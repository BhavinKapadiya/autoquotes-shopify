import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { shopifyApp } from '@shopify/shopify-app-express';
import { ApiVersion, LogSeverity } from '@shopify/shopify-api';

dotenv.config();

// Initialize Services Imports
import { AQClient } from './services/AQClient';
import { ShopifyClient } from './services/ShopifyClient';
import { PricingEngine } from './services/PricingEngine';
import { SyncManager } from './services/SyncManager';
import { GoogleSheetsAdapter } from './services/GoogleSheetsAdapter';
import { GoogleDriveAdapter } from './services/GoogleDriveAdapter';
import { Database } from './services/Database';

const app = express();
const port = process.env.PORT || 5000;

// Connect to Database
Database.getInstance().connect();

// Initialize Shopify App
const shopify = shopifyApp({
    api: {
        apiKey: process.env.SHOPIFY_API_KEY,
        apiSecretKey: process.env.SHOPIFY_API_SECRET,
        scopes: ['read_products', 'write_products'],
        hostName: process.env.HOST?.replace(/https?:\/\//, '') || 'localhost:5000',
        apiVersion: ApiVersion.October24,
        isEmbeddedApp: true,
    },
    auth: {
        path: '/api/auth',
        callbackPath: '/api/auth/callback',
    },
    webhooks: {
        path: '/api/webhooks',
    },
});

app.use(cors());
app.use(express.json());

// Initialize Services
const aqClient = new AQClient(process.env.AQ_API_KEY || '');
const shopifyClient = new ShopifyClient(); // Offline client for background sync
const pricingEngine = new PricingEngine();
const googleSheets = new GoogleSheetsAdapter();
const googleDrive = new GoogleDriveAdapter();

const syncManager = new SyncManager(aqClient, shopifyClient, pricingEngine, googleSheets, googleDrive);

// --- Shopify Auth Routes ---
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
    shopify.config.auth.callbackPath,
    shopify.auth.callback(),
    shopify.redirectToShopifyOrAppRoot()
);

app.get('/', (req, res) => {
    res.send('AutoQuotes to Shopify Sync Service is running');
});

// Trigger Sync (Legacy/Full)
app.post('/api/sync', async (req, res) => {
    const { force } = req.body;
    // New behavior: Ingest then Sync
    res.send({ status: `Full Sync cycle started` });
    syncManager.syncAllProducts(!!force).catch(err => console.error(err));
});

// New Staged Endpoints
app.post('/api/products/ingest', async (req, res) => {
    res.send({ status: 'Ingest started' });
    syncManager.ingestFromAQ().catch(err => console.error(err));
});

app.post('/api/products/sync', async (req, res) => {
    res.send({ status: 'Sync to Shopify started' });
    syncManager.syncToShopify().catch(err => console.error(err));
});

app.post('/api/products/pricing/apply', async (req, res) => {
    res.send({ status: 'Pricing update started' });
    syncManager.reapplyPricingRules().catch(err => console.error(err));
});

app.get('/api/products', async (req, res) => {
    try {
        const Product = require('./models/Product').default;
        const page = parseInt(req.query.page as string) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;

        const products = await Product.find()
            .sort({ aqMfrName: 1, aqModelNumber: 1 })
            .skip(skip)
            .limit(limit);

        const total = await Product.countDocuments();

        res.json({ products, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Sync Single Product
app.post('/api/sync/product', async (req, res) => {
    const { productId } = req.body;
    if (!productId) {
        return res.status(400).json({ error: 'productId is required' });
    }

    try {
        await syncManager.syncSpecificProduct(productId);
        res.json({ status: 'success', message: `Synced product ${productId}` });
    } catch (error: any) {
        console.error('Single sync failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Pricing Rules
app.get('/api/pricing/rules', (req, res) => {
    res.json(pricingEngine.getRules());
});

// --- Manufacturer Settings ---

app.get('/api/manufacturers', async (req, res) => {
    try {
        const mfrs = await aqClient.getManufacturers();
        res.json(mfrs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch manufacturers' });
    }
});

app.get('/api/settings', (req, res) => {
    try {
        const enabled = syncManager.getEnabledManufacturers();
        res.json({ enabledManufacturers: enabled });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

app.post('/api/settings', (req, res) => {
    const { enabledManufacturers } = req.body;
    if (Array.isArray(enabledManufacturers)) {
        syncManager.setEnabledManufacturers(enabledManufacturers);
        res.json({ status: 'Settings saved' });
    } else {
        res.status(400).json({ error: 'Invalid format' });
    }
});

// Update Pricing Rule
app.post('/api/pricing/rules', async (req, res) => {
    const { manufacturer, markup } = req.body;
    await pricingEngine.setRule(manufacturer, { manufacturer, markupPercentage: markup });
    res.json({ status: 'Rule updated' });
});

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
