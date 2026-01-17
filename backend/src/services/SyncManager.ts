import { AQClient } from './AQClient';
import { ShopifyClient } from './ShopifyClient';
import { PricingEngine } from './PricingEngine';
import { AQProduct } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleSheetsAdapter } from './GoogleSheetsAdapter';
import { GoogleDriveAdapter } from './GoogleDriveAdapter';

export class SyncManager {
    private aqClient: AQClient;
    private shopifyClient: ShopifyClient;
    private pricingEngine: PricingEngine;
    private googleSheets: GoogleSheetsAdapter;
    private googleDrive: GoogleDriveAdapter;
    private stateFile = path.join(__dirname, '../../data/sync_state.json');

    constructor(
        aqClient: AQClient,
        shopifyClient: ShopifyClient,
        pricingEngine: PricingEngine,
        googleSheets: GoogleSheetsAdapter,
        googleDrive: GoogleDriveAdapter
    ) {
        this.aqClient = aqClient;
        this.shopifyClient = shopifyClient;
        this.pricingEngine = pricingEngine;
        this.googleSheets = googleSheets;
        this.googleDrive = googleDrive;
        this.ensureDataDir();
    }

    private ensureDataDir() {
        const dir = path.dirname(this.stateFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private getLastSync(): string | undefined {
        if (fs.existsSync(this.stateFile)) {
            const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
            return data.lastSync;
        }
        return undefined;
    }

    private saveLastSync(date: string) {
        fs.writeFileSync(this.stateFile, JSON.stringify({ lastSync: date }));
    }

    async syncSpecificProduct(input: string) {
        console.log(`Force syncing specific input: ${input}`);
        let productId = input;

        // 1. Check if input is a UUID (roughly)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);

        if (!isUUID) {
            console.log(`'${input}' is not a UUID. Searching full product list for Model Number...`);

            const enabled = this.getEnabledManufacturers();
            let found: AQProduct | undefined;

            // Search in all enabled manufacturers
            for (const mfrId of enabled) {
                // If we want to be fast, we probably shouldn't fetch EVERYTHING. 
                // But without a "search by model" endpoint, we have to.
                // Optimally we'd cache this list, but for specific sync it's okay to be slow.
                try {
                    const products = await this.aqClient.getProducts(undefined, mfrId);
                    found = products.find(p => p.models?.mfrModel === input || p.models?.mfrModel === input.trim());
                    if (found) {
                        console.log(`Found in Manufacturer ${mfrId}`);
                        break;
                    }
                } catch (e) {
                    console.error(`Error searching mfr ${mfrId}:`, e);
                }
            }

            if (found) {
                console.log(`✅ Found Model '${input}' -> ID: ${found.productId}`);
                productId = found.productId;
            } else {
                console.warn(`❌ Model '${input}' not found in enabled manufacturers. Trying to use as ID anyway...`);
            }
        }

        const product = await this.aqClient.getProductDetails(productId);

        if (!product) {
            throw new Error(`Product ${productId} not found in AutoQuotes.`);
        }

        console.log(`Fetched details for: ${product.mfrName} - ${product.models?.mfrModel}`);
        await this.syncProduct(product);
        return product;
    }

    // --- Manufacturer Settings ---

    getEnabledManufacturers(): string[] {
        if (fs.existsSync(this.stateFile)) {
            const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
            // Default to AARCO if nothing saved
            return data.enabledManufacturers || ['78512195-9f0a-de11-b012-001ec95274b6'];
        }
        return ['78512195-9f0a-de11-b012-001ec95274b6'];
    }

    setEnabledManufacturers(ids: string[]) {
        let data: any = {};
        if (fs.existsSync(this.stateFile)) {
            data = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
        }
        data.enabledManufacturers = ids;
        fs.writeFileSync(this.stateFile, JSON.stringify(data));
    }

    async syncAllProducts(forceFull: boolean = false) {
        console.log(`Starting sync... (Force Full: ${forceFull})`);

        let lastSync: string | undefined = undefined;
        if (!forceFull) {
            lastSync = this.getLastSync();
            console.log(`Last sync was: ${lastSync || 'Never'}`);
        } else {
            console.log('Forcing full sync - ignoring last sync timestamp.');
        }

        const enabledMfrs = this.getEnabledManufacturers();
        console.log(`Syncing ${enabledMfrs.length} manufacturers:`, enabledMfrs);

        try {
            // 1. Fetch Lists from ALL enabled manufacturers
            let allProducts: AQProduct[] = [];

            for (const mfrId of enabledMfrs) {
                console.log(`Fetching products for Manufacturer ID: ${mfrId}`);
                const products = await this.aqClient.getProducts(lastSync, mfrId);
                console.log(`- Got ${products.length} products.`);
                allProducts = [...allProducts, ...products];
            }

            const products = allProducts; // Keep variable name consistent for rest of logic
            console.log(`Total items to process: ${products.length}`);

            const processedIds = new Set(products.map(p => p.productId));

            // 2. Fetch User-Defined Models (Drive Images + Sheet Variants)
            console.log('Checking for user-defined products (Images/Variants)...');
            const driveModels = await this.googleDrive.getAllImageModels();
            const sheetModels = await this.googleSheets.getAllVariantModels();

            const userModels = new Set([...driveModels, ...sheetModels]);
            console.log(`Found ${userModels.size} unique user-defined models.`);

            // 3. Sync Main List
            for (const product of products) {
                await this.syncProduct(product);
                // Mark model as processed if we have it here
                if (product.models?.mfrModel) {
                    // We can't easily mark userModels as processed by ID, but we know this product is synced.
                    // The next step checks by Model Number anyway (via smart search fallback), so it's fine.
                }
            }

            // 4. Force Sync Missing User Models
            // We iterate through user models. If they weren't in the main list (by checking if we synced them?), 
            // actually 'products' is a list of objects. We need to check if a user model maps to one of these.
            // Since we don't know the ID of user models yet, we have to rely on the fact that if it WAS in the list, 
            // we already synced it. But wait, we might have synced it but not "known" it was a user model.
            // A simpler approach: For every user model, check if we found a matching Model Number in the 'products' list.
            // If NOT found in 'products' list, then we force sync it.

            for (const model of userModels) {
                const alreadySynced = products.find(p => p.models?.mfrModel === model || p.models?.mfrModel === model.trim());

                if (!alreadySynced) {
                    console.log(`User model '${model}' was missing from main list. Force syncing...`);
                    try {
                        // Use our smart search (which handles model -> ID lookup)
                        await this.syncSpecificProduct(model);
                    } catch (err) {
                        console.error(`Failed to force sync user model '${model}':`, err);
                    }
                }
            }

            this.saveLastSync(new Date().toISOString());
            console.log('Sync complete.');
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }

    private async syncProduct(aqProduct: AQProduct) {
        let shopifyData: any; // Declare outside try block for access in catch

        try {
            // 1. Validate Data
            if (!aqProduct.models || !aqProduct.models.mfrModel) {
                console.warn(`Skipping product ${aqProduct.productId} - Missing model number`);
                return;
            }

            const modelNumber = aqProduct.models.mfrModel;
            const description = aqProduct.specifications?.shortMarketingSpecification ||
                aqProduct.specifications?.AQSpecification ||
                `${aqProduct.mfrName} ${modelNumber}`;

            // 2. Base Price Calculation
            const basePrice = aqProduct.pricing?.listPrice || 0;

            // 3. Check for Google Drive Image Override
            let images: any[] = aqProduct.pictures ? aqProduct.pictures.map(pic => ({ src: pic.url })) : [];
            const overrideImage = await this.googleDrive.findImageOverride(modelNumber);

            if (overrideImage) {
                console.log(`Using override image for ${modelNumber}`);
                // Replace all AQ images with the single override image
                // Shopify allows 'attachment' for base64
                images = [{
                    attachment: overrideImage.base64
                }];
            }

            // 4. Check for Google Sheets Variants
            const customVariants = await this.googleSheets.getVariants(modelNumber);
            let shopifyVariants = [];

            if (customVariants.length > 0) {
                console.log(`Found ${customVariants.length} custom variants for ${modelNumber}`);

                // Construct variants from Sheet Data
                shopifyVariants = customVariants.map(v => {
                    // Calculate price for this variant
                    const variantPrice = this.pricingEngine.calculatePrice({
                        ...aqProduct,
                        ListPrice: basePrice + (v.priceMod || 0), // Apply modifier to base
                        Manufacturer: aqProduct.mfrName,
                        ModelNumber: modelNumber,
                    } as any);

                    return {
                        price: variantPrice,
                        sku: `${modelNumber}${v.skuMod}`,
                        inventory_management: null,
                        option1: v.optionValue, // e.g. "Red"
                    };
                });
            } else {
                // Default Single Variant
                const finalPrice = this.pricingEngine.calculatePrice({
                    ...aqProduct,
                    ListPrice: basePrice,
                    Manufacturer: aqProduct.mfrName,
                    ModelNumber: modelNumber,
                } as any);

                shopifyVariants.push({
                    price: finalPrice,
                    sku: modelNumber,
                    inventory_management: null,
                    option1: 'Default Title'
                });
            }

            // 5. Prepare Shopify Data
            // Construct nice body HTML
            let bodyHtml = `<p>${description}</p>`;
            if (aqProduct.specifications?.longMarketingSpecification) {
                bodyHtml += `<p>${aqProduct.specifications.longMarketingSpecification}</p>`;
            }
            if (aqProduct.specifications?.AQSpecification) {
                bodyHtml += `<h3>Specifications</h3><p>${aqProduct.specifications.AQSpecification}</p>`;
            }

            // Determine Option Names (if using variants)
            const options = customVariants.length > 0
                ? [{ name: customVariants[0].optionName }] // Assuming all rows for a model share the Option Name (e.g. "Color")
                : undefined;

            shopifyData = {
                title: `${aqProduct.mfrName} ${modelNumber}`,
                body_html: bodyHtml,
                vendor: aqProduct.mfrName,
                product_type: aqProduct.productCategory?.name || 'General',
                handle: `${aqProduct.mfrName}-${modelNumber}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                options: options,
                variants: shopifyVariants,
                images: images,
                metafields: [
                    { key: 'model_number', value: modelNumber, type: 'single_line_text_field', namespace: 'custom' },
                    { key: 'aq_id', value: aqProduct.productId, type: 'single_line_text_field', namespace: 'custom' },
                    { key: 'shipping_weight', value: String(aqProduct.productDimension?.shippingWeight || 0), type: 'number_decimal', namespace: 'custom' },
                    { key: 'dimensions', value: `${aqProduct.productDimension?.productHeight || 0}"H x ${aqProduct.productDimension?.productWidth || 0}"W x ${aqProduct.productDimension?.productDepth || 0}"D`, type: 'single_line_text_field', namespace: 'custom' }
                ]
            };

            // 6. Push to Shopify
            const existing = await this.shopifyClient.findProductByHandle(shopifyData.handle);

            if (existing) {
                console.log(`Updating ${shopifyData.handle}...`);
                await this.shopifyClient.updateProduct(existing.id, shopifyData);
            } else {
                console.log(`Creating ${shopifyData.handle}...`);
                await this.shopifyClient.createProduct(shopifyData);
            }

        } catch (error: any) {
            // RETRY LOGIC: If it fails due to "file not supported on trial accounts", try syncing WITHOUT images
            if (error.response && error.response.body && JSON.stringify(error.response.body).includes('trial accounts')) {
                console.warn(`⚠️  Skipping images for ${aqProduct.models?.mfrModel} due to Shopify Trial limitation.`);

                try {
                    // Remove images and retry
                    const dataWithoutImages = { ...shopifyData, images: [] }; // shopifyData needs to be accessible here, so we might need to restructure slightly or just paste the logic inside the main block.
                    // simpler: just call create again here, but we need 'shopifyData'.
                    // To avoid large refactor, let's just use the client directly with modified data if we can acccess it.
                    // actually, better to handle this inside the main flow or just catch it here attempting a re-create.

                    // RE-ATTEMPT creation/update without images
                    const existing = await this.shopifyClient.findProductByHandle(shopifyData.handle);
                    if (existing) {
                        await this.shopifyClient.updateProduct(existing.id, { ...shopifyData, images: [] });
                    } else {
                        await this.shopifyClient.createProduct({ ...shopifyData, images: [] });
                    }
                    console.log(`✅ Recovered: Synced ${aqProduct.models?.mfrModel} (No Images).`);
                    return;

                } catch (retryError) {
                    console.error(`Retry failed for ${aqProduct.models?.mfrModel}:`, retryError);
                }
            }

            console.error(`Failed to sync product ${aqProduct.models?.mfrModel || 'Unknown'}:`, error);
        }
    }
}
