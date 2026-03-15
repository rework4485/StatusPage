/**
 * Vercel Serverless Function — GET /proxy?svc=<key>
 * Route-table proxy: only hard-coded service keys are accepted; no arbitrary URL input.
 * Runs server-side so there are no CORS restrictions.
 */

const ROUTES = {
  // Applications / Education
  'iready-status':       'https://i-ready.status.io/',
  'hmh-status':          'https://status.hmhco.com/api/v2/status.json',
  'hmh-incidents':       'https://status.hmhco.com/api/v2/incidents.json',
  'follett-status':      'https://status.follettsoftware.com/rest/systemstatus',
  'iiq-status':          'https://status.incidentiq.com/api/v2/status.json',
  'iiq-incidents':       'https://status.incidentiq.com/api/v2/incidents.json',
  'clever-status':       'https://status.clever.com/api/v2/status.json',
  'clever-incidents':    'https://status.clever.com/api/v2/incidents.json',
  'seesaw-status':       'https://status.seesaw.me/api/v2/status.json',
  'seesaw-incidents':    'https://status.seesaw.me/api/v2/incidents.json',
  'jamf-status':         'https://status.jamf.com/api/v2/status.json',
  'jamf-incidents':      'https://status.jamf.com/api/v2/incidents.json',
  'duo-status':          'https://status.duo.com/api/v2/status.json',
  'duo-incidents':       'https://status.duo.com/api/v2/incidents.json',
  'duo-components':      'https://status.duo.com/api/v2/components.json',
  'imagine-status':      'https://status.imaginelearning.com/api/v2/status.json',
  'imagine-incidents':   'https://status.imaginelearning.com/api/v2/incidents.json',
  'finalsite-status':    'https://status.finalsite.com/api/v2/status.json',
  'finalsite-incidents': 'https://status.finalsite.com/api/v2/incidents.json',
  'dexcom-status':       'https://status.dexcom.com/api/v2/status.json',
  'dexcom-incidents':    'https://status.dexcom.com/api/v2/incidents.json',
  'adobe-registry':      'https://data.status.adobe.com/adobestatus/SnowServiceRegistry',
  'adobe-events':        'https://data.status.adobe.com/adobestatus/StatusEvents',
  'gworkspace-incidents':'https://www.google.com/appsstatus/dashboard/incidents.json',
  'apple-status':        'https://www.apple.com/support/systemstatus/data/system_status_en_US.js',
  'appledev-status':     'https://developer.apple.com/system-status/data/system_status_en_US.js',
  // Infrastructure
  'cf-status':           'https://www.cloudflarestatus.com/api/v2/status.json',
  'cf-incidents':        'https://www.cloudflarestatus.com/api/v2/incidents.json',
  'cf-components':       'https://www.cloudflarestatus.com/api/v2/components.json',
  'cf-maintenances':     'https://www.cloudflarestatus.com/api/v2/scheduled-maintenances/active.json',
  'dnsfilter-status':    'https://status.dnsfilter.com/api/v2/status.json',
  'dnsfilter-incidents': 'https://status.dnsfilter.com/api/v2/incidents.json',
  'meraki-status':       'https://status.meraki.net/api/v2/status.json',
  'meraki-incidents':    'https://status.meraki.net/api/v2/incidents.json',
  'aws-rss':             'https://status.aws.amazon.com/rss/all.rss',
  'azure-status':        'https://azure.status.microsoft/en-us/status/',
  'gcloud-incidents':    'https://status.cloud.google.com/incidents.json',
  'oci-status':          'https://ocistatus.oraclecloud.com/api/v2/status.json',
  'oci-components':      'https://ocistatus.oraclecloud.com/api/v2/components.json',
  'ibm-rss':             'https://cloud.ibm.com/status/api/notifications/feed.rss',
  'akamai-status':       'https://www.akamaistatus.com/api/v2/status.json',
  'akamai-incidents':    'https://www.akamaistatus.com/api/v2/incidents.json',
  'fastly-rss':          'https://www.fastlystatus.com/rss/',
  'bunny-status':        'https://status.bunny.net/api/v2/status.json',
  'bunny-incidents':     'https://status.bunny.net/api/v2/incidents.json',
  'cachefly-status':     'https://www.cacheflystatus.com/api/v2/status.json',
  'cachefly-incidents':  'https://www.cacheflystatus.com/api/v2/incidents.json',
  'quad9-status':        'https://uptime.quad9.net/api/v2/status.json',
  'quad9-incidents':     'https://uptime.quad9.net/api/v2/incidents.json',
  // Transit
  'mbta-providence':     'https://api-v3.mbta.com/alerts?filter[route]=CR-Providence&filter[activity]=BOARD,EXIT,RIDE',
  'mbta-southcoast':     'https://api-v3.mbta.com/alerts?filter[route]=CR-NewBedford,CR-FallRiver&filter[activity]=BOARD,EXIT,RIDE',
  // Network diagnostics
  'cf-trace':            'https://cloudflare.com/cdn-cgi/trace',
  'speed-meta':          'https://speed.cloudflare.com/meta',
  'ip-api':              'https://ip-api.com/json',
  'doh-cloudflare':      'https://cloudflare-dns.com/dns-query?name=whoami.cloudflare&type=TXT&ct=application/dns-json',
  'google-204':          'https://dns.google/generate_204',
};

const UA = 'Mozilla/5.0 (compatible; StatusMonitor/1.0)';

// Special routes: dynamic URLs or auth — not in ROUTES table
const SPECIAL_KEYS = new Set(['ioda-na-outages', 'radar-us-anomalies']);

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
