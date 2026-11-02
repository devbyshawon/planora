# Planora API reference

Base prefix: **`/api`** on the same browser origin. JSON request bodies use `Content-Type: application/json`. State-changing requests require exact `Origin: <APP_ORIGIN>` and `X-Planora-Client: web`. Sessions are cookies, not localStorage bearer tokens. API responses use `Cache-Control: no-store`.

Errors use `{ "error": { "code": "...", "message": "...", "details": {} } }`; details are optional. Common statuses: 400 invalid input, 401 missing/revoked session, 403 origin/role/unlock policy, 404 inaccessible record, 409 overlap/stale state, 413 bounded query/body limit, 429 rate limit, 503 unavailable mail/provider. Successful deletes/logout generally use 204. Do not parse JSON from an empty 204 response.

## Public and account workflows

| Method | Path | Access / input |
| --- | --- | --- |
| GET | `/health` | Public database readiness; 200 or 503 |
| GET | `/public/settings` | Public registration flag/default timezone/reminder policy |
| POST | `/auth/register` | Public; name, email, password, optional valid timeZone; registration policy enforced |
| POST | `/auth/login` | Public; email/password; suspended accounts rejected |
| GET | `/auth/me` | Session; safe current user |
| POST | `/auth/logout` | Session; revokes sessions; 204 |
| POST | `/auth/change-password` | Session; currentPassword/newPassword; keeps new current session, revokes others |
| POST | `/auth/forgot-password` | Public; email; generic response, rate-limited |
| POST | `/auth/reset-password` | Public; token/newPassword; atomic single-use token |
| POST | `/auth/request-verification` | Session; current email, rate-limited |
| POST | `/auth/verify-email` | Public; token; consumes valid link once; no automatic sign-in |
| PATCH | `/account/profile` | Session; name/email; email changes require currentPassword |
| PATCH | `/account/settings` | Session; known preference fields/timeZone; timezone migration is transactional |
| GET/POST | `/account/categories` | Session; list/create owned name/color category |
| PATCH/DELETE | `/account/categories/:id` | Session; owned category; in-use deletion rejected |

Settings: theme `light/dark`, timeFormat `12h/24h`, weekStartsOn `0/1`, showHourGuides boolean, defaultView `day/week/month`, reminderMinutes integer 0–1440, remindersEnabled boolean, timeZone valid IANA name. Changing timezone preserves local task clock values and rejects invalid migrated slots atomically. Verification is cleared on email change.

## Tasks, repeat rules, and templates

All paths below require a session. Inaccessible task/template/series IDs return 404.

Calendar and bucket list requests return at most 5,000 tasks. Larger results fail with `413 TASK_LIST_TOO_LARGE`, not partial success. Use the 50-per-page search endpoint to manage large collections. History responses contain 50 events per page plus the total; paging is projected in MongoDB.

| Method | Path | Purpose / options |
| --- | --- | --- |
| GET | `/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD` | Inclusive date range, bounded recurrence generation |
| GET | `/tasks?location=bucket` | Owned bucket items |
| GET | `/tasks/search` | q/from/to/category/priority/status/location/page; literal text matching, 50 per page |
| GET | `/tasks/:id` | Current owned task |
| GET | `/tasks/:id/history` | Stable page-numbered movement history; 50 per page |
| POST | `/tasks` | Create calendar task or bucket idea |
| PATCH | `/tasks/:id` | Edit, complete, bucket, reschedule; include current expectedUpdatedAt |
| DELETE | `/tasks/:id` | Delete task/occurrence; preserves suppression/history policies |
| GET/POST | `/series` | List/create owned repeat definitions |
| GET/PATCH/DELETE | `/series/:id` | Inspect/update/delete whole series with exception policies |
| GET/POST | `/templates` | List/create personal reusable task values |
| PATCH/DELETE | `/templates/:id` | Update/delete owned template |
| POST | `/templates/:id/apply` | Date plus optional task overrides/allowOverlap; `location` defaults to calendar or may be bucket (no date required); creates independent task |

Example create body:

```json
{
  "title": "CascadeVLM reading",
  "date": "2026-11-03",
  "startTime": "09:15",
  "endTime": "09:55",
  "notes": "Review the image encoder.",
  "priority": "high",
  "status": "scheduled",
  "location": "calendar"
}
```

Category may be omitted to use the account's first category; otherwise use an ID returned by that account's category API. Task status is `scheduled`, `completed`, or `not_completed`; priority is `low`, `medium`, or `high`; location is `calendar` or `bucket`. Dates/clock values are interpreted in the account's saved IANA timezone. Do not supply owner or computed UTC/duration fields.

On an overlap warning, show the conflicts to the user. Resubmit with `allowOverlap:true` only after explicit consent. Read the latest task version before editing and include `expectedUpdatedAt`; a stale operation must be refreshed rather than blindly retried. A repeat rule in the series request uses date as its start date and frequency `daily`, `weekdays`, `weekly`, or `monthly`, startTime/endTime, optional inclusive endDate, and weekdays 1=Monday through 7=Sunday. See the Stage 3 guide for full-series reconciliation policies.

## Review, progress, and exports

| Method | Path | Purpose / input |
| --- | --- | --- |
| GET | `/insights/review?date=YYYY-MM-DD` | Reviewable tasks from an ended local date |
| POST | `/insights/review/:id` | date, action `keep/bucket/delete`, expectedUpdatedAt |
| GET | `/insights/progress?from=...&to=...&category=...` | Historical daily totals/category breakdown, exact minutes, streaks |
| POST | `/exports/preview` | from/to, period `day/week/month/custom`, optional category/status/includeNotes/reminderMinutes |
| POST | `/exports/download` | Same filters plus format `pdf/csv/ics`; attachment response |

Exports are calendar-only and bounded to 366 days and 5,000 tasks; oversize queries fail rather than silently truncate. A null ICS reminderMinutes disables alarms; 0–1440 enables a lead. Downloads return Content-Disposition, X-Planora-Task-Count, and X-Planora-Warning-Count. Range/filter ownership is shared across preview and every format.

## Google Calendar

All paths require a session. Mutations require origin/header protection. Callback is a top-level GET using browser-bound state/PKCE.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/google/status` | Optional configuration, connection/calendar readiness, latest run |
| POST | `/google/connect` | Start fixed-provider OAuth |
| GET | `/google/callback` | Browser-bound, single-use OAuth completion |
| POST | `/google/calendar` | Explicit calendar setup/recovery/adoption |
| POST | `/google/disconnect` | Remove local credentials, attempt revocation, retain Google events |
| POST | `/google/sync` | from/to and optional owned category; persistent bounded job |
| GET | `/google/jobs/:id?page=1` | Owned results, 50 per page |
| POST | `/google/jobs/:id/step` | Process at most one task |
| POST | `/google/jobs/:id/retry` | Retry failed items |
| POST | `/google/jobs/:id/cancel` | Cancel remaining steps; completed external writes remain |

Refer to UPGRADE_STAGE6.md for prior-range reconciliation, tombstones, uncertain inserts/calendars, recurring occurrence mappings, and live acceptance.

## Reminders and administration

| Method | Path | Access / purpose |
| --- | --- | --- |
| GET | `/reminders/upcoming` | Session; enabled policy, serverTime, current owned candidates |
| POST | `/reminders/claim` | Session; taskId/deviceId/key; current-state due check, unique claim |
| GET | `/admin/access` | Admin role; unlock state only |
| POST | `/admin/unlock` | Admin role; current password, separate 15-minute cookie |
| POST | `/admin/lock` | Admin role; clear unlock cookie |
| GET | `/admin/summary` | Admin + unlock; account totals |
| GET | `/admin/users?q=&status=&role=&page=1` | Admin + unlock; metadata only, 25 per page |
| PATCH | `/admin/users/:id/status` | Admin + unlock; status/expectedUpdatedAt; self/admin targets blocked |
| GET/PATCH | `/admin/defaults` | Admin + unlock; shared policies/defaults; PATCH expectedRevision |
| GET | `/admin/audit?page=1` | Admin + unlock; 50 metadata audit entries per page |

Reminder device IDs are 16–100 alphanumeric/underscore/hyphen characters, and keys are 64 lowercase hex characters from upcoming candidates. Claims recheck owner, current calendar status/time, due window, account preference, and global policy. A duplicate claim returns `claimed:false`; a new claim returns 201 with current notification text. This is not a push delivery receipt. Roles are managed only by the local CLI, not an HTTP endpoint.
