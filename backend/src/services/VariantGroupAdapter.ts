import { google } from 'googleapis';

export interface VariantData {
    model: string;
    description: string;
    prefix: string;  // Grouping key — maps multiple models under one Shopify product
    design: string;  // Shopify option1 value (e.g. description/model label)
    size: string;    // Shopify option2 value (e.g. capacity/dimensions)
}

/**
 * VariantGroupAdapter
 * 
 * Reads the variant grouping Google Sheet via the Sheets API using the Thunder
 * service account credentials (THUNDER_GOOGLE_CREDENTIALS).
 * 
 * Sheet structure expected (per tab, first row = headers):
 *   ID | Model | Description | ... | Capacity | Dimensions | ...
 * 
 * - ID:          Grouping identifier. Rows sharing the same ID (per tab) are
 *                grouped as variants of one Shopify product.
 * - Model:       The AQ model number. Used as the Map key for lookup.
 * - Description: Human-readable label used as the variant option value.
 * - Capacity:    Preferred size/option2 value; falls back to Dimensions.
 */
export class VariantGroupAdapter {
    private sheets: any;
    private spreadsheetId: string | undefined;

    constructor() {
        this.spreadsheetId = process.env.VARIANT_SHEET_ID;
        const keyFile = process.env.THUNDER_GOOGLE_CREDENTIALS;

        if (!this.spreadsheetId || !keyFile) {
            console.warn('⚠️  VariantGroupAdapter: VARIANT_SHEET_ID or THUNDER_GOOGLE_CREDENTIALS not set. Variant grouping will be skipped.');
            return;
        }

        try {
            const auth = new google.auth.GoogleAuth({
                keyFile,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
            });
            this.sheets = google.sheets({ version: 'v4', auth });
        } catch (err) {
            console.error('❌ Failed to initialise VariantGroupAdapter Sheets client:', err);
        }
    }

    /**
     * Fetches all tabs in the spreadsheet and returns a Map keyed by model number.
     * If the sheet is inaccessible or env vars are missing, returns an empty Map
     * so the rest of the sync can continue unaffected.
     */
    async getVariantMappings(): Promise<Map<string, VariantData>> {
        const mappings = new Map<string, VariantData>();

        if (!this.sheets || !this.spreadsheetId) return mappings;

        try {
            console.log('📊 Fetching variant groupings from Google Sheets API...');

            // Step 1: Get the list of all tab names
            const metaResponse = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId,
                fields: 'sheets.properties.title',
            });

            const sheetTitles: string[] = (metaResponse.data.sheets || []).map(
                (s: any) => s.properties?.title as string
            ).filter(Boolean);

            console.log(`   Found ${sheetTitles.length} tab(s): ${sheetTitles.join(', ')}`);

            // Step 2: Read each tab
            for (const title of sheetTitles) {
                try {
                    const response = await this.sheets.spreadsheets.values.get({
                        spreadsheetId: this.spreadsheetId,
                        range: `'${title}'!A1:Z`,
                    });

                    const rows: any[][] = response.data.values || [];
                    if (rows.length < 2) continue; // No data rows

                    // Parse header row
                    const headers: string[] = rows[0].map((h: any) => String(h ?? '').trim());
                    const col = (name: string) => headers.indexOf(name);

                    const idIdx          = col('ID');
                    const modelIdx       = col('Model');
                    const descIdx        = col('Description');
                    const capacityIdx    = col('Capacity');
                    const dimensionsIdx  = col('Dimensions');

                    if (modelIdx === -1) {
                        console.warn(`   ⚠️  Tab "${title}" has no "Model" column — skipped.`);
                        continue;
                    }

                    // Parse data rows
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        const model = row[modelIdx]?.trim();
                        if (!model) continue;

                        const id          = idIdx >= 0          ? String(row[idIdx]         ?? '').trim() : '';
                        const description = descIdx >= 0        ? String(row[descIdx]        ?? '').trim() : '';
                        const capacity    = capacityIdx >= 0    ? String(row[capacityIdx]    ?? '').trim() : '';
                        const dimensions  = dimensionsIdx >= 0  ? String(row[dimensionsIdx]  ?? '').trim() : '';

                        // Build a stable prefix: tab name + ID so that IDs from different tabs don't collide.
                        // If there's no ID, the model stands alone (no grouping).
                        const prefix = id ? `${title.replace(/\s+/g, '_')}-${id}` : model;

                        mappings.set(model, {
                            model,
                            description,
                            prefix,
                            design: description || model,
                            size: capacity || dimensions || 'Standard',
                        });
                    }
                } catch (tabErr: any) {
                    console.warn(`   ⚠️  Could not read tab "${title}": ${tabErr?.message}`);
                }
            }

            console.log(`✅ Loaded ${mappings.size} variant mapping entries across ${sheetTitles.length} tab(s).`);
            return mappings;

        } catch (error: any) {
            console.error('❌ Error fetching variant grouping sheet:', error?.message || error);
            return mappings; // Non-fatal — sync continues without grouping
        }
    }
}
