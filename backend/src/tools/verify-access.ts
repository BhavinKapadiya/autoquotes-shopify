import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SHOP = process.env.SHOPIFY_SHOP_NAME;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOP || !TOKEN) {
    console.error('Missing credentials in .env');
    process.exit(1);
}

async function verify() {
    const url = `https://${SHOP}/admin/api/2024-01/shop.json`;
    console.log(`Testing connection to: ${url}`);

    try {
        const response = await axios.get(url, {
            headers: {
                'X-Shopify-Access-Token': TOKEN
            }
        });

        console.log('✅ Connection Successful!');
        console.log('Shop ID:', response.data.shop.id);
        console.log('Shop Name:', response.data.shop.name);
        console.log('Email:', response.data.shop.email);

        // Check scopes from headers if available
        // Note: Axios headers are lowercase
        console.log('Granted Scopes:', response.headers['x-shopify-shop-api-call-limit']);
        // actually x-shopify-access-scopes is the one
        console.log('X-Shopify-Access-Scopes:', response.headers['x-shopify-access-scopes'] || 'Not found');

        // Check Products Access
        console.log('\nTesting Product Access...');
        const productsUrl = `https://${SHOP}/admin/api/2024-01/products.json?limit=1`;
        const prodResponse = await axios.get(productsUrl, {
            headers: { 'X-Shopify-Access-Token': TOKEN }
        });
        console.log('✅ Product Access Successful!');
        console.log('Found products:', prodResponse.data.products.length);

    } catch (error: any) {
        console.error('❌ Request Failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Headers:', error.response.headers);
        }
    }
}

verify();
