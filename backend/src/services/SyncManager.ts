import { AQClient } from './AQClient';
import { ShopifyClient } from './ShopifyClient';
import { PricingEngine } from './PricingEngine';
import { AQProduct } from '../types';
import { GoogleSheetsAdapter } from './GoogleSheetsAdapter';
import { GoogleDriveAdapter } from './GoogleDriveAdapter';

export class SyncManager {
    private aqClient: AQClient;
    private shopifyClient: ShopifyClient;
    private pricingEngine: PricingEngine;
    private googleSheets: GoogleSheetsAdapter;
    private googleDrive: GoogleDriveAdapter;
    // private stateFile = path.join(__dirname, '../../data/sync_state.json'); // Legacy removed

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
        // this.ensureDataDir(); // Legacy removed
    }

    private lastSyncDate: Date | null = null;

    // Updated to use Settings model
    private async saveLastSync(date: string) {
        // Implement if tracking last full sync date in DB is needed
    }

    // --- Manufacturer Settings ---

    async getEnabledManufacturers(): Promise<string[]> {
        const Settings = require('../models/Settings').default;
        try {
            const settings = await Settings.findOne({ key: 'global_settings' });
            // Default to AARCO if nothing saved
            return settings?.enabledManufacturers || ['78512195-9f0a-de11-b012-001ec95274b6'];
        } catch (error) {
            console.error('Error fetching enabled manufacturers from DB:', error);
            return ['78512195-9f0a-de11-b012-001ec95274b6'];
        }
    }

    async setEnabledManufacturers(ids: string[]) {
        const Settings = require('../models/Settings').default;
        const Product = require('../models/Product').default;

        try {
            // 1. Get current list to detect removals
            const currentSettings = await Settings.findOne({ key: 'global_settings' });
            const currentIds: string[] = currentSettings?.enabledManufacturers || [];

            // 2. Identify removed IDs
            const removedIds = currentIds.filter(id => !ids.includes(id));

            // 3. Save new list
            await Settings.findOneAndUpdate(
                { key: 'global_settings' },
                { enabledManufacturers: ids },
                { upsert: true, new: true }
            );

            // 4. Archive products from removed manufacturers
            if (removedIds.length > 0) {
                console.log(`Manufacturers disabled: ${removedIds.join(', ')}. Archiving products...`);
                const result = await Product.updateMany(
                    { aqMfrId: { $in: removedIds } },
                    { status: 'archived' }
                );
                console.log(`Archived ${result.modifiedCount} products.`);
            }

        } catch (error) {
            console.error('Error saving enabled manufacturers:', error);
            throw error;
        }
    }

    // --- New Staged Workflow ---

    async ingestFromAQ(forceFull: boolean = false) {
        console.log(`Starting INGEST from AQ... (Force Full: ${forceFull})`);
        const enabledMfrs = await this.getEnabledManufacturers();

        try {
            // 1. Fetch Lists from ALL enabled manufacturers
            let allProducts: AQProduct[] = [];
            for (const mfrId of enabledMfrs) {
                console.log(`Fetching products for Manufacturer ID: ${mfrId}`);
                const products = await this.aqClient.getProducts(undefined, mfrId);
                console.log(`- Got ${products.length} products.`);
                allProducts = [...allProducts, ...products];
            }

            console.log(`Total items to ingest: ${allProducts.length}`);

            // 2. Save/Update to Database
            for (const product of allProducts) {
                await this.saveToStaging(product);
            }

            console.log('Ingest complete.');
        } catch (error) {
            console.error('Ingest failed:', error);
        }
    }

    private async saveToStaging(aqProduct: AQProduct) {
        // Find existing or create new
        // Calculate initial price based on current rules
        // Convert to IProduct format
        // Upsert into MongoDB
        const Product = require('../models/Product').default; // Dynamic require to avoid circular dependency issues if any

        try {
            if (!aqProduct.models?.mfrModel) return;

            const modelNumber = aqProduct.models.mfrModel;
            const mfrName = aqProduct.mfrName;

            // Calculate Price
            const basePrice = aqProduct.pricing?.listPrice || 0;
            const finalPrice = this.pricingEngine.calculatePrice({
                ...aqProduct,
                ListPrice: basePrice,
                Manufacturer: mfrName,
                ModelNumber: modelNumber,
            } as any);

            // Extract Spec Sheet
            let specSheetUrl = '';
            // Check 'documents' first (New API Structure)
            if (aqProduct.documents && aqProduct.documents.length > 0) {
                const doc = aqProduct.documents.find(d => d.mediaType === 'document' || (d.url && d.url.toLowerCase().endsWith('.pdf')));
                if (doc) specSheetUrl = doc.url;
            }
            // Fallback to 'resources'
            if (!specSheetUrl && aqProduct.resources) {
                const res = aqProduct.resources.find(r => r.type === 'SpecSheet' || (r.url && r.url.toLowerCase().endsWith('.pdf')));
                if (res) specSheetUrl = res.url;
            }

            // Extract Images
            let images: { src: string, attachment?: string }[] = aqProduct.pictures ? aqProduct.pictures.map(pic => ({ src: pic.url })) : [];
            const overrideImage = await this.googleDrive.findImageOverride(modelNumber);
            if (overrideImage) {
                images = [{ src: '', attachment: overrideImage.base64 }];
            }

            const updateData = {
                aqMfrId: aqProduct.mfrId,
                aqMfrName: mfrName,
                aqModelNumber: modelNumber,
                aqProductId: aqProduct.productId,
                title: `${mfrName} ${modelNumber}`,
                descriptionHtml: aqProduct.specifications?.longMarketingSpecification || aqProduct.specifications?.AQSpecification || '',
                listPrice: basePrice,
                finalPrice: finalPrice,
                specSheetUrl: specSheetUrl,
                categoryValues: aqProduct.categoryValues || [],
                images: images,
                productType: aqProduct.productCategory?.name || 'General',
                // Keep status valid if it exists, else default to staged
                // Actually, if we re-ingest, we probably want to keep it as-is unless we force reset?
                // Let's not overwrite status if it's 'synced' unless price changed?
                // For simplified flow: Always set to 'staged' on ingest implies "Review this update".
                // But if syncing 1600 products, we don't want to re-review everything.
                // Logic: If price or key data changed, set to staged?
                // For now, let's JUST update data. Status management can be manual or implicit.
            };

            await Product.findOneAndUpdate(
                { aqProductId: aqProduct.productId },
                { ...updateData, lastIngested: new Date() },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        } catch (e) {
            console.error(`Failed to save product ${aqProduct.productId}`, e);
        }
    }

    async syncToShopify(specificProductId?: string) {
        console.log('Starting SYNC to Shopify...');
        const Product = require('../models/Product').default;

        let productsToSync = [];
        if (specificProductId) {
            productsToSync = await Product.find({ aqProductId: specificProductId });
        } else {
            // Sync everything that is 'staged' (or just everything for now as users want full sync)
            // In true PIM, you only sync 'Approved'. Here we autosync 'staged' for MVP parity.
            productsToSync = await Product.find({ status: { $in: ['staged', 'synced'] } });
        }

        console.log(`Found ${productsToSync.length} products to sync.`);

        for (const product of productsToSync) {
            try {
                // Construct Body HTML from stored data
                let bodyHtml = `<p>${product.aqMfrName} ${product.aqModelNumber}</p>`;
                if (product.descriptionHtml) {
                    bodyHtml += `<p>${product.descriptionHtml}</p>`;
                }

                if (product.categoryValues && product.categoryValues.length > 0) {
                    bodyHtml += `<h3>Product Features & Specs</h3>`;
                    bodyHtml += `<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%;"><tbody>`;
                    product.categoryValues.forEach((cv: any) => {
                        bodyHtml += `<tr><td style="font-weight:bold;">${cv.property}</td><td>${cv.value}</td></tr>`;
                    });
                    bodyHtml += `</tbody></table>`;
                } else {
                    // Fallback text if no table
                }

                // Check for Custom Variants (Google Sheets)
                // We re-fetch here to get latest sheet data
                const customVariants = await this.googleSheets.getVariants(product.aqModelNumber);

                let shopifyVariants = [];
                if (customVariants.length > 0) {
                    shopifyVariants = customVariants.map(v => {
                        const variantPrice = product.finalPrice + (v.priceMod || 0);
                        return {
                            price: variantPrice,
                            sku: `${product.aqModelNumber}${v.skuMod}`,
                            option1: v.optionValue,
                            inventory_management: null
                        };
                    });
                } else {
                    shopifyVariants.push({
                        price: product.finalPrice,
                        sku: product.aqModelNumber,
                        option1: 'Default Title',
                        inventory_management: null
                    });
                }

                const options = customVariants.length > 0 ? [{ name: customVariants[0].optionName }] : undefined;

                const shopifyData = {
                    title: product.title,
                    body_html: bodyHtml,
                    vendor: product.aqMfrName,
                    product_type: product.productType,
                    handle: `${product.aqMfrName}-${product.aqModelNumber}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    options: options,
                    variants: shopifyVariants,
                    images: product.images,
                    metafields: [
                        { key: 'model_number', value: product.aqModelNumber, type: 'single_line_text_field', namespace: 'custom' },
                        { key: 'aq_id', value: product.aqProductId, type: 'single_line_text_field', namespace: 'custom' },
                        ...(product.specSheetUrl ? [{ key: 'spec_sheet_url', value: product.specSheetUrl, type: 'url', namespace: 'custom' }] : [])
                    ]
                };

                // Push
                const existing = await this.shopifyClient.findProductByHandle(shopifyData.handle);
                let shopifyId = '';
                if (existing) {
                    // console.log(`Updating ${shopifyData.handle}...`);
                    const res = await this.shopifyClient.updateProduct(existing.id, shopifyData);
                    shopifyId = res ? `${res.id}` : '';
                } else {
                    console.log(`Creating ${shopifyData.handle}...`);
                    const res = await this.shopifyClient.createProduct(shopifyData);
                    shopifyId = res ? `${res.id}` : '';
                }

                // Update DB Status
                product.status = 'synced';
                product.shopifyId = shopifyId;
                product.shopifyHandle = shopifyData.handle;
                product.lastSynced = new Date();
                await product.save();

            } catch (err) {
                console.error(`Failed to sync ${product.aqModelNumber} to Shopify:`, err);
                product.status = 'error';
                product.syncError = JSON.stringify(err);
                await product.save();
            }
        }
    }

    async syncAllProducts(forceFull: boolean = false) {
        // Legacy endpoint redirect
        await this.ingestFromAQ(forceFull);
        await this.syncToShopify();
    }

    async reapplyPricingRules() {
        console.log('Re-applying pricing rules to ALL staged products...');
        const Product = require('../models/Product').default;

        // Reload rules to be sure
        await this.pricingEngine.loadRules();

        const products = await Product.find({ status: { $in: ['staged', 'synced'] } });
        console.log(`Processing ${products.length} products...`);

        let count = 0;
        for (const p of products) {
            const finalPrice = this.pricingEngine.calculatePrice({
                ListPrice: p.listPrice,
                Manufacturer: p.aqMfrName,
                ModelNumber: p.aqModelNumber
            });

            p.finalPrice = finalPrice;
            // Should we revert to 'staged' if it was 'synced'?
            // If price changes, yes, it should be synced again.
            p.status = 'staged';
            await p.save();
            count++;
        }
        console.log(`Updated prices for ${count} products.`);
    }

    async syncSpecificProduct(input: string) {
        console.log(`Force syncing specific input: ${input}`);
        let productId = input;

        // 1. Check if UUID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);

        if (!isUUID) {
            console.log(`'${input}' is not a UUID. Searching full product list for Model Number...`);
            const enabled = await this.getEnabledManufacturers();
            let found: AQProduct | undefined;
            for (const mfrId of enabled) {
                try {
                    const products = await this.aqClient.getProducts(undefined, mfrId);
                    found = products.find(p => p.models?.mfrModel === input || p.models?.mfrModel === input.trim());
                    if (found) break;
                } catch (e) {
                    console.error(e);
                }
            }
            if (found) {
                productId = found.productId;
            } else {
                throw new Error(`Product ${input} not found`);
            }
        }

        const product = await this.aqClient.getProductDetails(productId);
        if (!product) throw new Error('Product not found in AQ');

        // Save to DB
        await this.saveToStaging(product);
        // Sync to Shopify
        await this.syncToShopify(product.productId);

        return product;
    }
}
