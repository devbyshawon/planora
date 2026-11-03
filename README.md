# Planora — from scratch

**Version 0.8.1: task-defined custom slot rows, flexible duration shortcuts, and compact gaps, built on the Stage 8 delivery package.**

Upgrading an existing installation? Read [UPGRADE_CUSTOM_SLOTS.md](./UPGRADE_CUSTOM_SLOTS.md) for the custom-slot update to Stage 8.

Start with [START_HERE.md](./START_HERE.md). It explains setup on a Mac, MongoDB Atlas, the first run, and a practical verification exercise.

Public release preparation is tracked in [PUBLIC_RELEASE.md](./docs/PUBLIC_RELEASE.md). Support/security contact: **shawon12hossain@gmail.com**. The deployment remains a pilot; repository licensing is deferred and free hosted access does not grant source redistribution rights. Copyright © 2026 MD. Shawon Hossain.

## What works now

- Installable PWA with user-controlled updates and offline support in the original planner interface, queued edits, automatic sync, local exports, and JSON recovery backups. See [installation](./docs/PWA.md) and [offline instructions](./docs/OFFLINE.md).
- Day/week rows follow actual task ranges such as 09:15–09:55, 10:00–10:30, and 11:30–13:30. No fixed hourly scaffold.
- Each weekly day has independent rows; gaps are compact, overlaps keep exact individual ranges, and any valid duration remains editable.

- Mini-month navigation, exact task detail tooltips, readable light/dark controls, and reduced-motion support.
- Production origin/configuration validation and real-startup smoke checks; Render and optional Vercel templates.
- HTTPS account-email option for SMTP-restricted hosting. See [deployment](./docs/DEPLOYMENT.md).
- [API reference](./docs/API.md), [architecture](./docs/ARCHITECTURE.md), [report](./docs/PROJECT_REPORT.md), [acceptance](./docs/ACCEPTANCE.md), and [demo](./docs/DEMO.md).

- Saved browser reminder opt-in/lead, explicit permission controls, and atomic delivery claims shared across tabs. Planora must stay open.
- Local admin role setup, current-password unlock, suspend/reactivate, registration/reminder controls, new-account defaults, and audit records.
- Optional email verification with hashed, expiring, single-use links and local previews/SMTP delivery.

- Google OAuth connection to a dedicated Planora calendar, encrypted refresh tokens, and exact-time event sync.
- Selected day/week/month/upcoming/custom ranges, stable event mappings, updates/removals, and pause/resume/retry results.
- Explicit Google disconnect and calendar/credential recovery. Real Google setup and live acceptance are documented in UPGRADE_STAGE6.md.

- Day/week/month/custom-range PDF agendas, safe CSV spreadsheets, and ICS calendars with optional alerts.
- Export previews, category/status filters, exact timezone-aware times, and bounded recurrence snapshots.

- Timezone-aware end-of-day review with explicit keep/bucket/delete decisions.
- Historical daily/weekly/monthly progress, exact duration totals, categories, and period streaks.
- Per-task movement history and per-date plan outcomes.
- Native desktop drag-and-drop from calendar blocks and a bucket tray, with overlap confirmation.
- Quick calendar completion and richer bucket sorting/age filters.

- Daily/selected-weekday/weekly/monthly recurring tasks with independent occurrence tracking.
- Individual occurrence edits/deletions and whole-series editing/deletion.
- Reusable personal task templates with create/edit/delete/apply workflows.
- Global search by title/notes/category, date range, priority, status, and location, with pagination and calendar navigation.

- Registration, sign-in, persistent cookie sessions, and sign-out with session revocation.
- Password hashing, server validation, request-origin checks, rate limits, and account-scoped database access.
- Daily, Monday-first weekly, and monthly calendars with Today, previous/next, a date picker, and a tomorrow shortcut.
- Tasks with exact minute-level date/time ranges, notes, four starter categories, priority, and status.
- Create, edit, duplicate, delete, complete, and undo completion through the task editor.
- Overlap warnings with an explicit “Save anyway” choice; overlapping blocks appear side by side.
- Search within the visible date range; category and priority filters.
- Bucket items with no date, moving tasks to the bucket, rescheduling, original schedule retention, and postponement counts.
- Completion counts and planned/completed minutes for the visible period and active filters.
- Profile name/email editing, current-password verification, and session revocation.
- Password changes and recovery with expiring, hashed, single-use tokens.
- Local recovery email previews and optional real SMTP delivery.
- User-owned custom categories, editing/colours, and protected deletion.
- Light/dark appearance, 12/24-hour display, week start, default view, slot boundaries, reminder lead time, and timezone settings saved to the account.

**Remaining:** deploy on your accounts, complete real-device/mail/Google/ICS acceptance and phone review, and capture your final sanitized submission screenshots. See [ROADMAP.md](./ROADMAP.md).

## Run

Use Node.js 24 and npm. After downloading and extracting this project:

```bash
cd planora
npm ci
npm run setup
```

Set `MONGODB_URI` in `server/.env`. The default targets a local MongoDB installation; replace it with your Atlas connection string if you use Atlas.

```bash
npm run dev
```

Open **http://localhost:5173**. The API listens on **http://localhost:5001**; Vite forwards `/api` requests to it. Both processes stop with Ctrl+C.

Do not install MongoDB locally if you are using Atlas. Do not use `sudo npm install`.

## Architecture

```text
planora/
  client/
    src/
      components/        React views, task editor, authentication screen
      App.jsx            Planner state and the application shell
      api.js             API client and consistent error handling
      calendar.js        Calendar date and display helpers
      styles.css         Responsive interface
      theme.css          Light/dark colour tokens
    vite.config.js       Development proxy
  server/
    src/
      models/            Mongoose User and Task schemas
      controllers/       Authentication and task workflows
      routes/            API route definitions
      middleware/        Authentication and validation
      utils/             Timezone conversion and errors
      app.js             Express application factory
      index.js           Database connection and startup
    test/                Database-backed API and timezone tests
    .env.example         Configuration template; contains no credentials
  shared/
    calendar.js          Categories, time rules, overlap/layout logic
    calendar.test.js     Business-rule tests
  scripts/setup.mjs      Safe local environment-file creation
  package-lock.json      Reproducible dependency versions
```

Mongoose schemas are the Models, React is the View layer, and controllers handle requests and business logic. Routes and middleware stay separate. `shared/` contains code used by both layers.

### Time representation

Tasks store a civil date (`2026-11-01`), exact local times (`09:15`, `09:55`), start/end minutes (`555`, `595`), the account's IANA timezone, and the corresponding UTC instants. `Asia/Dhaka` 09:15 becomes 03:15 UTC. The calendar uses the civil date and minute values to position blocks without rounding.

Day/week layouts derive rows from actual task boundaries rather than fixed hourly rows. A 09:15–09:55 task is a custom 40-minute slot. Each week column has independent boundaries. Gaps are compact add-slot targets. Day overlap groups keep separate positioned cards; week overlap groups stack cards with each exact range shown. Heights are adjusted for readable cards, including one-minute tasks, rather than using a one-pixel-per-minute scale. Printed ranges and elapsed-duration labels remain authoritative.

This release supports tasks within one calendar day, from 00:00 through 23:59. End must be later than start; split overnight work into two entries. Nonexistent and ambiguous daylight-saving times are rejected explicitly. Elapsed duration uses UTC differences, so a task spanning a valid daylight-saving transition has the correct elapsed minutes. Timezone settings explicitly preserve local task dates/clock times and recalculate UTC instants in a transaction. Invalid daylight-saving times roll the change back. This operation requires Atlas or a replica set; see UPGRADE_STAGE2.md.

### Bucket transitions

`Task.location` is `calendar` or `bucket`. One task identity survives movement between them. Sending a scheduled task to the bucket stores its original schedule, increments `postponeCount`, resets completion, and removes it from calendar queries. Editing an existing bucket item does not increment the count. Rescheduling preserves title, notes, category, priority, and postponement history.

The bucket retains the last schedule fields as history; `location` decides whether the task is currently scheduled. New bucket ideas have no schedule. The embedded transition history and daily plan ledger retain movements from the documented history boundary; legacy data is marked explicitly.

### Authentication and local deployment

The JWT is held in an HttpOnly, SameSite=Lax cookie. It is not stored in localStorage. Production cookies use `Secure`; local development uses HTTP. Logout increments the user's token version, revoking all that user's current sessions. Passwords are hashed using bcrypt. Each task lookup includes the authenticated owner.

All write requests require the configured `Origin` and `X-Planora-Client: web` header. Vite provides a same-origin `/api` proxy during development. The production startup can serve the built React app from Express using the same origin. The Stage 8 deployment guide supplies a same-origin Vercel API-proxy option and a simpler single-origin Render layout. Live cookie/proxy/OAuth acceptance remains necessary.

## Commands

| Command               | Purpose                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `npm ci`              | Install locked dependencies for both workspaces                          |
| `npm run setup`       | Create `server/.env` with a random secret; preserve an existing file     |
| `npm run mail:latest` | Show the latest local recovery/verification email preview                             |
| `npm run admin:grant -- --email you@example.com` | Grant an existing account the admin role locally; sign in again |
| `npm run admin:revoke -- --email you@example.com` | Remove a role while retaining at least one active admin |
| `npm run dev`         | Start frontend and backend together                                      |
| `npm run verify` | Run tests, build, and disposable production smoke |
| `npm run smoke:production` | Check the real server in production mode after building; isolated MongoDB only |
| `npm test`            | Run business-rule, timezone, and database-backed API tests               |
| `npm run build`       | Produce `client/dist`                                                    |
| `npm start`           | Run the backend; with production settings, also serve the built frontend |

Tests use a disposable MongoDB instance through `mongodb-memory-server`, never your Atlas database. The first test run downloads a MongoDB test binary, so internet access and extra disk space are needed. Your real database URL is not loaded by the tests.

## Environment

| Variable      | Local value / meaning                                               |
| ------------- | ------------------------------------------------------------------- |
| `MONGODB_URI` | Your Atlas connection string or `mongodb://127.0.0.1:27017/planora` |
| `JWT_SECRET`  | Random secret generated by setup, at least 32 characters            |
| `PORT`        | `5001`; avoid the port 5000 conflict on some Macs                   |
| `APP_ORIGIN`  | `http://localhost:5173` during Vite development                     |
| `NODE_ENV`    | `development` locally; `production` only behind HTTPS in deployment |
| `TRUST_PROXY` | `0` locally; configure for the actual trusted deployment proxy only |

For email previews, local development defaults to `MAIL_MODE=file`. For real email, configure `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in `server/.env`. File previews are disabled in production.

No frontend `.env` is needed. Never place database credentials or a JWT secret in a `VITE_` variable. Never commit `server/.env`.

## API

All paths start with `/api`. Authentication is required for all task routes. Responses use `{user}`, `{task}`, or `{tasks}`; failures use `{error: {code, message, details?}}`.

| Method       | Path                                   | Purpose                                |
| ------------ | -------------------------------------- | -------------------------------------- |
| GET          | `/health`                              | Database readiness                     |
| POST         | `/auth/register`                       | Create an account and session          |
| POST         | `/auth/login`                          | Sign in                                |
| GET          | `/auth/me`                             | Current account                        |
| POST         | `/auth/logout`                         | Revoke sessions and sign out           |
| POST         | `/auth/change-password`                | Verify current password and change it  |
| POST         | `/auth/forgot-password`                | Request a 15-minute recovery link      |
| POST         | `/auth/reset-password`                 | Consume a recovery token once          |
| PATCH        | `/account/profile`                     | Update name/email                      |
| PATCH        | `/account/settings`                    | Save preferences/timezone              |
| GET/POST     | `/account/categories`                  | List/create personal categories        |
| PATCH/DELETE | `/account/categories/:id`              | Edit/delete a personal category        |
| GET          | `/tasks?from=2026-11-01&to=2026-11-07` | Inclusive calendar date range          |
| GET          | `/tasks?location=bucket`               | Bucket list                            |
| POST         | `/tasks`                               | Create a scheduled task or bucket item |
| PATCH        | `/tasks/:id`                           | Edit, complete, move, or reschedule    |
| DELETE       | `/tasks/:id`                           | Delete an owned task                   |

Example task body:

```json
{
  "title": "Read BiomedCLIP",
  "date": "2026-11-01",
  "startTime": "09:15",
  "endTime": "09:55",
  "notes": "Focus on the text encoder.",
  "category": "study",
  "priority": "high",
  "status": "scheduled",
  "location": "calendar"
}
```

An overlap returns HTTP 409 with `error.code = OVERLAP` and conflicting task summaries. Resubmit the intended task with `allowOverlap: true` only after the user chooses to proceed.

## Verification

The automated suite covers calendar rules, task lifecycle, account security, transactional timezone changes, recurrence/templates, search, review/history/progress, exports, Google integration, reminders, and administration. See [VALIDATION.md](./VALIDATION.md) for current counts and checks, and [M1/M2 readiness](./docs/PRODUCTION_READINESS.md) for the preserved baseline and environment-separation steps.

## Official references

- [Node.js downloads](https://nodejs.org/en/download)
- [Vite getting started](https://vite.dev/guide/)
- [Express installation](https://expressjs.com/en/starter/installing/)
- [MongoDB Atlas connection guide](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/)

## Stage 2 implementation notes

Categories and preferences are embedded in User documents. Legacy account defaults are initialized idempotently without deleting or recreating task records. Existing category IDs remain valid. The app serializes authenticated writes per account in its single Node process to avoid local category-deletion/timezone/task-edit races. Horizontal multi-process deployment needs a database-coordinated write strategy before scaling beyond this topology.

See UPGRADE_STAGE2.md for the new UI, recovery configuration, and timezone policy.

## Stage 3 implementation notes

RecurrenceSeries stores bounded repeat rules; Task records preserve each original occurrence slot using a unique partial index. Individual recurring deletions use tombstones, and rescheduled/bucket occurrences retain their slot. Generation runs in MongoDB transactions and requires Atlas or a replica set. Templates are user-owned and never modify tasks already created from them. Global search generates recurrence in an explicit range of at most 366 days and returns pages of 50 tasks. See UPGRADE_STAGE3.md for the complete behaviour and API.

## Stage 4 implementation notes

Task documents now keep private history events and per-date plan outcomes. Ordinary state/history/plan changes are saved atomically in one task document; recurring and timezone bulk changes maintain these fields within transactions. New deletions are soft deletions so recorded history survives. Earlier exact movements are not fabricated: legacy data is marked and its known schedule/counts are preserved. Review/progress GET requests use the existing account serialization because they can materialize recurring dates. See UPGRADE_STAGE4.md for metrics, review, drag, and history policies.


## Stage 5 implementation notes

Download schedule provides Day, Week, Month, and custom-range PDFs, CSV spreadsheets, and ICS calendars. Shared authenticated range queries materialize recurring slots, exclude bucket/deleted/foreign tasks, and apply category/status filters. Export preview and download are POST requests protected by the existing origin check and account write serialization. Ranges are bounded to 366 days and 5,000 tasks; no silent truncation.

CSV quotes every cell, uses UTF-8 with BOM, and neutralizes formula-leading text. PDFKit embeds locally installed Noto Latin/Bengali fonts and paginates complete task titles and notes. ICS includes stable UIDs, bounded repeat rules, exclusion dates, a VTIMEZONE definition, exact UTC standalone events, and configurable DISPLAY alerts (10 minutes by default). Modified/completed occurrences and clock-change duration exceptions are separate events. Downloads are current calendar snapshots, not live calendar synchronization or history reports. See UPGRADE_STAGE5.md for details and import limitations.


## Stage 6 implementation notes

Google connection, OAuth state, event mappings, and the latest sync run use separate owner-scoped collections. Refresh tokens and PKCE verifiers use authenticated encryption with a dedicated GOOGLE_TOKEN_KEY. Access tokens are cached only in memory. Native server fetch uses fixed Google URLs, timeouts, redacted errors, and bounded retries.

Manual sync processes one task per request with saved progress and a persisted safety lease. Mappings are stored before event insertion; uncertain responses are reconciled through the stable event ID. Recurring occurrences are individual remote events. The selected range also reconciles previously mapped placements so moved/deleted/bucket tasks do not leave stale linked events when that range is synced again. Google mutation locks outlive an aborted HTTP client until the external write settles.

The integration is optional: leave all four GOOGLE_* settings blank to keep using the planner without it. Google Cloud setup and real-account acceptance are still required; see UPGRADE_STAGE6.md. Automated Google tests use a fake provider and do not constitute live Google OAuth or notification delivery verification.
