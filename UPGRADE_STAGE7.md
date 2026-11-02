# Stage 7: browser reminders, administration, and email verification

Version **0.7.0** builds on Stage 6. It adds opt-in browser reminders, protected administration, account suspension/reactivation, shared defaults, and verification of your current email address. Existing Google settings and planner data are retained. No new environment variables are required.

## Install on your Mac

Stop the running app with **Control+C**. Extract `Planora_Stage7_Update.zip` into Downloads. From your existing **planora** project folder, run:

```bash
node ~/Downloads/Planora_Stage7_Update/apply-stage7.mjs . &&
npm ci &&
npm test &&
npm run build &&
npm run dev
```

Expected: version **0.7.0**, **110 passing tests** (4 shared and 106 server/worker tests), a successful build, and `Planora API ready at http://localhost:5001`. Open **http://localhost:5173** using the same hostname as APP_ORIGIN.

The installer supports the supplied Stage 6 source and repeat Stage 7 installation. It verifies the update before writing, backs up changed source under `.planora-backups/`, preserves `server/.env`, and does not access MongoDB. Your custom **ROADMAP.md** is backed up before installing this release's roadmap; copy personal checkmarks/notes from that backup afterwards. Other modified or missing existing source files stop installation before any changes. Share conflicting filenames if that happens; keep your project folder.

## Enable browser reminders

1. Sign in and open **Settings → Reminders**.
2. Click **Allow notifications** and approve your browser's permission prompt.
3. Click **Send test notification**. Check browser and macOS notification settings if it does not appear.
4. Select **Enable browser reminders for my account**, choose a lead time from **0–1440 minutes**, and save. Zero means at task start.
5. Create a non-completed calendar task whose reminder is a few minutes in the future. Keep Planora open and the computer awake. Confirm the alert uses the correct title/date/timezone; clicking it opens the task.

Permission is requested only by your explicit button click. Your enable/lead preference is saved to your account; browser permission is local to each browser/device. Grant permission separately on another device. Disabling reminders saves to the account and is checked again by the server when an alert is claimed. Other open tabs refresh account settings on focus and periodically.

Only owned, non-completed, non-deleted **calendar** tasks qualify. Bucket tasks do not. Recurring occurrences are generated for the relevant range; deleted/exceptional occurrences keep their existing rules. A stale task schedule or changed lead time cannot claim its former reminder. Titles are read again at claim time.

### Delivery limits

- Keep at least one Planora tab open. This release has no service worker, web push service, or closed-browser scheduler. Sleeping devices and throttled background tabs can miss alerts.
- Use a supported desktop browser on localhost or HTTPS. The test button checks whether the browser can request a page notification; operating-system settings still control visible delivery. Mobile page notifications may be unsupported.
- Tabs sharing the same browser storage use a persistent random device ID. MongoDB atomically permits **one delivery claim per account, browser/device, task start, and lead time**. Separate browsers/devices may each alert once. Clearing site storage creates a new device identity.
- A due alert has a **two-minute** catch-up window. Positive lead-time alerts are suppressed once the task has started. There is no old-alert replay after that window.
- The claim is saved before requesting an OS notification. A crash, denied OS delivery, or notification-constructor failure after claiming can lose that alert. This is at-most-once claiming, not guaranteed delivery.
- Google Calendar's fixed 10-minute alarms and Stage 5 ICS alarms remain separate. Enabling both can produce an alert from each system.

## Set up your first administrator

Register/sign in with your normal Planora account first. In a second terminal, from the same project folder, replace the example email with that account's email:

```bash
npm run admin:grant -- --email your-account@example.com
```

The command reads the existing `server/.env`, connects to your MongoDB database, and changes the role of that **existing active account**. Atlas or a MongoDB replica set is required for its transaction. It does not create an account or password. Only someone with local server/database access should run it.

Role changes revoke existing sessions. Sign in again, choose **Administration** in the sidebar, and enter your current password to unlock it for **15 minutes**. You can explicitly lock it earlier. Ordinary sign-in does not unlock protected admin data. Password/email changes, logout, and role revocation invalidate the unlock along with the session.

To remove a role later:

```bash
npm run admin:revoke -- --email another-admin@example.com
```

At least one active administrator must remain. There is no public role-assignment endpoint, first-registrant promotion, or shared default admin password.

### Accounts

Search accounts by literal name/email, filter active/suspended accounts, and page through 25 metadata records at a time. Suspend/reactivate requires an explicit confirmation and the current record version. Suspension preserves planner data, revokes sessions, invalidates outstanding password-recovery links, and blocks login until reactivation. Reinstated users must sign in again.

The screen cannot suspend yourself or any administrator. To suspend another administrator, first remove that account's role with the local command while retaining another active admin. The interface exposes account identity/status/verification metadata; personal tasks, notes, password hashes, recovery links, and Google tokens are excluded.

### Site settings

- **Allow new account registration** controls new registrations on the server. Existing active accounts can still sign in.
- **Allow browser reminders** pauses reminder delivery globally while retaining each user's preference. Pending claims also recheck this control.
- Timezone, week start, reminder lead time, appearance, default view, and starter categories apply to **new accounts only**. Existing accounts retain their settings and category IDs. Notifications are always off for newly registered accounts until personally enabled. Registration can explicitly choose another valid timezone.
- Settings use a revision check to refuse stale overwrites. Reload the admin dialog if another administrator has changed them.
- **Activity** shows the latest 50 role, account-status, and site-settings audit records, without task content or secrets. The API supports further pages.

## Verify your email

Open **Settings → Profile → Send verification link**. Local development uses the existing mail mode:

```bash
npm run mail:latest
```

Open the preview's link and click **Verify email**. Link opening alone does not consume it. Verification is optional for planner access; it does not sign you in or switch accounts. A fresh link expires after **24 hours**, is single-use, and replaces the prior link. Requests are throttled; allow a minute between requests. Only the token hash is stored in MongoDB. Changing the account's email clears verification and invalidates the old-address link.

Real delivery uses the existing `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` settings from Stage 2. Restart the server after environment changes. Local file previews are disabled in production. Missing SMTP does not prevent planning; requesting verification returns a safe delivery error. Do not share preview links or credentials.

## Acceptance exercise on your Mac

1. Enable reminders with the explicit permission button, send a test notification, and observe one actual task notification with Planora open.
2. Open a second tab in the same browser. Schedule another future reminder; confirm only one Planora alert appears. Complete or bucket a task before its due time and confirm no alert is delivered.
3. Disable reminders and save; create another task and confirm no alert. Re-enable for subsequent tasks. Check a separate device only if you want alerts there too.
4. Grant your admin role locally, sign in again, unlock Administration, and use a separate test account to exercise suspend/reactivate. Confirm its task data returns after reactivation.
5. Change a new-account default. Register a test user and check that default; verify existing accounts retain their own settings. Test registration closure, then restore your desired setting.
6. Request and consume a verification link. Check the verified badge; reuse the link and confirm rejection. If using SMTP, verify delivery to your own mailbox.
7. Retain the Stage 6 real Google acceptance checks; this release does not replace them.

Automated tests cover reminder ownership/timing/current-state checks, concurrent claims, recurrence exceptions, admin role/unlock/origin protections, session revocation, concurrent last-admin protection, defaults, registration controls, and expiring/single-use verification. Browser checks exercise permission UI and notification calls with a controlled Notification test double. **Actual macOS/browser alert delivery and real SMTP delivery still require the exercise above.**

## API additions

Prefix every path below with `/api`. Existing authenticated session and origin/header protections apply. All admin endpoints require an admin role; protected ones additionally require the separate current-password unlock.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/public/settings` | Public registration flag, default timezone, and reminder policy only |
| GET | `/reminders/upcoming` | Owned upcoming reminder candidates and server time |
| POST | `/reminders/claim` | Revalidate and atomically claim one due reminder for a browser/device |
| POST | `/auth/request-verification` | Authenticated, throttled email-link request |
| POST | `/auth/verify-email` | Atomically consume a valid verification token; no session required |
| GET | `/admin/access` | Current admin-unlock state |
| POST | `/admin/unlock` | Current-password check and short admin cookie |
| POST | `/admin/lock` | Clear the admin-unlock cookie |
| GET | `/admin/summary` | Protected account totals |
| GET | `/admin/users` | Protected, filtered/paginated account metadata |
| PATCH | `/admin/users/:id/status` | Protected, version-checked suspend/reactivate |
| GET/PATCH | `/admin/defaults` | Protected shared settings with revision control |
| GET | `/admin/audit?page=1` | Protected administrative history, 50 per page |

Reminder queries are limited to 5,000 candidates in the next hour; exceeding this returns an explicit error rather than truncation. Delivery claims expire through a MongoDB TTL index. The server's existing account-write coordination still assumes **one Node process**; distributed application replicas need database-coordinated locking before deployment. Stage 8 remains final acceptance, accessibility/mobile review, deployment, and the project report/demo materials.
