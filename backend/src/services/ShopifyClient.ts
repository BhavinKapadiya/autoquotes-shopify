import Shopify from 'shopify-api-node';
import dotenv from 'dotenv';

dotenv.config();

export class ShopifyClient {
    private shopify: Shopify | undefined;

    constructor() {
        const shopName = process.env.SHOPIFY_SHOP_NAME;
        const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

        if (!shopName || !accessToken) {
            console.warn('⚠️  Shopify credentials not found in env. ShopifyClient will be disabled.');
            return;
        }

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
}
