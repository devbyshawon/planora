# Staging deployment

The `codex/staging` branch is the clean staging source. Its initial snapshot omits old local backup/mail history while the original local branches remain preserved.

## Backend

- Render: `https://planora-staging-api.onrender.com`
- Readiness: `/api/health` returned `{"status":"ok","application":"Planora"}` on 2 November 2026.
- Atlas database: `planora_staging`, using a dedicated scoped database user.
- Credentials are configured privately in Render; never put a completed database URI here.

## Frontend setup

Import the repository into a dedicated Vercel project named `planora-staging`, deploying `codex/staging` from the repository root. Use Vite, install `npm ci`, build `npm run build`, and output `client/dist`. `vercel.json` forwards `/api/*` to the staging backend before the SPA fallback and prevents API caching. No backend secrets belong in Vercel.

After deployment, set Render's `APP_ORIGIN` to the stable Vercel HTTPS origin (without a trailing slash), replacing the bootstrap `https://staging.example.invalid`, and redeploy the backend. Keep Google configuration disabled until its callback is configured for that same canonical origin.

Verify the Vercel `/api/health` response before registration/login. Then test session persistence, logout, ownership, scheduling, bucket/template workflows, recurrence, downloads, and settings through the Vercel URL. Cookie/proxy behavior, forwarded client IPs and rate limits still need live acceptance. Use disposable staging accounts.

Vercel preview URLs have different origins and should not be treated as the canonical working application. This project uses staging data only. Public production hosting requires separate configuration: the checked-in proxy currently targets staging.

Email delivery and real Google/device acceptance are not yet configured or certified. Render Free can sleep; do not use this staging deployment as a guarantee of timely reminders.
