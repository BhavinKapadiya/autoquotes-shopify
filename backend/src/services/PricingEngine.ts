import { AQProduct } from '../types';
import Settings from '../models/Settings';

export interface PricingRule {
    manufacturer: string;
    markupPercentage: number; // e.g., 20 for 20%
    overridePrice?: number;
    pricingMode?: 'AQ_NET' | 'LIST_DISCOUNT';
    discountChain?: string;
}

export interface PricingContext {
    ListPrice: number;
    NetPrice: number; // From AQ
    Manufacturer: string;
    ModelNumber?: string;
}

export interface PricingResult {
    netCost: number;
    finalPrice: number;
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

    // Step 1: Determine Net Cost
    private calculateNetCost(context: PricingContext, rule?: PricingRule): number {
        const mode = rule?.pricingMode || 'AQ_NET';

        // Mode A: AQ_NET - Use the Net Price from AutoQuotes directly
        if (mode === 'AQ_NET') {
            // Safety: if AQ net is 0, fallback to list (prevent free items)
            return context.NetPrice > 0 ? context.NetPrice : context.ListPrice;
        }

        // Mode B: LIST_DISCOUNT - Apply chain to List Price
        if (mode === 'LIST_DISCOUNT') {
            const chain = rule?.discountChain || '';
            const discounts = chain.split('/').map(d => parseFloat(d)).filter(d => !isNaN(d));

            let currentCost = context.ListPrice;
            for (const discount of discounts) {
                // Discount is percentage off, e.g. 50 means x 0.50 ? 
                // Wait, standard industry chain usually means "50/10" = price * 0.50 * 0.90
                // If it's "50% off", multiplier is 0.50. 
                // Let's assume standard chain logic: "50" means 50% discount -> multiplier 0.5
                // "10" means 10% discount -> multiplier 0.9
                const multiplier = 1 - (discount / 100);
                currentCost = currentCost * multiplier;
            }
            return parseFloat(currentCost.toFixed(2));
        }

        return context.ListPrice;
    }

    calculatePrice(context: PricingContext): PricingResult {
        const rule = this.rules.get(context.Manufacturer.toUpperCase()) || this.rules.get('DEFAULT');

        // 1. Get Net Cost
        const netCost = this.calculateNetCost(context, rule);

        // 2. Apply Markup (or Override)
        if (rule?.overridePrice) {
            return { netCost, finalPrice: rule.overridePrice };
        }

        const markup = rule?.markupPercentage || 0;
        const finalPrice = netCost * (1 + markup / 100);

        return {
            netCost: parseFloat(netCost.toFixed(2)),
            finalPrice: parseFloat(finalPrice.toFixed(2))
        };
    }
}
