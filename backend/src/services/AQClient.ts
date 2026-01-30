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
            console.log(`🔍 Fetching manufacturers from: ${this.baseUrl}/manufacturers`);
            console.log(`🔑 Using API Key: ${this.apiKey ? this.apiKey.slice(0, 8) + '...' : 'NOT SET'}`);
            
            const response = await this.client.get<any>('/manufacturers');
            // Support both direct array and nested data property
            const raw = Array.isArray(response.data) ? response.data : (response.data?.data || []);

            console.log(`✅ Received ${raw.length} manufacturers from AQ API`);
            console.log('Raw Manufacturers Data (first 3):', JSON.stringify(raw.slice(0, 3)));

            const mapped = raw.map((m: any) => ({
                id: m.id || m.mfrId || m.ManufacturerID || m.manufacturerId || '',
                name: m.name || m.mfrName || m.ManufacturerName || m.manufacturerName || 'Unknown'
            })).filter((m: { id: string; name: string }) => m.id && m.name !== 'Unknown');

            console.log(`📦 Mapped ${mapped.length} valid manufacturers`);

            // Ensure AARCO is always present (User Requirement)
            const aarcoId = '78512195-9f0a-de11-b012-001ec95274b6';
            const hasAarco = mapped.find((m: { id: string }) => m.id === aarcoId);

            if (!hasAarco) {
                mapped.unshift({ id: aarcoId, name: 'AARCO Products' });
            }

            return mapped;
        } catch (error: any) {
            console.error('❌ Error fetching manufacturers from AQ:');
            console.error('   URL:', `${this.baseUrl}/manufacturers`);
            console.error('   API Key:', this.apiKey ? this.apiKey.slice(0, 8) + '...' : 'NOT SET');
            console.error('   Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data));
            }
            // Fallback: Always return AARCO at minimum
            return [
                { id: '78512195-9f0a-de11-b012-001ec95274b6', name: 'AARCO Products' }
            ];
        }
    }
}
