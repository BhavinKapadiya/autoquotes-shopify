'use client';

import { useState, useEffect, useRef } from 'react';

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

interface PricingRuleModalProps {
  isOpen: boolean;
  manufacturer: Manufacturer | null;
  existingRule?: PricingRule;
  onClose: () => void;
  onSave: (data: { markup: string; mode: string; chain: string }) => Promise<void>;
}

export default function PricingRuleModal({
  isOpen,
  manufacturer,
  existingRule,
  onClose,
  onSave,
}: PricingRuleModalProps) {
  const [markup, setMarkup] = useState('');
  const [mode, setMode] = useState<string>('AQ_NET');
  const [chain, setChain] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Initialize form with existing rule data
  useEffect(() => {
    if (existingRule) {
      setMarkup(String(existingRule.markupPercentage || ''));
      setMode(existingRule.pricingMode || 'AQ_NET');
      setChain(existingRule.discountChain || '');
    } else {
      setMarkup('');
      setMode('AQ_NET');
      setChain('');
    }
    setError('');
  }, [existingRule, isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!markup || Number(markup) < 0) {
      setError('Please enter a valid markup percentage');
      return;
    }
    
    setSaving(true);
    setError('');
    
    try {
      await onSave({ markup, mode, chain });
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !manufacturer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        ref={modalRef}
        tabIndex={-1}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-scale-in"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Set Pricing Rule</h2>
              <p className="text-sm text-gray-500 mt-0.5">for <span className="font-semibold text-gray-700">{manufacturer.name}</span></p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Pricing Mode */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Pricing Mode</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('AQ_NET')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  mode === 'AQ_NET'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold text-gray-900">AQ Net Price</div>
                <div className="text-xs text-gray-500 mt-1">Recommended</div>
              </button>
              <button
                type="button"
                onClick={() => setMode('LIST_DISCOUNT')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  mode === 'LIST_DISCOUNT'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold text-gray-900">List - Discount</div>
                <div className="text-xs text-gray-500 mt-1">Custom chain</div>
              </button>
            </div>
          </div>

          {/* Discount Chain (conditional) */}
          {mode === 'LIST_DISCOUNT' && (
            <div className="animate-fade-in">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Discount Chain</label>
              <input
                type="text"
                value={chain}
                onChange={(e) => setChain(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-mono"
                placeholder="e.g. 50/10/5"
              />
              <p className="text-xs text-gray-400 mt-2">Enter discounts separated by slashes (50/10/5 = 50% off, then 10%, then 5%)</p>
            </div>
          )}

          {/* Markup Percentage */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Plus Markup %</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">+</span>
              <input
                type="number"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                placeholder="20"
                min="0"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">%</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !markup}
            className="flex-1 px-4 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : (
              'Save Rule'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
