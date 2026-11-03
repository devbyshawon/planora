import PDFDocument from "pdfkit";
import { createRequire } from "node:module";
import { DateTime } from "luxon";
import { categoryName, statusName } from "./data.js";
const require = createRequire(import.meta.url);
const fonts = {
  regular: require.resolve(
    "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff",
  ),
  bold: require.resolve(
    "@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff",
  ),
  bengali: require.resolve(
    "@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-400-normal.woff",
  ),
};
import { renderPdf } from "../../../../shared/pdfLayout.js";
export const makePdf = data => renderPdf(data, PDFDocument, fonts, chunks => Buffer.concat(chunks));
