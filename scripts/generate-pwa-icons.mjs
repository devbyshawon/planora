// Reproducible raster companions to Planora's code-native calendar mark.
// Node built-ins only; no image-generation service or new dependency is needed.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
const directory = new URL("../client/public/icons/", import.meta.url);
mkdirSync(directory, { recursive: true });
const dots = [[200, 260], [256, 260], [312, 260], [200, 310], [256, 310], [200, 350], [256, 350]];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#3658b8"/><g stroke="#fff" stroke-width="12" stroke-linecap="round" fill="none"><rect x="144" y="156" width="224" height="220" rx="24"/><path d="M200 134v42m112-42v42M144 218h224"/></g><g fill="#fff">${dots.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="8"/>`).join("")}</g></svg>\n`;
writeFileSync(new URL("icon.svg", directory), svg);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
const lineDistance = (x, y, ax, ay, bx, by) => {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
};
function ink(x, y) {
  const qx = Math.abs(x - 256) - 88, qy = Math.abs(y - 266) - 86;
  const rectangleDistance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 24;
  return Math.abs(rectangleDistance) <= 6 ||
    lineDistance(x, y, 200, 134, 200, 176) <= 6 ||
    lineDistance(x, y, 312, 134, 312, 176) <= 6 ||
    lineDistance(x, y, 144, 218, 368, 218) <= 6 ||
    dots.some(([cx, cy]) => Math.hypot(x - cx, y - cy) <= 8);
}
function png(size) {
  const pixels = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let white = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++)
        if (ink((x + (sx + 0.5) / 4) * 512 / size, (y + (sy + 0.5) / 4) * 512 / size)) white++;
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      [54, 88, 184].forEach((value, channel) => { pixels[offset + channel] = Math.round(value + (255 - value) * white / 16); });
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["icon-maskable-512.png", 512], ["apple-touch-icon.png", 180]])
  writeFileSync(new URL(file, directory), png(size));
console.log("Generated Planora SVG and PNG icons (192, 512, maskable 512, Apple 180).");
