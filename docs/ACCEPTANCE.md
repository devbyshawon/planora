# Release acceptance and evidence

Version 0.8.1 custom-slot correction to Stage 8, prepared 1 November 2026. Code validation and live external acceptance are separate. This package has not been deployed into your accounts by the build environment.

## Reproduce local checks

From the project root:

```bash
npm ci
npm run verify
npm audit
```

`verify` runs the shared/server tests, production build, and `smoke:production`. Tests and the smoke script create disposable MongoDB replica sets; they do not load your Atlas database as their test target. The first run may download a MongoDB binary. Keep internet access available. The smoke script starts the real server entry point with an isolated URI and explicit test settings, serves the built app, and shuts it down afterwards.

## Twelve-feature acceptance map

| Feature | Code/automated evidence | Live exercise |
| --- | --- | --- |
| 1. Exact-time scheduling | `shared/calendar.test.js`, `shared/slots.test.js`, `api.test.js`, `schedule.test.js`; exact placement browser check | Create 09:15–09:55; verify 40m, adjacency, explicit overlap consent |
| 2. Day/week/month | Browser checks across all views, mini-month date selection, mobile overflow | Change saved week start, select dates, use keyboard and your phone |
| 3. Recurrence/templates | `recurrence.test.js`, `stage3.test.js`; stable occurrences and edit exceptions | Monthly 31st, selected weekdays, individual and whole-series edits |
| 4. Categories/priority/search | `stage2.test.js`, `stage3.test.js`; private CRUD and literal/filter/pagination checks | Custom category, notes search, high-priority filter |
| 5. Completion | Task lifecycle, independent recurring statuses, closed-day review tests | Complete one task; verify summary and a different occurrence remain correct |
| 6. Bucket | Stage 3/4 private bucket/search/history checks | Move a task to bucket, edit notes, sort, reschedule |
| 7. Rescheduling | `stage4.test.js`, tracking tests; stale/overlap rejection leaves history unchanged | Form edit and desktop drag/drop; confirm minute precision and history |
| 8. Progress | `stage4.test.js`, `tracking.test.js`; original-day ledger, exact minutes, streak boundaries | Inspect daily/weekly/monthly totals and category drill-down |
| 9. PDF/CSV | `exports.test.js`; escaping, ownership, filters, limits; independent parser/format checks | Download day/week/month; visually inspect your Unicode notes |
| 10. Google | `google.test.js` plus simulated provider browser workflows | Real consent, exact event, repeat sync, change/remove, device alert |
| 11. ICS alerts | Independent ICS parser tests for rules, exclusions, DST, UTF-8, alarms | Import into intended calendar app and observe actual alarm |
| 12. Reminders/settings | `stage7.test.js`, `reminder-worker.test.js`; server-time, claims, permissions/state | Keep Planora open; observe one OS alert across two tabs, then disable |

Account/admin acceptance additionally covers registration closure, role escalation rejection, password unlock, current session invalidation, suspension/reactivation, last-active-admin concurrency, new-account-only defaults, audit metadata, and expiring/single-use recovery/verification tokens. Stage 8 tests cover startup environment validation and HTTPS mail request/error handling.

## Local release result

- M1/M2 check on 2 November 2026: **125 passed** (10 shared + 115 server/worker), no failures. See `VALIDATION.md` for the current runtime and the boundary between this run and historical browser evidence.
- Vite production build: passed.
- Real production-entry-point smoke: passed for database readiness, static app/assets, SPA fallback, unknown API JSON, CSP, Secure/HttpOnly/SameSite cookies, origin/header rejection, and logout revocation.
- Stage 6/7 browser regression exercises: simulated Google provider and controlled Notification interface; these do not certify live external delivery.
- Stage 8 browser checks: actual task-defined rows, duration shortcuts, compact gaps, independent week columns, overlaps/dragging and day/week/month, keyboard dialog dismissal, reduced-motion support, mobile overflow, and automated accessibility review.
- Dependency audit: no reported vulnerabilities at the release check. This is time-specific and does not prove the absence of every security defect.

Automated accessibility checks are limited to the exercised screens and states. They do not certify WCAG conformance, a complete screen-reader review, touch ergonomics on every device, or arbitrary user-chosen category colors.

## Required live acceptance before calling the public deployment accepted

Leave these unchecked until you observe the real result; an installer must not mark them for you.

- [ ] Deploy the intended commit; `/api/health` returns 200 on the canonical public origin.
- [ ] Register/login, reload the page, and logout on that origin; no cookie loops or HTML responses for API errors.
- [ ] Test a second account: it cannot read/edit the first account's task IDs, categories, templates, history, exports, or Google state.
- [ ] Send recovery and verification to your own mailbox through the configured production provider; consume once and reject reuse. Confirm final inbox delivery, not just provider acceptance.
- [ ] Grant your admin role with the operator CLI; unlock, suspend/reactivate a test account, inspect defaults/audit, and lock again.
- [ ] Connect real Google, repeat/update sync without duplicates, and complete the Stage 6 exercise.
- [ ] Observe browser/macOS task alerts, cross-tab behavior, and permission denial/revocation using the Stage 7 exercise.
- [ ] Import an ICS snapshot and observe its calendar-app alarm.
- [ ] Test your Samsung/other phone and Mac browser, light/dark modes, keyboard navigation, and readable zoom. Use the form workflow where native drag/drop is unavailable.
- [ ] Capture sanitized final screenshots using `SCREENSHOT_GUIDE.md` and attach them to your academic report/demo as required.
- [ ] Check backups/restore, secret exclusions, provider limits, service sleep behavior, and canonical OAuth callback.

## Release decision

The package is ready for local installation and staging/deployment acceptance. Public readiness depends on the live checklist above. There is no claim of guaranteed closed-browser notifications, bidirectional Google sync, horizontal scaling, or an externally audited security certification.
