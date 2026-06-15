// Vercel Serverless Function — Proxy genérico para dados de campanhas
// Recebe os mesmos query params do endpoint /all e repassa, anexando a API key no servidor.
//
// Endpoint exposto: GET /api/data?date_from=...&date_to=...&fields=...
// Retorna: a resposta crua do upstream

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const API_KEY = process.env.WINDSOR_API_KEY || '2d4d1d577551f238260e5e6e150a4d7b4f24';

  try {
    // Reconstrói querystring sem api_key (vamos anexar a nossa)
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query || {})) {
      if (k === 'api_key') continue;
      qs.set(k, Array.isArray(v) ? v[0] : v);
    }
    qs.set('api_key', API_KEY);

    const url = `https://connectors.windsor.ai/all?${qs.toString()}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.status(r.status).send(text);
  } catch (err) {
    res.status(500).json({ error: 'proxy_failed', message: String(err) });
  }
}
