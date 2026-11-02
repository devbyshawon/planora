# Stage 5: PDF, CSV, and ICS downloads

Version **0.5.0** adds schedule exports to Stage 4. Existing accounts, tasks, recurring rules, templates, categories, history, saved settings, and `server/.env` are retained. No database migration or new environment variable is required.

## Install on your Mac

Stop the app with **Control+C**. Extract `Planora_Stage5_Update.zip` into Downloads. From your **existing planora project folder**, run:

```bash
node ~/Downloads/Planora_Stage5_Update/apply-stage5.mjs .
npm ci
npm test
npm run build
npm run dev
```

The installer supports the supplied Stage 4 source (v0.4.0) or an already-applied Stage 5 update. It checks source hashes before writing, creates a backup under `.planora-backups/`, and refuses edited/missing source files. It never reads or writes your database or `.env`. If a source conflict is listed, keep the file and share its name so the change can be merged.

Expected: **54 passing tests**, a successful build, and the app at **http://localhost:5173**. Earlier releases must apply their updates in sequence before Stage 5. The bundled `planora/` folder is also the complete current source for a fresh installation; see START_HERE.md.

## Download your schedule

1. Sign in and choose **Download schedule** in the sidebar.
2. Choose **PDF**, **CSV**, or **ICS**.
3. Choose a reference date and **Day**, **Week**, or **Month**, or choose **Custom range**.
4. Optionally filter by category and task status. These export controls are independent of the sidebar's calendar filters.
5. Decide whether to include notes. For ICS, choose a reminder or no reminder.
6. Check the task count, total planned time, exact date range, timezone, and any scheduling warnings.
7. Click **Download PDF/CSV/ICS**.

Week follows the account's saved week-start preference. Month includes only dates in that month, not neighboring dates shown in the calendar grid. Dates are interpreted in the planner timezone, regardless of the computer's timezone. Files use exact 24-hour start/end times.

Exports include **current calendar tasks**, including completed/not-completed tasks when selected. Bucket items, deleted occurrences/tasks, and other accounts' records are excluded. Previously planned dates in history are not separate rows. A moved task appears at its current date and time. Overlapping task durations are added individually; totals do not measure unique clock time or time actually worked.

A range can include at most **366 days** and **5,000 tasks**. A larger result is refused rather than truncated. Choose a smaller range or category. An empty range produces a valid empty file: CSV headers, an empty ICS calendar, or a PDF explaining that no tasks matched.

The preview and the actual download query the latest data separately. Changes in another tab between the two requests can change the final task count. The success message reports the downloaded count.

## PDF agenda

Daily, weekly, monthly, and custom-range agendas group tasks by date. Every task includes its full title, exact start/end, elapsed minutes, category, priority, and status. Notes are included only when checked and continue onto later pages without truncation. Headers contain the range, timezone, selected filters, and generation time; footers contain page numbers.

PDFKit and Noto fonts are installed through `npm ci`; no external fonts or Python are needed on your Mac. Latin and Bengali text are supported. Characters missing from the included font subsets are printed as `[U+XXXX]` codes instead of invisible boxes. CSV and ICS retain the original Unicode text. Bengali visual shaping is supported; copied text can follow glyph order in some PDF readers.

PDF uses an agenda layout for reliable printing of overlapping tasks and long notes, rather than shrinking a month grid until its text becomes unreadable.

## CSV spreadsheet

CSV contains one row per task with its ID, title, date, exact local times, elapsed minutes, timezone, UTC start/end, category name, priority, status, optional notes, series ID/original recurrence date, export range, and generated UTC time.

The file uses UTF-8 with a BOM, CRLF record separators, and quoted cells. Commas, double quotes, and multiline notes are escaped. Text beginning with formula characters (`=`, `+`, `-`, `@`), including after whitespace/control prefixes, receives a leading apostrophe. This is an intentional spreadsheet safety transformation; it may remain visible in plain-text readers. Empty CSVs contain the header row only.

## ICS calendar and alerts

Open/import the `.ics` file in a compatible calendar app. It contains only the selected range, not an unbounded future schedule.

- Exact timestamps for independent tasks use UTC; descriptions retain the planner timezone and selected range.
- Unchanged scheduled occurrences are grouped by their original daily/selected-weekday/weekly/monthly rule, bounded by the selected end date and the series end date.
- A VTIMEZONE component supplies timezone offsets/transitions covering the export and surrounding years. Regular recurrence stays at the intended local clock time across changes.
- Deleted, bucket, filtered-out, edited, completed, invalid, or otherwise omitted nominal slots are excluded using EXDATE where a grouped rule exists.
- Changed/completed occurrences, preserved old-rule tasks, moved-in occurrences, and dates whose elapsed duration differs because of a clock change are independent exact events. This prevents a recurring rule from recreating their old slot or giving them an incorrect end time.
- Monthly rules on the 31st skip months without that date, matching Planora.
- Nonexistent and ambiguous clock-change occurrences are omitted under Planora's existing generation policy and reported as warnings.
- Planora completion is stored in the description and `X-PLANORA-STATUS`. VEVENT uses `STATUS:CONFIRMED`; iCalendar's VEVENT status is not a task-completion field.
- UID values are deterministic: unchanged grouped rules use account/series IDs; independent events use account/task IDs. They remain stable for repeated equivalent exports. Changes between grouped and independent representation can change the applicable UID.
- Alerts use `VALARM`, `ACTION:DISPLAY`, and a relative start trigger. Default is **10 minutes before**; options include at start, 5/15/30/60 minutes, or none. Completed tasks never receive alerts.

**ICS is a snapshot, not live sync.** Importing another range or a later snapshot can replace/truncate a series, duplicate events, or leave previously imported events behind, depending on the calendar app. Stable UIDs do not guarantee how a client imports files. Use a separate calendar for each snapshot or remove the prior imported snapshot before replacing it. Google API synchronization with update/delete handling comes in Stage 6.

The receiving calendar controls notification permissions, device settings, and whether imported alarms are honored. Generating a valid alarm does not itself guarantee a notification. Stage 5 does not add browser notifications inside Planora.

## Acceptance exercise

1. Create a task at **09:15-09:55**, another in a different category, and a completed task.
2. Download the selected day in all three formats. Verify the first task's local range and 40-minute duration.
3. Filter one category/status and verify the preview and files exclude the others.
4. Move a task to the bucket and delete one occurrence. Verify neither appears in the next export.
5. Export a week/month containing a recurring task, an edited occurrence, and a rescheduled occurrence. Verify the imported file matches the selected calendar range without recreating the old slots.
6. Choose ICS with 10-minute reminders and inspect the imported reminder; then download with no reminder.
7. Try a date range with no tasks and a range longer than 366 days.
8. Confirm task creation, daily review, progress/history, templates, recurring edits, and account settings still work.

## API additions

Both endpoints require the existing authenticated session cookie and the `Origin` / `X-Planora-Client: web` protections. POST is used because exports can materialize missing recurring dates; requests share the existing per-account write serialization.

| Method | Endpoint | Response |
| --- | --- | --- |
| POST | `/api/exports/preview` | Task count, exact total minutes, range, timezone, generation time, warnings |
| POST | `/api/exports/download` | Attachment: PDF, CSV, or ICS |

Common body: `from`, `to` (ISO local dates); optional `period` (`day`, `week`, `month`, `custom`, default `custom`), owned `category`, `status`, `includeNotes` (boolean, default true), and `reminderMinutes` (integer 0-1440 or null for none; default 10). Download also requires `format` (`pdf`, `csv`, `ics`). The explicit from/to range is authoritative; period labels the file. The UI calculates aligned day/week/month bounds.

Attachments include `X-Planora-Task-Count` and `X-Planora-Warning-Count`. Responses are not cached. Filenames use only validated dates and fixed period/format values.

Independent checks use CSV-Parse and ICAL.js in the automated suite, plus PDF text/layout inspection and Python CSV/iCalendar parsers during release QA. See VALIDATION.md for actual results.

## Next

Stage 6: Google Calendar OAuth, selected-range synchronization, stable remote-event mappings, retries/status, and disconnect behavior. Browser reminder delivery, admin controls, deployment, and final project documentation remain later stages.
