import http from 'http';
import https from 'https';

export function startKeepAlivePing(url: string, intervalMs = 5 * 60 * 1000) {
  if (!url) {
    return;
  }

  const client = url.startsWith('https') ? https : http;
  console.log(`🫀 Keep-alive ping enabled for ${url} every ${intervalMs / 1000}s`);

  const ping = () => {
    const start = Date.now();
    const req = client.get(url, (res) => {
      res.on('data', () => undefined);
      res.on('end', () => {
        const duration = Date.now() - start;
        console.log(`🫀 Keep-alive ping success (${res.statusCode}) in ${duration}ms`);
      });
    });

    req.on('error', (error) => {
      console.warn('⚠️ Keep-alive ping failed:', error.message);
    });

    req.setTimeout(4000, () => {
      req.destroy();
      console.warn('⚠️ Keep-alive ping timed out');
    });
  };

  ping();
  setInterval(ping, intervalMs).unref();
}

