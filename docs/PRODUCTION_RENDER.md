# Glint production deployment

The existing Glint UI and Node/Express backend run together as one always-on
Render web service. LiveKit Inference provides Cartesia speech remotely. The
main UI does not use the separate `/livekit` comparison worker, so that worker
is disabled in production. Meta model credentials continue to come exclusively
from each user's browser connection and stay in session memory. Do not copy
`MODEL_API_KEY`, BaseTen keys, or `.env.local` to this service.

## Service configuration

Use `render.yaml` as the reviewed configuration (or enter its values in the
Render dashboard). Deploy branch `codex/livekit-prototype`, Node 24, one paid
Starter instance, and a 1 GB persistent disk mounted at `/var/data/glint`.
Build: `npm ci --include=dev && npm run build`. Start: `npm start`.
Health check: `/healthz`. Automatic deploys remain off for a controlled rollout.

Set these non-secret variables:

```text
NODE_VERSION=24
NODE_ENV=production
HOST=0.0.0.0
GLINT_DATA_DIR=/var/data/glint
GLINT_TTS_PROVIDER=livekit
GLINT_LIVEKIT_ENABLED=0
GLINT_LIVEKIT_AGENT_ENABLED=0
GLINT_LIVEKIT_TTS_MODEL=cartesia/sonic-3
GLINT_LIVEKIT_TTS_VOICE=<same tested voice ID>
```

Store `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in Render's environment secrets.
Do not use `VITE_` prefixes for them. The server derives its exact HTTPS origin
from `RENDER_EXTERNAL_URL`. If adding a custom domain, explicitly configure
`APP_ORIGIN=https://your-domain` and use that domain consistently. Do not set
`APP_ORIGIN` to localhost or a temporary tunnel URL. Render supplies `PORT`.

Cloud builds skip downloading the unused local Kokoro model. The frontend's
existing vision/VAD assets are still prepared and verified. CI runs on Linux
with Node 24. No local Docker engine is required for this native Node deployment.

## Verify after deployment

1. Verify Render's deploy succeeds and `/healthz` returns JSON `{"status":"ok"}`.
2. Check the home page, secure session cookie, `/events` WebSocket, and camera/mic
   permissions over the permanent HTTPS URL. Private paths such as `/.env.local`
   must remain blocked.
3. Connect a Meta API key in the browser and test a short voice conversation,
   camera question, explicit image generation, interruption, and End session.
4. Check Render logs for provider errors, first-text timings, cloud voice
   availability, and playback summaries. Never log keys or conversation/media.
5. Confirm the persistent disk is attached and `GLINT_DATA_DIR` points to its
   mount before storing reviewed tasks. Keep Render billing and LiveKit usage
   dashboards available to the service owner.

## Operational limits and recovery

This first deployment uses one process because sessions, keys and active jobs
are in memory. Restart/redeploy disconnects active conversations; users reconnect
their keys. SQLite persists only opted-in reviewed task data. It does not persist
API keys, photos, audio, or conversation history. A disk does not provide shared
session state or horizontal scaling; do not increase instance count yet.

Use Render's previous successful deploy to roll back application code. Preserve
the disk; do not delete/recreate it during a rollback. `/healthz` performs no paid
provider calls and returns 503 while shutting down. Shutdown has a bounded drain.
Render hosts the process; the laptop and cloudflared tunnel are not part of the
production request path. Compute/disk charges are separate from LiveKit and Meta.

References: https://render.com/docs/web-services,
https://render.com/docs/disks, https://render.com/docs/environment-variables,
https://render.com/docs/health-checks.
