import mongoose, { Schema, Document } from 'mongoose';

export interface IManufacturerConfig extends Document {
  mfrName: string;
  mfrId?: string;
  groupingStrategy: 'GOOGLE_SHEETS' | 'AQ_REGEX' | 'FLAT';
  regexPattern?: string;
  variantOption1Source?: string;
  variantOption2Source?: string;
  variantOption3Source?: string;
  categoryMappings: Array<{
    aqProductType: string;
    shopifyCollection: string;
    tagsToApply: string[];
  }>;
}

const ManufacturerConfigSchema: Schema = new Schema({
  mfrName: { type: String, required: true, unique: true },
  mfrId: { type: String },
  groupingStrategy: {
    type: String,
    enum: ['GOOGLE_SHEETS', 'AQ_REGEX', 'FLAT'],
    default: 'FLAT'
  },
  regexPattern: { type: String },
  variantOption1Source: { type: String },
  variantOption2Source: { type: String },
  variantOption3Source: { type: String },
  categoryMappings: [{
    aqProductType: { type: String, required: true },
    shopifyCollection: { type: String, required: true },
    tagsToApply: [{ type: String }]
  }]
}, {
  timestamps: true
});

export default mongoose.model<IManufacturerConfig>('ManufacturerConfig', ManufacturerConfigSchema);
