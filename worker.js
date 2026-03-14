/**
 * Cloudflare Worker — StatusPage
 *
 * Routes:
 *   /proxy?svc=<key>  — server-side proxy with hard-coded route table + 60 s edge cache
 *   /events           — SSE stream: sends cached responses for all service keys, then closes
 *   /*                — static assets (index.html, etc.) served from directory binding
 *
 * Security: no arbitrary URL is accepted; only keys in ROUTES are proxied.
 */

// ── Route table ────────────────────────────────────────────────────────────────
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
  // Network diagnostics (proxy fallback only — client uses direct fetch first)
  'cf-trace':            'https://cloudflare.com/cdn-cgi/trace',
  'speed-meta':          'https://speed.cloudflare.com/meta',
  'ip-api':              'https://ip-api.com/json',
  'doh-cloudflare':      'https://cloudflare-dns.com/dns-query?name=whoami.cloudflare&type=TXT&ct=application/dns-json',
  'google-204':          'https://dns.google/generate_204',
};

// Keys included in the /events SSE stream (exclude network-diag routes)
const SSE_KEYS = Object.keys(ROUTES).filter(k =>
  !['cf-trace','speed-meta','ip-api','doh-cloudflare','google-204'].includes(k)
);

const CACHE_TTL = 60; // seconds
const UA = 'Mozilla/5.0 (compatible; StatusMonitor/1.0)';

// Paths blocked from static asset serving (server-side files)
const BLOCKED = new Set(['/worker.js', '/wrangler.toml', '/vercel.json', '/_routes.json']);
function isBlocked(pathname) {
  return BLOCKED.has(pathname) || pathname.startsWith('/api/') || pathname.startsWith('/functions/');
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
  };
}

// Security headers applied to every HTML page response
function pageSecurityHeaders() {
  return {
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    // Inline scripts/styles are needed (single-file SPA).
    // External connects are HTTPS-only; logo images come from several CDNs.
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ].join('; '),
  };
}

// ── Cache helpers ──────────────────────────────────────────────────────────────
function cacheRequest(key) {
  return new Request(`https://svc-cache.internal/v2/${key}`);
}

async function readCache(key) {
  const resp = await caches.default.match(cacheRequest(key));
  if (!resp) return null;
  return { body: await resp.text(), ct: resp.headers.get('content-type') || 'text/plain' };
}

async function writeCache(key, body, ct, ctx) {
  ctx.waitUntil(
    caches.default.put(
      cacheRequest(key),
      new Response(body, {
        headers: {
          'Content-Type': ct,
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
        },
      })
    )
  );
}

async function fetchRoute(key, ctx) {
  // Cache hit
  const hit = await readCache(key);
  if (hit) return { ...hit, cached: true };

  // Cache miss — fetch upstream
  const resp = await fetch(ROUTES[key], {
    headers: { 'User-Agent': UA, 'Accept': 'application/json, application/xml, text/html, text/plain, */*' },
    cf: { cacheEverything: false },
  });

  const body = await resp.text();
  const ct = resp.headers.get('content-type') || 'text/plain';

  if (resp.ok || resp.status === 204) {
    writeCache(key, body, ct, ctx);
  } else {
    throw new Error(`upstream ${resp.status}`);
  }

  return { body, ct, cached: false };
}

// ── /proxy handler ─────────────────────────────────────────────────────────────
async function handleProxy(request, ctx) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const key = new URL(request.url).searchParams.get('svc');
  if (!key) {
    return new Response('Missing svc parameter', { status: 400, headers: corsHeaders() });
  }
  if (!ROUTES[key]) {
    return new Response('Unknown service key', { status: 404, headers: corsHeaders() });
  }

  try {
    const { body, ct, cached } = await fetchRoute(key, ctx);
    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type': ct,
        'Cache-Control': 'no-store',
        'X-Cache': cached ? 'HIT' : 'MISS',
      },
    });
  } catch (err) {
    return new Response('Upstream error: ' + err.message, {
      status: 502,
      headers: corsHeaders(),
    });
  }
}

// ── /events SSE handler ────────────────────────────────────────────────────────
async function handleEvents(request, ctx) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const write = (event, data) =>
    writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

  ctx.waitUntil(
    (async () => {
      try {
        // Only serve cached responses here — no upstream fetches (preserves free-plan subrequest budget).
        // Cache-miss keys are signalled to the client so it falls back to /proxy.
        await Promise.all(
          SSE_KEYS.map(async (key) => {
            try {
              const cached = await readCache(key);
              if (cached) {
                await write('svc', { key, body: cached.body });
              } else {
                await write('svc-miss', { key });
              }
            } catch (e) {
              await write('svc-err', { key, error: e.message });
            }
          })
        );
      } finally {
        await write('done', {});
        await writer.close();
      }
    })()
  );

  return new Response(readable, {
    headers: {
      ...corsHeaders(),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ── Main fetch handler ─────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (isBlocked(pathname)) {
      return new Response('Not Found', { status: 404 });
    }
    if (pathname === '/proxy') return handleProxy(request, ctx);
    if (pathname === '/events') return handleEvents(request, ctx);

    // Serve static assets; inject security headers on HTML responses
    const resp = await env.ASSETS.fetch(request);
    if (resp.headers.get('content-type')?.includes('text/html')) {
      const headers = new Headers(resp.headers);
      for (const [k, v] of Object.entries(pageSecurityHeaders())) headers.set(k, v);
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
    }
    return resp;
  },
};
