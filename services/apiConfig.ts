/**
 * Utility function to construct API URLs that work in both local and production environments
 * Uses VITE_BACKEND_URL environment variable if set, otherwise falls back to /api
 */
export const getApiUrl = (path: string): string => {
  const envValue = import.meta.env.VITE_BACKEND_URL;
  let BACKEND_URL = envValue || '/api';
  
  // 🔥 DEBUG: Log the environment variable value (for debugging production issues)
  if (typeof window !== 'undefined') {
    const isProduction = window.location.hostname.includes('cryptogifting.app') || 
                        window.location.hostname.includes('vercel.app');
    if (isProduction) {
      console.log('🔍 getApiUrl Debug:', {
        envValue: envValue ? (envValue.length > 50 ? envValue.substring(0, 50) + '...' : envValue) : 'NOT SET',
        initialBackendUrl: BACKEND_URL,
        hostname: window.location.hostname,
        isProd: import.meta.env.PROD,
        mode: import.meta.env.MODE,
      });
    }
  }
  
  // 🔥 CRITICAL FIX: In production, if VITE_BACKEND_URL is missing or invalid, use fallback
  // Check if we're in production by hostname (more reliable than import.meta.env.PROD)
  const isProduction = typeof window !== 'undefined' && 
    (window.location.hostname.includes('cryptogifting.app') || 
     window.location.hostname.includes('vercel.app') ||
     (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')));
  
  if (isProduction) {
    // If env var is missing, empty, or points to localhost, use fallback
    if (!BACKEND_URL || 
        BACKEND_URL.trim() === '' || 
        BACKEND_URL === '/api' || 
        BACKEND_URL.includes('localhost') || 
        BACKEND_URL.includes('127.0.0.1') ||
        BACKEND_URL.includes(':3001')) {
      console.warn('⚠️ VITE_BACKEND_URL not properly set in production, using fallback', {
        receivedValue: BACKEND_URL,
        fallbackTo: 'https://crypto-gifting-app.onrender.com'
      });
      BACKEND_URL = 'https://crypto-gifting-app.onrender.com';
    }
  }
  
  // Ensure we never use localhost in production
  if (import.meta.env.PROD && (BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1'))) {
    console.error('❌ ERROR: Backend URL contains localhost in production!', BACKEND_URL);
    throw new Error('Invalid backend URL configuration in production. VITE_BACKEND_URL must be set to a production URL.');
  }
  
  // If BACKEND_URL is set but doesn't end with /api, append it
  if (BACKEND_URL !== '/api' && !BACKEND_URL.endsWith('/api')) {
    BACKEND_URL = `${BACKEND_URL}/api`;
  }
  
  // Remove leading slash from path if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  const finalUrl = `${BACKEND_URL}/${cleanPath}`;
  
  // Log final URL in production for debugging
  if (isProduction && typeof window !== 'undefined') {
    console.log('✅ getApiUrl final URL:', finalUrl);
  }
  
  return finalUrl;
};


