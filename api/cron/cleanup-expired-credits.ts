import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel Serverless Function
 * 
 * This function is called by Vercel cron job and then calls the Render backend
 * to execute the credit cleanup.
 * 
 * Flow: Vercel cron → This function → Render backend API
 * 
 * Environment Variables Required:
 * - RENDER_BACKEND_URL: Your Render backend URL (e.g., https://your-app.onrender.com)
 * - CRON_SECRET: Secret token to authenticate with Render backend
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests (Vercel cron sends POST)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get Render backend URL from environment variable
    const renderBackendUrl = process.env.RENDER_BACKEND_URL;
    
    if (!renderBackendUrl) {
      console.error('❌ RENDER_BACKEND_URL not set in Vercel environment variables');
      return res.status(500).json({ 
        error: 'Backend URL not configured',
        message: 'Please set RENDER_BACKEND_URL in Vercel environment variables',
        hint: 'Format: https://your-backend-name.onrender.com'
      });
    }

    // Get CRON_SECRET from environment
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      console.error('❌ CRON_SECRET not set in Vercel environment variables');
      return res.status(500).json({ 
        error: 'Cron secret not configured',
        message: 'Please set CRON_SECRET in Vercel environment variables'
      });
    }

    // Construct the full URL to Render backend
    const renderBackendEndpoint = `${renderBackendUrl.replace(/\/$/, '')}/api/cron/cleanup-expired-credits`;

    console.log('🔄 Vercel cron job triggered - calling Render backend...');
    console.log(`   Render Backend: ${renderBackendEndpoint}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);

    // Call Render backend with CRON_SECRET
    const response = await fetch(renderBackendEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cronSecret}`,
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Render backend error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      
      return res.status(response.status).json({
        error: 'Backend request failed',
        status: response.status,
        statusText: response.statusText,
        details: errorText,
        timestamp: new Date().toISOString(),
      });
    }

    const data = await response.json();
    
    console.log('✅ Credit cleanup completed successfully:', {
      expiredCreditsCount: data.expiredCreditsCount,
      timestamp: data.timestamp,
    });

    return res.status(200).json({
      success: true,
      message: 'Credit cleanup executed successfully',
      backendResponse: data,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    // Handle fetch errors (network, timeout, etc.)
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      console.error('❌ Request timeout calling Render backend');
      return res.status(504).json({
        error: 'Request timeout',
        message: 'Render backend did not respond within 30 seconds',
        details: String(error),
      });
    }

    console.error('❌ Error calling Render backend:', error);
    return res.status(500).json({
      error: 'Failed to execute credit cleanup',
      message: 'An error occurred while calling the Render backend',
      details: String(error),
      timestamp: new Date().toISOString(),
    });
  }
}


