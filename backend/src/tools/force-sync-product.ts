import dotenv from 'dotenv';
import { AQClient } from '../services/AQClient';
import { ShopifyClient } from '../services/ShopifyClient';
import { PricingEngine } from '../services/PricingEngine';
import { SyncManager } from '../services/SyncManager';
import { GoogleSheetsAdapter } from '../services/GoogleSheetsAdapter';
import { GoogleDriveAdapter } from '../services/GoogleDriveAdapter';

dotenv.config();

// Verify Env Vars
if (!process.env.AQ_API_KEY || !process.env.SHOPIFY_ACCESS_TOKEN || !process.env.SHOPIFY_SHOP_NAME) {
    console.error('❌ Missing .env variables! Make sure you are running this from the backend folder.');
    process.exit(1);
}

async function forceSync() {
    console.log('🚀 Initializing Services...');

    // Initialize Services
    const aqClient = new AQClient(process.env.AQ_API_KEY || '');
    const shopifyClient = new ShopifyClient();
    const pricingEngine = new PricingEngine();
    const googleSheets = new GoogleSheetsAdapter();
    const googleDrive = new GoogleDriveAdapter();

    const syncManager = new SyncManager(aqClient, shopifyClient, pricingEngine, googleSheets, googleDrive);

    const PRODUCT_ID = '02989dbc-881b-4516-97ad-febf0f30e57a'; // FAT16 ID found in debug

    console.log(`🔍 Fetching details for FAT16 (${PRODUCT_ID})...`);

    // We need to fetch the FULL product details, as the list item might be partial
    // AQClient has getProductDetails method? Let me check AQClient code again.
    // Yes it does: getProductDetails(id)

    const product = await aqClient.getProductDetails(PRODUCT_ID);

    if (!product) {
        console.error('❌ Failed to fetch product details from AQ.');
        return;
    }

    // Check if it's wrapped in an array or data property
    let actualProduct = product;
    if ((product as any).data && Array.isArray((product as any).data)) {
        actualProduct = (product as any).data[0];
    }

    console.log('✅ Product fetched from AQ.');
    // console.log('Raw Product Data:', JSON.stringify(actualProduct, null, 2));

    // Safety check BEFORE accessing sub-properties
    if (!actualProduct || !actualProduct.models) {
        console.error('❌ CRITICAL: "models" property is missing from the unwrapped response!');
        return;
    }

    console.log(`Title: ${actualProduct.mfrName} ${actualProduct.models.mfrModel}`);

    console.log('⏳ Syncing to Shopify...');
    await syncManager.syncProduct(actualProduct);

    console.log('🏁 Sync Attempt Complete. Check Shopify Admin.');
}

forceSync();
