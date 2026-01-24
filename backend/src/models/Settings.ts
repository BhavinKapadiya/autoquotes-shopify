import mongoose, { Schema, Document } from 'mongoose';

export interface IPricingRule {
    manufacturer: string;
    markupPercentage: number;
    overridePrice?: number;
    pricingMode?: 'AQ_NET' | 'LIST_DISCOUNT';
    discountChain?: string;
}

export interface ISettings extends Document {
    key: string; // e.g., 'global_settings'
    enabledManufacturers: string[];
    pricingRules: IPricingRule[];
}

const SettingsSchema: Schema = new Schema({
    key: { type: String, required: true, unique: true, default: 'global_settings' },
    enabledManufacturers: [String],
    pricingRules: [{
        manufacturer: String,
        markupPercentage: Number,
        overridePrice: Number,
        pricingMode: { type: String, enum: ['AQ_NET', 'LIST_DISCOUNT'], default: 'AQ_NET' },
        discountChain: String // e.g. "50/10/5"
    }]
}, { timestamps: true });

export default mongoose.model<ISettings>('Settings', SettingsSchema);
