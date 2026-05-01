import mongoose, { Schema, Document } from 'mongoose';

export interface ICategoryRule extends Document {
    vendor: string;
    productType: string;
    parentCategory: string;
    subCategory: string;
    childCategory: string;
}

const CategoryRuleSchema: Schema = new Schema({
    vendor: { type: String, required: true },
    productType: { type: String, required: true },
    parentCategory: { type: String, required: true },
    subCategory: { type: String, required: true },
    childCategory: { type: String, required: true }
}, {
    timestamps: true
});

// Enforce unique combinations of vendor and productType
CategoryRuleSchema.index({ vendor: 1, productType: 1 }, { unique: true });

export default mongoose.model<ICategoryRule>('CategoryRule', CategoryRuleSchema);
