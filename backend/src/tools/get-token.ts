import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3456;

// Instructions:
// 1. Set SHOPIFY_API_KEY (Client ID) and SHOPIFY_API_SECRET (Client Secret) in your .env or pass them as args.
// 2. Set SHOPIFY_SHOP_NAME in .env
// 3. Ensure "http://localhost:3000/callback" is added to "Allowed redirection URL(s)" in your Partner Dashboard > App Setup.

const CLIENT_ID = process.env.SHOPIFY_API_KEY; // Map Client ID to this
const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET; // Map Secret to this
const SHOP = process.env.SHOPIFY_SHOP_NAME;
const SCOPES = 'read_products,write_products,read_files,write_files';
const REDIRECT_URI = `http://localhost:${port}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET || !SHOP) {
    console.error('❌ Missing Credentials! Please check your .env file or script constants.');
    console.log('Required: SHOPIFY_API_KEY (Client ID), SHOPIFY_API_SECRET (Secret), SHOPIFY_SHOP_NAME');
    process.exit(1);
}

app.get('/install', (req, res) => {
    const installUrl = `https://${SHOP}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}`;
    console.log(`Open this URL to install: ${installUrl}`);
    res.redirect(installUrl);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        res.status(400).send('Missing authorization code');
        return;
    }

    try {
        const response = await axios.post(`https://${SHOP}/admin/oauth/access_token`, {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
        });

        const accessToken = response.data.access_token;

        console.log('\n\n✅ SUCCESS! Here is your Access Token:');
        console.log('==========================================');
        console.log(`SHOPIFY_ACCESS_TOKEN=${accessToken}`);
        console.log('==========================================\n');
        console.log('Copy this token to your .env file.');

        res.send('<h1>Success! Check your terminal for the Access Token.</h1>');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error getting token:', error.response?.data || error.message);
        res.status(500).send('Error retrieving token. Check terminal.');
    }
});

app.listen(port, async () => {
    // Dynamically import 'open' to handle ESM/CommonJS if needed, or just print
    console.log(`\n🚀 Token Generator running on http://localhost:${port}`);
    console.log(`\nIMPORTANT: If you are fixing a 403 error:`);
    console.log(`   Go to Shopify Admin > Settings > Apps > UNINSTALL 'AutoQuotes API' first.`);
    console.log(`   Then allow the browser to re-install it.`);
    console.log(`\n1. Ensure "http://localhost:${port}/callback" is in your Partner Dashboard App Setup.`);
    console.log(`2. Opening browser to start auth...`);

    try {
        // Simple hack to open URL
        const start = (process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open');
        require('child_process').exec(start + ' ' + `http://localhost:${port}/install`);
    } catch (e) {
        console.log(`Click here: http://localhost:${port}/install`);
    }
});
