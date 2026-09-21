# Render worker

This directory contains the Render runtime for OmniRoute.

## Request strategy

Vercel remains the public first hop. On every eligible request it performs a short health check against Render. When Render is healthy, Vercel forwards the request with `x-omniroute-forwarded=1`; otherwise the existing Vercel handler serves it directly. The forwarded marker prevents a loop.

Render runs the same Next application locally, so provider work executes on Render instead of making a second request back through Vercel. Render only calls Vercel when its local handler fails, and it sends a compact idle snapshot to `/api/internal/render-sync` after inactivity. The snapshot is an operational journal and metrics only; model responses are not written to the JSON file.

## Deployment

Create the service from the repository using [`render.yaml`](../render.yaml). The service needs a persistent disk mounted at `/var/data/omniroute`, the same provider/API environment variables as Vercel, and a random `RENDER_INTERNAL_SECRET` set identically in both services. On Vercel set:

```text
RENDER_SERVICE_URL=https://<your-render-service>.onrender.com
RENDER_INTERNAL_SECRET=<same-random-secret>
```

The Vercel database migration adds `ai_render_state`, which stores the latest compact idle snapshot when Supabase is configured. Render itself does not use Supabase for its local request journal.

## Local smoke run

```bash
npm ci
npm run build
PORT=10000 RENDER_DATA_DIR=/tmp/omniroute-render npm run render:start
curl http://127.0.0.1:10000/health
```
