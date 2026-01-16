import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { shopifyApp } from '@shopify/shopify-app-express';
import { LATEST_API_VERSION, LogSeverity } from '@shopify/shopify-api';

dotenv.config();

// Initialize Services Imports
import { AQClient } from './services/AQClient';
import { ShopifyClient } from './services/ShopifyClient';
import { PricingEngine } from './services/PricingEngine';
import { SyncManager } from './services/SyncManager';
import { GoogleSheetsAdapter } from './services/GoogleSheetsAdapter';
import { GoogleDriveAdapter } from './services/GoogleDriveAdapter';

const app = express();
const port = process.env.PORT || 5000;

// Initialize Shopify App
const shopify = shopifyApp({
    api: {
        apiKey: process.env.SHOPIFY_API_KEY,
        apiSecretKey: process.env.SHOPIFY_API_SECRET,
        scopes: ['read_products', 'write_products'],
        hostName: process.env.HOST?.replace(/https?:\/\//, '') || 'localhost:5000',
        apiVersion: LATEST_API_VERSION,
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

// Trigger Sync
app.post('/api/sync', async (req, res) => {
    res.send({ status: 'Sync started' });
    syncManager.syncAllProducts().catch(err => console.error(err));
});

// Get Pricing Rules
app.get('/api/pricing/rules', (req, res) => {
    res.json(pricingEngine.getRules());
});

// Update Pricing Rule
app.post('/api/pricing/rules', (req, res) => {
    const { manufacturer, markup } = req.body;
    pricingEngine.setRule(manufacturer, { manufacturer, markupPercentage: markup });
    res.json({ status: 'Rule updated' });
});

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
