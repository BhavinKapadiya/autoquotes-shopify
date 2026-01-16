import { google } from 'googleapis';
import { AQVariant } from '../types';
import * as path from 'path';

export class GoogleSheetsAdapter {
    private sheets: any;
    private spreadsheetId: string | undefined;
    private cache: AQVariant[] | null = null;
    private lastFetch: number = 0;
    private CACHE_TTL = 1000 * 60 * 5; // 5 minutes

    constructor() {
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        if (!this.spreadsheetId || !keyFile) {
            console.warn('⚠️ Google Sheets credentials missing. Variant sync will be skipped.');
            return;
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: keyFile,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        this.sheets = google.sheets({ version: 'v4', auth });
    }

    private async fetchAllVariants(): Promise<AQVariant[]> {
        // Return cached if valid
        if (this.cache && (Date.now() - this.lastFetch < this.CACHE_TTL)) {
            return this.cache;
        }

        if (!this.sheets || !this.spreadsheetId) return [];

        let rows;
        try {
            console.log('Fetching variants from Google Sheets (Variants tab)...');
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Variants!A2:E',
            });
            rows = response.data.values;
        } catch (error: any) {
            // Fallback to Sheet1 if tab not found
            if (error.message && error.message.includes('Unable to parse range')) {
                console.warn('Tab "Variants" not found. Trying "Sheet1"...');
                try {
                    const response = await this.sheets.spreadsheets.values.get({
                        spreadsheetId: this.spreadsheetId,
                        range: 'Sheet1!A2:E',
                    });
                    rows = response.data.values;
                } catch (innerError) {
                    console.error('Failed to fetch from Sheet1 as well:', innerError);
                    return [];
                }
            } else {
                throw error;
            }
        }

        if (!rows || rows.length === 0) {
            console.log('No data found in Sheets.');
            this.cache = [];
            return [];
        }

        // Map rows to objects
        const variants: AQVariant[] = rows.map((row: any[]) => ({
            modelNumber: row[0]?.trim() || '',
            optionName: row[1]?.trim() || '',
            optionValue: row[2]?.trim() || '',
            priceMod: parseFloat(row[3]) || 0,
            skuMod: row[4]?.trim() || ''
        })).filter((v: AQVariant) => v.modelNumber !== '');

        this.cache = variants;
        this.lastFetch = Date.now();
        console.log(`Loaded ${variants.length} variant rules.`);
        return variants;

    }

    async getVariants(modelNumber: string): Promise<AQVariant[]> {
        const allVariants = await this.fetchAllVariants();
        return allVariants.filter(v => v.modelNumber.toLowerCase() === modelNumber.toLowerCase());
    }
}
