import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import regularUrl from "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url";
import boldUrl from "@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url";
import bengaliUrl from "@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-400-normal.woff?url";
import { renderPdf } from "../../../shared/pdfLayout.js";
import { makeCsv } from "../../../server/src/utils/exports/csv.js";
import { makeIcs } from "../../../server/src/utils/exports/ics.js";
import { localExportData } from "./domain.js";
import { readOffline, offlineLock, writeOffline } from "./storage.js";
export async function offlineExport(body) {
  return offlineLock(async () => {
    const state = await readOffline();
    if (!state) throw new Error("Open Planora online first to save your planner on this device.");
    const data = localExportData(state, body);
    await writeOffline(state);
    let content;
    if (body.format === "pdf") {
      const values = await Promise.all([regularUrl,boldUrl,bengaliUrl].map(async url => {
        const response = await fetch(url); if (!response.ok) throw new Error("PDF fonts have not been saved on this device yet. Open Planora online once before exporting offline.");
        return new Uint8Array(await response.arrayBuffer());
      }));
      content = await renderPdf(data, PDFDocument, { regular: values[0], bold: values[1], bengali: values[2] }, chunks => {
        const result = new Uint8Array(chunks.reduce((n,c) => n+c.length,0)); let offset=0;
        for (const c of chunks) { result.set(c,offset); offset+=c.length; } return result;
      });
    } else if (body.format === "csv") content = makeCsv(data);
    else if (body.format === "ics") content = makeIcs(data);
    else throw new Error("Choose PDF, CSV, or ICS.");
    const type = { pdf:"application/pdf",csv:"text/csv;charset=utf-8",ics:"text/calendar;charset=utf-8" }[body.format];
    return { blob: new Blob([content], { type }), filename: `Planora_${data.options.period}_${data.options.from}_${data.options.to}.${body.format}`, count: data.tasks.length, warnings: data.warnings.length };
  });
}
