/**
 * Vercel Serverless Function — GET /api/proxy?url=<encoded>
 * Runs server-side so there are no CORS restrictions.
 */

const ALLOWED_HOSTS = new Set([
  'api-v3.mbta.com',
  'cloudflare.com',
  'www.cloudflarestatus.com',
  'status.dnsfilter.com',
  'status.meraki.net',
  'status.aws.amazon.com',
  'status.azure.com',
  'azurestatusdashboard.azureedge.net',
  'status.cloud.google.com',
  'ocistatus.oraclecloud.com',
  'cloud.ibm.com',
  'www.akamaistatus.com',
  'www.fastlystatus.com',
  'status.bunny.net',
  'www.cacheflystatus.com',
  'uptime.quad9.net',
  'i-ready.status.io',
  'status.hmhco.com',
  'status.follettsoftware.com',
  'status.incidentiq.com',
  'status.clever.com',
  'status.seesaw.me',
  'status.jamf.com',
  'status.duosecurity.com',
  'status.imaginelearning.com',
  'status.finalsite.com',
  'status.dexcom.com',
  'status.adobe.com',
  'www.googlewsastatus.com',
  'www.apple.com',
  'developer.apple.com',
  'ip-api.com',
  'free.freeipapi.com',
  'ipinfo.io',
  'speed.cloudflare.com',
  'cloudflare-dns.com',
  'dns.google',
]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { url: targetRaw } = req.query;

  if (!targetRaw) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let target;
  try {
    target = new URL(targetRaw);
  } catch {
    return res.status(400).json({ error: 'Invalid url parameter' });
  }

  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return res.status(403).json({ error: 'Host not allowed' });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'StatusPage/1.0',
        'Accept': 'application/json, text/plain, */*',
      },
    });

    const body = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstream.status).send(body);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream fetch error' });
  }
}
