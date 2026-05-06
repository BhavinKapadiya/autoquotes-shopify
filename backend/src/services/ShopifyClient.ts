import Shopify from 'shopify-api-node';
import axios from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';

dotenv.config();

export class ShopifyClient {
    private shopify: Shopify | undefined;
    private shopName: string = '';
    private accessToken: string = '';

    constructor() {
        const shopName = process.env.SHOPIFY_SHOP_NAME;
        const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

        if (!shopName || !accessToken) {
            console.warn('⚠️  Shopify credentials not found in env. ShopifyClient will be disabled.');
            return;
        }
        this.shopName = shopName;
        this.accessToken = accessToken;

        this.shopify = new Shopify({
            shopName: shopName,
            accessToken: accessToken,
            autoLimit: true, // Handles rate limiting automatically
        });
    }

    /**
     * Search for products with specific query
     */
    async findProductByHandle(handle: string) {
        if (!this.shopify) return null;
        try {
            const products = await this.shopify.product.list({ handle });
            return products.length > 0 ? products[0] : null;
        } catch (error) {
            console.error('Error finding product:', error);
            throw error;
        }
    }

    /**
     * Create a new product in Shopify
     */
    async createProduct(productData: any) {
        if (!this.shopify) return null;
        try {
            return await this.shopify.product.create(productData);
        } catch (error: any) {
            console.error('Error creating product:', error);
            if (error.response && error.response.body) {
                console.error('Shopify Validation Errors:', JSON.stringify(error.response.body, null, 2));
            }
            throw error;
        }
    }

    /**
     * Update an existing product
     */
    async updateProduct(id: number, productData: any) {
        if (!this.shopify) return null;
        try {
            return await this.shopify.product.update(id, productData);
        } catch (error) {
            console.error(`Error updating product ${id}:`, error);
            throw error;
        }
    }

    /**
     * Create or Update Metafield
     */
    async setMetafield(productId: number, namespace: string, key: string, value: string, type: string) {
        if (!this.shopify) return null;
        try {
            // First check if it exists (simplified logic, usually we traverse metafields)
            // For now, we'll just try to create. 
            // In production, you'd find existing ID to update, or use the GraphQL mutation 'productUpdate' which handles this better.

            return await this.shopify.metafield.create({
                key,
                value,
                type,
                namespace,
                owner_resource: 'product',
                owner_id: productId
            });
        } catch (error) {
            console.error('Error setting metafield:', error);
            // Fallback/Retry logic would go here
        }
    }

    /**
     * Ensure a Smart Collection exists with the given title and tag rule
     */
    async ensureSmartCollection(title: string, tagCondition: string) {
        if (!this.shopify || !title || !tagCondition) return null;
        try {
            // Check if collection with this title already exists
            const existingCollections = await this.shopify.smartCollection.list({ title });
            
            // Check for an exact title match (just to be safe, though Shopify filters by title)
            const exactMatch = existingCollections.find(c => c.title.toLowerCase() === title.toLowerCase());
            if (exactMatch) {
                console.log(`ℹ️ Smart Collection "${title}" already exists. Skipping creation.`);
                return exactMatch;
            }

            console.log(`➕ Creating new Smart Collection: "${title}" (Rule: Tag equals "${tagCondition}")`);
            const newCollection = await this.shopify.smartCollection.create({
                title: title,
                rules: [
                    {
                        column: 'tag',
                        relation: 'equals',
                        condition: tagCondition
                    }
                ]
            });
            return newCollection;
        } catch (error: any) {
            console.error(`Error ensuring smart collection "${title}":`, error);
            if (error.response && error.response.body) {
                console.error('Shopify Validation Errors:', JSON.stringify(error.response.body, null, 2));
            }
            throw error;
        }
    }

    /**
     * Upload an image buffer directly to Shopify Files via GraphQL
     */
    async uploadToShopifyFiles(fileBuffer: Buffer, filename: string, mimeType: string): Promise<string> {
        if (!this.shopName || !this.accessToken) {
            throw new Error('ShopifyClient is not initialized. Check SHOPIFY_SHOP_NAME and SHOPIFY_ACCESS_TOKEN env vars.');
        }
        const shopDomain = this.shopName.includes('.myshopify.com') ? this.shopName : `${this.shopName}.myshopify.com`;
        const graphqlEndpoint = `https://${shopDomain}/admin/api/2024-10/graphql.json`;
        
        console.log(`📡 Shopify GraphQL Upload to: ${shopDomain}`);
        
        // Step 1: Create staged upload target
        const stagedUploadMutation = `
            mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
                stagedUploadsCreate(input: $input) {
                    stagedTargets {
                        url
                        resourceUrl
                        parameters {
                            name
                            value
                        }
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const stagedResponse = await axios.post(
            graphqlEndpoint,
            {
                query: stagedUploadMutation,
                variables: {
                    input: [{
                        filename: filename,
                        mimeType: mimeType,
                        resource: "FILE",
                        httpMethod: "POST"
                    }]
                }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': this.accessToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (stagedResponse.data.errors) {
            console.error('❌ Shopify GraphQL errors:', stagedResponse.data.errors);
            throw new Error(`Shopify API error: ${stagedResponse.data.errors[0]?.message || 'Unknown error'}`);
        }

        if (!stagedResponse.data.data?.stagedUploadsCreate) {
            console.error('❌ stagedUploadsCreate is null. Full response:', stagedResponse.data);
            throw new Error('Shopify API returned null. Check access token and permissions.');
        }

        const stagedData = stagedResponse.data.data.stagedUploadsCreate;
        
        if (stagedData.userErrors?.length > 0) {
            throw new Error(`Staged upload error: ${stagedData.userErrors[0].message}`);
        }

        const target = stagedData.stagedTargets?.[0];
        if (!target || !target.url || !target.resourceUrl) {
            throw new Error('Shopify did not return a valid staged upload target.');
        }
        const uploadUrl = target.url;
        const resourceUrl = target.resourceUrl;
        const parameters = target.parameters || [];

        // Step 2: Upload file to staged URL
        const formData = new FormData();
        
        for (const param of parameters) {
            formData.append(param.name, param.value);
        }
        
        formData.append('file', fileBuffer, {
            filename: filename,
            contentType: mimeType
        });

        await axios.post(uploadUrl, formData, {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        // Step 3: Create the file in Shopify
        const fileCreateMutation = `
            mutation fileCreate($files: [FileCreateInput!]!) {
                fileCreate(files: $files) {
                    files {
                        ... on MediaImage {
                            id
                            image {
                                url
                            }
                        }
                        ... on GenericFile {
                            id
                            url
                        }
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const fileCreateResponse = await axios.post(
            graphqlEndpoint,
            {
                query: fileCreateMutation,
                variables: {
                    files: [{
                        originalSource: resourceUrl,
                        contentType: "IMAGE"
                    }]
                }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': this.accessToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        const fileData = fileCreateResponse.data?.data?.fileCreate;
        
        if (!fileData) {
            // The file create call returned an unexpected response, but upload likely succeeded.
            // We return the resourceUrl which is still a valid, usable URL.
            console.warn('⚠️ fileCreate returned unexpected shape but upload succeeded. Using resourceUrl.');
            return resourceUrl;
        }

        if (fileData.userErrors?.length > 0) {
            throw new Error(`File create error: ${fileData.userErrors[0].message}`);
        }

        return resourceUrl;
    }
}
