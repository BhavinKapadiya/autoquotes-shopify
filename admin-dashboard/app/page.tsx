"use client";

import { useState, useEffect } from 'react';

// App Bridge v4 uses the global `shopify` object when embedded.
// We declare it here for TS.
declare global {
  interface Window {
    shopify?: any;
  }
}

interface PricingRule {
  manufacturer: string;
  markupPercentage: number;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [manufacturer, setManufacturer] = useState('');
  const [markup, setMarkup] = useState('');
  const [status, setStatus] = useState('');
  const [rules, setRules] = useState<PricingRule[]>([]);

  // Helper for Authenticated Requests using App Bridge v4
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://autoquotes-shopify.onrender.com';
    // Ensure url starts with / if it's a relative path, or handle full URLs
    const fullUrl = url.startsWith('http') ? url : `${backendUrl}${url}`;

    try {
      let token = '';
      if (typeof window !== 'undefined' && window.shopify && window.shopify.id) {
        token = await window.shopify.id.getSessionToken();
      } else {
        // Fallback for local testing outside Shopify (optional)
        console.warn('Not in Shopify iframe, skipping token');
      }

      const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      return fetch(fullUrl, { ...options, headers });
    } catch (error) {
      console.error("Auth Token Error:", error);
      throw error;
    }
  };

  const fetchRules = async () => {
    try {
      const res = await authFetch('/api/pricing/rules');
      if (res.ok) {
        const data = await res.json();
        setRules(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch rules', err);
    }
  };

  useEffect(() => {
    // Check if we are embedded
    if (typeof window !== 'undefined' && !window.shopify) {
      // We might want to inject the script if it's missing, but for now just warn
      // <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
      // In Next.js App Router we should theoretically put this in layout `head`.
    }
    fetchRules();
  }, []);

  const triggerSync = async () => {
    setLoading(true);
    setStatus('Starting sync...');
    try {
      const res = await authFetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      const data = await res.json();
      setStatus(`Sync Initiated: ${data.status}`);
    } catch (err) {
      setStatus('Error triggering sync (Is backend running?)');
    }
    setLoading(false);
  };

  const updateRule = async () => {
    if (!manufacturer || !markup) return;
    try {
      await authFetch('/api/pricing/rules', {
        method: 'POST',
        body: JSON.stringify({ manufacturer, markup: Number(markup) }),
      });
      setStatus(`Rule updated for ${manufacturer}`);
      setManufacturer('');
      setMarkup('');
      fetchRules(); // Refresh list
    } catch (err) {
      setStatus('Error updating rule');
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY}></script>
      <div className="max-w-5xl mx-auto py-12 px-6">
        <header className="mb-10 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">AutoQuotes Sync Admin</h1>
            <p className="text-gray-500 mt-2">Manage your B2B pricing and sync status.</p>
          </div>
          <div className="text-right">
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${loading ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
              {loading ? 'Syncing...' : 'System Ready'}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Left Column: Controls */}
          <div className="space-y-8">

            {/* Single Product Sync */}
            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                🎯 Sync Specific Product
              </h2>
              <p className="text-gray-600 mb-4 text-sm">
                If a product is missing from the list (hidden/accessory), enter its <b>AutoQuotes ID</b> or <b>Model Number</b> (exact match) here.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. FAT16 or FSH18"
                  className="flex-1 border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2"
                  id="singleSyncInput"
                />
                <button
                  onClick={async () => {
                    const input = document.getElementById('singleSyncInput') as HTMLInputElement;
                    const val = input.value.trim();
                    if (!val) return;

                    setLoading(true);
                    setStatus(`Syncing ${val}...`);
                    try {
                      const res = await authFetch('/api/sync/product', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ productId: val })
                      });
                      if (res.ok) {
                        setStatus(`✅ Successfully synced ${val}`);
                        input.value = '';
                      } else {
                        const err = await res.json();
                        setStatus(`❌ Failed: ${err.error}`);
                      }
                    } catch (e) {
                      setStatus('❌ Error connecting to server');
                    }
                    setLoading(false);
                  }}
                  disabled={loading}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
                >
                  Sync Item
                </button>
              </div>
            </section>

            {/* Sync Control */}
            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                🔄 Sync Operations
              </h2>
              <p className="text-gray-600 mb-6 text-sm">
                Trigger a manual sync to pull latest products from AutoQuotes, apply pricing rules, and push to Shopify.
              </p>
              <button
                onClick={triggerSync}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 flex justify-center items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Syncing in background...
                  </>
                ) : 'Start Full Sync'}
              </button>
              {status && (
                <div className="mt-4 p-3 bg-gray-50 rounded text-sm text-gray-700 border border-gray-100">
                  {status}
                </div>
              )}
            </section>

            {/* Add Rule Form */}
            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                ➕ Add Pricing Rule
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Manufacturer Code</label>
                  <input
                    type="text"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value.toUpperCase())}
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2"
                    placeholder="e.g. HOBART"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Markup Percentage (%)</label>
                  <input
                    type="number"
                    value={markup}
                    onChange={(e) => setMarkup(e.target.value)}
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2"
                    placeholder="20"
                  />
                </div>
                <button
                  onClick={updateRule}
                  disabled={!manufacturer || !markup}
                  className="w-full bg-gray-900 hover:bg-black text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  Save Rule
                </button>
              </div>
            </section>
          </div>

          {/* Right Column: Active Rules List */}
          <div className="space-y-8">
            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-full">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-gray-800">
                  📋 Active Rules
                </h2>
                <button onClick={fetchRules} className="text-sm text-blue-600 hover:text-blue-800">Refresh</button>
              </div>

              {rules.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  No rules active. Using defaults.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manufacturer</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Markup</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {rules.map((rule, idx) => (
                        <tr key={idx}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{rule.manufacturer}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              +{rule.markupPercentage}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

        </div>
      </div>
    </main>
  );
}
