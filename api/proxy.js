// Vercel Serverless proxy for /api/* -> forwards to Render backend
// Keeps method, headers and body. Exposes backend responses transparently.
const BACKEND = process.env.CHECKBELL_BACKEND || 'https://checkbell-v2.onrender.com';

module.exports = async (req, res) => {
  try {
    // Strip leading /api
    const targetPath = req.url.replace(/^\/?api/, '');
    const url = BACKEND.replace(/\/+$/, '') + '/api' + targetPath;

    // Build headers for forward, remove host header
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders.host;

    // Stream body if present
    const fetchOptions = {
      method: req.method,
      headers: forwardHeaders,
      // In Vercel Node runtime, `req` is a readable stream; pass it through
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      redirect: 'manual',
    };

    const r = await fetch(url, fetchOptions);

    // Forward status
    res.statusCode = r.status;

    // Forward headers (omit hop-by-hop headers)
    const hopByHop = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailers','transfer-encoding','upgrade']);
    r.headers.forEach((value, name) => {
      if (!hopByHop.has(name.toLowerCase())) {
        res.setHeader(name, value);
      }
    });

    // Ensure CORS allowed for browser
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight
    if (req.method === 'OPTIONS') return res.end();

    // Pipe response body
    const reader = r.body?.getReader?.();
    if (reader) {
      const stream = new ReadableStream({
        start(controller) {
          function push() {
            reader.read().then(({ done, value }) => {
              if (done) {
                controller.close();
                return;
              }
              controller.enqueue(value);
              push();
            }).catch((err) => controller.error(err));
          }
          push();
        }
      });
      const resBuffer = await new Response(stream).arrayBuffer();
      return res.end(Buffer.from(resBuffer));
    }

    // Fallback: text
    const text = await r.text();
    res.end(text);
  } catch (e) {
    console.error('proxy error', e);
    res.statusCode = 502;
    res.end('Bad Gateway');
  }
};
