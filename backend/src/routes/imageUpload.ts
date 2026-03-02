import { Router } from 'express';
import multer from 'multer';
import Product from '../models/Product';
import { ShopifyClient } from '../services/ShopifyClient';
import { SyncManager } from '../services/SyncManager';

// Configure multer for memory storage (we'll stream to Shopify)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
        }
    }
});

const shopifyClient = new ShopifyClient();

export const createImageUploadRouter = (syncManager: SyncManager) => {
    const router = Router();

    /**
     * POST /api/products/:productId/image
     * Upload new images for a product (supports multiple)
     */
    router.post('/:productId/image', upload.array('images', 10), async (req, res) => {
        try {
            const { productId } = req.params;
            const files = req.files as Express.Multer.File[];

            if (!files || files.length === 0) {
                return res.status(400).json({ error: 'No image files provided' });
            }

            // Find product
            const product = await Product.findById(productId);
            if (!product) {
                return res.status(404).json({ error: 'Product not found' });
            }

            console.log(`📸 Uploading ${files.length} images for product: ${product.title}`);

            const uploadedUrls: string[] = [];
            const errors: string[] = [];

            // Upload each file to Shopify Files
            for (const file of files) {
                try {
                    const imageUrl = await shopifyClient.uploadToShopifyFiles(
                        file.buffer,
                        file.originalname,
                        file.mimetype
                    );
                    uploadedUrls.push(imageUrl);
                    console.log(`✅ Image uploaded to Shopify: ${imageUrl}`);
                } catch (err: any) {
                    console.error(`❌ Failed to upload ${file.originalname}:`, err.message);
                    errors.push(`${file.originalname}: ${err.message}`);
                }
            }

            if (uploadedUrls.length === 0) {
                return res.status(500).json({
                    error: 'Failed to upload any images',
                    details: errors
                });
            }

            // Append new images to the existing list
            if (!product.images) {
                product.images = [];
            }
            product.images.push(...uploadedUrls.map(url => ({ src: url })));
            product.status = 'staged';
            await product.save();

            // REAL-TIME SYNC: Trigger sync to Shopify immediately
            console.log(`🔄 Triggering auto-sync for ${product.aqProductId} after image upload...`);
            try {
                await syncManager.syncToShopify(product.aqProductId);
            } catch (syncErr: any) {
                // Don't fail the request, just log. The images are already saved in DB.
                console.error(`⚠️ Auto-sync failed for ${productId} after upload:`, syncErr?.message || syncErr);
            }

            return res.json({
                success: true,
                imageUrls: uploadedUrls,
                message: `Successfully uploaded ${uploadedUrls.length} image(s) and synced to Shopify`,
                errors: errors.length > 0 ? errors : undefined
            });

        } catch (error: any) {
            console.error('Image upload error:', error);
            return res.status(500).json({
                error: 'Failed to upload images',
                details: error.message
            });
        }
    });

    /**
     * DELETE /api/products/:productId/images
     * Remove an image from a product
     */
    router.delete('/:productId/images', async (req, res) => {
        try {
            const { productId } = req.params;
            const { imageUrl, imageId } = req.body;

            if (!imageUrl && !imageId) {
                return res.status(400).json({ error: 'Image URL or ID is required' });
            }

            const product = await Product.findById(productId);
            if (!product) {
                return res.status(404).json({ error: 'Product not found' });
            }

            if (!product.images || product.images.length === 0) {
                return res.status(400).json({ error: 'Product has no images' });
            }

            // Filter out the image
            const originalLength = product.images.length;

            if (imageId) {
                product.images = product.images.filter(img =>
                    (img as any)._id?.toString() !== imageId
                );
            } else {
                product.images = product.images.filter(img => img.src !== imageUrl);
            }

            if (product.images.length === originalLength) {
                return res.status(400).json({ error: 'Image not found in product' });
            }

            product.status = 'staged';
            await product.save();

            // REAL-TIME SYNC: Trigger sync to Shopify immediately
            console.log(`🔄 Triggering auto-sync for ${product.aqProductId} after image delete...`);
            try {
                await syncManager.syncToShopify(product.aqProductId);
            } catch (syncErr: any) {
                console.error(`⚠️ Auto-sync failed for ${productId} after delete:`, syncErr?.message || syncErr);
            }

            return res.json({ success: true, message: 'Image removed and product synced', images: product.images });

        } catch (error: any) {
            console.error('Error deleting image:', error);
            return res.status(500).json({ error: 'Failed to delete image', details: error.message });
        }
    });

    return router;
};
