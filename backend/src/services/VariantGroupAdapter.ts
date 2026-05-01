import Papa from 'papaparse';
import axios from 'axios';

export interface VariantData {
    model: string;
    description: string;
    prefix: string;
    design: string;
    size: string;
}

export class VariantGroupAdapter {
    // The public CSV export URL for the provided Google Sheet
    private readonly SHEET_CSV_URL = process.env.VARIANT_SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/1F0O_B5O04w7YvbKIM6O0jQjazGyC8Bqnq4hT7DELiQw/export?format=csv&gid=0';

    /**
     * Fetches and parses the public variant Google Sheet.
     * Returns a Map where the key is the Model number and value is the variant details.
     */
    async getVariantMappings(): Promise<Map<string, VariantData>> {
        const mappings = new Map<string, VariantData>();
        
        try {
            console.log(`Fetching Variant groupings from Google Sheets...`);
            const response = await axios.get(this.SHEET_CSV_URL);
            
            const result = Papa.parse(response.data, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (h) => h.trim(),
            });

            if (result.errors && result.errors.length > 0) {
                console.warn('Warnings while parsing variant CSV:', result.errors);
            }

            for (const row of result.data as any[]) {
                const model = row['Model']?.trim();
                if (!model) continue;

                mappings.set(model, {
                    model: model,
                    description: row['Description']?.trim() || '',
                    prefix: row['Prefix']?.trim() || model, // Fallback to model if prefix missing
                    design: row['Design']?.trim() || 'Standard',
                    size: row['Size']?.trim() || 'Standard'
                });
            }

            console.log(`Loaded ${mappings.size} variant mapping rules.`);
            return mappings;
        } catch (error) {
            console.error('Error fetching/parsing variant sheet:', error);
            // Return empty map on error so sync can proceed using legacy behavior
            return mappings;
        }
    }
}
