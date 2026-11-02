# Planora — A Custom-Time Daily Planner

**Author:** MD. Shawon Hossain  
**Department:** Computer Science and Engineering, BRAC University  
**Release:** 0.8.0, Stage 8 delivery  
**Date:** 1 November 2026

## Abstract

Planora is a MERN personal planning application that schedules tasks at exact local minute ranges rather than forcing hourly slots. It combines daily, weekly, and monthly calendars with repeat rules, reusable templates, a bucket for unfinished ideas, explicit review decisions, historical progress, schedule downloads, Google Calendar synchronization, and opt-in browser reminders. Accounts own their records and settings. A separate administrator workflow manages account status and shared defaults. This report describes the delivered implementation and its acceptance boundaries; deployment and actual external notification/mail delivery must be validated with the owner's accounts and devices.

## Problem and objectives

Real activities may start at 09:15 and finish at 09:55. Rounding them to a fixed slot loses timing detail. Unfinished work also needs a retained identity and history rather than repeated manual recreation. Planora addresses these needs by preserving exact schedules, requiring explicit overlap consent, separating calendar and bucket placement, tracking occurrence-level completion, and presenting progress based on historical daily plans.

The twelve functional objectives are exact-time scheduling, three calendar views, recurrence/templates, categories/priority/search, completion, bucket management, rescheduling, progress, PDF/CSV downloads, Google sync, ICS alarms, and reminders/settings. Authentication, verification/recovery, ownership, and protected administration support these features. The traceability table is in `ACCEPTANCE.md`.

## Technology and architecture

The frontend uses React, Vite, date-fns, and Lucide icons. Node/Express handles the API, Mongoose persists MongoDB records, and Luxon validates civil times and IANA timezone transitions. Bcrypt hashes passwords; signed HttpOnly cookies carry versioned sessions. PDFKit with bundled Unicode fonts renders PDF agendas. CSV/ICS generators and Google OAuth/Calendar utilities run on the server. Email supports development previews, TLS SMTP, and an HTTPS provider option.

The MVC/data diagrams and coordination rules are in `ARCHITECTURE.md`. Deployment can use one Render origin for both UI and API, or a Vercel frontend with an explicit same-origin API proxy. The supplied design runs one Node process.

## Data and implementation decisions

A Task stores its owner, local date/clock values, UTC instants, exact elapsed duration, category/priority/status, calendar/bucket location, occurrence identity, exception/deletion markers, movement history, and per-date plan ledger. This lets a moved task keep its identity and notes. The account embeds private categories and preferences; new shared defaults apply at registration without rewriting existing accounts.

Repeat definitions are separate from generated Task occurrences. Bounded materialization and a unique occurrence index prevent duplicates. Monthly dates absent in a month are skipped, and individual exceptions/completed occurrences survive appropriate whole-series edits. DST gaps and ambiguous boundary times are rejected rather than silently choosing an offset.

Progress uses saved plan placements and exact durations. Empty days break defined streaks. Older records disclose the start of detailed history instead of fabricating prior movement events. Daily review is permitted only for an ended date in the saved timezone and requires an explicit keep/bucket/delete action.

Exports share one owned query/filter boundary. CSV handles quoting and formula-like input, PDF supports Unicode agendas, and ICS includes stable identities, timezone definitions, exclusions, and configurable alarms within a bounded snapshot. Google sync is manual one-way synchronization to a dedicated app-created calendar with persisted mappings, per-item outcomes, and pause/resume/retry.

Reminders require account opt-in, local browser permission, an open page, and current server eligibility. A unique per-browser claim prevents duplicate tab attempts; the OS may still reject or miss notification display. Google and imported ICS alarms are independent delivery systems.

## Security and account workflows

Owner filters are applied to private records. Password/email changes and logout revoke appropriate sessions. Recovery and verification links are hashed, expiring, and single-use. Production cookies are Secure/HttpOnly/SameSite=Lax, requests use a canonical origin and custom header, and API responses are not cached. Startup rejects invalid production origins and local preview mode.

Google authorization uses PKCE and single-use browser-bound state; refresh tokens are encrypted with an account-specific purpose binding. Administrator access requires both a server-checked role and a separate short current-password unlock. Role assignment is a local operator command, with last-active-admin protection. Suspension retains data and revokes sessions; admin account listings exclude private task content and secrets.

These controls reduce specific risks; they are not a claim that every possible vulnerability is absent. Keep provider packages/audits current and complete deployment-specific cookie/proxy/network checks.

## Validation

The release includes 115 shared/server/worker checks and a separate real-startup production smoke script. Tests cover exact timing/adjacency, overlap consent, tenancy, recurrence exceptions, transitions/history, review/progress boundaries, exports/encoding, Google mapping and retry behavior, reminder claims, roles/suspension/defaults, verification, startup validation, and HTTPS mail request/failure behavior.

Browser exercises cover planning views, mini-month selection, exact pixel placement, settings, mobile overflow, notification permission controls with a test double, protected administration, verification, and simulated Google workflows. Automated accessibility review guided contrast fixes and keyboard/mobile checks. Read `ACCEPTANCE.md` for evidence limits and the remaining real-account/device checklist.

## Delivery and demonstration

The release contains source, a safe upgrade installer, deployment configurations, CI checks, API documentation, this report, architecture diagrams, acceptance criteria, a screenshot capture guide, and a timed demonstration script. `DEMO.md` provides the presentation sequence; `SCREENSHOT_GUIDE.md` specifies sanitized evidence to capture from the owner's final app.

## Limitations and future work

Tasks are within one day; overnight activities must be split. Recurrence/export/sync windows are bounded. Native drag/drop is intended for desktop; forms provide a mobile/keyboard alternative. Ordinary page notifications cannot guarantee closed-browser or sleeping-device delivery. Google is not two-way or continuously automatic. The in-memory account queue and rate limiter require a single Node process; scaling needs distributed coordination. Free hosting may sleep and restrict transport/network features. Actual SMTP/HTTPS inbox delivery, calendar imports, Google publishing/consent, and OS alerts require live acceptance.

Future work can add distributed locks/rate limiting, push infrastructure, broader assistive-technology/device testing, stronger operational backup/monitoring integration, and carefully designed two-way reconciliation. These are outside the delivered release's guarantees.

## Supporting references

See `API.md` for implemented endpoints, `ARCHITECTURE.md` for diagrams, `DEPLOYMENT.md` for official platform references/configuration, and `ACCEPTANCE.md` for test and live acceptance criteria. Earlier UPGRADE_STAGE2–7 guides retain detailed migration and integration policies.
