import {
  exportInput,
  exportData,
  exportPreview,
} from "../utils/exports/data.js";
import { makeCsv } from "../utils/exports/csv.js";
import { makeIcs } from "../utils/exports/ics.js";
import { makePdf } from "../utils/exports/pdf.js";
import { AppError } from "../utils/errors.js";
async function dataFor(req) {
  const options = exportInput(req.body);
  return exportData(
    req.user,
    options,
    req.app.locals.config.now?.() || new Date(),
  );
}
export async function previewExport(req, res) {
  res.json(exportPreview(await dataFor(req)));
}
export async function downloadExport(req, res) {
  const format = req.body?.format;
  if (!["pdf", "csv", "ics"].includes(format))
    throw new AppError(400, "Choose PDF, CSV, or ICS.");
  const data = await dataFor(req);
  const content =
    format === "pdf"
      ? await makePdf(data)
      : format === "csv"
        ? makeCsv(data)
        : makeIcs(data);
  const filename = `Planora_${data.options.period}_${data.options.from}_${data.options.to}.${format}`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader(
    "Content-Type",
    {
      pdf: "application/pdf",
      csv: "text/csv; charset=utf-8",
      ics: "text/calendar; charset=utf-8",
    }[format],
  );
  res.setHeader("X-Planora-Task-Count", String(data.tasks.length));
  res.setHeader("X-Planora-Warning-Count", String(data.warnings.length));
  res.send(content);
}
