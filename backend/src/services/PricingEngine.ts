import { AQProduct } from '../types';
import Settings from '../models/Settings';

export interface PricingRule {
    manufacturer: string;
    markupPercentage: number; // e.g., 20 for 20%
    overridePrice?: number;
}

export interface PricingContext {
    ListPrice: number;
    Manufacturer: string;
    ModelNumber?: string;
}

export class PricingEngine {
    private rules: Map<string, PricingRule>;

    constructor() {
        this.rules = new Map();
        this.loadRules();
    }

    async loadRules() {
        try {
            const settings = await Settings.findOne({ key: 'global_settings' });
            if (settings && settings.pricingRules) {
                this.rules.clear();
                settings.pricingRules.forEach(r => {
                    this.rules.set(r.manufacturer.toUpperCase(), r);
                });
                console.log(`Loaded ${this.rules.size} pricing rules from DB.`);
            } else {
                // Initialize default if not exists
                this.rules.set('DEFAULT', { manufacturer: 'DEFAULT', markupPercentage: 0 });
                await this.saveRules();
            }
        } catch (error) {
            console.error('Failed to load pricing rules:', error);
            // Fallback default
            this.rules.set('DEFAULT', { manufacturer: 'DEFAULT', markupPercentage: 0 });
        }
    }

    async setRule(manufacturer: string, rule: PricingRule) {
        this.rules.set(manufacturer.toUpperCase(), rule);
        await this.saveRules();
    }

    private async saveRules() {
        try {
            const rulesArray = Array.from(this.rules.values());
            await Settings.findOneAndUpdate(
                { key: 'global_settings' },
                { pricingRules: rulesArray },
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error('Failed to save pricing rules:', error);
        }
    }

    getRules(): PricingRule[] {
        return Array.from(this.rules.values());
    }

    calculatePrice(product: PricingContext): number {
        const listPrice = product.ListPrice;
        const rule = this.rules.get(product.Manufacturer.toUpperCase()) || this.rules.get('DEFAULT');

        if (!rule) return listPrice; // Safety net

        if (rule.overridePrice) {
            return rule.overridePrice;
        }

        const markup = rule.markupPercentage || 0;
        return listPrice * (1 + markup / 100);
    }
}
