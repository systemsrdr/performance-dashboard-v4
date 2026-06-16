// Vercel Serverless Function — Proxy para listar contas conectadas
// Tenta vários endpoints conhecidos do upstream em sequência, devolve o primeiro
// que retornar dados úteis. Inclui diagnóstico via ?debug=1.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const API_KEY = process.env.WINDSOR_API_KEY || '2d4d1d577551f238260e5e6e150a4d7b4f24';
  const debug = req.query && req.query.debug === '1';
  const diagnostics = [];

  const today = new Date();
  const dateTo = today.toISOString().split('T')[0];
  const past = new Date(); past.setDate(past.getDate() - 60);
  const dateFrom = past.toISOString().split('T')[0];

  const candidates = [
    { name: 'co_user_linked', url: `https://onboard.windsor.ai/api/team/co-user-linked-accounts/?api_key=${API_KEY}` },
    { name: 'get_connectors', url: `https://onboard.windsor.ai/api/get_connectors?api_key=${API_KEY}` },
    { name: 'connectors',     url: `https://onboard.windsor.ai/api/connectors?api_key=${API_KEY}` },
    { name: 'ds_accounts',    url: `https://onboard.windsor.ai/api/ds/accounts?api_key=${API_KEY}` },
    // Última cartada: deriva das próprias linhas de dados consumindo /all
    { name: 'derive_with_name',
      url: `https://connectors.windsor.ai/all?api_key=${API_KEY}&date_from=${dateFrom}&date_to=${dateTo}&fields=source,account_id,account_name,spend`,
      derive: true },
    // Plano B do derive: sem account_name (alguns conectores não expõem)
    { name: 'derive_no_name',
      url: `https://connectors.windsor.ai/all?api_key=${API_KEY}&date_from=${dateFrom}&date_to=${dateTo}&fields=source,account_id,spend`,
      derive: true },
  ];

  let best = null;
  for (const c of candidates) {
    try {
      const r = await fetch(c.url, { headers: { 'Accept': 'application/json' } });
      const text = await r.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (_) {}
      const accountsFound = countAccounts(parsed, c.derive);
      diagnostics.push({ name: c.name, status: r.status, accountsFound, preview: text.substring(0, 200) });
      if (r.ok && accountsFound > 0) {
        best = { source: c.name, data: c.derive ? deriveAccountsFromData(parsed) : parsed };
        break;
      }
    } catch (err) {
      diagnostics.push({ name: c.name, error: String(err) });
    }
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (debug) {
    res.status(200).json({ diagnostics, used: best ? best.source : null, data: best ? best.data : null });
    return;
  }
  res.status(200).json(best ? best.data : []);
}

function countAccounts(json, derive) {
  if (!json) return 0;
  if (derive) {
    const arr = Array.isArray(json) ? json : (json.data || []);
    if (!Array.isArray(arr)) return 0;
    const ids = new Set();
    for (const r of arr) { const id = r && (r.account_id || r.id); if (id) ids.add(String(id)); }
    return ids.size;
  }
  let arr = null;
  if (Array.isArray(json)) arr = json;
  else if (Array.isArray(json.data)) arr = json.data;
  else if (Array.isArray(json.accounts)) arr = json.accounts;
  else if (Array.isArray(json.connectors)) arr = json.connectors;
  else if (Array.isArray(json.linked_accounts)) arr = json.linked_accounts;
  else if (Array.isArray(json.results)) arr = json.results;
  if (Array.isArray(arr)) {
    let total = 0;
    for (const item of arr) { if (item && Array.isArray(item.accounts)) total += item.accounts.length; }
    return total > 0 ? total : arr.length;
  }
  return 0;
}

function deriveAccountsFromData(json) {
  const arr = Array.isArray(json) ? json : (json && json.data) || [];
  const seen = new Map();
  for (const r of arr) {
    if (!r) continue;
    const id = r.account_id || r.id;
    if (!id) continue;
    const ds = (r.source || r.datasource || '').toLowerCase();
    const key = ds + '-' + id;
    if (seen.has(key)) continue;
    seen.set(key, { datasource: ds, account_id: String(id), account_name: r.account_name || String(id), status: 'active' });
  }
  return Array.from(seen.values());
}
