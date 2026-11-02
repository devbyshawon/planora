# Planora Stage 3 — recurring tasks, templates, and global search

Version **0.3.0** extends your existing Stage 2 project. Accounts, tasks, bucket history, profile settings, categories, mail configuration, and `server/.env` are preserved.

## Install on your Mac

1. Stop the running app with **Control+C**.
2. Extract `Planora_Stage3_Update.zip` into Downloads.
3. In the terminal of your **existing** `planora` folder, run:

```bash
node ~/Downloads/Planora_Stage3_Update/apply-stage3.mjs .
```

The installer checks file hashes against Stage 2, backs up overwritten files under `.planora-backups/`, and refuses to overwrite locally edited or missing source files. It never accesses the database or changes `.env`. If it lists conflicts, keep those files and share their names so we can merge the changes.

Then run:

```bash
npm ci
npm test
npm run build
npm run dev
```

Expected: **29 passing tests** and a successful build. Open **http://localhost:5173** and sign in with your existing account.

## Create a recurring task

1. Click **Create task** and enter a title, exact times, category, priority, and notes.
2. Choose its starting date.
3. Choose **Repeat**:
   - **Every day**.
   - **Selected weekdays**, then select the weekdays you want.
   - **Every week**, on the starting date's weekday.
   - **Every month**, on the starting date's day of the month.
4. Optionally choose **Repeat until**. That date is inclusive. Leaving it empty makes the rule ongoing.
5. Click **Create series**. Review overlap warnings and use **Save anyway** only if you want to proceed.

Each occurrence gets its own task ID and completion status. Completing Monday does not complete Tuesday. The calendar marks recurring tasks with ↻.

Monthly rules use the original date: a task starting on the 31st skips months without a 31st. It is not moved to the 28th or 30th. Nonexistent or ambiguous daylight-saving times are skipped and reported as warnings. Asia/Dhaka does not have this clock-change issue for the current schedule.

### Editing and deletion

Open an occurrence to edit or delete **only that occurrence**. An edited or rescheduled occurrence becomes an individual exception. It retains its original recurrence slot so it cannot be regenerated on the original day after moving to the bucket or another date.

Use **Edit whole series** to change the repeat rule, title, notes, category, priority, or times for uncompleted, unmodified occurrences and future generated occurrences. Completed tasks and individual exceptions keep their existing details and progress. A previously deleted occurrence stays deleted. This behaviour is stated in the editor before saving.

Use **Delete entire series** to remove every occurrence, including completed tasks and bucket items from that series. The interface asks for confirmation. Ordinary templates and unrelated tasks stay intact.

The sidebar's **Recurring tasks** panel lists all active series, including series outside the currently visible dates. It provides New, Edit, and Delete actions.

### Generation and overlap checks

An ongoing series is stored as a rule, rather than an infinite number of tasks. Creation generates its first 90 days. Opening a calendar range or searching a date range generates additional matching dates as needed, up to 366 days in one request. Returning to a range does not duplicate its tasks.

Creation and whole-series edits check overlaps in the initial 90-day window; edits also check existing occurrences being changed. Later conflicts are reported as calendar warnings when that range is opened. Open the affected occurrence to adjust its time. The app allows overlaps, and does not silently move another task to make space.

Series generation and changes use MongoDB transactions and a unique recurrence-slot index. **MongoDB Atlas or a MongoDB replica set is required for recurring tasks.** Your existing ordinary-task workflows continue to work with standalone local MongoDB.

Keep at most 50 active series per account. Requests are bounded to protect the app from accidentally trying to generate years of daily tasks at once.

## Save and reuse task templates

Two creation options are available:

- Open a scheduled task or a new task form and click **Save as template**. Its title becomes the template name.
- Open **Task templates** in the sidebar, click **New template**, and choose a separate name and default task details.

Templates keep the task title, notes, category, priority, and exact start/end times. They do not keep a date, completion status, bucket history, or recurrence rule.

Click **Use template**, choose a date, adjust details if needed, and save. Every use creates a new independent task and checks overlaps normally. You can optionally choose Repeat in the task form to start a recurring series from those details.

Template edits affect later uses; they do not rewrite tasks already created. Deleting a template also keeps those existing tasks. Template names are unique per account, ignoring case. Each account supports up to 200 templates.

A category used by a task, active series, or template cannot be deleted. Reassign or remove those references first.

## Search beyond the current calendar view

Open **Search all tasks** in the sidebar. Search by title, notes, category name, selected category, priority, status, and calendar/bucket location.

The form starts with the year of the selected calendar date. Change **From date** and **To date** to search another period. A search may cover up to 366 days, and recurrence is generated within that date range. Results are paginated at 50 tasks per page.

Bucket items are included regardless of date because some have never been scheduled. Choose **Calendar** if you want only dated tasks within the range.

Click a calendar result to open its details, switch to the correct day, clear conflicting view filters, and scroll its time into view. Bucket results open the bucket item instead. The search does not expose another account's tasks, categories, or templates.

The existing small **Search this view** box continues to filter only the current view; the sidebar's search provides the full date/filter workflow.

## Acceptance exercise

1. Create **CascadeVLM reading**, 09:15–09:55, repeating daily for five days.
2. Complete the first occurrence and confirm the other four stay scheduled.
3. Rename just the second occurrence and confirm the others keep their titles.
4. Edit the whole series. Confirm the completed first occurrence and individually edited second occurrence keep their details, while the remaining unmodified occurrences update.
5. Delete one occurrence, reload the date range, and confirm it stays deleted.
6. Move another occurrence to the bucket and reschedule it. Confirm it does not also reappear in its original slot.
7. Save a task as a template and use it on a different day.
8. Search for that task from another calendar week and open its result.
9. Run `npm test` and `npm run build`.

## API additions

| Method               | Endpoint                   | Purpose                               |
| -------------------- | -------------------------- | ------------------------------------- |
| GET                  | `/api/tasks/search`        | Account-scoped filters and pagination |
| GET / POST           | `/api/series`              | List/create recurring rules           |
| GET / PATCH / DELETE | `/api/series/:id`          | Inspect/edit/delete an owned series   |
| GET / POST           | `/api/templates`           | List/create personal templates        |
| PATCH / DELETE       | `/api/templates/:id`       | Edit/delete a personal template       |
| POST                 | `/api/templates/:id/apply` | Create a dated task from a template   |

Recurring creation accepts normal task fields plus:

```json
{
  "recurrence": {
    "frequency": "weekdays",
    "weekdays": [1, 3, 5],
    "endDate": "2027-05-31"
  }
}
```

Weekdays use 1 = Monday through 7 = Sunday. `endDate` may be null or empty for an ongoing rule. Search accepts `q`, `from`, `to`, `category`, `priority`, `status`, `location`, and `page`. API searches without dates search already materialized tasks; use a date range to generate future recurring occurrences explicitly.

## What follows

Stage 4 adds end-of-day review, richer progress summaries, full postponement history, and drag-and-drop rescheduling. Exports, Google Calendar sync, browser reminders, administration, and deployment follow in their later stages.
