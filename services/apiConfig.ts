/**
 * Utility function to construct API URLs that work in both local and production environments
 * Uses VITE_BACKEND_URL environment variable if set, otherwise falls back to /api
 */
export const getApiUrl = (path: string): string => {
  let BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '/api';
  
  // 🔥 CRITICAL FIX: In production, if VITE_BACKEND_URL is missing, use fallback
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
      console.warn('⚠️ VITE_BACKEND_URL not properly set in production, using fallback');
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
  
  return `${BACKEND_URL}/${cleanPath}`;
};


