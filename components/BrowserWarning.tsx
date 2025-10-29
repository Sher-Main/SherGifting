import React from 'react';

const BrowserWarning: React.FC = () => {
  const [showWarning, setShowWarning] = React.useState(false);

  React.useEffect(() => {
    // Check for common problematic extensions
    const checkExtensions = () => {
      const hasProblematicExtensions = 
        window.chrome?.runtime?.getManifest?.()?.name?.includes('MetaMask') ||
        window.chrome?.runtime?.getManifest?.()?.name?.includes('Wallet') ||
        document.querySelector('script[src*="metamask"]') ||
        document.querySelector('script[src*="wallet"]');
      
      if (hasProblematicExtensions) {
        setShowWarning(true);
      }
    };

    // Check after a short delay to allow extensions to load
    const timer = setTimeout(checkExtensions, 1000);
    return () => clearTimeout(timer);
  }, []);

  if (!showWarning) return null;

  return (
    <div className="fixed top-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded-lg shadow-lg z-50 max-w-sm">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium">
            Browser Extension Conflict
          </h3>
          <div className="mt-2 text-sm">
            <p>
              Some browser extensions may interfere with wallet creation. 
              Try disabling wallet extensions temporarily if you encounter issues.
            </p>
          </div>
          <div className="mt-3">
            <button
              onClick={() => setShowWarning(false)}
              className="text-sm bg-yellow-200 hover:bg-yellow-300 px-2 py-1 rounded"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrowserWarning;
