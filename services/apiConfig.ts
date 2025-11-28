/**
 * Utility function to construct API URLs that work in both local and production environments
 * Uses VITE_BACKEND_URL environment variable if set, otherwise falls back to /api
 */
export const getApiUrl = (path: string): string => {
  let BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '/api';
  
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

