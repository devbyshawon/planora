# Custom-slot correction for Stage 8 — v0.8.1

Your requirement is **task-defined rows**, not merely custom-duration blocks inside an hourly grid. This update replaces the Day and Week hourly scaffold with rows derived from your planned task ranges. It builds directly on your installed Stage 8; do not reinstall earlier stages.

## Install

Stop Planora with **Control+C**. Extract `Planora_Custom_Slots_Update.zip` into Downloads. From your existing **planora** project folder:

```bash
node ~/Downloads/Planora_Custom_Slots_Update/apply-custom-slots.mjs . &&
npm ci &&
npm run verify &&
npm audit &&
npm run dev
```

Expected: version **0.8.1**, **121 passing tests** (10 shared + 111 server/worker), build/smoke success, and normal API readiness. Open **http://localhost:5173**.

The installer preserves `server/.env` and does not access MongoDB. It backs up replaced source. Locally edited README/roadmap/architecture/acceptance documents are kept rather than overwritten, including the publication-pack README; review this guide for the updated layout/test count. Other source conflicts stop installation before writes. Extra publication documents, licenses, manual results and your Git settings are outside the update.

## What you should see

| Example slot | Duration | Row behavior |
| --- | --- | --- |
| 09:15–09:55 | 40 minutes | One exact custom row |
| 10:00–10:30 | 30 minutes | A separate row |
| 10:30–11:30 | 1 hour | A separate row |
| 11:30–13:30 | 2 hours | A separate row |

- No fixed 08:00–09:00 / 09:00–10:00 row scaffold in Day or Week.
- Rows follow actual start/end boundaries. Gaps appear as compact range buttons, not hours of blank grid. Empty days offer **Add a custom slot**.
- In Week, each day has independent rows. Equal vertical positions across different days do not imply equal clock times; read the explicit ranges. Week columns can scroll horizontally on a phone.
- Overlapping tasks remain independent. Day shows separate cards within a connected overlap group; Week stacks those cards under an overlap heading. Every card retains its own exact range and duration. The aggregate overlap heading is not a new merged task.
- Card heights are adjusted for readability, including one-minute tasks. They are not a proportional elapsed-time axis. Exact range/duration labels remain authoritative, including valid clock-change elapsed durations.
- Filters show matching tasks; a gap between displayed tasks is not a guarantee that no hidden task occupies it. The server still checks all relevant owned tasks for overlaps.
- Month remains a date overview; it has no hourly scaffold to replace.

## Creating and moving slots

The editor now offers **30 min**, **1 hour**, and **2 hours** shortcuts. Start/end inputs remain editable for any valid minute range, including 09:15–09:55. New ordinary tasks initially suggest 09:00–09:30; that is editable input, not a mandatory duration. A shortcut that would cross midnight is unavailable.

Click a gap to start a task at that range's beginning, initially suggesting up to 30 minutes within it. You can choose other valid times before saving. Use **Choose other times** or **Create task** to enter any valid schedule. Day-edge constraints remain unchanged: end must be later than start within one day, through 23:59.

Dragging a dated task onto a row/gap uses that target's start time and preserves the task's saved wall-clock duration. Overlap consent and stale-version checks still run on the server. Dropping on an empty day keeps an existing scheduled task's time.

Dragging an **undated bucket idea** opens the editor so you choose the duration before saving. Cancel leaves the idea in the bucket. It is no longer silently assigned a 40-minute schedule. Month drops for undated ideas follow the same editor workflow.

The saved preference key named showHourGuides is retained for compatibility, but the visible label is now **Slot boundaries** and it controls task-row boundary decoration. There is no account/data migration.

## Verification

The shared tests cover exact 40/30/60/120-minute rows, adjacency, compact gaps, overlap columns, accessible one-minute/day-edge rows, immutable derivation and midnight shortcut bounds. Backend tests retain ownership, timing, overlap, history, recurrence, mail, Google and admin coverage. New browser checks exercise actual custom rows, independent week boundaries, shortcuts, overlap confirmation, dragging/cancel, undated-bucket duration selection, month, dark/mobile layout and automated accessibility.

Use `docs/CUSTOM_SLOTS_ACCEPTANCE.md` for your manual checks. Existing live email/Google/OS alert requirements still apply; this calendar correction does not configure those providers or certify their delivery.
