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

    async syncSpecificProduct(productId: string) {
        console.log(`Force syncing specific product: ${productId}`);
        const product = await this.aqClient.getProductDetails(productId);

        if (!product) {
            throw new Error(`Product ${productId} not found in AutoQuotes.`);
        }

        console.log(`Fetched details for: ${product.mfrName} - ${product.models?.mfrModel}`);
        await this.syncProduct(product);
        return product;
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

        try {
            const products = await this.aqClient.getProducts(lastSync);
            console.log(`Fetched ${products.length} products from AQ.`);

            for (const product of products) {
                await this.syncProduct(product);
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
