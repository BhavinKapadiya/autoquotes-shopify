import express from 'express';
import ManufacturerConfig from '../models/ManufacturerConfig';
import { DataProfiler } from '../services/DataProfiler';
import { OpenAIService } from '../services/OpenAIService';

export default function createConfigRouter() {
    const router = express.Router();

    /**
     * GET /api/config/:mfrName/analyze
     * Generates a data profile for the manufacturer and gets AI suggestions.
     * Does NOT save to DB. Just returns the analysis to the frontend.
     */
    router.get('/:mfrName/analyze', async (req, res) => {
        try {
            const mfrName = req.params.mfrName;
            
            const profiler = new DataProfiler();
            const profile = await profiler.generateProfile(mfrName);

            const aiService = new OpenAIService();
            const suggestions = await aiService.suggestConfiguration(profile);

            res.json({
                profile,
                suggestions
            });
        } catch (error: any) {
            console.error('Error analyzing manufacturer:', error);
            res.status(500).json({ error: error.message || 'Failed to analyze manufacturer data' });
        }
    });

    /**
     * GET /api/config/:mfrName
     * Fetch the saved configuration for a manufacturer.
     */
    router.get('/:mfrName', async (req, res) => {
        try {
            const config = await ManufacturerConfig.findOne({ mfrName: new RegExp(`^${req.params.mfrName}$`, 'i') });
            if (!config) {
                return res.status(404).json({ error: 'Configuration not found' });
            }
            res.json(config);
        } catch (error) {
            console.error('Error fetching config:', error);
            res.status(500).json({ error: 'Failed to fetch configuration' });
        }
    });

    /**
     * POST /api/config/:mfrName
     * Save the user-approved configuration to the database.
     */
    router.post('/:mfrName', async (req, res) => {
        try {
            const mfrName = req.params.mfrName;
            const payload = req.body;

            // Ensure mfrName is set in payload
            payload.mfrName = mfrName;

            const config = await ManufacturerConfig.findOneAndUpdate(
                { mfrName: new RegExp(`^${mfrName}$`, 'i') },
                payload,
                { new: true, upsert: true, runValidators: true }
            );

            res.json(config);
        } catch (error: any) {
            console.error('Error saving config:', error);
            res.status(500).json({ error: error.message || 'Failed to save configuration' });
        }
    });

    return router;
}
