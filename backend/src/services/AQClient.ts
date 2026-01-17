import axios, { AxiosInstance } from 'axios';
import { AQProduct, AQResponse } from '../types';

export class AQClient {
    private client: AxiosInstance;
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        // Updated to new FES API endpoint provided by user
        this.baseUrl = process.env.AQ_API_URL || 'https://api.aq-fes.com/products-api';

        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'ocp-apim-subscription-key': this.apiKey,
                'aq-languagecode': 'en',
                'Accept': 'application/json',
            },
        });
    }

    /**
     * Fetches products for a specific manufacturer.
     */
    async getProducts(updatedAfter?: string, manufacturerId: string = '78512195-9f0a-de11-b012-001ec95274b6'): Promise<AQProduct[]> {
        try {
            const params: any = {}; // Limit might not be supported or is different here

            // The endpoint structure is /manufacturers/{id}/products
            const url = `/manufacturers/${manufacturerId}/products`;

            const response = await this.client.get<AQResponse<AQProduct>>(url, { params });

            // Response structure in screenshot shows "data": [...]
            // Depending on the exact wrapper, it might be response.data.data or just response.data if axios unwraps it
            // Based on typical axios usage: response.data is the body. The body has a 'data' array.
            return response.data.data || [];
        } catch (error) {
            console.error('Error fetching products from AQ:', error);
            throw error;
        }
    }

    /**
     * Fetches full details for a specific product
     */
    async getProductDetails(id: string): Promise<AQProduct | null> {
        try {
            const response = await this.client.get<any>(`/products/${id}`);
            // The API returns { data: [ { ... } ] } for single products too
            if (response.data && Array.isArray(response.data.data)) {
                return response.data.data[0];
            }
            return response.data;
        } catch (error) {
            console.error(`Error fetching product details for ${id}:`, error);
            return null;
        }
    }
    /**
     * Fetches all available manufacturers.
     */
    async getManufacturers(): Promise<{ id: string, name: string }[]> {
        try {
            const response = await this.client.get<any>('/manufacturers');
            // Support both direct array and nested data property
            const raw = Array.isArray(response.data) ? response.data : (response.data?.data || []);

            console.log('Raw Manufacturers Data:', JSON.stringify(raw.slice(0, 3))); // Log first few for debugging

            const mapped = raw.map((m: any) => ({
                id: m.id || m.mfrId || m.ManufacturerID || m.manufacturerId || '',
                name: m.name || m.mfrName || m.ManufacturerName || m.manufacturerName || 'Unknown'
            })).filter((m: { id: string; name: string }) => m.id && m.name !== 'Unknown');

            // Ensure AARCO is always present (User Requirement)
            const aarcoId = '78512195-9f0a-de11-b012-001ec95274b6';
            const hasAarco = mapped.find((m: { id: string }) => m.id === aarcoId);

            if (!hasAarco) {
                mapped.unshift({ id: aarcoId, name: 'AARCO Products' });
            }

            return mapped;
        } catch (error) {
            console.error('Error fetching manufacturers from AQ:', error);
            // Fallback: Always return AARCO at minimum
            return [
                { id: '78512195-9f0a-de11-b012-001ec95274b6', name: 'AARCO Products' }
            ];
        }
    }
}
