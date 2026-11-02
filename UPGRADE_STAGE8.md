# Stage 8 — final delivery package

Version **0.8.0** builds on Stage 7. It adds a mini-month navigator, clearer task details, contrast/reduced-motion improvements, production environment validation, Render/Vercel configuration examples, HTTPS email support, CI/production checks, and the final project documentation.

## Install from Stage 7

Stop Planora with **Control+C**. Extract `Planora_Stage8_Update.zip` into Downloads. From your existing **planora** project folder:

```bash
node ~/Downloads/Planora_Stage8_Update/apply-stage8.mjs . &&
npm ci &&
npm run verify &&
npm audit &&
npm run dev
```

Expected: **115 passing tests** (4 shared + 111 server/worker), a successful build, a passed production smoke, and the dev API at localhost:5001. Open **http://localhost:5173**.

The smoke test uses disposable MongoDB and explicit test configuration; it does not test against your Atlas data. A MongoDB test binary may be downloaded on the first run. `npm test` and `npm run build` remain available separately.

The installer checks hashes before writing, preserves `server/.env`, never accesses MongoDB, and backs up changed source in `.planora-backups/`. An edited ROADMAP.md is backed up before the release roadmap is installed; recover your personal notes/checkmarks from that backup. Other modified/missing source files stop installation before any changes. Keep your folder and share conflicting filenames rather than deleting it. Repeat installation is safe.

## What to check locally

1. Use the mini-month arrows and choose a date. It changes the selected date while retaining your current day/week/month view.
2. Confirm a 09:15–09:55 task still occupies its exact 40-minute range. Long blocks show category/priority/duration; tooltips and accessible names include more detail. Clicking opens the existing full task editor.
3. Check light/dark settings and your phone viewport. Keyboard-accessible forms remain available for task editing/rescheduling; native drag/drop is a desktop convenience.
4. Existing account settings, admin role, categories, history, recurrence, Google connection, and reminder preferences remain in MongoDB. No new local environment variables are required when using existing development preview/SMTP settings.

## Email and deployment

Stage 8 adds optional `MAIL_MODE=resend`, `RESEND_API_KEY`, and `MAIL_FROM` for HTTPS email. SMTP and local development previews remain supported. This is relevant on Render's free service, which blocks common outbound SMTP ports. Production forbids local preview mode and requires an HTTPS APP_ORIGIN. Follow **docs/DEPLOYMENT.md**; do not switch local settings merely to install the update.

The root `render.yaml` describes a single full-stack service. `deploy/vercel.example.json` is an optional template: copy/edit it as documented if choosing Vercel plus Render. Credentials, domains, Atlas network settings, and provider accounts are configured by you. The package has not deployed anything or incurred hosting charges on your accounts.

## Delivery documents

| File | Use |
| --- | --- |
| `ROADMAP.md` | Current completion state and live acceptance still required |
| `docs/ACCEPTANCE.md` | Twelve-feature traceability, test evidence, final live checklist |
| `docs/DEPLOYMENT.md` | Render/Atlas and optional Vercel setup, email/OAuth/operations |
| `docs/API.md` | Implemented routes, input boundaries, auth and response behavior |
| `docs/ARCHITECTURE.md` | MVC/data Mermaid diagrams and coordination policies |
| `docs/PROJECT_REPORT.md` | Project report suitable for adapting to your submission template |
| `docs/DEMO.md` | Timed demonstration and examiner questions |
| `docs/SCREENSHOT_GUIDE.md` | Final sanitized screenshot capture plan |
| `.github/workflows/checks.yml` | Tests/build/production smoke/audit on GitHub push/PR |

## Completion boundary

Local code checks and the delivery materials are complete. The release does **not** certify real mailbox delivery, Google consent/API/device alerts, ICS import alarms, macOS notifications, or your hosted proxy/cookie behavior. Complete the unchecked items in `docs/ACCEPTANCE.md`, capture your final screenshots, and confirm backup/restore before declaring the deployed project fully accepted. A browser test double or simulated Google provider is not live acceptance.
