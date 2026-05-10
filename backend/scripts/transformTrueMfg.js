/**
 * True Mfg. – Specialty Display → Shopify productSet Transformer
 *
 * Usage:
 *   node scripts/transformTrueMfg.js
 *
 * Input:  backend/datatoanalyse.json   (raw AQ API dump, "data" array)
 * Output: backend/output/truemfg_shopify_payloads.json  (array of productSet inputs)
 *
 * The script:
 *  1. Filters to only "True Mfg. – Specialty Display"
 *  2. Groups SKUs into Base Model buckets (first 3 dash-segments)
 *  3. Builds Shopify variants (3 options: Exterior Finish, Width, Front Style)
 *  4. Generates tags + metafields
 *  5. Writes the final payloads to disk and previews one complete payload
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Paths ────────────────────────────────────────────────────────────────────
const INPUT_FILE  = path.resolve(__dirname, '..', 'datatoanalyse.json');
const OUTPUT_DIR  = path.resolve(__dirname, '..', 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'truemfg_shopify_payloads.json');

const TARGET_MANUFACTURER = 'True Mfg. \u2013 Specialty Display';   // exact string with em-dash

// ─── Decode Zone from Model Code ─────────────────────────────────────────────
const ZONE_MAP = {
    'DZ':  'Dual Zone',
    'R':   'Refrigerated',
    'DC':  'Dry / Non-Refrigerated',
    'F':   'Freezer',
    'DR':  'Dual Refrigerated',
};

function decodeZone(zoneCode) {
    return ZONE_MAP[zoneCode] || zoneCode;
}

// ─── Decode Series from Model Prefix ─────────────────────────────────────────
const SERIES_MAP = {
    'TDM': 'Display Merchandiser',
    'TGM': 'Glass Merchandiser',
    'GDM': 'Glass Door Merchandiser',
    'TFM': 'Floral Merchandiser',
    'TDC': 'Deli Case',
};

function decodeSeries(seriesCode) {
    return SERIES_MAP[seriesCode] || seriesCode;
}

// ─── Extract Base Model ───────────────────────────────────────────────────────
// TDM-DZ-59-GE/GE-S-W      →  TDM-DZ-59       (Series-Zone-Width)
// TGM-R-59-SC/SC-W-W       →  TGM-R-59
// GDM-26F-HST-HC~TSL01     →  GDM-26F          (Series-Model, no zone)
// G4SM-23-HC~TSL01         →  G4SM-23
// THAC-48-HC-LD            →  THAC-48
// TCGG-48-S-HC-LD          →  TCGG-48
// TVM-30SL-HC~VM03         →  TVM-30SL
function extractBaseModel(mfrModel) {
    const parts = mfrModel.split('-');

    // PRIMARY PATTERN: Series-Zone-Width (TDM-DZ-59, TGM-R-77 etc.)
    // Criteria: parts[1] is all uppercase alpha (zone code), parts[2] starts with a digit
    if (
        parts.length >= 3 &&
        /^[A-Z]+$/.test(parts[1]) &&
        /^\d/.test(parts[2])
    ) {
        return `${parts[0]}-${parts[1]}-${parts[2]}`;
    }

    // SECONDARY PATTERN: Series-Model (GDM-26F, THAC-48, TCGG-72 etc.)
    // Criteria: parts[1] contains digits mixed with letters OR is purely numeric
    // Strip everything after the first suffix token (HC, HST, LD, VM, TSL)
    if (parts.length >= 2) {
        // Collect segments until we hit a known suffix keyword
        const SUFFIX_KEYWORDS = /^(HC|HST|LD|VM|TSL|RF|RTO|S|LS)\d*$/i;
        const baseSegments = [];
        for (let i = 0; i < parts.length; i++) {
            // Stop at suffix keywords (but allow single-letter like "S" only if it's exactly 1 char
            // and comes after position 1 — avoids swallowing the model body)
            const seg = parts[i];
            if (i >= 2 && SUFFIX_KEYWORDS.test(seg)) break;
            // Also stop if segment contains tilde (variant marker)
            if (seg.includes('~')) break;
            baseSegments.push(seg);
        }
        if (baseSegments.length >= 2) {
            return baseSegments.join('-');
        }
    }

    // FINAL FALLBACK
    console.warn(`  [WARN] Could not determine base model for: "${mfrModel}" — using first 2 segments.`);
    return `${parts[0]}-${parts[1]}`;
}

// ─── Normalize Exterior Finish ────────────────────────────────────────────────
// "all stainless steel exterior"  →  "Stainless Steel"
// "all white exterior"            →  "White"
// "all black exterior"            →  "Black"
// "white exterior"                →  "White"
// "stainless steel exterior"      →  "Stainless Steel"
function normalizeExteriorFinish(raw) {
    if (!raw) return 'Unknown';
    let v = raw.toLowerCase().replace(/^all\s+/, '').replace(/\s+exterior$/, '').trim();
    return v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ─── Build Front Style label ──────────────────────────────────────────────────
function buildFrontStyle(frontVal, endsVal) {
    const front = (frontVal || '').toLowerCase().trim();
    const ends  = (endsVal  || '').toLowerCase().trim();

    if (!ends || ends === front) return toTitleCase(front);

    const endsLabel = (() => {
        if (ends === 'glass')       return 'Glass Ends';
        if (ends === 'white')       return 'Solid White Sides';
        if (ends === 'black')       return 'Solid Black Sides';
        if (ends === 'stainless')   return 'Stainless Sides';
        return toTitleCase(ends);
    })();

    return `${toTitleCase(front)} / ${endsLabel}`;
}

function toTitleCase(str) {
    return (str || '').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ─── Get a single categoryValue by property name (supports aliases) ───────────
function getCatVal(categoryValues, ...propertyNames) {
    for (const name of propertyNames) {
        const entry = categoryValues.find(cv =>
            cv.property.toLowerCase() === name.toLowerCase()
        );
        if (entry) return entry.value;
    }
    return '';
}

// ─── Build Shopify Tags ───────────────────────────────────────────────────────
function buildTags(product, baseModel, zone, series) {
    const tags = new Set();
    const cat  = product.productCategory?.name || '';

    if (cat)    tags.add(`category:${cat}`);
    if (zone)   tags.add(`zone:${zone}`);
    if (series) tags.add(`series:${series.toLowerCase().replace(/\s+/g, '-')}`);

    const width = product.productDimension?.productWidth;
    if (width)  tags.add(`width:${Math.round(width)}in`);

    // Exterior finishes (all variants)
    const ext = getCatVal(product.categoryValues, 'Exterior Finish');
    if (ext)    tags.add(`finish:${normalizeExteriorFinish(ext).toLowerCase()}`);

    const front = getCatVal(product.categoryValues, 'Front');
    if (front)  tags.add(`front:${front.toLowerCase().replace(/\s+/g, '-')}`);

    const refrig = getCatVal(product.categoryValues, 'Refrigeration');
    if (refrig) tags.add(`refrigeration:${refrig.toLowerCase().replace(/\s+/g, '-')}`);

    tags.add('vendor:true-mfg-specialty-display');
    tags.add(`mfr-model-base:${baseModel.toLowerCase()}`);

    (product.certifications || []).forEach(cert => {
        tags.add(`cert:${cert.toLowerCase().replace(/\s+/g, '-')}`);
    });

    return [...tags];
}

// ─── Parse key specs from AQSpecification string ─────────────────────────────
function parseAQSpec(spec) {
    const out = {};
    if (!spec) return out;

    const hp    = spec.match(/(\d+\/?\d*)\s*HP/i);
    const amps  = spec.match(/([\d.]+)\s*amps/i);
    const nema  = spec.match(/(NEMA\s[\d-]+P?)/i);
    const refr  = spec.match(/(R\d{3}\s+\w+\s+\w+)/i);
    const volt  = spec.match(/(\d{3}v?\/\d+\/\d+-ph)/i);

    if (hp)   out.hp           = hp[1] + ' HP';
    if (amps) out.amps         = parseFloat(amps[1]);
    if (nema) out.nema_plug    = nema[1].trim();
    if (refr) out.refrigerant  = refr[1].trim();
    if (volt) out.voltage      = volt[1].trim();

    return out;
}

// ─── Build Metafields array ───────────────────────────────────────────────────
function buildMetafields(product, parsedSpec) {
    const mf   = [];
    const dim  = product.productDimension || {};
    const cv   = product.categoryValues   || [];
    const docs = product.documents        || [];

    const add = (key, value, type = 'single_line_text_field') => {
        if (value === null || value === undefined || value === '') return;
        mf.push({ namespace: 'true_mfg', key, value: String(value), type });
    };

    // Physical dimensions
    if (dim.productHeight)   add('height_in',       dim.productHeight,   'number_decimal');
    if (dim.productWidth)    add('width_in',         dim.productWidth,    'number_decimal');
    if (dim.productDepth)    add('depth_in',         dim.productDepth,    'number_decimal');
    if (dim.shippingWeight)  add('shipping_weight_lbs', dim.shippingWeight, 'number_decimal');
    if (dim.shippingCube)    add('shipping_cube',    dim.shippingCube,    'number_decimal');

    // Logistics
    add('freight_class', product.freightClass);
    add('ship_from_zip', product.shipFromZip);

    // Parsed specs
    if (parsedSpec.hp)          add('hp',           parsedSpec.hp);
    if (parsedSpec.amps)        add('amps',         parsedSpec.amps, 'number_decimal');
    if (parsedSpec.nema_plug)   add('nema_plug',    parsedSpec.nema_plug);
    if (parsedSpec.refrigerant) add('refrigerant',  parsedSpec.refrigerant);
    if (parsedSpec.voltage)     add('voltage',      parsedSpec.voltage);

    // CategoryValues → metafields (excluding the 3 option-driving properties)
    const OPTION_PROPS = new Set([
        'exterior finish',
        'width (side - side)',
        'front',
        'ends',
    ]);

    cv.forEach(entry => {
        const propKey = entry.property.toLowerCase();
        if (OPTION_PROPS.has(propKey)) return;   // already used as option

        const mfKey = entry.property
            .toLowerCase()
            .replace(/\s*[\/()\-]+\s*/g, '_')
            .replace(/[^a-z0-9_]/g, '')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');

        add(mfKey, entry.value);
    });

    // Document links
    const cutsheet = docs.find(d => d.mediaType === 'cutsheet');
    const manual   = docs.find(d => d.mediaType === 'manual');
    const warranty = docs.find(d => d.mediaType === 'warrantysheet');

    if (cutsheet?.url) add('cutsheet_url', cutsheet.url, 'url');
    if (manual?.url)   add('manual_url',   manual.url,   'url');
    if (warranty?.url) add('warranty_url', warranty.url, 'url');

    // Certifications as JSON list
    if ((product.certifications || []).length > 0) {
        mf.push({
            namespace: 'true_mfg',
            key:       'certifications',
            value:     JSON.stringify(product.certifications),
            type:      'json',
        });
    }

    return mf;
}

// ─── Build a human-readable product title ─────────────────────────────────────
function buildTitle(baseModel, series, zone, width) {
    // e.g. "True TDM-DZ-59 Dual Zone Display Merchandiser, 59""
    const widthLabel = width ? `, ${Math.round(width)}"` : '';
    return `True ${baseModel} ${zone} ${series}${widthLabel}`;
}

// ─── Build Shopify product handle ────────────────────────────────────────────
function buildHandle(baseModel) {
    return `true-mfg-${baseModel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

// ─── Transform one Base Model group → Shopify productSet input ────────────────
function transformGroup(baseModel, skus) {
    const seriesCode = baseModel.split('-')[0];
    const zoneCode   = baseModel.split('-')[1];
    const series     = decodeSeries(seriesCode);
    const zone       = decodeZone(zoneCode);

    // Use the first SKU as the "parent" for shared fields
    const parent   = skus[0];
    const dim      = parent.productDimension || {};
    const parsedSpec = parseAQSpec(parent.specifications?.AQSpecification);

    // ── Collect all distinct option values across all SKUs ──────────────────
    const allExteriors  = new Set();
    const allWidths     = new Set();
    const allFrontStyles = new Set();

    skus.forEach(sku => {
        const cv = sku.categoryValues || [];
        // Try multiple property aliases for exterior finish
        const ext   = getCatVal(cv, 'Exterior Finish', 'Cabinet Finish', 'Finish');
        const front = getCatVal(cv, 'Front', 'Door Style', 'Glass Type');
        const ends  = getCatVal(cv, 'Ends', 'Sides', 'End Style');
        const w     = sku.productDimension?.productWidth;

        if (ext) allExteriors.add(normalizeExteriorFinish(ext));
        if (w)   allWidths.add(`${w}"`);
        const fs = buildFrontStyle(front, ends);
        if (fs)  allFrontStyles.add(fs);
    });

    // Fallback: if a group has no distinguishing finish (1 finish = 'Standard')
    if (allExteriors.size === 0) allExteriors.add('Standard');

    const exteriorValues  = [...allExteriors];
    const widthValues     = [...allWidths];
    const frontStyleValues = [...allFrontStyles];

    // ── Guard: warn if option count exceeds what Shopify supports ────────────
    const totalOptionValues = exteriorValues.length * widthValues.length * frontStyleValues.length;
    if (totalOptionValues > 100) {
        console.warn(
            `  [WARN] Base model "${baseModel}" → ${skus.length} SKUs would produce ` +
            `${totalOptionValues} variant combinations — exceeds 100 Shopify limit!`
        );
    }
    if (exteriorValues.length > 30 || widthValues.length > 30 || frontStyleValues.length > 30) {
        console.warn(
            `  [WARN] Base model "${baseModel}" → one of the 3 option axes has >30 values.`
        );
    }

    // ── Build variant list (one real variant per source SKU) ──────────────────
    const variants = skus.map(sku => {
        const cv    = sku.categoryValues || [];
        const ext   = getCatVal(cv, 'Exterior Finish', 'Cabinet Finish', 'Finish');
        const front = getCatVal(cv, 'Front', 'Door Style', 'Glass Type');
        const ends  = getCatVal(cv, 'Ends', 'Sides', 'End Style');
        const skuW  = sku.productDimension?.productWidth;
        const price = sku.pricing?.mapMrpPrice || sku.pricing?.sellPrice || 0;
        const listP = sku.pricing?.listPrice   || 0;

        return {
            sku:             sku.models?.mfrModel,
            price:           price.toFixed(2),
            compareAtPrice:  listP > 0 ? listP.toFixed(2) : null,
            inventoryItem: {
                tracked:       false,
                requiresShipping: true,
                weight:        sku.productDimension?.shippingWeight || 0,
                weightUnit:    'POUNDS',
            },
            selectedOptions: [
                { name: 'Exterior Finish', value: normalizeExteriorFinish(ext) || 'Standard' },
                { name: 'Width',           value: skuW ? `${skuW}"` : 'Standard' },
                { name: 'Front Style',     value: buildFrontStyle(front, ends) || 'Standard' },
            ],
            // Per-variant metafields for AQ product ID and model number
            metafields: [
                { namespace: 'true_mfg', key: 'aq_product_id', value: sku.productId, type: 'single_line_text_field' },
                { namespace: 'true_mfg', key: 'mfr_model',     value: sku.models?.mfrModel || '', type: 'single_line_text_field' },
            ],
        };
    });

    // ── Build images list ──────────────────────────────────────────────────────
    const seenUrls = new Set();
    const images   = [];
    skus.forEach(sku => {
        (sku.pictures || []).forEach(pic => {
            if (pic.url && !seenUrls.has(pic.url)) {
                seenUrls.add(pic.url);
                images.push({ src: pic.url, altText: `${baseModel} ${pic.name}` });
            }
        });
    });

    // ── Build tags (aggregate from all SKUs to capture all finish tags) ────────
    const tagsSet = new Set();
    skus.forEach(sku => {
        buildTags(sku, baseModel, zone, series).forEach(t => tagsSet.add(t));
    });

    // ── Build shared metafields from the parent SKU ────────────────────────────
    const metafields = buildMetafields(parent, parsedSpec);

    // ── Final productSet input shape ───────────────────────────────────────────
    return {
        // Shopify productSet fields
        handle:      buildHandle(baseModel),
        title:       buildTitle(baseModel, series, zone, dim.productWidth),
        vendor:      parent.mfrName,
        productType: parent.productCategory?.name || '',
        descriptionHtml: parent.specifications?.AQSpecification
            ? `<p>${parent.specifications.AQSpecification}</p>`
            : '',
        status: 'DRAFT',   // Set to ACTIVE once reviewed

        tags: [...tagsSet],

        options: [
            { name: 'Exterior Finish', values: exteriorValues  },
            { name: 'Width',           values: widthValues      },
            { name: 'Front Style',     values: frontStyleValues },
        ],

        variants,
        images,
        metafields,

        // ── Debug metadata (strip before sending to Shopify) ──────────────────
        _debug: {
            baseModel,
            series,
            zone,
            totalSourceSkus: skus.length,
            exteriorFinishOptions:  exteriorValues,
            widthOptions:           widthValues,
            frontStyleOptions:      frontStyleValues,
            estimatedVariantCount:  variants.length,
        },
    };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function main() {
    console.log('━'.repeat(70));
    console.log('  True Mfg. – Specialty Display → Shopify productSet Transformer');
    console.log('━'.repeat(70));

    // 1. Read input
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`\n[ERROR] Input file not found: ${INPUT_FILE}`);
        process.exit(1);
    }

    const raw   = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
    const allItems = raw.data || raw;   // support both { data: [...] } and bare array

    console.log(`\n[1] Raw data loaded`);
    console.log(`    Total items in file : ${allItems.length}`);

    // 2. Filter by manufacturer
    const filtered = allItems.filter(item => item.mfrName === TARGET_MANUFACTURER);

    console.log(`    After filter ("${TARGET_MANUFACTURER}") : ${filtered.length} items`);
    console.log(`    Discarded (other mfrs) : ${allItems.length - filtered.length} items`);

    if (filtered.length === 0) {
        console.error('\n[ERROR] No items matched the target manufacturer. Check the mfrName string.');
        process.exit(1);
    }

    // 3. Group by base model
    console.log('\n[2] Grouping by Base Model...');
    const groups = {};
    filtered.forEach(item => {
        const mfrModel = item.models?.mfrModel || '';
        if (!mfrModel) {
            console.warn(`  [WARN] Item ${item.productId} has no mfrModel — skipped.`);
            return;
        }
        const base = extractBaseModel(mfrModel);
        if (!groups[base]) groups[base] = [];
        groups[base].push(item);
    });

    const baseModels = Object.keys(groups).sort();
    console.log(`\n    Distinct Base Models found: ${baseModels.length}`);
    baseModels.forEach(bm => {
        console.log(`    • ${bm.padEnd(20)} → ${groups[bm].length} SKU(s)`);
    });

    // 4. Transform each group
    console.log('\n[3] Transforming groups...');
    const payloads = [];

    baseModels.forEach(bm => {
        const skus = groups[bm];
        console.log(`\n  → Processing "${bm}" (${skus.length} SKUs)`);
        const payload = transformGroup(bm, skus);
        payloads.push(payload);
        console.log(
            `    Options: [${payload.options.map(o => `${o.name}(${o.values.length})`).join(', ')}]` +
            `   Variants: ${payload.variants.length}   Tags: ${payload.tags.length}`
        );
    });

    // 5. Preview one complete payload
    const preview = payloads[0];
    console.log('\n' + '─'.repeat(70));
    console.log(`[4] Preview — First payload: "${preview._debug.baseModel}"`);
    console.log('─'.repeat(70));
    console.log(JSON.stringify(preview, null, 2));

    // 6. Write output
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payloads, null, 2), 'utf8');

    console.log('\n' + '═'.repeat(70));
    console.log(`[5] Done!`);
    console.log(`    Total productSet payloads  : ${payloads.length}`);
    console.log(`    Total variants across all  : ${payloads.reduce((s, p) => s + p.variants.length, 0)}`);
    console.log(`    Output written to          : ${OUTPUT_FILE}`);
    console.log('═'.repeat(70));
}

main();
