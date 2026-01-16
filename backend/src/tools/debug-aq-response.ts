import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.AQ_API_KEY;
const API_URL = process.env.AQ_API_URL || 'https://api.autoquotes.com/v1';
const MANUFACTURER_ID = '78512195-9f0a-de11-b012-001ec95274b6';

if (!API_KEY) {
    console.error('AQ_API_KEY is missing in .env');
    process.exit(1);
}

async function debugResponse() {
    try {
        const client = axios.create({
            baseURL: API_URL,
            headers: {
                'ocp-apim-subscription-key': API_KEY,
                'aq-languagecode': 'en',
                'Accept': 'application/json',
            },
        });

        console.log(`Fetching products for MFR: ${MANUFACTURER_ID}...`);
        const res = await client.get(`/manufacturers/${MANUFACTURER_ID}/products`);

        console.log('Status:', res.status);

        const data = res.data;
        if (data.data && Array.isArray(data.data)) {
            console.log(`Received ${data.data.length} items in 'data' array.`);

            // Search for the missing product
            const target = data.data.find((p: any) =>
                (p.models?.mfrModel && p.models.mfrModel.includes('FAT16')) ||
                (p.productId === 'FAT16')
            );

            if (target) {
                console.log('✅ FOUND "FAT16" in API Response!');
                console.log('Product Model:', target.models);
                console.log('Product ID:', target.productId);
            } else {
                console.log('❌ "FAT16" NOT FOUND in this list of 794 items.');
                console.log('Sample item models:', data.data.slice(0, 3).map((p: any) => p.models));
            }

        } else {
            console.log('No "data" array found.');
        }

        console.log('Top-level keys in response body:', Object.keys(data));

    } catch (error: any) {
        console.error('Request failed:', error.message);
        if (error.response) {
            console.error('Response Body:', error.response.data);
        }
    }
}

debugResponse();
