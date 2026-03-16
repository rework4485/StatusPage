# Service Status Page

Real-time status dashboard for cloud providers, SaaS applications, CDNs, DNS resolvers, and MBTA commuter rail. Features a Network Diagnostics tab showing Cloudflare edge routing, DNS resolver detection, protocol support (TLS 1.3, HTTP/3), ISP info, and an on-demand speed test.

---

## Services monitored

| Category | Services |
|----------|----------|
| **Applications** | i-Ready, HMH, Follett, IncidentIQ, Clever, Seesaw, Jamf, Duo, Imagine Learning, FinalSite, Dexcom, Adobe CC, Google Workspace, Apple Services, Apple Developer |
| **Infrastructure** | Cloudflare, DNSFilter, Meraki, AWS, Azure, Google Cloud, Oracle Cloud, IBM Cloud, Akamai, Fastly, Bunny.net, CacheFly, Quad9 |
| **Transit** | MBTA Providence/Stoughton Line, MBTA South Coast Rail |

---

## Architecture

```
Browser
  │
  ├─ GET /events  (SSE)  ──► Cloudflare Worker
  │                              ├─ checks CF edge cache (60 s TTL)
  │                              ├─ streams cached responses per service key
  │                              └─ signals cache-miss → browser falls back to /proxy
  │
  ├─ GET /proxy?svc=<key> ──► Cloudflare Worker
  │                              ├─ route-table lookup (no raw URL accepted)
  │                              ├─ CF edge cache hit → instant response
  │                              └─ cache miss → upstream fetch → cache write
  │
  └─ GET /                ──► Cloudflare Worker → ASSETS binding → index.html
```

**Key properties:**
- **Single-file SPA** — all UI, parsers, and client logic in `index.html`
- **Route-table proxy** — `worker.js` only proxies URLs in its hard-coded `ROUTES` table; arbitrary URLs are rejected (no SSRF surface)
- **Edge cache** — Cloudflare Cache API caches every upstream response for 60 s, reducing origin load and improving latency for all users at a PoP
- **SSE push** — on page load the browser opens `EventSource('/events')`; the Worker streams cached service data so all parsers run from memory (near-instant first render)
- **Fallback chain** — SSE cache-miss → `/proxy?svc=<key>` → direct browser fetch (local/`file://`)

---

## Deploying to Cloudflare Workers

### Prerequisites

```bash
npm install -g wrangler
wrangler login
```

### Deploy

```bash
wrangler deploy
```

`wrangler.toml` is pre-configured with the `[assets]` binding pointing at the repo root. The Worker serves `index.html` as the static asset and handles `/proxy` and `/events` itself.

### Custom domain

Assign a Workers Route or custom domain in the Cloudflare dashboard under **Workers & Pages → your worker → Settings → Triggers**.

---

## Deploying to Vercel (alternative)

```bash
npm install -g vercel
vercel --prod
```

`vercel.json` rewrites `/proxy` → `/api/proxy.js`. The Vercel function uses the same route table as `worker.js` but without server-side caching or SSE (the browser falls back to per-service polling automatically).

---

## Local development

Open `index.html` directly (`file://`) or serve it with any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

In local mode `_IS_DEPLOYED` is `false`; the app skips the Worker proxy and SSE and fetches service APIs directly from the browser (most support CORS).

---

## Adding a service

1. **Worker route table** — add an entry in the `ROUTES` object in `worker.js`:
   ```js
   'myservice-status': 'https://status.example.com/api/v2/status.json',
   'myservice-incidents': 'https://status.example.com/api/v2/incidents.json',
   ```

2. **Vercel route table** — add the same entries to `ROUTES` in `api/proxy.js`.

3. **Client route map** — add matching entries to `ROUTE_KEYS` in `index.html`:
   ```js
   'https://status.example.com/api/v2/status.json':    'myservice-status',
   'https://status.example.com/api/v2/incidents.json': 'myservice-incidents',
   ```

4. **Service definition** — add an entry to the `SVCS` array in `index.html`:
   ```js
   {name:'My Service', su:'https://status.example.com/api/v2/status.json',
    iu:'https://status.example.com/api/v2/incidents.json',
    hu:'https://status.example.com', cat:'app'},
   ```
   Most Atlassian Statuspage-hosted services work with the default parser. For custom APIs add a `p:'myparser'` key and implement the parser in `fetchOne()`.

---

## Security

| Control | Implementation |
|---------|---------------|
| No-SSRF proxy | Route table in `worker.js`; `?svc=<key>` only — raw URLs rejected with 404 |
| Security headers | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy set by Worker on every HTML response |
| XSS mitigation | All upstream API text (incident titles, bodies, service names) passed through `esc()` before `innerHTML` insertion |
| CORS | Proxy endpoints return `Access-Control-Allow-Origin: *` intentionally (public status data); page origin itself is restricted by CSP |
| DDoS / rate limiting | Cloudflare's network-level protection; add a Rate Limiting rule in the CF dashboard for additional control |

---

## File structure

```
index.html          — Single-file SPA (UI + all parsers + SSE client)
worker.js           — Cloudflare Worker (proxy + SSE + asset serving)
wrangler.toml       — Workers deployment config
api/proxy.js        — Vercel serverless function (route-table proxy, no cache)
functions/proxy.js  — Legacy Cloudflare Pages function (superseded by worker.js)
_routes.json        — Pages function routing hints (retained for compat)
vercel.json         — Vercel rewrite rules
```
