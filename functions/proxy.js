import routes from '../routes.json';

const { static: ROUTES, special } = routes;
const UA = 'Mozilla/5.0 (compatible; StatusMonitor/1.0)';
const SPECIAL_KEYS = new Set(special);

async function fetchSpecialRoute(key, env) {
  if (key === 'ioda-na-outages') {
    const until = Math.floor(Date.now() / 1000);
    const from = until - 86400;
    const url = `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from=${from}&until=${until}&entityType=country&relatedTo=continent/NA&limit=50`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!resp.ok) throw new Error(`upstream ${resp.status}`);
    return new Response(await resp.text(), {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': resp.headers.get('content-type') || 'application/json',
      },
    });
  }

  if (key === 'radar-us-anomalies') {
    const token = env.CF_RADAR_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ noToken: true }), {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json',
        },
      });
    }

    const resp = await fetch(
      'https://api.cloudflare.com/client/v4/radar/traffic_anomalies?location=US&location=CA&location=MX&status=VERIFIED&format=json',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': UA,
        },
      },
    );
    if (!resp.ok) throw new Error(`upstream ${resp.status}`);
    return new Response(await resp.text(), {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': resp.headers.get('content-type') || 'application/json',
      },
    });
  }

  throw new Error('unknown special key');
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get('svc');

  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing svc parameter' }), {
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  }

  if (SPECIAL_KEYS.has(key)) {
    try {
      return await fetchSpecialRoute(key, env);
    } catch (err) {
      return new Response(JSON.stringify({ error: `Upstream fetch error: ${err.message}` }), {
        status: 502,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      });
    }
  }

  if (!ROUTES[key]) {
    return new Response(JSON.stringify({ error: 'Unknown service key' }), {
      status: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  }

  try {
    const upstream = await fetch(ROUTES[key], {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, application/xml, text/html, text/plain, */*',
      },
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.ok || upstream.status === 204 ? 200 : 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': upstream.headers.get('content-type') || 'text/plain',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Upstream fetch error' }), {
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  }
}
