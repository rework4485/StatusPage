/**
 * Cloudflare Pages Function — GET /proxy?url=<encoded>
 * Runs server-side so there are no CORS restrictions.
 */

// Only allow fetching from known status page domains
const ALLOWED_HOSTS = new Set([
  'api-v3.mbta.com',
  'api.codetabs.com',
  'api.allorigins.win',
  'cdn-cgi',
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
  'status.duo.com',
  'data.status.adobe.com',
  'www.google.com',
  'azure.status.microsoft',
]);

export async function onRequest(context) {
  const { request } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  const url = new URL(request.url);
  const targetRaw = url.searchParams.get('url');

  if (!targetRaw) {
    return new Response('Missing url parameter', { status: 400, headers: corsHeaders() });
  }

  let target;
  try {
    target = new URL(targetRaw);
  } catch {
    return new Response('Invalid url parameter', { status: 400, headers: corsHeaders() });
  }

  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return new Response('Host not allowed', { status: 403, headers: corsHeaders() });
  }

  try {
    const resp = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'StatusPage/1.0',
        'Accept': 'application/json, text/plain, */*',
      },
      cf: { cacheEverything: false },
    });

    const body = await resp.arrayBuffer();
    const contentType = resp.headers.get('content-type') || 'application/json';

    return new Response(body, {
      status: resp.status,
      headers: {
        ...corsHeaders(),
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return new Response('Upstream fetch error: ' + err.message, {
      status: 502,
      headers: corsHeaders(),
    });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}
