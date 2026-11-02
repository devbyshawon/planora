# Staging deployment

The `codex/staging` branch is the clean staging source. Its initial snapshot omits old local backup/mail history while the original local branches remain preserved.

## Backend

- Render: `https://planora-staging-api.onrender.com`
- Readiness: `/api/health` returned `{"status":"ok","application":"Planora"}` on 2 November 2026.
- Atlas database: `planora_staging`, using a dedicated scoped database user.
- Credentials are configured privately in Render; never put a completed database URI here.

## Frontend setup

Import the repository into a dedicated Vercel project named `planora-staging`, deploying `codex/staging` from the repository root. Use Vite, install `npm ci`, build `npm run build`, and output `client/dist`. `vercel.json` forwards `/api/*` to the staging backend before the SPA fallback and prevents API caching. No backend secrets belong in Vercel.

The canonical frontend is `https://planora-staging.vercel.app`. Render's `APP_ORIGIN` was updated to that origin and redeployed. Google uses the same origin followed by `/api/google/callback`. The Google integration and Resend account email are now configured privately on Render.

Verify the Vercel `/api/health` response before registration/login. Then test session persistence, logout, ownership, scheduling, bucket/template workflows, recurrence, downloads, and settings through the Vercel URL. Cookie/proxy behavior, forwarded client IPs and rate limits still need live acceptance. Use disposable staging accounts.

Vercel preview URLs have different origins and should not be treated as the canonical working application. This project uses staging data only. Public production hosting requires separate configuration: the checked-in proxy currently targets staging.

Render Free can sleep; do not use this staging deployment as a guarantee of timely reminders.

## Live acceptance record — updated 3 November 2026

Evidence below distinguishes direct checks from user-reported manual results. It does not replace production acceptance or certify all devices, accessibility states, or failure modes.

Direct checks by the assistant:

- Canonical Vercel frontend returned HTTP 200 and the configured security headers.
- Vercel `/api/health` returned the healthy Planora JSON response through Render.
- Empty login requests from the canonical origin reached validation (400); a mismatched origin was rejected (403 `ORIGIN_REJECTED`). Neither check supplied credentials or created accounts.
- API responses used `Cache-Control: no-store`.

User-reported manual passes:

- Registration, refresh/session persistence, logout, and subsequent login.
- Exact-time scheduling, overlap consent, completion/reopening, bucket moves, rescheduling/history, and calendar views.
- Recurring occurrence completion/edit/deletion and normal/calendar/bucket template application.
- PDF/CSV content, category filtering, ICS download, and visible separation between two accounts. Direct cross-account API checks remain covered by the local automated suite rather than a separately observed deployed attack test.
- Ended-day review and the expected progress totals.
- Saved preferences and browser reminder/test-notification exercise, reported completed.
- Real verification/recovery email delivery, password reset login, and link reuse rejection.
- Real Google connection, event details/reminder configuration, repeat sync without duplicates, and existing-event updates, reported completed.
- Actual Google reminder appearance, explicitly confirmed in the mobile test follow-up.
- ICS calendar import and alarm exercise.
- Administrator unlock, suspension/reactivation, registration switch, audit, and locking exercise, reported completed.
- Mobile calendar views, task editing, bucket/rescheduling form, settings/theme, and dialog/control usability.

Still awaiting explicit confirmation:

- Moving a synced task to the bucket removes its linked Google event after syncing its previous date; rescheduling and syncing leaves one correct event. The reminder appearance was confirmed, but that answer did not clearly identify these removal/rescheduling results.

## Before public production

- Use a separate production database, application credentials, deployment configuration, and Google callback/client as appropriate; do not relabel staging data as production.
- Verify a sending domain to deliver account emails to arbitrary users. Current Resend test-sender acceptance only covered the account owner's inbox.
- Google consent remains in Testing; complete the applicable production audience/verification requirements before wider access. Do not describe Testing consent as unrestricted public authorization.
- Choose reliable backend hosting, configure monitoring, verify proxy-aware rate limits, and rehearse database backup/restoration.
- Complete production smoke/ownership checks on the final canonical domain. Keyboard/screen-reader/zoom coverage, load behavior, and sanitized release screenshots remain separate acceptance work.
- An online-first installable PWA was implemented on 3 November 2026; see [installation and acceptance](./PWA.md). Actual device installation and installed-app OAuth/download checks remain pending. Background push and offline editing remain separate features.
