# Planora deployment guide

Stage 8 supplies configuration and local production checks. It does not deploy into your hosting accounts. Use one canonical browser origin and one Node process. Keep your existing Google encryption key if reusing its database.

## Choose a layout

**Recommended first deployment:** one Render Web Service serves the built React app and `/api`, with MongoDB Atlas. There is one browser origin and no CORS configuration.

**Optional:** Vercel serves React and proxies `/api/*` to Render. Browser requests still go to the Vercel origin; never change `api.js` to call Render directly. This preserves host-only HttpOnly cookies, SameSite=Lax, and the existing origin/header checks. Validate the real proxy/cookie/OAuth behavior before using this layout publicly.

## Before deploying

1. Apply Stage 8 locally. Run `npm ci`, `npm run verify`, and `npm audit`.
2. Commit the project to your own GitHub repository. Confirm `server/.env`, local mail previews, source backups, and `node_modules` are excluded by `.gitignore`. The repository root must contain `package.json`, `client`, `server`, and `render.yaml`.
3. Use an Atlas database user scoped to the application's database. Configure network access for your Render service's outbound addresses where available. Do not assume that allowing only your laptop also allows Render. Avoid leaving broad network access enabled when a narrower configuration works.
4. Keep a private database backup and copies of `JWT_SECRET` and `GOOGLE_TOKEN_KEY`. Rotating JWT_SECRET signs everyone out; changing GOOGLE_TOKEN_KEY makes existing saved Google refresh tokens unreadable until reconnect.

## Render: full stack on one origin

1. In Render create a **Web Service** from your repository, or use the root `render.yaml` Blueprint. No paid service is created by this package. Review your selected plan and platform billing settings before creating resources.
2. Set Root Directory to the project root, Runtime to Node, Build Command to `npm ci --include=dev && npm run build`, Start Command to `npm start`, and Health Check Path to `/api/health`. The included `.node-version` pins the tested Node 24.22.1 runtime. Keep a single instance; do not run PM2 clusters.
3. Copy the service's intended public URL from Render, for example `https://your-planora.onrender.com`. Set **APP_ORIGIN** to that exact origin, without a trailing slash. Render supplies PORT; do not hard-code another port there.
4. Set private environment variables below. Do not upload your local `.env` or prefix secrets with `VITE_`.
5. Deploy. `/api/health` must return `200` and `{"status":"ok","application":"Planora"}` after MongoDB connects. Open the same public origin for the UI.
6. Run the live checklist in `ACCEPTANCE.md`. The included GitHub workflow runs checks on push/PR; requiring those checks before deployment is a repository/hosting setting you must enable yourself.

| Variable | Production setting |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_ORIGIN` | Exact public HTTPS browser origin |
| `MONGODB_URI` | Private Atlas connection URI with the intended database name |
| `JWT_SECRET` | Strong random secret, at least 32 characters; keep stable across restarts |
| `TRUST_PROXY` | `1` for the direct Render edge → Node layout; verify proxy topology before changing |
| `MAIL_MODE` | `resend` or `smtp2go` for HTTPS delivery, or `smtp` where outbound SMTP is supported |
| `MAIL_FROM` | Sender authorized by your mail provider |
| `RESEND_API_KEY` | Private key, required only with `MAIL_MODE=resend` |
| `SMTP2GO_API_KEY` | Private key, required only with `MAIL_MODE=smtp2go` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Required for SMTP; TLS is required by this app |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google web OAuth client, configured as in Stage 6 |
| `GOOGLE_REDIRECT_URI` | Canonical APP_ORIGIN plus `/api/google/callback` |
| `GOOGLE_TOKEN_KEY` | Existing dedicated 64-hex encryption key; use `npm run google:key` for a new database |

All four Google variables may remain blank. A partially configured Google integration fails startup. HTTP APP_ORIGIN, malformed origins, invalid ports/proxy counts, and local preview mode in production fail startup with configuration messages.

### Email on Render

Render's free web service blocks outbound SMTP ports 25, 465, and 587. Existing SMTP configuration therefore cannot be assumed to work on that plan. Stage 8 adds `MAIL_MODE=resend`, which sends through the provider's HTTPS API without an SDK dependency.

1. Create your own Resend account. Add and verify a sending domain you control according to its DNS instructions. Domain registration is separate; this guide does not promise a free domain or unrestricted sending.
2. Create an appropriate sending API key. Set `MAIL_MODE=resend`, `RESEND_API_KEY`, and `MAIL_FROM`, for example `Planora <account@your-verified-domain.example>`, in Render's private environment settings. Redeploy.
3. Request recovery and verification for your own account. Check the actual inbox/spam folder and consume each link. Provider acceptance is not proof of inbox delivery. Check your provider's current quota and sender restrictions.

The implementation uses the fixed `https://api.resend.com/emails` endpoint, a 15-second timeout, no redirects, and a hash-based idempotency key. It does not expose provider response bodies or credentials to users. SMTP remains available on a compatible host/plan. Missing delivery settings leave planning usable but cannot deliver account email. Never use `MAIL_MODE=file` in production.

### Administrator setup without a Render shell

Register your intended account through the deployed UI. On your own Mac, use this same source with `server/.env` pointing to the **same Atlas database**, then run:

```bash
npm run admin:grant -- --email your-existing-account@example.com
```

Sign in again on the deployed site. Administration requires your current password and unlocks for 15 minutes. Free Render services do not provide the same shell access as paid services, so this local operator workflow is intentional. There is no public administrator bootstrap URL.

## Optional Vercel frontend plus Render backend

1. First get the Render deployment healthy. Copy `deploy/vercel.example.json` to **`vercel.json` in the project root**. Replace `YOUR-RENDER-SERVICE` with the actual Render hostname in its first rewrite. Commit that configuration. Keep the `/api` rewrite before the SPA fallback.
2. Import the repository in Vercel. Use project-root Root Directory, install command `npm ci`, build command `npm run build`, and output directory `client/dist`. No backend secrets are needed in Vercel.
3. Choose one stable production Vercel/custom-domain origin, for example `https://your-planora.vercel.app`. Change Render's APP_ORIGIN to exactly that origin and restart/redeploy Render. All normal writes from the old Render UI origin will then be rejected; use the canonical frontend.
4. For Google, update Render's GOOGLE_REDIRECT_URI and the Google OAuth client's registered URI to `https://your-planora.vercel.app/api/google/callback`. Keep client secrets/token key on Render. Do not direct OAuth to the backend hostname.
5. Verify `/api/health`, register/login, reload persistence, logout, downloads, browser permission, Google connect/sync, and admin unlock on the actual frontend. Inspect cookies: Secure, HttpOnly, SameSite=Lax, host-only on the frontend origin. API responses must be `no-store`; do not enable API rewrite caching or cache account responses in a CDN.
6. Preview deployments have different origins. Do not allow arbitrary previews to use the production database or relax origin checks to `*`. Use an isolated backend/database and explicit origin for previews, or keep backend-dependent acceptance on production only.

The numeric TRUST_PROXY value represents trusted network hops, not the number of products in your architecture. Do not blindly set it to `true` or increase it to trust client-supplied X-Forwarded-For. Start with the documented direct Render value and review actual proxy headers. A Vercel proxy may pool IP-based rate limits at the proxy address; verify this topology before public multi-user use. No distributed lock or distributed rate-limit store is supplied.

## Operations and limitations

- Free Render services can sleep after idle periods and need time to wake. Reminders and sync require responsive requests and user interaction; do not promise always-on delivery on a sleeping service.
- MongoDB stores account data, history, claims, Google mappings, and sync jobs. Render's local filesystem is ephemeral. Exports are generated on demand; production mail previews are forbidden.
- The account-write queue is in one Node process. Scaling to multiple instances/clusters needs database-coordinated locks and shared rate limiting first. Restarting clears only in-memory locks/access caches; persistent sync leases/results remain in MongoDB.
- Monitor readiness, safe application errors, and provider statuses. Do not log cookies, Authorization headers, tokens, entire request bodies, or Atlas URIs. Export logs/screenshots only after checking for private task content.
- Back up Atlas using a method available for your plan and rehearse restore into an isolated database. This package does not provision backups.
- To roll back, restore the previous source/deploy without deleting MongoDB data. Keep Stage 8 backups. Additional fields are retained; do not downgrade while a sync/migration is running or without testing compatibility.

Official references checked for this release: [Render Express](https://render.com/docs/deploy-node-express-app), [Blueprint](https://render.com/docs/blueprint-spec), [Node version](https://render.com/docs/node-version), [free-service limits](https://render.com/docs/free), [Vercel external rewrites](https://vercel.com/docs/routing/rewrites), [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email), and [verified sending domains](https://resend.com/docs/dashboard/domains/introduction). Hosting policies can change; check the current dashboard before deployment.
