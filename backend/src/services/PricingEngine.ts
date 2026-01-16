import { AQProduct } from '../types';

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
        // Load initial rules (mocked for now, later from DB)
        this.rules.set('DEFAULT', { manufacturer: 'DEFAULT', markupPercentage: 0 });
    }

    setRule(manufacturer: string, rule: PricingRule) {
        this.rules.set(manufacturer.toUpperCase(), rule);
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
