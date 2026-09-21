# Render worker

This directory contains the Render runtime for OmniRoute.

## Request strategy

Vercel remains the public first hop. On every eligible request it performs a short health check against Render. When Render is healthy, Vercel forwards the request with `x-omniroute-forwarded=1`; otherwise the existing Vercel handler serves it directly. The forwarded marker prevents a loop.

Render runs the same Next application locally, so provider work executes on Render instead of making a second request back through Vercel. Render only calls Vercel when its local handler fails, and it sends a compact idle snapshot to `/api/internal/render-sync` after inactivity. The snapshot is an operational journal and metrics only; model responses are not written to the JSON file.

## Deployment

Create the service from the repository using [`render.yaml`](../render.yaml). Render will build [`Dockerfile`](../Dockerfile), expose the port supplied through `PORT`, and mount a persistent disk at `/var/data/omniroute`. The service needs the same provider/API environment variables as Vercel and a random `RENDER_INTERNAL_SECRET` set identically in both services. On Vercel set:

```text
RENDER_SERVICE_URL=https://<your-render-service>.onrender.com
RENDER_INTERNAL_SECRET=<same-random-secret>
```

The Vercel database migration adds `ai_render_state`, which stores the latest compact idle snapshot when Supabase is configured. Render itself does not use Supabase for its local request journal.

On the free Render plan, do not configure the gateway credentials in Render. At every boot, Render retrieves `OMNIROUTE_AI_API_KEY`, `OMNIROUTE_VERCEL_PROFILE`, `DATABASE_URL`, `PARADOX_PASSPHRASE`, and `PARADOX_API_KEY` from the protected Vercel `/api/internal/render-config` route and keeps them only in process memory. They are not written to the ephemeral filesystem. Render only needs `VERCEL_URL` and `RENDER_INTERNAL_SECRET`.

## Local smoke run

```bash
docker build -t omniroute-render .
docker run --rm --name omniroute-render \
  -p 10000:10000 \
  -e VERCEL_URL=https://omniouter-vercel.vercel.app \
  -e RENDER_INTERNAL_SECRET=<same-random-secret> \
  -v omniroute-state:/var/data/omniroute \
  omniroute-render

curl http://127.0.0.1:10000/health
```
