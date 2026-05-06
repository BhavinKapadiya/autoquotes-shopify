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
            // Return empty array if nothing saved
            return settings?.enabledManufacturers || [];
        } catch (error) {
            console.error('Error fetching enabled manufacturers from DB:', error);
            return [];
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

            // 4. Archive products from ANY manufacturer not in the enabled list
            console.log(`Archiving products for manufacturers not in the enabled list...`);
            
            // Find which manufacturers are being newly archived so we can sync their deletion to Shopify
            const newlyArchivedProducts = await Product.find({
                aqMfrId: { $nin: ids },
                status: { $ne: 'archived' }
            }).distinct('aqMfrId');

            const result = await Product.updateMany(
                { aqMfrId: { $nin: ids } },
                { status: 'archived' }
            );
            console.log(`Archived ${result.modifiedCount} products.`);

            // BACKGROUND JOB: Sync Archival to Shopify
            // We don't await this so the UI response is fast, but we log errors.
            if (newlyArchivedProducts.length > 0) {
                this.syncArchivalsToShopify(newlyArchivedProducts).catch(err => console.error('Background archival failed:', err));
            }

        } catch (error) {
            console.error('Error saving enabled manufacturers:', error);
            throw error;
        }
    }

    async syncArchivalsToShopify(mfrIds: string[]) {
        console.log(`[DEBUG_COMMIT] Syncing DELETIONS/ARCHIVALS for manufacturers: ${mfrIds.join(', ')}`);
        const Product = require('../models/Product').default;

        // Find products that are 'archived' locally but have a Shopify ID (so they exist remotely)
        // We only care about products that have been synced at least once.
        const productsToArchive = await Product.find({
            aqMfrId: { $in: mfrIds },
            status: 'archived',
            shopifyId: { $exists: true, $ne: '' }
        });

        console.log(`Found ${productsToArchive.length} products to set to DRAFT on Shopify.`);

        for (const product of productsToArchive) {
            try {
                // Set status to draft
                await this.shopifyClient.updateProduct(Number(product.shopifyId), {
                    status: 'draft'
                });
                console.log(`Set ${product.aqModelNumber} (ID: ${product.shopifyId}) to DRAFT.`);
            } catch (err: any) {
                if (err.response?.statusCode === 404 || err.response?.code === 404 || err.message?.includes('404')) {
                    console.log(`Product ${product.aqModelNumber} already deleted/not found on Shopify. Considering archived.`);
                    // Optional: Clear shopifyId since it's invalid
                    // product.shopifyId = '';
                    // await product.save();
                } else {
                    console.error(`Failed to archive ${product.aqModelNumber} on Shopify:`, err);
                }
            }
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
        
        // Let's get the existing product to check if thunder is already synced
        let existingProduct = null;
        try {
            existingProduct = await Product.findOne({ aqProductId: aqProduct.productId });
        } catch (e) {
            console.error('Error finding existing product', e);
        }

        try {
            if (!aqProduct.models?.mfrModel) return;

            const modelNumber = aqProduct.models.mfrModel;
            const mfrName = aqProduct.mfrName;

            // Calculate Price
            const basePrice = aqProduct.pricing?.listPrice || 0;
            const netPrice = aqProduct.pricing?.netPrice || 0;

            const pricingResult = this.pricingEngine.calculatePrice({
                ListPrice: basePrice,
                NetPrice: netPrice,
                Manufacturer: mfrName,
                ModelNumber: modelNumber,
            });

            const finalPrice = pricingResult.finalPrice;
            const netCost = pricingResult.netCost;

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
            let thunderImagesSynced = existingProduct?.thunderImagesSynced || false;

            // --- THUNDER SPECIFIC LOGIC ---
            const THUNDER_MFR_ID = 'ddffdfa6-be0d-dd11-a23a-00304834a8c9';
            if (aqProduct.mfrId === THUNDER_MFR_ID) {
                const thunderFolderId = process.env.THUNDER_DRIVE_FOLDER_ID;
                const thunderKeyFile = process.env.THUNDER_GOOGLE_CREDENTIALS;

                if (!thunderImagesSynced && thunderFolderId && thunderKeyFile) {
                    console.log(`🌩️  Thunder Product detected (${modelNumber}). Checking Thunder Drive for multi-images...`);
                    try {
                        const thunderDrive = new GoogleDriveAdapter({
                            folderId: thunderFolderId,
                            keyFile: thunderKeyFile
                        });

                        const matches = await thunderDrive.findMultiImageOverrides(modelNumber);
                        
                        if (matches && matches.length > 0) {
                            console.log(`✅ Found ${matches.length} matching Thunder images for ${modelNumber}. Uploading to Shopify...`);
                            
                            const thunderImages: { src: string }[] = [];

                            for (const match of matches) {
                                try {
                                    const buffer = Buffer.from(match.base64, 'base64');
                                    const shopifyUrl = await this.shopifyClient.uploadToShopifyFiles(
                                        buffer,
                                        match.name,
                                        match.mimeType
                                    );
                                    thunderImages.push({ src: shopifyUrl });
                                    console.log(`   -> Uploaded to Shopify Files: ${shopifyUrl}`);
                                } catch (uploadErr: any) {
                                    console.error(`   ❌ Failed to upload Thunder image ${match.name}:`, uploadErr?.message || uploadErr);
                                }
                            }
                            
                            // Only replace images if we successfully uploaded at least one
                            if (thunderImages.length > 0) {
                                images = thunderImages;
                                thunderImagesSynced = true;
                                console.log(`🏁 Thunder sync complete for ${modelNumber}. ${thunderImages.length} images uploaded.`);
                            } else {
                                // All uploads failed — keep default AQ images
                                console.warn(`⚠️ All Thunder image uploads failed for ${modelNumber}. Falling back to AQ defaults.`);
                            }
                        } else {
                            console.log(`ℹ️ No Thunder custom images found in Drive for ${modelNumber}. Using default AQ images.`);
                        }
                    } catch (driveErr: any) {
                        console.error(`❌ Error during Thunder Drive lookup for ${modelNumber}:`, driveErr?.message || driveErr);
                        // Non-fatal: keep the default images
                    }
                } else if (!thunderImagesSynced && (!thunderFolderId || !thunderKeyFile)) {
                    console.warn(`⚠️ Thunder Drive env vars not set. Skipping image override for ${modelNumber}.`);
                } else {
                    // Already synced — carry over the permanent Shopify File URLs
                    if (existingProduct?.images && existingProduct.images.length > 0) {
                        images = existingProduct.images;
                        console.log(`ℹ️ Thunder images already synced for ${modelNumber}. Preserving existing images.`);
                    }
                }
            } else {
                // --- STANDARD MANUFACTURER LOGIC ---
                const overrideImage = await this.googleDrive.findImageOverride(modelNumber);
                if (overrideImage) {
                    images = [{ src: '', attachment: overrideImage.base64 }];
                }
            }

            const updateData = {
                aqMfrId: aqProduct.mfrId,
                aqMfrName: mfrName,
                aqModelNumber: modelNumber,
                aqProductId: aqProduct.productId,
                title: `${mfrName} ${modelNumber}`,
                descriptionHtml: aqProduct.specifications?.longMarketingSpecification || aqProduct.specifications?.AQSpecification || '',
                listPrice: basePrice,
                aqNetPrice: netPrice, // Save raw AQ net
                netCost: netCost, // Save calculated net cost
                finalPrice: finalPrice,
                specSheetUrl: specSheetUrl,
                categoryValues: aqProduct.categoryValues || [],
                images: images,
                productType: aqProduct.productCategory?.name || 'General',
                status: existingProduct && existingProduct.status !== 'archived' ? existingProduct.status : 'staged', // Re-stage archived, preserve staged/synced
                thunderImagesSynced: thunderImagesSynced
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
        const CategoryRule = require('../models/CategoryRule').default;
        const { VariantGroupAdapter } = require('./VariantGroupAdapter');

        let productsToSync = [];
        if (specificProductId) {
            productsToSync = await Product.find({ aqProductId: specificProductId });
        } else {
            productsToSync = await Product.find({
                $or: [
                    { status: { $in: ['staged', 'synced'] } },
                    { status: 'archived', shopifyId: { $exists: true, $ne: '' } }
                ]
            });
        }

        console.log(`Found ${productsToSync.length} products to sync.`);

        // Fetch Category Rules
        const categoryRules = await CategoryRule.find();

        // Ensure Smart Collections Exist Before Processing
        if (this.shopifyClient) {
            console.log('📋 Ensuring Smart Collections exist for all Category Rules...');
            for (const r of categoryRules) {
                try {
                    if (r.productType) await this.shopifyClient.ensureSmartCollection(r.productType, r.productType);
                    if (r.parentCategory) await this.shopifyClient.ensureSmartCollection(r.parentCategory, `Category_${r.parentCategory}`);
                    if (r.subCategory) await this.shopifyClient.ensureSmartCollection(r.subCategory, `Sub_${r.subCategory}`);
                    if (r.childCategory) await this.shopifyClient.ensureSmartCollection(r.childCategory, `Child_${r.childCategory}`);
                } catch (collectionErr: any) {
                    console.error(`⚠️ Failed to create collection for rule ${r.vendor} - ${r.productType}:`, collectionErr.message);
                }
            }
        }
        
        // Fetch Variant Mappings
        const variantGroupAdapter = new VariantGroupAdapter();
        const variantMappings = await variantGroupAdapter.getVariantMappings();

        // Group products by Prefix
        const groups = new Map<string, any[]>();
        const ungroupedProducts = [];

        for (const product of productsToSync) {
            const mapping = variantMappings.get(product.aqModelNumber);
            if (mapping) {
                const prefix = mapping.prefix;
                if (!groups.has(prefix)) groups.set(prefix, []);
                groups.get(prefix)!.push(product);
            } else {
                ungroupedProducts.push(product);
            }
        }

        console.log(`Grouped into ${groups.size} variant groups. ${ungroupedProducts.length} remain ungrouped.`);

        // Process Grouped Products
        for (const [prefix, groupedProds] of groups) {
            try {
                // Determine Parent (first non-archived if possible, otherwise first)
                let parentProduct = groupedProds.find((p: any) => p.status !== 'archived') || groupedProds[0];
                
                // Construct Body HTML from Parent
                let bodyHtml = `<p>${parentProduct.aqMfrName} ${parentProduct.aqModelNumber}</p>`;
                if (parentProduct.descriptionHtml) {
                    bodyHtml += `<p>${parentProduct.descriptionHtml}</p>`;
                }

                if (parentProduct.categoryValues && parentProduct.categoryValues.length > 0) {
                    bodyHtml += `<h3>Product Features & Specs</h3>`;
                    bodyHtml += `<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%;"><tbody>`;
                    parentProduct.categoryValues.forEach((cv: any) => {
                        bodyHtml += `<tr><td style="font-weight:bold;">${cv.property}</td><td>${cv.value}</td></tr>`;
                    });
                    bodyHtml += `</tbody></table>`;
                }

                // Inject Category Tags (case-insensitive match to handle vendor/productType casing differences)
                let tags = parentProduct.tags ? [...parentProduct.tags] : [];
                
                // 1. Existing Logic: Exact match on productType
                const exactRule = categoryRules.find((r: any) =>
                    r.vendor.toLowerCase().trim() === (parentProduct.aqMfrName || '').toLowerCase().trim() &&
                    r.productType.toLowerCase().trim() === (parentProduct.productType || '').toLowerCase().trim()
                );
                if (exactRule) {
                    console.log(`🏷️  Applying category tags for ${parentProduct.aqMfrName} / ${parentProduct.productType}: ${exactRule.parentCategory} > ${exactRule.subCategory} > ${exactRule.childCategory}`);
                    const cTags = [`Category_${exactRule.parentCategory}`, `Sub_${exactRule.subCategory}`, `Child_${exactRule.childCategory}`];
                    cTags.forEach(t => { if (!tags.includes(t)) tags.push(t); });
                } else {
                    console.log(`ℹ️  No category rule found for exact match: "${parentProduct.aqMfrName}" / "${parentProduct.productType}"`);
                }

                // 2. New Logic: Dynamic Keyword Scanning (Title, Product Type, Description)
                const searchableText = [
                    parentProduct.title || '',
                    parentProduct.productType || '',
                    (parentProduct.descriptionHtml || '').replace(/<[^>]*>?/gm, ' ')
                ].join(' ').toLowerCase();

                const vendorRules = categoryRules.filter((r: any) => 
                    r.vendor.toLowerCase().trim() === (parentProduct.aqMfrName || '').toLowerCase().trim()
                );
                
                for (const r of vendorRules) {
                    const keyword = r.productType.toLowerCase().trim();
                    const subKeyword = (r.subCategory || '').toLowerCase().trim();
                    const childKeyword = (r.childCategory || '').toLowerCase().trim();

                    if (keyword && searchableText.includes(keyword)) {
                        // Apply the keyword tag
                        if (!tags.includes(r.productType)) {
                            tags.push(r.productType);
                            console.log(`🔍 Keyword "${r.productType}" found in product text! Applied tag to ${parentProduct.aqModelNumber}`);
                        }
                        // Apply the hierarchy tags
                        if (r.parentCategory && !tags.includes(`Category_${r.parentCategory}`)) tags.push(`Category_${r.parentCategory}`);
                        if (r.subCategory && !tags.includes(`Sub_${r.subCategory}`)) tags.push(`Sub_${r.subCategory}`);
                        if (r.childCategory && !tags.includes(`Child_${r.childCategory}`)) tags.push(`Child_${r.childCategory}`);
                    }

                    // Independent check for Sub Category keyword
                    if (subKeyword && searchableText.includes(subKeyword) && !tags.includes(r.subCategory)) {
                        tags.push(r.subCategory);
                        console.log(`🔍 Sub-Category Keyword "${r.subCategory}" found! Applied raw tag to ${parentProduct.aqModelNumber}`);
                    }

                    // Independent check for Child Category keyword
                    if (childKeyword && searchableText.includes(childKeyword) && !tags.includes(r.childCategory)) {
                        tags.push(r.childCategory);
                        console.log(`🔍 Child-Category Keyword "${r.childCategory}" found! Applied raw tag to ${parentProduct.aqModelNumber}`);
                    }
                }

                // Construct Variants
                let shopifyVariants: any[] = [];
                for (const prod of groupedProds) {
                    const mapping = variantMappings.get(prod.aqModelNumber);
                    if (mapping) {
                        shopifyVariants.push({
                            price: prod.finalPrice,
                            sku: prod.aqModelNumber,
                            option1: mapping.design || 'Standard',
                            option2: mapping.size || 'Standard',
                            inventory_management: null
                        });
                    }
                }

                const shopifyStatus = parentProduct.status === 'archived' ? 'draft' : 'active';
                const shopifyData = {
                    status: shopifyStatus,
                    title: parentProduct.title,
                    body_html: bodyHtml,
                    vendor: parentProduct.aqMfrName,
                    product_type: parentProduct.productType,
                    tags: tags,
                    handle: `${parentProduct.aqMfrName}-${prefix}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    options: [{ name: 'Design' }, { name: 'Size' }],
                    variants: shopifyVariants,
                    images: parentProduct.images,
                    metafields: [
                        { key: 'prefix', value: prefix, type: 'single_line_text_field', namespace: 'custom' },
                        { key: 'aq_id', value: parentProduct.aqProductId, type: 'single_line_text_field', namespace: 'custom' },
                        ...(parentProduct.specSheetUrl ? [{ key: 'spec_sheet_url', value: parentProduct.specSheetUrl, type: 'url', namespace: 'custom' }] : [])
                    ]
                };

                // Push to Shopify
                const existing = await this.shopifyClient.findProductByHandle(shopifyData.handle);
                let shopifyId = '';
                if (existing) {
                    const res = await this.shopifyClient.updateProduct(existing.id, shopifyData);
                    shopifyId = res ? `${res.id}` : '';
                } else {
                    console.log(`Creating ${shopifyData.handle}...`);
                    const res = await this.shopifyClient.createProduct(shopifyData);
                    shopifyId = res ? `${res.id}` : '';
                }

                // Update DB Status for ALL products in group
                for (const prod of groupedProds) {
                    if (prod.status !== 'archived') {
                        prod.status = 'synced';
                    }
                    prod.shopifyId = shopifyId;
                    prod.shopifyHandle = shopifyData.handle;
                    prod.lastSynced = new Date();
                    await prod.save();
                }

            } catch (err: any) {
                console.error(`Failed to sync group ${prefix} to Shopify:`, err);
                for (const prod of groupedProds) {
                    prod.status = 'error';
                    prod.syncError = JSON.stringify(err);
                    await prod.save();
                }
            }
        }

        // Process Ungrouped Products (Legacy Logic)
        for (const product of ungroupedProducts) {
            try {
                // Construct Body HTML
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
                }

                // Inject Category Tags (case-insensitive match to handle vendor/productType casing differences)
                let tags = product.tags ? [...product.tags] : [];
                
                // 1. Existing Logic: Exact match on productType
                const exactRule = categoryRules.find((r: any) =>
                    r.vendor.toLowerCase().trim() === (product.aqMfrName || '').toLowerCase().trim() &&
                    r.productType.toLowerCase().trim() === (product.productType || '').toLowerCase().trim()
                );
                if (exactRule) {
                    console.log(`🏷️  Applying category tags for ${product.aqMfrName} / ${product.productType}: ${exactRule.parentCategory} > ${exactRule.subCategory} > ${exactRule.childCategory}`);
                    const cTags = [`Category_${exactRule.parentCategory}`, `Sub_${exactRule.subCategory}`, `Child_${exactRule.childCategory}`];
                    cTags.forEach(t => { if (!tags.includes(t)) tags.push(t); });
                } else {
                    console.log(`ℹ️  No category rule found for exact match: "${product.aqMfrName}" / "${product.productType}"`);
                }

                // 2. New Logic: Dynamic Keyword Scanning (Title, Product Type, Description)
                const searchableText = [
                    product.title || '',
                    product.productType || '',
                    (product.descriptionHtml || '').replace(/<[^>]*>?/gm, ' ')
                ].join(' ').toLowerCase();

                const vendorRules = categoryRules.filter((r: any) => 
                    r.vendor.toLowerCase().trim() === (product.aqMfrName || '').toLowerCase().trim()
                );
                
                for (const r of vendorRules) {
                    const keyword = r.productType.toLowerCase().trim();
                    const subKeyword = (r.subCategory || '').toLowerCase().trim();
                    const childKeyword = (r.childCategory || '').toLowerCase().trim();

                    if (keyword && searchableText.includes(keyword)) {
                        // Apply the keyword tag
                        if (!tags.includes(r.productType)) {
                            tags.push(r.productType);
                            console.log(`🔍 Keyword "${r.productType}" found in product text! Applied tag to ${product.aqModelNumber}`);
                        }
                        // Apply the hierarchy tags
                        if (r.parentCategory && !tags.includes(`Category_${r.parentCategory}`)) tags.push(`Category_${r.parentCategory}`);
                        if (r.subCategory && !tags.includes(`Sub_${r.subCategory}`)) tags.push(`Sub_${r.subCategory}`);
                        if (r.childCategory && !tags.includes(`Child_${r.childCategory}`)) tags.push(`Child_${r.childCategory}`);
                    }

                    // Independent check for Sub Category keyword
                    if (subKeyword && searchableText.includes(subKeyword) && !tags.includes(r.subCategory)) {
                        tags.push(r.subCategory);
                        console.log(`🔍 Sub-Category Keyword "${r.subCategory}" found! Applied raw tag to ${product.aqModelNumber}`);
                    }

                    // Independent check for Child Category keyword
                    if (childKeyword && searchableText.includes(childKeyword) && !tags.includes(r.childCategory)) {
                        tags.push(r.childCategory);
                        console.log(`🔍 Child-Category Keyword "${r.childCategory}" found! Applied raw tag to ${product.aqModelNumber}`);
                    }
                }

                // Check for Native DB Variants First
                let shopifyVariants = [];
                let options = undefined;

                if (product.variants && product.variants.length > 0) {
                    // Group options
                    const optionsMap = new Map();
                    product.variants.forEach((v: any) => {
                         if (v.option1) optionsMap.set('option1', v.option1);
                         if (v.option2) optionsMap.set('option2', v.option2);
                         if (v.option3) optionsMap.set('option3', v.option3);
                    });
                    
                    if (optionsMap.size > 0) {
                        options = [];
                        if (optionsMap.has('option1')) options.push({ name: product.variants[0].option1 });
                        if (optionsMap.has('option2')) options.push({ name: product.variants[0].option2 });
                        if (optionsMap.has('option3')) options.push({ name: product.variants[0].option3 });
                    }

                    shopifyVariants = product.variants.map((v: any) => ({
                        price: v.price,
                        sku: v.sku,
                        option1: v.value1,
                        option2: v.value2,
                        option3: v.value3,
                        inventory_management: v.inventory > 0 ? 'shopify' : null,
                        inventory_quantity: v.inventory > 0 ? v.inventory : undefined
                    }));

                } else {
                    // Fallback to Google Sheets (Legacy)
                    const customVariants = await this.googleSheets.getVariants(product.aqModelNumber);
                    
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
                        options = [{ name: customVariants[0].optionName }];
                    } else {
                         // Default Single Variant
                         shopifyVariants.push({
                            price: product.finalPrice,
                            sku: product.aqModelNumber,
                            option1: 'Default Title',
                            inventory_management: null
                        });
                    }
                }

                const shopifyStatus = product.status === 'archived' ? 'draft' : 'active';
                const shopifyData = {
                    status: shopifyStatus,
                    title: product.title,
                    body_html: bodyHtml,
                    vendor: product.aqMfrName,
                    product_type: product.productType,
                    tags: tags,
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

                const existing = await this.shopifyClient.findProductByHandle(shopifyData.handle);
                let shopifyId = '';
                if (existing) {
                    const res = await this.shopifyClient.updateProduct(existing.id, shopifyData);
                    shopifyId = res ? `${res.id}` : '';
                } else {
                    console.log(`Creating ${shopifyData.handle}...`);
                    const res = await this.shopifyClient.createProduct(shopifyData);
                    shopifyId = res ? `${res.id}` : '';
                }

                if (product.status !== 'archived') {
                    product.status = 'synced';
                }
                product.shopifyId = shopifyId;
                product.shopifyHandle = shopifyData.handle;
                product.lastSynced = new Date();
                await product.save();

            } catch (err: any) {
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
            // Use stored aqNetPrice, fallback to list if missing (old data)
            const aqNet = p.aqNetPrice || 0;

            const pricingResult = this.pricingEngine.calculatePrice({
                ListPrice: p.listPrice,
                NetPrice: aqNet,
                Manufacturer: p.aqMfrName,
                ModelNumber: p.aqModelNumber
            });

            p.finalPrice = pricingResult.finalPrice;
            p.netCost = pricingResult.netCost;

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
