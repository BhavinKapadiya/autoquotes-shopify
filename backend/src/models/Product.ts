import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
    aqMfrId: string;
    aqMfrName: string;
    aqModelNumber: string;
    aqProductId: string;

    title: string;
    descriptionHtml: string;
    specSheetUrl?: string;

    // Pricing
    listPrice: number;
    aqNetPrice: number; // Raw AQ Net Price
    netCost: number; // Base for markup
    costMarkup: number; // The rule applied
    finalPrice: number; // Calculated price

    // Status
    status: 'staged' | 'synced' | 'error';
    syncError?: string;
    lastIngested: Date;
    lastSynced?: Date;

    // Raw Data (Stored for reference/re-processing)
    images: { src: string, attachment?: string }[];
    categoryValues: { property: string, value: string }[];
    variants: any[]; // Store calculated variants
    tags: string[];
    productType: string;

    // Shopify Info
    shopifyId?: string;
    shopifyHandle?: string;
}

const ProductSchema: Schema = new Schema({
    aqMfrId: { type: String, required: true },
    aqMfrName: { type: String, required: true },
    aqModelNumber: { type: String, required: true, index: true },
    aqProductId: { type: String, required: true, unique: true },

    title: { type: String, required: true },
    descriptionHtml: { type: String },
    specSheetUrl: { type: String },

    listPrice: { type: Number, default: 0 },
    aqNetPrice: { type: Number, default: 0 }, // Raw AQ Net Price
    netCost: { type: Number, default: 0 }, // Calculated Net Cost
    costMarkup: { type: Number, default: 0 },
    finalPrice: { type: Number, default: 0 },

    status: { type: String, default: 'staged', enum: ['staged', 'synced', 'error'] },
    syncError: { type: String },
    lastIngested: { type: Date, default: Date.now },
    lastSynced: { type: Date },

    images: [{ src: String, attachment: String }],
    categoryValues: [{ property: String, value: String }],
    variants: [{
        id: String,
        title: String,
        price: Number,
        sku: String,
        inventory: Number,
        option1: String, 
        value1: String,
        option2: String,
        value2: String,
        option3: String,
        value3: String
    }],
    tags: [String],
    productType: { type: String },

    shopifyId: { type: String },
    shopifyHandle: { type: String }
}, {
    timestamps: true
});

// Composite index for fast lookups by manufacturer
ProductSchema.index({ aqMfrId: 1, status: 1 });

export default mongoose.model<IProduct>('Product', ProductSchema);
