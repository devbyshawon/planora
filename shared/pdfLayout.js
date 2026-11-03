import { DateTime } from "luxon";
import { categoryName, statusName } from "./exportModel.js";
const INK = "#17352E",
  MUTED = "#587068",
  GREEN = "#167D5B";
export function renderPdf(data, PDFDocument, fonts, concatenate) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
      bufferPages: true,
      info: {
        Title: `Planora ${data.options.period} schedule`,
        Author: "Planora",
        Subject: `${data.options.from} to ${data.options.to} | ${data.timeZone}`,
        CreationDate: data.generatedAt,
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(concatenate(chunks)));
    doc.on("error", reject);
    try {
      Object.entries(fonts).forEach(([name, path]) =>
        doc.registerFont(name, path),
      );
      const width = doc.page.width - 84,
        bottom = doc.page.height - 66;
      let y = 42;
      // Split by script without separating Bengali shaping clusters. Missing
      // glyphs are written as Unicode codes; CSV/ICS always retain originals.
      function runs(text, bold = false) {
        const result = [];
        for (const char of String(text).replace(
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
          "",
        )) {
          const font = /[\u0964\u0965\u0980-\u09ff\u200c\u200d]/.test(char)
            ? "bengali"
            : bold
              ? "bold"
              : "regular";
          doc.font(font);
          const value =
            char === "\n" ||
            doc._font.font.hasGlyphForCodePoint(char.codePointAt(0))
              ? char
              : `[U+${char.codePointAt(0).toString(16).toUpperCase()}]`;
          if (result.at(-1)?.font === font) result.at(-1).text += value;
          else result.push({ font, text: value });
        }
        return result;
      }
      function measure(text, size, bold = false) {
        return runs(text, bold).reduce(
          (sum, run) =>
            sum + doc.font(run.font).fontSize(size).widthOfString(run.text),
          0,
        );
      }
      function line(text, x, yy, size = 10, color = INK, bold = false) {
        let cursor = x;
        for (const run of runs(text, bold)) {
          doc
            .font(run.font)
            .fontSize(size)
            .fillColor(color)
            .text(run.text, cursor, yy, {
              lineBreak: false,
              width: width + 20,
            });
          cursor += doc.widthOfString(run.text);
        }
      }
      function wrap(text, maxWidth, size, bold = false) {
        const lines = [];
        for (const paragraph of String(text)
          .replace(/\r\n|\r/g, "\n")
          .split("\n")) {
          let current = "";
          for (const word of paragraph.split(/(\s+)/).filter(Boolean)) {
            if (measure(current + word, size, bold) <= maxWidth) {
              current += word;
              continue;
            }
            if (current.trim()) {
              lines.push(current.trimEnd());
              current = "";
            }
            if (measure(word.trimStart(), size, bold) <= maxWidth) {
              current = word.trimStart();
              continue;
            }
            for (const { segment } of new Intl.Segmenter(undefined, {
              granularity: "grapheme",
            }).segment(word.trimStart())) {
              if (
                current &&
                measure(current + segment, size, bold) > maxWidth
              ) {
                lines.push(current);
                current = "";
              }
              current += segment;
            }
          }
          lines.push(current.trimEnd());
        }
        return lines;
      }
      function header(continued = false) {
        doc.rect(42, 33, 28, 4).fill(GREEN);
        line("PLANORA", 42, 46, 11, GREEN, true);
        line(
          `${{ day: "Daily", week: "Weekly", month: "Monthly", custom: "Custom range" }[data.options.period]} schedule${continued ? " / continued" : ""}`,
          42,
          70,
          23,
          INK,
          true,
        );
        line(
          `${data.options.from} to ${data.options.to}`,
          42,
          108,
          11,
          INK,
          true,
        );
        y = 132;
        const filter = `${data.timeZone} | ${data.options.category ? categoryName(data, data.options.category) : "All categories"} | ${data.options.status ? statusName(data.options.status) : "All statuses"}`;
        for (const part of wrap(filter, width, 9)) {
          line(part, 42, y, 9, MUTED);
          y += 15;
        }
        line(
          `Generated ${DateTime.fromJSDate(data.generatedAt, { zone: data.timeZone }).toFormat("yyyy-MM-dd HH:mm")} (${data.timeZone})`,
          42,
          y,
          8,
          MUTED,
        );
        y += 27;
        doc
          .moveTo(42, y)
          .lineTo(42 + width, y)
          .strokeColor("#D6E4DE")
          .stroke();
        y += 16;
      }
      function newPage() {
        doc.addPage();
        header(true);
      }
      function ensure(height) {
        if (y + height > bottom) newPage();
      }
      header();
      const total = data.tasks.reduce((sum, t) => sum + t.durationMinutes, 0);
      line(
        `${data.tasks.length} tasks / ${Math.floor(total / 60)}h ${total % 60}m planned`,
        42,
        y,
        11,
        GREEN,
        true,
      );
      y += 26;
      if (!data.tasks.length) {
        line("No calendar tasks match these filters.", 42, y, 12);
        y += 24;
      }
      if (data.warnings.length) {
        for (const part of wrap(
          `${data.warnings.length} scheduling warning(s). Overlapping durations are added; invalid clock-change occurrences are omitted. Review these warnings in Planora.`,
          width,
          9,
        )) {
          ensure(15);
          line(part, 42, y, 9, MUTED);
          y += 15;
        }
        y += 12;
      }
      let date = "";
      for (const task of data.tasks) {
        const contentX = 158,
          contentWidth = width - 116;
        const titleLines = wrap(task.title, contentWidth, 11, true);
        const metaLines = wrap(
          `${categoryName(data, task.category)} / ${task.priority} priority / ${statusName(task.status)}`,
          contentWidth,
          8,
        );
        const needed = Math.max(
          54,
          titleLines.length * 17 + metaLines.length * 14 + 10,
        );
        if (y + needed + (date !== task.date ? 39 : 0) > bottom) {
          newPage();
          date = "";
        }

        if (date !== task.date) {
          date = task.date;
          const heading = DateTime.fromISO(date, { zone: "UTC" }).toFormat(
            "cccc, dd LLL yyyy",
          );
          doc.roundedRect(42, y, width, 26, 4).fill("#EEF5F1");
          line(heading, 52, y + 5, 10, INK, true);
          y += 39;
        }
        // Keep time and the complete title together. Notes continue naturally.
        line(`${task.startTime} - ${task.endTime}`, 42, y, 10, INK, true);
        line(`${task.durationMinutes} min`, 42, y + 19, 9, MUTED);
        for (const part of titleLines) {
          line(part, contentX, y, 11, INK, true);
          y += 17;
        }
        for (const part of metaLines) {
          line(part, contentX, y, 8, MUTED);
          y += 14;
        }
        if (data.options.includeNotes && task.notes) {
          y += 6;
          for (const part of wrap(task.notes, contentWidth, 9)) {
            if (y + 16 > bottom) {
              newPage();
              line(
                `${task.date} / ${task.startTime} - ${task.endTime} / notes continued`,
                42,
                y,
                9,
                MUTED,
              );
              y += 24;
            }
            line(part, contentX, y, 9, MUTED);
            y += 16;
          }
        }
        y += 10;
        if (y + 10 < bottom) {
          doc
            .moveTo(158, y)
            .lineTo(42 + width, y)
            .strokeColor("#E5EDE8")
            .stroke();
          y += 17;
        }
      }
      const pages = doc.bufferedPageRange();
      for (
        let index = pages.start;
        index < pages.start + pages.count;
        index++
      ) {
        doc.switchToPage(index);
        doc.page.margins.bottom = 0;
        line(
          "Planora / Current calendar snapshot",
          42,
          doc.page.height - 42,
          8,
          MUTED,
        );
        const label = `${index + 1} / ${pages.count}`;
        line(
          label,
          doc.page.width - 42 - measure(label, 8),
          doc.page.height - 42,
          8,
          MUTED,
        );
        doc.page.margins.bottom = 42;
      }
      // Shaped marks can have no codepoint. Explicit zero-width mappings avoid
      // empty CMap strings that some PDF text parsers cannot read.
      for (const font of new Set(Object.values(doc._fontFamilies))) {
        if (font.unicode)
          font.unicode = font.unicode.map((points) =>
            points.length ? points : [0x200b],
          );
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
