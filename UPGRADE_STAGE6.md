# Stage 6: connect and sync Google Calendar

Version **0.6.0** adds manual, one-way **Planora -> Google Calendar** synchronization. It uses a separate Google calendar named **Planora**, account-bound OAuth, encrypted refresh tokens, persistent event mappings, and resumable per-task results.

**The code and simulated Google workflows are tested. Your Google Cloud project, real consent flow, calendar visibility, and device alerts still need the live acceptance exercise below.** No Google credentials are bundled. Existing planner features work without Google configuration.

## 1. Install the update on your Mac

Stop the app with **Control+C** and extract `Planora_Stage6_Update.zip` into Downloads. From your existing **planora** project folder, run:

```bash
node ~/Downloads/Planora_Stage6_Update/apply-stage6.mjs . &&
npm ci &&
npm test &&
npm run build &&
npm run dev
```

Expected: **version 0.6.0**, **82 passing tests** (4 shared and 78 backend), a successful build, and `Planora API ready at http://localhost:5001`.

The installer supports Stage 5, including the original and dependency-fixed Stage 5 package files. It preserves `server/.env`, does not access the database, verifies source hashes, and backs up changed source under `.planora-backups/`. For **ROADMAP.md only**, a locally edited version is backed up and the new release roadmap is installed; refer to that backup to retain your personal checkmarks/notes. Other edited/missing existing source files stop installation before any changes. Share conflicting filenames rather than deleting the project.

Open **http://localhost:5173**. Google Calendar will show that it is not configured until the following setup is complete. Use **localhost** consistently for browser access, APP_ORIGIN, and the Google redirect URI.

## 2. Create your Google Cloud OAuth client

Use your own account in the [Google Cloud Console](https://console.cloud.google.com/).

1. Create/select a project, for example **Planora**.
2. Open **APIs & Services -> Library**, find **Google Calendar API**, and enable it for this project.
3. Open **Google Auth Platform** (or the OAuth consent configuration shown in your console). Configure branding/support contact and developer contact information.
4. Choose the appropriate audience. For a personal Gmail development setup, use **External**, leave the app in **Testing**, and add the Google email you will connect as a **test user**.
5. In data access/scopes, configure only:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email` (the email identity permission; the authorization request uses its `email` alias)
   - `https://www.googleapis.com/auth/calendar.app.created`
6. Create an OAuth client with application type **Web application**. Name it **Planora Local**.
7. Add this **Authorized redirect URI**, exactly:

```text
http://localhost:5173/api/google/callback
```

8. Copy the **Client ID** and **Client secret** into your local environment file in the next section. Do not paste them into chat or commit them to GitHub.

The server owns the callback and authorization-code exchange. The frontend-origin callback is proxied through Vite's existing `/api` proxy during local development. A separate JavaScript SDK/client authorization flow is not used.

Google's console labels can change. See the official [consent setup](https://developers.google.com/workspace/guides/configure-oauth-consent), [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server), and [Calendar scope definitions](https://developers.google.com/workspace/calendar/api/auth) if your console differs.

## 3. Add the four Google settings

In a second terminal, from the project root, generate a dedicated encryption key:

```bash
npm run google:key
```

Copy the generated 64-character hexadecimal value. Add these lines to **server/.env**, retaining your existing MongoDB URI, JWT secret, and SMTP settings:

```dotenv
GOOGLE_CLIENT_ID=your-web-application-client-id
GOOGLE_CLIENT_SECRET=your-web-application-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5173/api/google/callback
GOOGLE_TOKEN_KEY=the-64-character-hexadecimal-key-you-generated
```

Ensure the existing setting is:

```dotenv
APP_ORIGIN=http://localhost:5173
```

Stop and restart `npm run dev` after editing `.env`. Node's source watcher does not reliably restart for environment-file changes.

All four Google settings may be blank to disable the integration. A partially configured set or an invalid key/callback is rejected at startup with a configuration message. The callback must be APP_ORIGIN plus `/api/google/callback`; HTTP is permitted only for localhost/127.0.0.1. Public deployments require HTTPS and an `/api` route to the backend on that public origin.

**Keep GOOGLE_TOKEN_KEY stable and separate from JWT_SECRET.** Existing encrypted refresh tokens require that exact key. If it is lost/changed, reconnect Google to save a newly encrypted token, or disconnect locally and remove the app's grant in your Google Account connections. Back up secrets privately; never put `.env` into the release ZIP or GitHub.

## 4. Connect from Planora

1. Open **http://localhost:5173** and sign in to Planora.
2. Choose **Google Calendar** in the sidebar.
3. Click **Connect Google Calendar**.
4. Select the Google account you added as a test user and approve the requested permissions.
5. Return to Planora. The dialog shows **Connected**, your verified Google email, and the sync controls. A calendar named **Planora** is created in that Google account.

The Calendar scope is limited to calendars created by this app. Basic Google identity is used to show the connected account and prevent accidental switching while already connected. Other calendar contents are not queried or imported. For public launch, follow Google's publishing/verification requirements for the scopes/audience you actually use.

A Google app configured as External/Testing can receive refresh tokens that expire after seven days when Calendar permission is requested. Planora shows a reconnect state when access expires or is revoked. See Google's [token-expiration rules](https://developers.google.com/identity/protocols/oauth2#expiration).

Use **Reconnect Google Calendar** if access expired or the dedicated calendar was deleted. Selecting another Google account while connected is rejected; disconnect first to switch accounts.

## 5. Sync a selected range

Choose **Day**, **Week**, **Month**, **Upcoming 30 days**, or **Custom range**, with an optional category filter. Week follows your saved week start; Month excludes neighboring calendar-grid dates. Upcoming 30 days starts at today in your planner timezone. Date ranges are limited to 366 days and 5,000 task links; oversized selections are refused rather than truncated.

Click **Start sync**. Planora stores the selected task IDs and processes one task per request. The dialog updates counts and per-task results:

- **synced**: created or updated the linked Google event.
- **unchanged**: its managed fields already match Planora.
- **removed**: removed the mapped event for a bucket/deleted task.
- **skipped**: there is no linked event to remove.
- **failed**: a safe explanation is shown; successful tasks are retained.

Use **Pause**, **Resume sync**, **Retry failed tasks**, or **Cancel remaining**. Closing the dialog/page pauses after a request already sent has settled. You can return later; progress is stored in MongoDB. A crashed/interrupted in-flight step has a three-minute safety lease before it can be resumed. Cancelling does not undo events already synced.

There is no background scheduler or automatic mutation hook. After editing, completing, rescheduling, bucketing, or deleting tasks, run sync again for the relevant current or previously synced date range. Changes made after a task's step finished require another sync. Changes before a pending step are read from the current task record when that step runs.

### What a range includes

A sync includes:

1. Current calendar tasks within the chosen date range/category.
2. Previously mapped active events whose **last synced date/category** matched that same range/filter.

This second group lets Planora remove stale linked events or follow moved tasks. For example, sync Monday's Study tasks, move one to Friday/Work, then sync Monday/Study again: its existing Google event is updated to Friday/Work. Therefore an update can land outside the chosen range/filter. To reconcile old remote placements after a change, select their old range or a custom range covering them.

Unlinked Google events are untouched. Changes made directly in Google do not edit Planora. The next sync overwrites Planora-managed fields of a verified mapped event with current Planora data. A mismatched remote ownership marker fails safely rather than overwriting/deleting that event. ETags protect against a Google edit during an individual update.

### Exact times and reminders

Events use the task's stored UTC start/end together with its IANA timezone. A 09:15-09:55 Dhaka task is sent as exactly 03:15-03:55 UTC with `Asia/Dhaka`, retaining 40 elapsed minutes.

The title remains the task title. Description includes Planora status, category, priority, timezone, original recurrence date when present, and notes. Non-completed tasks receive an explicit **10-minute popup** reminder; completed tasks use no reminders. These are Google event alarms, separate from Planora's future browser-notification feature. Google account/calendar/device notification settings control actual delivery.

### Recurring tasks

Each generated occurrence becomes a separate Google event with its own stable mapping. No unbounded remote RRULE is created. This keeps occurrence completion, edits, moves, bucket state, and deletion aligned with Planora's existing occurrence identity. Lazy generation runs for the chosen bounded range. A later sync is needed to add further dates. Whole-series edits/deletions are reflected when their mapped ranges are synced again.

## 6. Disconnect and calendar recovery

**Disconnect** requires confirmation. It removes saved Google tokens and cached access, attempts to revoke the Google grant, cancels pending sync, and **keeps the Google calendar and its existing events**. Planora logout alone does not disconnect Google.

If Google cannot confirm revocation, Planora still removes its local token and tells you to remove Planora from your [Google Account connections](https://myaccount.google.com/connections). Disconnect remains available for local credential removal even if Google configuration has been disabled.

Reconnecting the same Google account reuses its saved calendar/mappings when accessible. Switching to a different Google account after disconnect creates a separate calendar and mapping generation; the previous account's calendar/events remain there. A deleted Google calendar is recreated during explicit reconnect, with a new mapping generation.

Calendar creation is deliberately not blindly retried after an uncertain response. If the dialog asks you to check Google Calendar, open its settings. If a Planora calendar was created, find **Integrate calendar -> Calendar ID**, enter that ID, and click **Use existing Planora calendar**. Adoption requires this account's Planora ownership marker. Otherwise, after checking, explicitly choose to create another Planora calendar. Do not adopt an unrelated or primary calendar.

## 7. Live Google acceptance exercise

After your real Google setup:

1. Connect and confirm the dedicated **Planora** calendar appears under your Google account.
2. Create a task at **09:15-09:55** in Planora. Sync that day and verify its title, exact local times, notes/category/status, and 10-minute popup reminder in Google.
3. Sync again: there should still be one corresponding event, with an **unchanged** result.
4. Edit the task title/time; sync and verify the existing event updates.
5. Complete it; sync and verify its completion description and absence of reminders.
6. Move it to the bucket; sync its previously synced date and verify the Google event is removed. Reschedule it and verify a later sync creates the correct event again.
7. Test a recurring rule and one edited/deleted occurrence. Check exact occurrence count and dates.
8. Start a multi-task sync, pause, close/reopen, and resume. Verify counts and no duplicate events.
9. Disconnect and verify Google events remain. Reconnect the same account and verify the existing mapping is reused.
10. For an actual alert check, create a non-completed task more than 10 minutes in the future, sync it, enable the receiving app/device's notifications, and observe the reminder.

The packaged automated/browser tests use a fake Google provider, not your Google account. Live consent, API enablement, publishing restrictions, calendar visibility, and device alert delivery must be checked using your credentials and devices before declaring the integration fully accepted.

## API additions

All endpoints are account-scoped and require the existing Planora session. POST endpoints also require the existing request-origin and `X-Planora-Client: web` protections. OAuth callback is a top-level GET using the same browser's session and a short-lived HttpOnly binding cookie.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/google/status` | Configured/connected state, verified Google email, calendar readiness, latest run summary |
| POST | `/api/google/connect` | Return the fixed-provider OAuth URL and save hashed, expiring state/PKCE |
| GET | `/api/google/callback` | Consume state once, exchange code server-side, verify identity, save encrypted refresh token, set up calendar |
| POST | `/api/google/calendar` | Finish/recover calendar setup; optional verified `calendarId` or explicit `confirmNew: true` |
| POST | `/api/google/disconnect` | Remove local tokens, attempt revocation, cancel pending sync |
| POST | `/api/google/sync` | Create a persistent sync run from `from`, `to`, optional owned `category` |
| GET | `/api/google/jobs/:id?page=1` | Owned results, 50 items per page |
| POST | `/api/google/jobs/:id/step` | Process at most one pending task |
| POST | `/api/google/jobs/:id/retry` | Mark only failed items pending again |
| POST | `/api/google/jobs/:id/cancel` | Cancel remaining work without undoing completed steps |

OAuth state is hashed and expires after 10 minutes. PKCE verifiers and refresh tokens use authenticated AES-256-GCM with an account-specific purpose binding. Access tokens are short-lived in-memory values. Tokens, provider response bodies, and client secrets are not returned in task/account/status responses. External URLs are fixed Google endpoints; redirects return only fixed result labels to APP_ORIGIN.

Mapping is persisted before an external event insertion, and client-supplied event IDs allow recovery after uncertain inserts. Cancelled/deleted remote-event tombstones receive a new persisted ID. Requests have timeouts and a bounded retry for transient errors; individual failures remain retryable. Google mutation locks are retained until the server finishes an external write, including after the HTTP client disconnects. As before, this app's broader write-serialization design assumes one Node process; horizontally scaled deployment needs a database-coordinated account lock strategy.

## Troubleshooting

- **Not configured:** add all four Google settings, retain APP_ORIGIN, restart the server.
- **redirect_uri_mismatch:** copy the exact registered localhost callback above and match GOOGLE_REDIRECT_URI. Do not use the API port or a different hostname.
- **Access denied / testing restrictions:** use an allowed test account and check Google's consent/audience/publishing settings.
- **403 / permission:** enable Calendar API in the same project as the OAuth client, approve the Calendar scope, and reconnect.
- **Reconnect required:** expired/revoked grant, a missing refresh token, or a changed encryption key; reconnect or disconnect/reconnect as indicated.
- **Still running after restart:** wait for the three-minute step lease, then resume.
- **No changes in Google after editing Planora:** run sync again for the current or previously synced range.
- **Old ICS imports also present:** Stage 5 snapshots are independent of API mappings. Remove the old imported calendar/events manually if they duplicate your new dedicated Planora calendar.

## Next

Stage 7 adds Planora browser reminder delivery and protected administration. Stage 8 remains final cross-feature acceptance, deployment, accessibility/security review, and project documentation.
