// Vercel Serverless Function — Proxy para Windsor.ai
// Resolve o CORS chamando o Windsor pelo servidor em vez do browser.
//
// Endpoint exposto: GET /api/accounts
// Retorna: a resposta crua do Windsor (lista de contas conectadas)
//
// A API key fica no servidor — pode ser definida via env var WINDSOR_API_KEY
// na Vercel (Settings → Environment Variables) ou usar o fallback abaixo.

export default async function handler(req, res) {
  // CORS: permite o front consumir esta função
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const API_KEY = process.env.WINDSOR_API_KEY || '2d4d1d577551f238260e5e6e150a4d7b4f24';

  try {
    const url = `https://onboard.windsor.ai/api/team/co-user-linked-accounts/?api_key=${API_KEY}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600'); // cache 5 min
    res.status(r.status).send(text);
  } catch (err) {
    res.status(500).json({ error: 'proxy_failed', message: String(err) });
  }
}
