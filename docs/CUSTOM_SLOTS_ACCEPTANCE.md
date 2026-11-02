# Manual acceptance: custom task-defined rows

This supplements Stage 8/publication-pack checks. Earlier “one minute equals one pixel” expectations are superseded: exact labels/data are authoritative and task rows have readable minimum heights. Other tests remain applicable.

- [ ] Create 09:15–09:55, 10:00–10:30, 10:30–11:30 and 11:30–13:30 tasks on a test date. Confirm four distinct task-defined rows labeled with those ranges and 40/30/60/120 minutes.
- [ ] Confirm there is no fixed hourly row scaffold or long unused midnight-to-morning grid. Inspect compact gap buttons between the actual rows.
- [ ] Create a one-minute task. Confirm it has a readable row, can be opened/completed, and still saves exactly one minute.
- [ ] Use the duration shortcuts, then manually enter a custom 40- or 75-minute range. Confirm shortcuts do not restrict arbitrary start/end input.
- [ ] Near midnight verify invalid equal/backward/overnight ranges are rejected and a two-hour shortcut cannot silently spill into tomorrow.
- [ ] Create a task on the next day ending at a different minute boundary. In Week, confirm it does not split another day's 09:15–09:55 row. Each day uses its own schedule.
- [ ] Add an overlap, cancel its warning, and verify no task was saved. Repeat and explicitly save. Inspect the overlap group and every task's individual range; adjacent tasks stay separate.
- [ ] Drag an existing task onto a gap. Confirm the target start and original duration, identity and history. Drag onto an occupied task, cancel consent, and verify the original schedule/history remain.
- [ ] Drop an undated bucket idea onto a row/gap. Confirm the editor opens with editable times and the idea remains in bucket until Save. Cancel once; repeat, choose two hours and save. Confirm the same task identity is retained.
- [ ] Filter out tasks. Confirm rows follow visible matches; creating in a displayed gap still uses server overlap warnings against hidden owned tasks.
- [ ] Toggle 12/24-hour clock and Slot boundaries, then reload. Confirm saved preferences and exact task data persist.
- [ ] Open a global search/reminder result or rescheduled task. Confirm the correct dated custom row can be reached without relying on a pixel-per-minute offset.
- [ ] Check Day/Week at phone width and with keyboard navigation. Week should scroll inside the calendar, not force page-wide horizontal overflow. Verify quick completion remains available on short tasks.
- [ ] Check Month, recurrence exceptions, exports, Google sync and reminder settings retain their prior data semantics; the change is a calendar presentation/editor correction.

Record pass/fail and any issue with version 0.8.1, your browser and timezone. No manual result is pre-marked passed by this update.
