import { Router } from 'express';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import Product from '../models/Product';

const router = Router();

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

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP_NAME;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Build the shop domain - handle both "store-name" and "store-name.myshopify.com" formats
function getShopDomain(): string {
    const shop = SHOPIFY_SHOP || '';
    // If already has .myshopify.com, use as-is; otherwise append it
    return shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
}

/**
 * Upload image to Shopify Files via GraphQL API
 */
async function uploadToShopifyFiles(fileBuffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const shopDomain = getShopDomain();
    const graphqlEndpoint = `https://${shopDomain}/admin/api/2024-10/graphql.json`;
    
    console.log(`📡 Shopify GraphQL endpoint: ${graphqlEndpoint}`);
    
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
                'X-Shopify-Access-Token': SHOPIFY_TOKEN,
                'Content-Type': 'application/json'
            }
        }
    );

    // Log the full response for debugging
    console.log('📋 Shopify stagedUploads response:', JSON.stringify(stagedResponse.data, null, 2));

    // Check for GraphQL errors (authentication, permission issues)
    if (stagedResponse.data.errors) {
        console.error('❌ Shopify GraphQL errors:', stagedResponse.data.errors);
        throw new Error(`Shopify API error: ${stagedResponse.data.errors[0]?.message || 'Unknown error'}`);
    }

    // Check if stagedUploadsCreate is null (usually means auth failed)
    if (!stagedResponse.data.data?.stagedUploadsCreate) {
        console.error('❌ stagedUploadsCreate is null. Full response:', stagedResponse.data);
        throw new Error('Shopify API returned null. Check access token and permissions.');
    }

    const stagedData = stagedResponse.data.data.stagedUploadsCreate;
    
    if (stagedData.userErrors?.length > 0) {
        throw new Error(`Staged upload error: ${stagedData.userErrors[0].message}`);
    }

    const target = stagedData.stagedTargets[0];
    const uploadUrl = target.url;
    const resourceUrl = target.resourceUrl;
    const parameters = target.parameters;

    // Step 2: Upload file to staged URL
    const formData = new FormData();
    
    // Add all parameters from Shopify
    for (const param of parameters) {
        formData.append(param.name, param.value);
    }
    
    // Add the file last
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
                'X-Shopify-Access-Token': SHOPIFY_TOKEN,
                'Content-Type': 'application/json'
            }
        }
    );

    const fileData = fileCreateResponse.data.data.fileCreate;
    
    if (fileData.userErrors?.length > 0) {
        throw new Error(`File create error: ${fileData.userErrors[0].message}`);
    }

    // The file creation is async in Shopify, so we use resourceUrl directly
    // For immediate use, we'll use the resourceUrl which works as a valid image source
    return resourceUrl;
}

/**
 * POST /api/products/:productId/image
 * Upload a new image for a product
 */
/**
 * POST /api/products/:productId/image
 * Upload new images for a product (Support Multiple)
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
                const imageUrl = await uploadToShopifyFiles(
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

        // Update product in database
        // Append new images to the existing list
        if (!product.images) {
            product.images = [];
        }

        // Add new images
        const newImages = uploadedUrls.map(url => ({ src: url }));
        product.images.push(...newImages);

        // Mark as staged so it gets synced
        product.status = 'staged';
        await product.save();

        res.json({
            success: true,
            imageUrls: uploadedUrls,
            message: `Successfully uploaded ${uploadedUrls.length} images`,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error: any) {
        console.error('Image upload error:', error);
        res.status(500).json({
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

        // Mark as staged
        product.status = 'staged';
        await product.save();

        res.json({ success: true, message: 'Image removed', images: product.images });

    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});

export default router;
