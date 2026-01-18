import mongoose, { Schema, Document } from 'mongoose';

export interface IPricingRule {
    manufacturer: string;
    markupPercentage: number;
    overridePrice?: number;
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
        overridePrice: Number
    }]
}, { timestamps: true });

export default mongoose.model<ISettings>('Settings', SettingsSchema);
