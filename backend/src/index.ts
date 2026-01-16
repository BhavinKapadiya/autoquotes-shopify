import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { AQClient } from './services/AQClient';
import { ShopifyClient } from './services/ShopifyClient';
import { PricingEngine } from './services/PricingEngine';
import { SyncManager } from './services/SyncManager';

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

import { GoogleSheetsAdapter } from './services/GoogleSheetsAdapter';
import { GoogleDriveAdapter } from './services/GoogleDriveAdapter';

// Initialize Services
const aqClient = new AQClient(process.env.AQ_API_KEY || '');
const shopifyClient = new ShopifyClient();
const pricingEngine = new PricingEngine();
const googleSheets = new GoogleSheetsAdapter();
const googleDrive = new GoogleDriveAdapter();

const syncManager = new SyncManager(aqClient, shopifyClient, pricingEngine, googleSheets, googleDrive);

app.get('/', (req, res) => {
    res.send('AutoQuotes to Shopify Sync Service is running');
});

// Trigger Sync
app.post('/api/sync', async (req, res) => {
    res.send({ status: 'Sync started' });
    // Run in background
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
