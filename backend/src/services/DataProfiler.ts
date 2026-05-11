import Product from '../models/Product';
import { GoogleSheetsAdapter } from './GoogleSheetsAdapter';

export interface MfrDataProfile {
  mfrName: string;
  totalProducts: number;
  uniqueProductTypes: string[];
  categoryValueKeys: string[];
  googleSheetsColumns?: string[];
}

export class DataProfiler {
  /**
   * Generates a lightweight schema/profile of a manufacturer's data
   * to send to OpenAI for analysis.
   */
  async generateProfile(mfrName: string): Promise<MfrDataProfile> {
    console.log(`📊 Generating data profile for manufacturer: ${mfrName}`);
    
    // 1. Fetch all products for this mfr
    const products = await Product.find({ 
      aqMfrName: new RegExp(`^${mfrName}$`, 'i'),
      status: { $ne: 'archived' }
    });

    if (products.length === 0) {
      throw new Error(`No active products found for manufacturer: ${mfrName}`);
    }

    // 2. Extract unique product types
    const productTypes = new Set<string>();
    
    // 3. Extract unique categoryValue keys (properties)
    const categoryValueKeys = new Set<string>();

    products.forEach(p => {
      if (p.productType) {
        productTypes.add(p.productType.trim());
      }
      
      if (p.categoryValues && Array.isArray(p.categoryValues)) {
        p.categoryValues.forEach((cv: any) => {
          if (cv.property) {
            categoryValueKeys.add(cv.property.trim());
          }
        });
      }
    });

    // 4. Optionally check Google Sheets for this mfr
    let googleSheetsColumns: string[] | undefined;
    try {
      const sheetsAdapter = new GoogleSheetsAdapter();
      // This is a bit of a hack: we might need to modify GoogleSheetsAdapter 
      // to easily return columns for a specific tab if it exists.
      // For now, we skip or mock if not easily accessible without full parse.
      // We'll leave it undefined unless requested.
    } catch (err) {
      console.warn('Could not fetch Google Sheets columns during profiling:', err);
    }

    return {
      mfrName,
      totalProducts: products.length,
      uniqueProductTypes: Array.from(productTypes),
      categoryValueKeys: Array.from(categoryValueKeys),
      googleSheetsColumns
    };
  }
}
