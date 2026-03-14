# Service Status Page

A real-time service status dashboard tracking cloud providers, SaaS apps, CDNs, and MBTA commuter rail.

## Deployment

### Cloudflare Pages (recommended)

1. Push this repo to GitHub
2. In Cloudflare Pages, connect the repo — build command: *(none)*, output directory: `.`
3. The `/functions/proxy.js` Worker runs server-side, eliminating CORS proxy chains

```bash
# Or deploy via CLI
npm install -g wrangler
wrangler pages deploy . --project-name status-page
```

### Vercel

```bash
npm install -g vercel
vercel --prod
```

The `vercel.json` rewrite maps `/proxy` → `/api/proxy.js`.

### Local (file://)

Open `index.html` directly. The app falls back to public CORS proxies automatically.

## Architecture

- **Single file SPA** — all UI in `index.html`
- **Serverless proxy** — `/functions/proxy.js` (CF Pages) or `/api/proxy.js` (Vercel) for server-side fetches
- **Per-service polling** — each service updates independently every 2 minutes; only changed cards re-render
- **Fallback chain** — when running locally: direct → codetabs → allorigins → isomorphic-git

## Services monitored

**Applications**: i-Ready, HMH, Follett, IncidentIQ, Clever, Seesaw, Jamf, Duo, Imagine Learning, FinalSite, Dexcom, Adobe CC, Google Workspace, Apple Services, Apple Developer

**Infrastructure**: Cloudflare, DNSFilter, Meraki, AWS, Azure, Google Cloud, Oracle Cloud, IBM Cloud, Akamai, Fastly, Bunny.net, CacheFly, Quad9

**Transit**: MBTA Providence/Stoughton Line, MBTA South Coast Rail (Fall River/New Bedford)
