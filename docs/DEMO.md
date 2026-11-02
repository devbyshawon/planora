# Planora demonstration script

Use a demo account with fictional tasks. Prepare a separate test account for administration. Do not show `.env`, Atlas credentials, private email links, Google tokens, or real personal notes. For a short presentation, preconfigure Google/mail rather than performing provider setup on screen.

| Time | Demonstration | Explain |
| --- | --- | --- |
| 0:00–0:45 | Register/sign in; briefly show Profile/Preferences | Private account, saved timezone/week start, optional email verification |
| 0:45–2:00 | Create 09:15–09:55 task; add adjacent 09:55 task; try an overlap | Exact minutes, adjacency accepted, explicit overlap warning/consent |
| 2:00–2:45 | Change day/week/month; choose mini-month date; filter category/priority | Three views share the same task records and saved week policy |
| 2:45–3:45 | Create selected-weekday recurrence; complete one occurrence; edit another; apply template | Stable independent occurrences and reusable input |
| 3:45–4:45 | Move task to bucket, search it, reschedule, inspect history | Retained identity, notes, original placement and postponement count |
| 4:45–5:45 | Review a prepared ended date; show daily/weekly/monthly progress | Explicit review and historical plan outcomes, exact totals |
| 5:45–6:45 | Preview/download PDF/CSV/ICS for selected dates | Shared owned filters, Unicode PDF, safe CSV, calendar snapshot/alarms |
| 6:45–7:45 | Sync prepared Google connection; repeat sync; edit and resync | Dedicated calendar, one-way managed updates, no duplicate normal event |
| 7:45–8:30 | Settings → Reminders; explicit permission/test button; show saved enable/lead | Open-page requirement and separate Google/ICS alarms; show an actual scheduled alert only if observed |
| 8:30–9:30 | Admin unlock, suspend/reactivate test account, site defaults/audit, lock | Role plus current-password unlock; preserved data; metadata-only administration |
| 9:30–10:00 | Show release checks and limitations | Tests/build/smoke evidence; disclose live external acceptance boundaries |

Prepare one task on yesterday's date in the account timezone for review. Prepare a long task to show category/priority details and one short task to demonstrate precise duration. For a live alert, schedule it a few minutes ahead, keep the computer awake, and verify OS settings beforehand. If a provider is unavailable during the presentation, show the actual safe failure state and describe the tested simulated workflow; do not present simulated results as live provider success.

Useful examiner questions: Why retain both civil and UTC time? Why use separate series and occurrence records? How are repeated Google inserts prevented? Why is a delivery claim not a guaranteed notification? Why run one Node process? Refer to ARCHITECTURE.md and ACCEPTANCE.md.
