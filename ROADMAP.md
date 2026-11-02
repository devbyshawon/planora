# Planora completion roadmap

This checklist maps the current release to the proposal. Partial means the listed initial functionality exists, with remaining work spelled out below. It does not mean the full proposal requirement is complete.

Current delivery: **Stage 8 plus custom-slot correction (v0.8.1) — code and delivery package prepared**. Complete the live deployment/account/device checklist in `docs/ACCEPTANCE.md` before declaring the public deployment accepted. Stage 1 local setup/repository tasks and real external delivery are not automatically marked by a release.

## Common workflows

| Requirement               | v0.8.1 status                          | Remaining                                                                 |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| Registration/login/logout | Implemented through Stage 7 | Real SMTP delivery acceptance on your mailbox            |
| Admin accounts/settings   | Implemented in Stage 7 | Local first-admin setup and account-level acceptance |

## The twelve counted features

| Feature                        | v0.8.1 status            | Remaining                                                                                                  |
| ------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1. Custom-time task scheduling | Core implemented       | Exact-time browser/API checks retained; live device exercise remains                                                     |
| 2. Daily/weekly/monthly views  | Core implemented       | Task-defined Day/Week rows and mini-month implemented; final phone/keyboard exercise remains                                 |
| 3. Recurring tasks/templates   | Implemented in Stage 3 | No pending core work; see UPGRADE_STAGE3.md for generation and edit policies                               |
| 4. Categories/priority/search  | Implemented in Stage 3 | No pending core work; search is paginated and bounded to the selected date range                           |
| 5. Completion tracking         | Implemented in Stage 4 | Quick completion and ended-day review are implemented                                                      |
| 6. Bucket list                 | Implemented in Stage 4 | Search/category/priority, age filtering, selectable sorting, and retained counts                           |
| 7. Rescheduling                | Implemented in Stage 4 | Form and native desktop drag-and-drop; earlier history starts at this update                               |
| 8. Progress summary            | Implemented in Stage 4 | Daily/weekly/monthly metrics, category/date drill-down, history, period streaks                            |
| 9. PDF/CSV schedule downloads  | Implemented in Stage 5 | Day/week/month/custom range, category/status filters, safe CSV, Unicode PDF agendas |
| 10. Google sync                | Implemented in Stage 6 | Google Cloud configuration, live consent/API/notification acceptance; see UPGRADE_STAGE6.md |
| 11. ICS with alerts            | Implemented in Stage 5 | Bounded snapshots with stable UIDs, repeat rules/exclusions, timezone definitions, configurable alerts |
| 12. Reminders/settings         | Implemented in Stage 7 | Open-page browser reminders; real OS delivery acceptance required; closed-browser push is outside this release |

## Recommended implementation sequence

### Stage 1 — Run and understand this foundation

- [ ] Run the app on your Mac with Atlas.
- [ ] Complete the exercise in START_HERE.md.
- [ ] Run the automated checks.
- [ ] Create your own GitHub repository and commit the source without `.env`.

### Stage 2 — Identity and organisation (implemented)

- [x] Password change with current-password verification and session revocation.
- [x] Recovery using hashed, expiring, single-use reset tokens; local previews and configurable SMTP delivery.
- [x] Profile and account-saved settings with timezone/clock/week-start/appearance validation.
- [x] User-owned embedded category records and CRUD; existing category IDs retained.
- [x] Global search with date/category/priority/status/text filters completed in Stage 3.

### Stage 3 — Global search, recurrence, and reusable tasks (implemented)

- [x] Separate RecurrenceSeries and occurrence Task records.
- [x] Generate a bounded range of occurrences using a stable series/date identity and unique index.
- [x] Support daily, selected weekdays, weekly, monthly, and optional end dates.
- [x] Treat “this occurrence” and “whole series” edits/deletions as separate workflows.
- [x] Define monthly rules for dates such as the 31st; preview skipped dates explicitly.
- [x] Preserve individual occurrence completion and bucket history.
- [x] Add Template model, editor, and insertion workflow.

### Stage 4 — Review and progress (implemented)

- [x] Transition-history records for bucket movements and rescheduling.
- [x] End-of-day review based on the user's local date, with explicit choices; never silently move tasks.
- [x] Daily/weekly/monthly totals, category breakdowns, planned vs completed elapsed time.
- [x] Define streaks consistently, including days with no scheduled tasks.
- [x] Drag-and-drop rescheduling with the same server-side overlap warning workflow.

### Stage 5 — Exports (implemented)

- [x] Implement authenticated range queries shared by PDF, CSV, and ICS.
- [x] Include exact local times, timezone, category, status, selected range, and generation date.
- [x] Escape CSV correctly and neutralise spreadsheet-formula injection.
- [x] Render and inspect daily, weekly, and monthly PDFs.
- [x] Use stable ICS UIDs, recurrence rules/exception dates, and `VALARM` reminders.
- [x] Validate exported files using independent parsers.

### Stage 6 — Google Calendar (implemented; live account setup required)

- [ ] Configure your Google Cloud project, Calendar API, OAuth client/audience/test users, and private environment settings.
- [x] Use the app-created-calendar scope plus basic identity; browser-bound, single-use OAuth state, PKCE, and server-owned callbacks.
- [x] Encrypt refresh tokens with a dedicated AES-GCM key and exclude tokens from application responses.
- [x] Persist task-to-event mappings and handle repeated creates/updates/deletes without duplicate normal events.
- [x] Sync day/week/month/upcoming/custom ranges with exact stored UTC instants and IANA timezone.
- [x] Attach 10-minute popup reminders to non-completed tasks; save per-task results with pause/resume/retry.
- [x] Define disconnect, uncertain creation, tombstone recovery, Google edits, and individual recurring-occurrence behavior.
- [ ] Complete the real-account live acceptance exercise in UPGRADE_STAGE6.md, including actual device reminder delivery.
- This is manual, one-way Planora -> Google; two-way reconciliation and unattended background sync are outside this stage.

### Stage 7 — Reminders and administration (implemented; local acceptance required)

- [x] Explicit button action requests notification permission; account/browser opt-in remains separate.
- [x] Open-page reminders use server time, a two-minute due window, current-state validation, and atomic per-browser delivery claims across tabs.
- [x] Save enable/lead settings to the account; never enable notifications by default.
- [x] Protected administrator role plus a separate 15-minute current-password unlock.
- [x] Local role setup/revocation, concurrent last-admin protection, and session revocation.
- [x] Suspend/reactivate normal accounts while retaining their planner data; metadata-only account administration.
- [x] Registration/reminder site controls, revision-checked new-account defaults, and administrative audit records.
- [x] Hashed, expiring, single-use email verification links; email changes invalidate prior verification.
- [ ] Observe actual browser/macOS task alerts and mail delivery using UPGRADE_STAGE7.md.
- Closed-browser push, guaranteed OS delivery, and unattended background jobs are outside this stage.

### Stage 8 — Delivery (local code validation complete; live acceptance remains)

- [x] Trace all twelve features to code/automated checks in docs/ACCEPTANCE.md.
- [x] Add a mini-month navigator and richer calendar task details without rounding times.
- [x] Correct the custom-slot interpretation in v0.8.1: actual task-defined rows, compact gaps, independent week columns, and 30/60/120-minute shortcuts with arbitrary editable times.
- [x] Review exercised accessibility/mobile states; correct text/button contrast and support reduced motion.
- [x] Retain recurrence/timezone, ownership, session, origin, and secret-handling regression checks.
- [x] Add production environment validation, reproducible Node selection, health checks, and a real-startup smoke script.
- [x] Supply Render deployment configuration and optional Vercel API-proxy template with a documented cookie/origin strategy.
- [x] Add optional HTTPS account-email delivery for hosts that block SMTP.
- [x] Document production variables, OAuth callback, free-host sleep/transport limits, single-process constraints, and operations.
- [x] Provide project report, MVC/data diagrams, API reference, demo script, screenshot capture guide, and GitHub check workflow.
- [ ] Deploy and complete real-account/device acceptance; check actual mail, Google, ICS, OS alerts, and your phone.
- [ ] Capture sanitized final screenshots and incorporate them into your required submission template.
- [ ] Confirm production database backup/restore and hosting/proxy settings on your accounts.

The release is ready for local installation and staging acceptance. No public deployment or actual external-delivery certification is claimed by the package.

## Acceptance checks to retain throughout

- A 09:15–09:55 task always retains that precise range and elapsed duration.
- Adjacent tasks do not trigger an overlap warning.
- Overlap consent is explicit and honoured by both UI and API.
- No account can read or mutate another account's tasks, categories, templates, exports, or OAuth tokens.
- A recurring occurrence has its own status and retains its identity after rescheduling.
- Moving a task between calendar and bucket does not lose notes, priority, or original schedule.
- Repeating a Google sync updates the same remote event.
- Exported reminders fire at the intended local time, including across timezone transitions.
