# Planora Stage 4 — daily review, progress, history, and drag-and-drop

Version **0.4.0** extends Stage 3. Your existing accounts, task IDs, recurring rules, templates, bucket items, preferences, categories, SMTP settings, and `server/.env` remain in place.

## Install on your Mac

1. Stop the running app with **Control+C**.
2. Extract `Planora_Stage4_Update.zip` into Downloads.
3. From the terminal of your **existing** `planora` folder, run:

```bash
node ~/Downloads/Planora_Stage4_Update/apply-stage4.mjs .
```

The installer checks your source against Stage 3, creates backups under `.planora-backups/`, and stops before overwriting edited or missing files. It does not access the database or alter `.env`.

Then run:

```bash
npm ci
npm test
npm run build
npm run dev
```

Expected: **41 passing tests** and a successful build. Open **http://localhost:5173** and use your existing account.

If the installer lists local source conflicts, keep those files and share their names so the changes can be merged.

## 1. Review an ended day

Choose **Daily review** in the sidebar. It opens the selected date if that date has ended in your planner timezone; otherwise it opens yesterday. You can change the date inside the dialog.

For each unfinished task, choose:

- **Move to bucket**: preserve its title, notes, category, priority, original schedule, and postponement count.
- **Keep not completed**: leave the task on that day with a recorded review decision.
- **Delete**: confirm deletion of that task, or only that recurring occurrence.

Completed tasks do not appear in the review. A saved decision removes the item from that day's review queue. Repeating the same request does not add another postponement or history event.

The app checks for yesterday's unfinished work when it opens and after task changes. While open, its local-day clock refreshes each minute so a review can appear after the date changes. A reminder banner opens yesterday's review. No task is moved, completed, or deleted without your choice.

You cannot review today or a future date before that day ends in your account's timezone. Manually reopening a task as scheduled, or rescheduling it, clears the old review decision when appropriate so its new date can be reviewed.

## 2. See progress by day, week, or month

Choose **Progress summary** in the sidebar. Select a reference date, period, and optional category filter.

The summary shows:

- Planned task slots and completed slots.
- Tasks moved to the bucket and the number of bucket movements.
- Completion percentage.
- Exact planned and completed minutes.
- Category totals and completion bars.
- Daily totals, with clickable dates and category rows.
- Streaks for fully completed ended days within the selected period.
- The tasks behind the totals, with links to their history and current calendar/bucket position.

### How the totals are counted

A task has one planned slot per date on which it was scheduled. Moving a task from Monday to Tuesday preserves Monday's planned slot and adds Tuesday's slot. This keeps unfinished work visible in the historical summary rather than making it disappear from Monday.

Rescheduling within one day updates that day's slot instead of adding another one. Repeated bucket movements on the same date increase the movement count; the count of tasks moved to the bucket still counts that task/date once. A later completion on the same date can therefore appear alongside a recorded bucket movement.

Planned minutes add each task's exact duration. Overlapping tasks are added separately; this is planned task time, not a measurement of unique clock time or time actually worked. Completed minutes include slots whose latest outcome is completed. Deleted/cancelled tasks are excluded from progress totals, while their recorded history is retained.

Streaks count only dates that have ended in the planner timezone. Every planned slot on a qualifying day must be completed. Empty days and days with unfinished/rescheduled/bucket work break the run. The displayed best/current streaks are scoped to the selected period, not presented as an all-time statistic.

## 3. Inspect task history

Open a task and click **View task history**, or use a history button in the progress summary.

History records creation, completion changes, edits, bucket movements, rescheduling, review decisions, recurring-series updates/removals/deletions, timezone changes, and task deletion. Movement entries keep the previous and next dates, clock times, locations, and statuses. Entries are displayed newest first with 50 entries per page.

### Existing Stage 1–3 data

Detailed history starts with this update. Earlier exact movements were not recorded, so they cannot be reconstructed reliably. Your existing postponement count and original schedule are preserved.

Older tasks contribute their saved current/last schedule to progress and are explicitly marked as legacy data. An older bucket item provides one known saved placement and at least its last known bucket movement; the app does not invent all earlier postponement dates. Its first new change records a clear “History tracking started” boundary.

New task deletions retain a hidden task record and history. Deleted tasks do not appear in the calendar, bucket, global search, or progress totals. Stage 4 does not include a trash/restore interface.

## 4. Drag to reschedule

Desktop browsers can now move tasks without opening the editor:

- **Day/Week:** drag a calendar block to another exact minute or day. Its local start-to-end duration is retained.
- **Month:** drag a task to another date. Its existing clock times are retained.
- **From the bucket:** open **Bucket tray** above the calendar and drag an item onto a time/date. An undated idea starts with a 40-minute slot; edit the task to choose a different duration.

If a drop overlaps another task, choose **Save anyway**, **Edit time**, or **Cancel**. Cancelling leaves the task in its original position. A placement that would extend beyond midnight is rejected; split overnight work into separate tasks as before.

Dragging a recurring occurrence changes only that occurrence and preserves its original recurrence slot. It does not move the entire series or regenerate the original occurrence.

If a task changed in another view before the drop was saved, the server refuses the stale update and asks you to reload. Task forms and review decisions also use this check.

Native drag gestures vary on touch browsers. The existing date/time editor remains available on mobile and for keyboard use.

## 5. Quick completion and bucket organisation

Hover over a calendar block with enough room to show the small completion button. Click it to complete or reopen the task. The status control in the task editor remains available for very short blocks and other views.

The bucket page now supports sorting by priority, oldest/newest added, original date, or most postponed. Its age filter can show all items, 7+ days, or 30+ days. Age is elapsed time since the latest bucket addition; previous movements remain visible in history.

## Acceptance exercise

1. Create a task at 09:15–09:55 and mark it complete using its calendar control. Reopen it.
2. Drag it to 11:15–11:55. Confirm its duration remains 40 minutes.
3. Try an overlapping drop, cancel it, then repeat and confirm if intentional.
4. Move the task to the bucket, open Bucket tray, and drag it back onto the calendar.
5. Open its history and inspect the moves and exact times.
6. Create unfinished tasks on a day that has already ended. Review one into the bucket, keep another not completed, and delete a third.
7. Open the progress summary for that day, click category/date breakdowns, and inspect their underlying task histories.
8. Confirm your recurring rules, templates, password flows, settings, and custom categories still work.

## API additions

| Method | Endpoint                                               | Purpose                                                       |
| ------ | ------------------------------------------------------ | ------------------------------------------------------------- |
| GET    | `/api/tasks/:id`                                       | Read the current owned task                                   |
| GET    | `/api/tasks/:id/history?page=1`                        | Read paginated owned history, including a deleted record      |
| GET    | `/api/insights/review?date=YYYY-MM-DD`                 | Unreviewed unfinished work for an ended day                   |
| POST   | `/api/insights/review/:id`                             | Save keep/bucket/delete decision                              |
| GET    | `/api/insights/progress?from=YYYY-MM-DD&to=YYYY-MM-DD` | Historical slots, exact-time metrics, categories, and streaks |

Review body: `date`, `action` (`keep`, `bucket`, or `delete`), and optional `expectedUpdatedAt`. Task PATCH/DELETE can also include `expectedUpdatedAt`; a mismatch returns `STALE_TASK` with HTTP 409. Progress accepts an optional owned `category` filter and a range of up to 366 days.

Task history and daily plan records are saved atomically with each ordinary task change. Recurring-series and timezone operations preserve them in their existing MongoDB transactions. Atlas/replica-set requirements for recurrence and timezone changes remain as in Stage 3.

## Next stage

Stage 5 adds daily/weekly/monthly PDF and CSV downloads, plus ICS calendar files with reminders. Google Calendar sync, browser notifications, administrator controls, and deployment remain later stages.
