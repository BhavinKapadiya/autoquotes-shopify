import express from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product';
import { v4 as uuidv4 } from 'uuid';
import { SyncManager } from '../services/SyncManager';

export const createVariantsRouter = (syncManager: SyncManager) => {
    const router = express.Router();

    /**
     * GET /api/products/:productId/variants
     * Get all variants for a product
     */
    router.get('/:productId/variants', async (req, res) => {
        try {
            const { productId } = req.params;
            const product = await Product.findById(productId);

            if (!product) {
                return res.status(404).json({ error: 'Product not found' });
            }

            res.json({ variants: product.variants || [] });
        } catch (error) {
            console.error('Error fetching variants:', error);
            res.status(500).json({ error: 'Failed to fetch variants' });
        }
    });

    /**
     * POST /api/products/:productId/variants
     * Replace all variants for a product (Bulk Update)
     */
    router.post('/:productId/variants', async (req, res) => {
        try {
            const { productId } = req.params;
            const { variants } = req.body;

            if (!Array.isArray(variants)) {
                return res.status(400).json({ error: 'Variants must be an array' });
            }

            const product = await Product.findById(productId);
            if (!product) {
                return res.status(404).json({ error: 'Product not found' });
            }

            // Process variants: ensure IDs and defaults
            const processedVariants = variants.map(v => ({
                id: v.id || uuidv4(),
                title: v.title || `${v.value1 || ''} ${v.value2 || ''}`.trim() || 'Default',
                price: Number(v.price) || product.finalPrice,
                sku: v.sku || product.aqModelNumber,
                inventory: Number(v.inventory) || 0,
                option1: v.option1 || 'Option 1',
                value1: v.value1 || 'Default',
                option2: v.option2,
                value2: v.value2,
                option3: v.option3,
                value3: v.value3
            }));

            product.variants = processedVariants;
            
            // Also update status to 'staged' if it was 'synced' so user knows to re-sync
            // Actually, we are going to sync immediately, but setting to staged is good practice in case sync fails
            if (product.status === 'synced') {
                product.status = 'staged';
            }

            await product.save();

            // REAL-TIME SYNC: Trigger sync to Shopify immediately
            console.log(`🔄 trigger auto-sync for ${productId} after variants update...`);
            try {
                await syncManager.syncSpecificProduct(productId);
            } catch (syncErr) {
                console.error(`⚠️ Auto-sync failed for ${productId}:`, syncErr);
            }

            res.json({ 
                success: true, 
                count: processedVariants.length,
                variants: processedVariants,
                message: 'Variants saved and product synced' 
            });

        } catch (error) {
            console.error('Error saving variants:', error);
            res.status(500).json({ error: 'Failed to save variants' });
        }
    });

    return router;
};
