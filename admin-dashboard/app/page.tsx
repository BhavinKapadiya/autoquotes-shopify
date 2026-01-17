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

  // Manufacturer Settings State
  const [manufacturers, setManufacturers] = useState<{ id: string, name: string }[]>([]);
  const [enabledMfrs, setEnabledMfrs] = useState<string[]>([]);
  const [mfrSearch, setMfrSearch] = useState('');

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

  const fetchData = async () => {
    try {
      const mfrRes = await authFetch('/api/manufacturers');
      if (mfrRes.ok) setManufacturers(await mfrRes.json());

      const setRes = await authFetch('/api/settings');
      if (setRes.ok) {
        const data = await setRes.json();
        setEnabledMfrs(data.enabledManufacturers || []);
      }
    } catch (e) {
      console.error("Failed to load initial data", e);
    }
  };

  useEffect(() => {
    fetchRules();
    fetchData();
  }, []);

  const toggleMfr = async (id: string) => {
    const newSet = enabledMfrs.includes(id)
      ? enabledMfrs.filter(x => x !== id)
      : [...enabledMfrs, id];

    setEnabledMfrs(newSet);
    await authFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabledManufacturers: newSet })
    });
  };

  function ManufacturerList() {
    const filtered = manufacturers.filter(m => (m.name || '').toLowerCase().includes(mfrSearch.toLowerCase()));
    return (
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Search Vendors..."
          className="w-full text-sm p-2 border rounded mb-2"
          value={mfrSearch}
          onChange={e => setMfrSearch(e.target.value)}
        />
        {filtered.map(m => (
          <div key={m.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
            <span className="text-sm font-medium text-gray-700">{m.name}</span>
            <div className="flex space-x-2">
              <button
                onClick={() => setManufacturer(m.name.toUpperCase())}
                className="text-xs px-2 py-1 rounded border bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
              >
                Set Rule
              </button>
              <button
                onClick={() => toggleMfr(m.id)}
                className={`text-xs px-2 py-1 rounded border ${enabledMfrs.includes(m.id) ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-green-200'}`}
              >
                {enabledMfrs.includes(m.id) ? 'Active' : 'Enable'}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-xs text-gray-400 text-center py-2">No results</div>}
      </div>
    );
  }



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

            {/* Manufacturer Selection */}
            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                🏭 Manufacturers
              </h2>

              <div className="space-y-4">
                {/* Search/Filter would go here if list is long */}
                <div className="max-h-60 overflow-y-auto border rounded p-2 custom-scrollbar">
                  {loading ? (
                    <div className="text-gray-500 text-sm p-2">Loading manufacturers...</div>
                  ) : (
                    <div className="space-y-2">
                      {/* We will fetch this list dynamically. For now, placeholders or minimal logic needed */}
                      {/* Actually, we need to fetch this data. I'll add a useEffect below or assume it's added. */}
                      <ManufacturerList />
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Add Rule Form */}
            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                ➕ Add Pricing Rule
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Select a manufacturer from the list above to auto-fill the name.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Manufacturer Name</label>
                  <input
                    type="text"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2 bg-gray-50"
                    placeholder="Select from list above..."
                    readOnly={false}
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
