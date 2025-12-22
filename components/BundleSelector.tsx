import React, { useEffect, useState } from 'react';
import { bundleService } from '../services/api';
import { Bundle } from '../types';

interface Props {
  onBundleSelect: (bundle: Bundle) => void;
  selectedBundleId: string | null;
}

export const BundleSelector: React.FC<Props> = ({ onBundleSelect, selectedBundleId }) => {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBundles = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedBundles = await bundleService.getBundles();
      setBundles(fetchedBundles);
    } catch (e: any) {
      console.error('Error fetching bundles:', e);
      setError('Failed to load bundles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBundles();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-400">Loading bundles…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <p className="text-rose-400 mb-2">{error}</p>
        <button
          onClick={fetchBundles}
          className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (bundles.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        No bundles available at this time.
      </div>
    );
  }

  return (
    <section className="bundle-selector">
      <header className="mb-6">
        <h3 className="text-2xl font-bold text-white mb-2">Preset Gift Bundles</h3>
        <p className="text-slate-400">Curated packs that feel thoughtful out of the box.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
        {bundles.map((bundle) => {
          const isSelected = selectedBundleId === bundle.id;
          const isValuePack = bundle.name === 'Value Pack';
          return (
            <div key={bundle.id} className="relative">
              {isValuePack && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10 flex items-center gap-1 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  <span>Recommended</span>
                </div>
              )}
              <article
                className={`relative bg-slate-800 border-2 rounded-lg p-6 cursor-pointer transition-all duration-200 flex flex-col h-full ${
                  isSelected
                    ? 'border-sky-500 shadow-lg shadow-sky-500/20 scale-105'
                    : 'border-slate-700 hover:border-slate-600 hover:shadow-md'
                } ${isValuePack ? 'mt-4' : ''}`}
                onClick={() => onBundleSelect(bundle)}
              >
              {bundle.badgeText && (
                <span
                  className="absolute top-3 right-3 px-2 py-1 text-xs font-semibold text-white rounded-full"
                  style={{ backgroundColor: bundle.badgeColor || '#0ea5e9' }}
                >
                  {bundle.badgeText}
                </span>
              )}

              <h4 className="text-xl font-bold text-white mb-2">{bundle.name}</h4>
              <p className="text-sm text-slate-400 mb-4 min-h-[40px]">{bundle.description}</p>

              <div className="text-3xl font-bold bg-gradient-to-r from-sky-500 to-cyan-400 bg-clip-text text-transparent mb-4">
                ${bundle.totalUsdValue.toFixed(2)}
              </div>

              <div className="space-y-2 mb-4 bg-slate-900/50 rounded-lg p-3">
                {bundle.tokens.map((t) => (
                  <div key={t.id} className="flex justify-between items-center text-sm">
                    <span className="font-medium text-slate-300">{t.tokenSymbol}</span>
                    <span className="text-slate-400">{t.percentage}%</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className={`w-full py-2 px-4 rounded-lg font-semibold transition-all duration-200 ${
                  isSelected
                    ? 'bg-gradient-to-r from-sky-500 to-cyan-400 text-white shadow-lg shadow-sky-500/30'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {isSelected ? 'Selected' : 'Choose Bundle'}
              </button>
            </article>
            </div>
          );
        })}
      </div>
    </section>
  );
};

