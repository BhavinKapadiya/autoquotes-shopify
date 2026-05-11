"use client";

import React, { useState, useEffect } from 'react';

// --- Types ---
interface Manufacturer {
  id: string;
  name: string;
}

interface CategoryMapping {
  aqProductType: string;
  shopifyCollection: string;
  tagsToApply: string[];
}

interface MfrConfig {
  mfrName: string;
  groupingStrategy: 'GOOGLE_SHEETS' | 'AQ_REGEX' | 'FLAT';
  regexPattern?: string;
  variantOption1Source?: string;
  variantOption2Source?: string;
  variantOption3Source?: string;
  categoryMappings: CategoryMapping[];
}

interface MfrProfile {
  totalProducts: number;
  uniqueProductTypes: string[];
  categoryValueKeys: string[];
}

export default function ManufacturerConfigPage() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [enabledMfrs, setEnabledMfrs] = useState<string[]>([]);
  const [selectedMfrName, setSelectedMfrName] = useState<string>('');
  
  const [config, setConfig] = useState<MfrConfig | null>(null);
  const [profile, setProfile] = useState<MfrProfile | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://autoquotes-shopify.onrender.com';

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const fullUrl = url.startsWith('http') ? url : `${backendUrl}${url}`;
    const headers = { ...options.headers, 'Content-Type': 'application/json' };
    return fetch(fullUrl, { ...options, headers });
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [mfrRes, setRes] = await Promise.all([
        authFetch('/api/manufacturers'),
        authFetch('/api/settings')
      ]);

      if (mfrRes.ok) setManufacturers(await mfrRes.json());
      if (setRes.ok) {
        const data = await setRes.json();
        setEnabledMfrs(data.enabledManufacturers || []);
      }
    } catch (e) {
      console.error("Load failed", e);
    }
  };

  const enabledManufacturersList = manufacturers.filter(m => enabledMfrs.includes(m.id));

  const handleMfrSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mfrName = e.target.value;
    setSelectedMfrName(mfrName);
    setConfig(null);
    setProfile(null);
    setError('');
    setSuccess('');

    if (!mfrName) return;

    setLoading(true);
    try {
      const res = await authFetch(`/api/config/${encodeURIComponent(mfrName)}`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      } else if (res.status === 404) {
        // No config yet, we can initialize an empty one
        setConfig({
          mfrName,
          groupingStrategy: 'FLAT',
          categoryMappings: []
        });
      } else {
        throw new Error('Failed to fetch config');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedMfrName) return;
    
    setAnalyzing(true);
    setError('');
    setSuccess('');
    
    try {
      const res = await authFetch(`/api/config/${encodeURIComponent(selectedMfrName)}/analyze`);
      if (!res.ok) throw new Error('Analysis failed. Did you ingest data for this manufacturer?');
      
      const data = await res.json();
      setProfile(data.profile);
      
      // Merge AI suggestions into current config
      const suggestions = data.suggestions;
      setConfig(prev => ({
        ...(prev || { mfrName: selectedMfrName, groupingStrategy: 'FLAT', categoryMappings: [] }),
        variantOption1Source: suggestions.suggestedOptions?.[0] || '',
        variantOption2Source: suggestions.suggestedOptions?.[1] || '',
        variantOption3Source: suggestions.suggestedOptions?.[2] || '',
        categoryMappings: suggestions.categoryMappings || []
      }));
      
      setSuccess('AI Analysis complete! Review the suggestions below.');
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!config || !selectedMfrName) return;
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const res = await authFetch(`/api/config/${encodeURIComponent(selectedMfrName)}`, {
        method: 'POST',
        body: JSON.stringify(config)
      });
      
      if (!res.ok) throw new Error('Failed to save configuration');
      
      setSuccess('Configuration saved successfully! Sync Engine will now use these rules.');
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryMappingChange = (index: number, field: keyof CategoryMapping, value: string) => {
    if (!config) return;
    const newMappings = [...config.categoryMappings];
    if (field === 'tagsToApply') {
      newMappings[index][field] = value.split(',').map(t => t.trim()).filter(Boolean);
    } else {
      newMappings[index][field] = value as any;
    }
    setConfig({ ...config, categoryMappings: newMappings });
  };

  const addCategoryMapping = () => {
    if (!config) return;
    setConfig({
      ...config,
      categoryMappings: [...config.categoryMappings, { aqProductType: '', shopifyCollection: '', tagsToApply: [] }]
    });
  };

  const removeCategoryMapping = (index: number) => {
    if (!config) return;
    const newMappings = [...config.categoryMappings];
    newMappings.splice(index, 1);
    setConfig({ ...config, categoryMappings: newMappings });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Manufacturer Configuration (AI-Assisted)</h1>
      </div>

      {error && <div className="bg-red-50 text-red-600 p-4 rounded-md text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-600 p-4 rounded-md text-sm">{success}</div>}

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Manufacturer</label>
            <select
              value={selectedMfrName}
              onChange={handleMfrSelect}
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
            >
              <option value="">-- Choose Manufacturer --</option>
              {enabledManufacturersList.map(m => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={!selectedMfrName || analyzing || loading}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 font-semibold flex items-center gap-2"
          >
            {analyzing ? 'Analyzing...' : '🧠 Auto-Analyze with AI'}
          </button>
        </div>
      </div>

      {loading && !analyzing && <div className="text-center py-8">Loading configuration...</div>}

      {config && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Left Column: Grouping & Variants */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-lg font-bold mb-4 border-b pb-2">Grouping Strategy</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">How are base models determined?</label>
                  <select
                    value={config.groupingStrategy}
                    onChange={e => setConfig({ ...config, groupingStrategy: e.target.value as any })}
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                  >
                    <option value="FLAT">Flat (1 Product per SKU)</option>
                    <option value="AQ_REGEX">Auto-Grouping (Regex on AQ Model)</option>
                    <option value="GOOGLE_SHEETS">Google Sheets Mapping</option>
                  </select>
                </div>
                
                {config.groupingStrategy === 'AQ_REGEX' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Regex Pattern (Optional, defaults to Series-Zone-Width)</label>
                    <input
                      type="text"
                      value={config.regexPattern || ''}
                      onChange={e => setConfig({ ...config, regexPattern: e.target.value })}
                      placeholder="e.g. ^([A-Z]+-[A-Z]+-\\d+)"
                      className="w-full border-gray-300 rounded-md shadow-sm p-2 border font-mono text-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-lg font-bold mb-4 border-b pb-2">Variant Options (Max 3)</h2>
              <p className="text-sm text-gray-500 mb-4">Select the properties from the manufacturer's data to use as Shopify drop-downs.</p>
              
              <div className="space-y-4">
                {[1, 2, 3].map((num) => {
                  const fieldName = `variantOption${num}Source` as keyof MfrConfig;
                  return (
                    <div key={num}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Option {num}</label>
                      <select
                        value={(config[fieldName] as string) || ''}
                        onChange={e => setConfig({ ...config, [fieldName]: e.target.value })}
                        className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                      >
                        <option value="">-- None --</option>
                        <option value="productDimension.productWidth">Width (Dimensions)</option>
                        {profile?.categoryValueKeys.map(key => (
                          <option key={key} value={key}>{key} (Spec)</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Categories */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h2 className="text-lg font-bold">Category Mappings</h2>
              <button onClick={addCategoryMapping} className="text-sm bg-gray-100 px-2 py-1 rounded hover:bg-gray-200">
                + Add Mapping
              </button>
            </div>
            
            <p className="text-sm text-gray-500 mb-4">Map raw AutoQuotes Product Types to Shopify Collections and Tags.</p>

            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {config.categoryMappings.map((mapping, idx) => (
                <div key={idx} className="p-4 border rounded-md bg-gray-50 relative">
                  <button 
                    onClick={() => removeCategoryMapping(idx)}
                    className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold"
                  >
                    ×
                  </button>
                  <div className="space-y-3 mt-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500">AQ Product Type</label>
                      <input
                        type="text"
                        value={mapping.aqProductType}
                        onChange={e => handleCategoryMappingChange(idx, 'aqProductType', e.target.value)}
                        className="w-full border-gray-300 rounded shadow-sm p-1 border text-sm"
                        placeholder="e.g. Display Case, Refrigerated Bakery"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500">Shopify Collection Name</label>
                      <input
                        type="text"
                        value={mapping.shopifyCollection}
                        onChange={e => handleCategoryMappingChange(idx, 'shopifyCollection', e.target.value)}
                        className="w-full border-gray-300 rounded shadow-sm p-1 border text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500">Tags (comma separated)</label>
                      <input
                        type="text"
                        value={mapping.tagsToApply.join(', ')}
                        onChange={e => handleCategoryMappingChange(idx, 'tagsToApply', e.target.value)}
                        className="w-full border-gray-300 rounded shadow-sm p-1 border text-sm"
                        placeholder="e.g. Category_Refrigeration, Sub_Bakery"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {config.categoryMappings.length === 0 && (
                <div className="text-sm text-gray-400 text-center py-4">No mappings defined.</div>
              )}
            </div>
          </div>

        </div>
      )}

      {config && (
        <div className="flex justify-end pt-4 border-t mt-8">
          <button
            onClick={handleSave}
            disabled={loading}
            className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 font-bold shadow-md disabled:opacity-50"
          >
            {loading ? 'Saving...' : '💾 Save Configuration'}
          </button>
        </div>
      )}

    </div>
  );
}
