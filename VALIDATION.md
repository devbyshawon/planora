# Validation for v0.8.1

## Integrated offline planner — 3 November 2026

The separate offline screen was replaced by the original React planner with an IndexedDB/API adapter, durable queued actions, signature/receipt conflict protection, local recurrence/templates, history/search/review/progress, planner preferences/categories, and browser PDF/CSV/ICS using the shared existing layout/rules. `npm run verify` passed **156 tests** (10 shared + 146 server/worker), build, and production smoke including every emitted precache resource. No dependencies were installed or changed. The PDF renderer is an existing dependency loaded in a separate browser chunk.

A disposable browser account/database verified the normal calendar/dialog while HTTP was stopped, creating a task offline, persistence after root reload, downloads of PDF/CSV/ICS containing that task, and automatic reconnection sync with exactly one server task. Template/recurrence/settings chains and uncertain retry/account isolation are covered by automated tests. The updated source-review package supersedes the earlier separate-workspace ZIP. Actual installed-device acceptance remains a user check. Google/email/authentication/security/admin actions still require online services; closed-app reminders/sync are not guaranteed.

## Offline task workspace — 3 November 2026

`npm run verify` passed with **147 tests** (10 shared + 137 server/worker), production build, and production startup/PWA smoke. New coverage includes owner/origin enforcement, task/receipt atomicity, idempotent create/delete retries, concurrent retries, chained local versions, stale/deleted tasks, timezone/category/schedule/overlap rejection, local queue transitions, and offline shell asset delivery without caching APIs.

A browser exercise used a disposable local account/database: enable the device copy, stop the HTTP server, reopen the offline workspace, create a task, reload and retain its pending edit, restore HTTP, observe automatic sync reach zero pending changes, and confirm the task appears in the usual online calendar. No live user tasks or Atlas data were used. Actual installed-device offline acceptance and cross-device conflict review remain user checks; this is not a guarantee of closed-app sync, encrypted device storage, or full offline feature parity.

## Public information pages — 3 November 2026

Production build and production startup smoke passed with unauthenticated checks for the about, privacy, and terms HTML pages and their stylesheet. The smoke asserts the expected page titles and support address and rejects accidental SPA fallback. Browser inspection confirmed privacy-page content and readable layout. Account/backend behavior was unchanged; the preceding 139-test result remains the latest full suite run. These pages disclose current pilot limitations rather than claiming completed public email, deletion, retention, or production acceptance.

## Verification response correction — 3 November 2026

`npm run verify` passed: **139 tests** (10 shared + 129 server/worker), production build, and production smoke. Regression coverage checks that a cooldown returns 429 `VERIFICATION_COOLDOWN` with `Retry-After: 60`, makes no provider request, and cannot claim delivery after a failed send. Failed-send tokens are removed, cooldowns are retained, and a later attempt can succeed. Resend configuration was not changed; public-recipient delivery remains blocked by the current test sender.

## Public-email integration preparation — 3 November 2026

`npm run verify` passed with **138 tests** (10 shared + 128 server/worker), production build, and production startup smoke using existing dependencies. Three new tests cover optional SMTP2GO configuration, bounded fixed-endpoint requests, reset/verification content, explicit recipient acceptance, and sanitized provider/transport errors without automatic retries. This is mocked provider validation; account approval, sender verification, and actual delivery to a separate inbox remain pending. The live provider has not been changed.

## PWA implementation — 3 November 2026

Using existing Node.js 24.13.1 and installed dependencies, `npm run verify` passed: repository path check, **135 tests** (10 shared + 125 server/worker), production build, and production startup smoke. The smoke now checks the manifest, PNG icons, emitted service worker, and offline page assets. No dependencies or private environment files were changed.

Ten new tests cover public-only precaching, API/mutation bypass, network-only navigation, offline fallback, safe asset caching, cache cleanup, manifest/icon dimensions, explicit installation, and consent before reloading updates. Browser checks confirmed installation guidance and the offline reconnect page at the root URL after stopping the local production preview server.

Actual OS installation, installed-app OAuth/download behavior, and a live two-tab upgrade remain manual acceptance. See [PWA.md](./docs/PWA.md). The audit result below belongs to the earlier M1/M2 run; it was not rerun for this dependency-free change.

## M1/M2 record — 2 November 2026

Checked on 2 November 2026 on macOS using the existing Node.js **24.13.1** and installed dependencies. The repository/CI pin remains **24.22.1**; this run does not claim validation on that exact version. No dependencies were installed, updated, or removed.

## Current results

- Repository tracked-path privacy check: passed. It does not scan file contents or old Git history.
- Shared/backend tests: **125 passed** (10 shared + 115 server/worker), zero failures.
- Vite production build: passed.
- Production startup smoke: passed, using an isolated disposable MongoDB replica set and the real server entry point.
- `npm audit --audit-level=moderate`: **0 vulnerabilities reported** at this check; packages were not changed.
- Git whitespace/diff check: passed.

The database suite and smoke check needed permission to bind local ports outside the execution sandbox. The first sandboxed attempts failed with `listen EPERM`; the approved runs completed. Tests use disposable MongoDB, not the account's Atlas database. Private `.env` values were not printed or changed.

Regressions cover template bucket selection/invalid destinations, skipped civil dates, oversized calendar/bucket lists with paginated-search recovery, history totals/empty pages/ownership, and older administrative audit pages with unlock enforcement.

Reproduce with `npm run verify` and `npm audit --audit-level=moderate`. The verification command checks repository paths, runs tests, builds React, and runs the production smoke. The first MongoDB test run may download a test binary.

## Current acceptance limits

This run did not execute browser automation, phone/screen-reader checks, real Google authorization, actual mail/OS delivery, ICS application imports, a load test, deployment, or database backup/restore. Existing browser claims below are historical evidence only. Embedded history storage and single-process account coordination remain limitations. See `docs/PRODUCTION_READINESS.md` for the baseline, environment templates, retained product choices, and outstanding operator steps.

## Historical v0.6 validation record

The remainder is retained from the previous release for traceability. Its counts, dates, browser exercises, audit results, and remaining-work statements describe that historical release, not the M1/M2 run above.

Checked on 1 November 2026 using Node.js 24.22.1 in a Linux development environment.

## Result and acceptance boundary

The release is checked with a clean `npm ci`, **82 passing tests** (4 shared and 78 backend), a successful production build, and `npm audit` reporting zero vulnerabilities at verification time. The pinned Stage 5 security fixes, Nodemailer 10.3.1 and CSV-Parse 7.0.3, are retained.

**Google tests use an injected fake provider. No real Google OAuth client, user account, calendar, or device alert was used.** Live Google setup and the acceptance exercise in UPGRADE_STAGE6.md remain necessary on the user's account. A passing simulated flow is not evidence of real consent, API enablement, publishing approval, calendar visibility, or notification delivery.

## Automated coverage

All 54 Stage 1-5 tests pass, retaining exact scheduling/overlap/layout, local-date/timezone checks, authentication/password flows, categories/settings, transactional recurrence and templates, global search, task movement/review/progress/history, CSV safety, PDF generation, ICS recurrence/timezone boundaries, and ownership checks.

Stage 6 adds 28 tests:

- Optional/strict Google configuration and authenticated owner-bound token encryption.
- Session/origin enforcement and disabled-integration behavior.
- Hashed state, encrypted PKCE, browser binding, single-use callbacks, and token privacy.
- Denied/expired/insufficient-scope/malformed callbacks, missing offline tokens, foreign states, and logout during OAuth.
- Exact Dhaka local/UTC event times, 10-minute alarms, quiet completed tasks, and stable repeated update identities.
- Google-side managed-field edits being overwritten by the next one-way sync.
- Bucket/deleted tasks removing only their mapped event and being scheduled again later.
- Previously mapped date/category scopes following tasks moved outside the selected scope.
- Independent recurring occurrences, exact exceptions, deletions, and no resurrection.
- Recovery after insertion succeeded but its HTTP response was lost.
- Remote-event deletion tombstones receiving a new stable ID.
- Foreign/mismatched remote markers failing without overwrite/delete.
- Per-task partial failure, redacted provider errors, and retry of only failed items.
- Bounded 429 retries, refresh-token revocation, rotated-token encryption, and changed-key recovery.
- Saved progress, prevention of overlapping run creation, leases after interruption, ownership, and cancellation.
- Concurrent step requests processing distinct items without duplicate events.
- Aborted HTTP clients retaining the Google write lock until the external mutation settles.
- Uncertain calendar creation not being blindly retried and recovery through a verified calendar ID.
- Disconnect removing credentials, retaining remote events, and same-account reconnect retaining mappings.
- Local disconnect even after the installation's Google configuration is removed.
- Explicit disconnect before switching Google accounts and separate calendar generations afterward.
- Missing calendars being recreated only through explicit reconnect.
- Invalid ranges/categories, valid empty selections, and rejection above 5,000 task links.
- Persistent 401 responses after refresh becoming a safe reconnect state.

The fake provider implements OAuth/token/userinfo/revocation and calendar/event HTTP shapes with explicit failures. Tests inspect serialized API responses for token/provider-body leakage and compare stable remote identities and exact UTC schedules. The application has no production fake-provider route or environment-controlled alternate provider URL; test injection is in the app-factory configuration only.

## Browser checks

Used the real React frontend, Express API, a disposable MongoDB replica set, and headless Chromium with web security enabled. Browser navigation to Google's consent URL was intercepted and redirected to the real local callback using the saved state, while server-side Google requests used the fake provider.

Verified:

- Actual task creation and the Google Calendar sidebar/dialog.
- Initial disconnected state, simulated consent navigation, callback, and connected Google email.
- First sync, exact 09:15-09:55 Dhaka time, repeated unchanged sync, and an edited title updating the same event.
- Multi-task pause, dialog close/reopen, saved remaining progress, and resume without duplicates.
- A visible provider failure and a successful failed-item retry.
- A 390 x 844 mobile viewport without page-level horizontal overflow.
- Disconnect cancellation/confirmation and preservation of the six test events.
- No uncaught browser JavaScript errors in the successful workflow.

The Stage 5 browser regression workflow checks actual PDF/CSV/ICS downloads, scoped previews, exact times, filters, disabled/default alarms, month bounds, invalid/empty ranges, mobile layout, and keyboard dismissal with the optional Google integration unconfigured.

Internal browser screenshots were inspected and are not bundled as deliverables. The earlier Stage 5 independent CSV/ICS parsers and rendered PDF acceptance checks remain documented in UPGRADE_STAGE5.md and covered by its existing tests; Stage 6 does not change those exporters.

## Upgrade validation

The installer is checked against both original and dependency-fixed Stage 5 sources. Checks cover exact final source hashes, private `.env` preservation, source backups, idempotent reapplication, refusal of edited/missing code, refusal of corrupted bundled source, and backup/replacement of a locally edited ROADMAP.md. Known package-JSON key-order/format differences are accepted only when their parsed content matches a known supplied baseline. Unknown dependency edits remain conflicts.

The archive contains complete current source and the installer/guide, excludes `.env`, dependency/build directories, runtime mail, backups, and screenshots, and passes ZIP integrity verification. The installer does not access the database.

## Practical limits

Real macOS/Atlas execution must be checked on the user's device. Google Cloud settings, live authorization, Google's current consent/publishing policies, and actual alerts remain user-account-dependent acceptance items.

Sync is manual and one-way, bounded to 366 days and 5,000 selected/mapped task links. Recurrence is expanded into independent events. Closing the page pauses after an in-flight item settles; there is no unattended background worker. A three-minute lease protects an interrupted step. The current account-write design assumes one Node process; multi-process deployment needs database-coordinated account serialization.

A selected range also reconciles previously mapped placements: moved tasks may update to a current date/category outside that selection. Google-only fields not managed by Planora and unlinked events are not imported into Planora. Disconnect retains the remote calendar/events and removes local tokens; unsuccessful provider revocation is reported for manual Google Account removal.

Browser reminder delivery, admin controls, final live acceptance, deployment, accessibility review, and project documentation remain in ROADMAP.md.
