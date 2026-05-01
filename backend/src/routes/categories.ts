import express from 'express';
import CategoryRule from '../models/CategoryRule';

const router = express.Router();

/**
 * GET /api/categories/rules
 * Get all category mapping rules
 */
router.get('/rules', async (req, res) => {
    try {
        const rules = await CategoryRule.find().sort({ vendor: 1, productType: 1 });
        res.json(rules);
    } catch (error) {
        console.error('Error fetching category rules:', error);
        res.status(500).json({ error: 'Failed to fetch category rules' });
    }
});

/**
 * POST /api/categories/rules
 * Create or update a category mapping rule
 */
router.post('/rules', async (req, res) => {
    try {
        const { vendor, productType, parentCategory, subCategory, childCategory } = req.body;

        if (!vendor || !productType || !parentCategory || !subCategory || !childCategory) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Use findOneAndUpdate with upsert to handle both create and update
        const rule = await CategoryRule.findOneAndUpdate(
            { vendor, productType },
            { vendor, productType, parentCategory, subCategory, childCategory },
            { new: true, upsert: true, runValidators: true }
        );

        res.json({ success: true, rule });
    } catch (error) {
        console.error('Error saving category rule:', error);
        res.status(500).json({ error: 'Failed to save category rule' });
    }
});

/**
 * DELETE /api/categories/rules/:id
 * Delete a category mapping rule
 */
router.delete('/rules/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await CategoryRule.findByIdAndDelete(id);
        
        if (!result) {
            return res.status(404).json({ error: 'Category rule not found' });
        }

        res.json({ success: true, message: 'Category rule deleted' });
    } catch (error) {
        console.error('Error deleting category rule:', error);
        res.status(500).json({ error: 'Failed to delete category rule' });
    }
});

export default router;
