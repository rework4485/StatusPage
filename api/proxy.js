/**
 * Vercel Serverless Function — GET /proxy?svc=<key>
 * Route-table proxy: only hard-coded service keys are accepted; no arbitrary URL input.
 * Runs server-side so there are no CORS restrictions.
 */

const { static: ROUTES, special } = require('../routes.json');

const UA = 'Mozilla/5.0 (compatible; StatusMonitor/1.0)';

// Special routes: dynamic URLs or auth — not in ROUTES table
const SPECIAL_KEYS = new Set(special);

async function fetchSpecialRoute(key) {
  if (key === 'ioda-na-outages') {
    const until = Math.floor(Date.now() / 1000);
    const from  = until - 86400;
    const url = `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from=${from}&until=${until}&entityType=country&relatedTo=continent/NA&limit=50`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': UA } });
    if (!resp.ok) throw new Error(`upstream ${resp.status}`);
    const body = await resp.text();
    return { body, ct: resp.headers.get('content-type') || 'application/json' };
  }
  if (key === 'radar-us-anomalies') {
    const token = process.env.CF_RADAR_TOKEN;
    if (!token) return { body: JSON.stringify({ noToken: true }), ct: 'application/json' };
    const resp = await fetch(
      'https://api.cloudflare.com/client/v4/radar/traffic_anomalies?location=US&location=CA&location=MX&status=VERIFIED&format=json',
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );
    if (!resp.ok) throw new Error(`upstream ${resp.status}`);
    const body = await resp.text();
    return { body, ct: resp.headers.get('content-type') || 'application/json' };
  }
  throw new Error('unknown special key');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { svc: key } = req.query;

  if (!key) {
    return res.status(400).json({ error: 'Missing svc parameter' });
  }

  // Special routes (dynamic URL / auth) — handled separately
  if (SPECIAL_KEYS.has(key)) {
    try {
      const { body, ct } = await fetchSpecialRoute(key);
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(body);
    } catch (err) {
      return res.status(502).json({ error: 'Upstream fetch error: ' + err.message });
    }
  }

  if (!ROUTES[key]) {
    return res.status(404).json({ error: 'Unknown service key' });
  }

  try {
    const upstream = await fetch(ROUTES[key], {
      headers: { 'User-Agent': UA, 'Accept': 'application/json, application/xml, text/html, text/plain, */*' },
    });

    const body = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'text/plain';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstream.ok || upstream.status === 204 ? 200 : 502).send(body);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream fetch error' });
  }
}
