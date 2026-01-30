"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PricingRuleModal from './components/PricingRuleModal';

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

interface Manufacturer {
  id: string;
  name: string;
}

type FilterTab = 'all' | 'enabled' | 'with_rules';

// --- Components ---

function IngestStep({ onTrigger, loading }: { onTrigger: () => void; loading: boolean }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col items-start h-full relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <span className="text-6xl">📥</span>
      </div>
      <div className="flex items-center mb-4">
        <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded mr-2">STEP 1</span>
        <h2 className="text-xl font-bold text-gray-900">Ingest Data</h2>
      </div>
      <p className="text-gray-500 mb-6 text-sm flex-grow">
        Fetch the latest product data from AutoQuotes into your staging database.
      </p>
      <button
        onClick={onTrigger}
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-md active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Ingesting...
          </>
        ) : 'Start Ingest'}
      </button>
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
        <span className="bg-indigo-500 text-white text-xs font-bold px-2 py-1 rounded mr-2">STEP 3</span>
        <h2 className="text-xl font-bold">Review & Sync</h2>
      </div>
      <p className="text-gray-400 mb-6 text-sm flex-grow">
        Review staged products and push to your live Shopify store.
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
  
  // Search and filter
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMfr, setSelectedMfr] = useState<Manufacturer | null>(null);

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

  // Get rule for a manufacturer
  const getRuleForMfr = (name: string): PricingRule | undefined => {
    return rules.find(r => r.manufacturer.toUpperCase() === name.toUpperCase());
  };

  // Filter manufacturers
  const filteredManufacturers = manufacturers.filter(m => {
    const matchesSearch = (m.name || '').toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    
    if (activeTab === 'enabled') return enabledMfrs.includes(m.id);
    if (activeTab === 'with_rules') return !!getRuleForMfr(m.name);
    return true;
  });

  // Actions
  const handleIngest = async () => {
    if (!confirm("Start importing data from AutoQuotes? This may take some time.")) return;
    setLoadState({ loading: true, status: 'Ingesting data...' });
    try {
      await authFetch('/api/products/ingest', { method: 'POST' });
      setLoadState({ loading: false, status: 'Ingest started successfully!' });
      setTimeout(() => setLoadState(s => ({ ...s, status: '' })), 5000);
    } catch (e) {
      setLoadState({ loading: false, status: 'Ingest failed.' });
    }
  };

  const handleToggleMfr = async (id: string) => {
    const newSet = enabledMfrs.includes(id) ? enabledMfrs.filter(x => x !== id) : [...enabledMfrs, id];
    setEnabledMfrs(newSet);
    await authFetch('/api/settings', { method: 'POST', body: JSON.stringify({ enabledManufacturers: newSet }) });
  };

  const handleOpenRuleModal = (mfr: Manufacturer) => {
    setSelectedMfr(mfr);
    setModalOpen(true);
  };

  const handleSaveRule = async (data: { markup: string; mode: string; chain: string }) => {
    if (!selectedMfr) return;
    
    await authFetch('/api/pricing/rules', {
      method: 'POST',
      body: JSON.stringify({
        manufacturer: selectedMfr.name.toUpperCase(),
        markup: Number(data.markup),
        pricingMode: data.mode,
        discountChain: data.chain
      }),
    });
    
    await loadInitialData();
    setLoadState({ loading: false, status: `Rule saved for ${selectedMfr.name}` });
    setTimeout(() => setLoadState(s => ({ ...s, status: '' })), 3000);
  };

  const handleDeleteRule = async (manufacturerName: string) => {
    if (!confirm(`Delete pricing rule for ${manufacturerName}?`)) return;
    
    // Save with 0 markup to effectively remove
    await authFetch('/api/pricing/rules', {
      method: 'POST',
      body: JSON.stringify({
        manufacturer: manufacturerName,
        markup: 0,
        pricingMode: 'AQ_NET',
        discountChain: ''
      }),
    });
    
    await loadInitialData();
    setLoadState({ loading: false, status: `Rule removed for ${manufacturerName}` });
    setTimeout(() => setLoadState(s => ({ ...s, status: '' })), 3000);
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans p-6">
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY}></script>

      <div className="max-w-7xl mx-auto">
        {/* Main Content Area */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
          {/* Toolbar */}
          <div className="px-6 py-5 border-b border-gray-100 space-y-4">
            {/* Title Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">Manufacturers</h2>
                <span className="text-sm text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">{filteredManufacturers.length}</span>
              </div>
              
              {/* Status/Version Indicator */}
               {loadState.status && (
                <div className="text-sm font-bold text-indigo-600 animate-pulse">{loadState.status}</div>
              )}
            </div>

            {/* Controls Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Filters (Left) */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                {(['all', 'enabled', 'with_rules'] as FilterTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      activeTab === tab
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab === 'all' ? 'All' : tab === 'enabled' ? 'Enabled' : 'With Rules'}
                  </button>
                ))}
              </div>

              {/* Actions (Right) */}
              <div className="flex items-center gap-3 w-full md:w-auto">
                {/* Search */}
                <div className="relative flex-grow md:flex-grow-0 md:w-64">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search manufacturers..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>

                {/* Start Ingest Button */}
                <button
                  onClick={handleIngest}
                  disabled={loadState.loading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                >
                  {loadState.loading ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  )}
                  {loadState.loading ? 'Ingesting...' : 'Start Ingest'}
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto h-[calc(100vh-250px)]">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Manufacturer</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Pricing Rule</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dataLoading ? (
                  // Loading skeleton
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 py-5"><div className="h-5 bg-gray-200 rounded w-48"></div></td>
                      <td className="px-6 py-5"><div className="h-6 bg-gray-200 rounded w-20"></div></td>
                      <td className="px-6 py-5"><div className="h-5 bg-gray-200 rounded w-32"></div></td>
                      <td className="px-6 py-5"><div className="h-8 bg-gray-200 rounded w-28 ml-auto"></div></td>
                    </tr>
                  ))
                ) : filteredManufacturers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                      No manufacturers found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredManufacturers.map(m => {
                    const isEnabled = enabledMfrs.includes(m.id);
                    const rule = getRuleForMfr(m.name);
                    
                    return (
                      <tr 
                        key={m.id} 
                        className={`hover:bg-gray-50 transition-colors ${isEnabled ? 'border-l-4 border-l-green-500' : ''}`}
                      >
                        {/* Manufacturer Name */}
                        <td className="px-6 py-5">
                          <span className="font-semibold text-gray-900">{m.name}</span>
                        </td>
                        
                        {/* Status */}
                        <td className="px-6 py-5">
                          <button
                            onClick={() => handleToggleMfr(m.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                              isEnabled
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {isEnabled ? (
                              <>
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Enabled
                              </>
                            ) : 'Disabled'}
                          </button>
                        </td>
                        
                        {/* Pricing Rule */}
                        <td className="px-6 py-5">
                          {rule ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-sm font-medium">
                                {rule.pricingMode === 'LIST_DISCOUNT' ? (
                                  <>List - {rule.discountChain || '0'}</>
                                ) : (
                                  'AQ Net'
                                )}
                                <span className="font-bold">+{rule.markupPercentage}%</span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">No rule set</span>
                          )}
                        </td>
                        
                        {/* Actions */}
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {rule && (
                              <button
                                onClick={() => handleDeleteRule(m.name.toUpperCase())}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete Rule"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenRuleModal(m)}
                              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                            >
                              {rule ? 'Edit Rule' : 'Set Rule'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pricing Rule Modal */}
      <PricingRuleModal
        isOpen={modalOpen}
        manufacturer={selectedMfr}
        existingRule={selectedMfr ? getRuleForMfr(selectedMfr.name) : undefined}
        onClose={() => {
          setModalOpen(false);
          setSelectedMfr(null);
        }}
        onSave={handleSaveRule}
      />
    </main>
  );
}
