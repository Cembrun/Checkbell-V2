const BACKEND = process.env.CHECKBELL_BACKEND || 'https://checkbell-v2.onrender.com';

module.exports = async (req, res) => {
  try {
    // req.url may be '/login' or '/proxy/login' depending on invocation; normalize
    const incoming = req.url || '/';
    const targetPath = incoming.startsWith('/api') ? incoming : '/api' + incoming;
    const url = BACKEND.replace(/\/+$/, '') + targetPath;

    // Read request body (if any)
    let body;
    if (!['GET','HEAD'].includes(req.method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (chunks.length) body = Buffer.concat(chunks);
    }

    // Forward headers, drop host
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders.host;

    const resp = await fetch(url, {
      method: req.method,
      headers: forwardHeaders,
      body,
      redirect: 'manual',
    });

    // copy status
    res.statusCode = resp.status;

    // copy headers except hop-by-hop
    const hopByHop = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailers','transfer-encoding','upgrade']);
    resp.headers.forEach((v,k)=>{
      if (!hopByHop.has(k.toLowerCase())) res.setHeader(k, v);
    });

    // ensure CORS for browser
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') return res.end();

    // stream body back
    const arrayBuffer = await resp.arrayBuffer();
    return res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('proxy catch-all error', err);
    res.statusCode = 502;
    res.end('Bad Gateway');
  }
};
