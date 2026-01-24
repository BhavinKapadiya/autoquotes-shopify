"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

// --- Types ---

declare global {
  interface Window {
    shopify?: any;
  }
}

interface PricingRule {
  manufacturer: string;
  markupPercentage: number;
  pricingMode?: 'AQ_NET' | 'LIST_DISCOUNT';
  discountChain?: string;
}

// ... existing code ...

function PricingRuleForm({
  manufacturer,
  setManufacturer,
  onSave
}: {
  manufacturer: string,
  setManufacturer: (v: string) => void,
  onSave: (markup: string, mode: string, chain: string) => void
}) {
  const [markup, setMarkup] = useState('');
  const [mode, setMode] = useState<string>('AQ_NET');
  const [chain, setChain] = useState('');

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-full">
      <div className="flex items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900">➕ Add/Update Rule</h2>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Vendor Name</label>
          <input
            type="text"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all font-mono"
            placeholder="Select from list..."
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Pricing Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
          >
            <option value="AQ_NET">AQ Net Price (Recommended)</option>
            <option value="LIST_DISCOUNT">List Price - Discount Chain</option>
          </select>
        </div>

        {mode === 'LIST_DISCOUNT' && (
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Discount Chain</label>
            <input
              type="text"
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all font-mono"
              placeholder="e.g. 50/10/5"
            />
            <p className="text-xs text-gray-400 mt-1">Enter discounts separated by slashes (e.g. 50/10/5 = 50% off, then 10% off...)</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Plus Markup %</label>
          <div className="relative">
            <input
              type="number"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              className="w-full p-3 pl-8 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all font-mono"
              placeholder="20"
            />
            <span className="absolute left-3 top-3 text-gray-400 font-bold">+</span>
          </div>
        </div>

        <button
          onClick={() => { onSave(markup, mode, chain); setMarkup(''); setChain(''); }}
          disabled={!manufacturer || !markup}
          className="w-full bg-black hover:bg-gray-800 text-white font-medium py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Pricing Rule
        </button>
      </div>
    </div>
  );
}

function SyncStep() {
  return (
    <div className="bg-gradient-to-br from-gray-900 to-black p-6 rounded-xl shadow-lg border border-gray-800 flex flex-col items-start h-full text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <span className="text-6xl">🚀</span>
      </div>
      <div className="flex items-center mb-4">
        <span className="bg-green-500 text-black text-xs font-bold px-2 py-1 rounded mr-2">STEP 3</span>
        <h2 className="text-xl font-bold">Review & Sync</h2>
      </div>
      <p className="text-gray-400 mb-6 text-sm flex-grow">
        Review staged products, ensure prices are correct, and then push everything to your live Shopify store.
      </p>
      <Link href="/staging" className="w-full block text-center bg-white text-black font-bold py-3 px-4 rounded-lg hover:bg-gray-100 transition-all shadow-md">
        Go to Staging Dashboard →
      </Link>
    </div>
  );
}

// --- Main Page ---

export default function Home() {
  const [loadState, setLoadState] = useState({ loading: false, status: '' });
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [enabledMfrs, setEnabledMfrs] = useState<string[]>([]);

  const [dataLoading, setDataLoading] = useState(true);

  // Shared state for the rule form
  const [selectedManufacturer, setSelectedManufacturer] = useState('');

  // Fetch Logic
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://autoquotes-shopify.onrender.com';
    const fullUrl = url.startsWith('http') ? url : `${backendUrl}${url}`;
    try {
      let token = '';
      if (typeof window !== 'undefined' && window.shopify && window.shopify.id) {
        token = await window.shopify.id.getSessionToken();
      }
      const headers = { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      return fetch(fullUrl, { ...options, headers });
    } catch (error) {
      console.error(error); throw error;
    }
  };

  const loadInitialData = async () => {
    setDataLoading(true);
    try {
      const [mfrRes, setRes, ruleRes] = await Promise.all([
        authFetch('/api/manufacturers'),
        authFetch('/api/settings'),
        authFetch('/api/pricing/rules')
      ]);

      if (mfrRes.ok) setManufacturers(await mfrRes.json());
      if (setRes.ok) {
        const data = await setRes.json();
        setEnabledMfrs(data.enabledManufacturers || []);
      }
      if (ruleRes.ok) {
        const data = await ruleRes.json();
        setRules(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Load failed", e);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => { loadInitialData(); }, []);

  // Actions
  const handleIngest = async () => {
    if (!confirm("Start importing data from AutoQuotes? This may take simple time.")) return;
    setLoadState({ loading: true, status: 'Ingesting data...' });
    try {
      await authFetch('/api/products/ingest', { method: 'POST' });
      setLoadState({ loading: false, status: 'Ingest started successfully!' });
    } catch (e) {
      setLoadState({ loading: false, status: 'Ingest failed.' });
    }
  };

  const handleToggleMfr = async (id: string) => {
    const newSet = enabledMfrs.includes(id) ? enabledMfrs.filter(x => x !== id) : [...enabledMfrs, id];
    setEnabledMfrs(newSet);
    await authFetch('/api/settings', { method: 'POST', body: JSON.stringify({ enabledManufacturers: newSet }) });
  };

  const handleSaveRule = async (markup: string, mode: string, chain: string) => {
    if (!selectedManufacturer || !markup) return;
    try {
      await authFetch('/api/pricing/rules', {
        method: 'POST',
        body: JSON.stringify({
          manufacturer: selectedManufacturer,
          markup: Number(markup),
          pricingMode: mode,
          discountChain: chain
        }),
      });
      loadInitialData(); // Reload rules
      setSelectedManufacturer('');
      setLoadState({ ...loadState, status: `Rule saved for ${selectedManufacturer}` });
    } catch (e) {
      setLoadState({ ...loadState, status: 'Failed to save rule' });
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans p-6">
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY}></script>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-end mb-10 border-b pb-6">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-gray-900">AQ Integration Manager</h1>
            <p className="text-gray-500 mt-1 font-medium">AutoQuotes to Shopify Staged Synchronization</p>
          </div>
          <div className="text-right">
            {loadState.status && <div className="text-sm font-bold text-blue-600 animate-pulse">{loadState.status}</div>}
            <div className="text-xs text-gray-400 mt-1">v2.0 Staged Sync</div>
          </div>
        </div>

        {/* Workflow Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <IngestStep onTrigger={handleIngest} />
          <div className="hidden md:block col-span-1 h-full">
            {/* Middle slot can be used for summary or kept as layout spacer if using 3-column. 
                 Actually let's make the Pricing one span 2 columns or layout differently. 
                 Let's stick to 3 distinct cards for the Steps.
             */}
            <PricingStep
              manufacturers={manufacturers}
              enabledMfrs={enabledMfrs}
              toggleMfr={handleToggleMfr}
              setManufacturer={setSelectedManufacturer}
              loading={dataLoading}
            />
          </div>
          <SyncStep />
        </div>

        {/* Detailed Config Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Mobile Duplicate for Pricing Step (hidden on desktop to use the grid above? No, let's keep the grid logical) */}
          {/* Let's adjust: Step 2 in the top grid is just "Configure Vendors", but we need the form. 
               Let's put the FORM in the main wide area below. 
           */}

          {/* Left: Detailed Pricing Rules Form */}
          <div className="lg:col-span-4 space-y-6">
            <PricingRuleForm
              manufacturer={selectedManufacturer}
              setManufacturer={setSelectedManufacturer}
              onSave={handleSaveRule}
            />
          </div>

          {/* Right: Active Rules List */}
          <div className="lg:col-span-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-6">📋 Active Pricing Rules</h3>
              {rules.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 rounded-lg text-gray-400 border border-dashed">
                  No rules active. Universal markup settings will apply.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {rules.map((rule, idx) => (
                    <div key={idx} className="flex flex-col p-4 bg-gray-50 rounded-lg border border-gray-100 hover:shadow-sm transition-shadow">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-gray-700 truncate" title={rule.manufacturer}>{rule.manufacturer}</span>
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">
                          +{rule.markupPercentage}% Markup
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {rule.pricingMode === 'LIST_DISCOUNT'
                          ? `List less ${rule.discountChain || '0'}`
                          : 'AQ Net Pricing'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
