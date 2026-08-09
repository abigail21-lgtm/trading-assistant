// Generates the app icons (dark bg + emerald "Desk" mark: a monitor outline
// with a trend line, on a stand) as real PNG files using only Node's built-in
// zlib -- no image-library dependency needed for a one-off asset generation
// script. Also wraps one of the PNGs in a minimal ICO container for the
// static favicon.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const BG = [0x02, 0x06, 0x17]; // slate-950
const MARK = [0x10, 0xb9, 0x81]; // emerald-500

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // no filter
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idatData = deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = BG[0];
    rgba[i * 4 + 1] = BG[1];
    rgba[i * 4 + 2] = BG[2];
    rgba[i * 4 + 3] = 255;
  }

  const setPixel = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = color[0];
    rgba[i + 1] = color[1];
    rgba[i + 2] = color[2];
    rgba[i + 3] = 255;
  };

  const fillRect = (x0, y0, x1, y1, color) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) {
        setPixel(x, y, color);
      }
    }
  };

  const strokeRect = (x0, y0, x1, y1, thickness, color) => {
    fillRect(x0, y0, x1, y0 + thickness, color);
    fillRect(x0, y1 - thickness, x1, y1, color);
    fillRect(x0, y0, x0 + thickness, y1, color);
    fillRect(x1 - thickness, y0, x1, y1, color);
  };

  const strokeSegment = (x0, y0, x1, y1, thickness, color) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const steps = Math.ceil(dist * 2);
    const r = thickness / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (ox * ox + oy * oy <= r * r) setPixel(Math.round(cx + ox), Math.round(cy + oy), color);
        }
      }
    }
  };

  const strokePolyline = (points, thickness, color) => {
    for (let i = 0; i < points.length - 1; i++) {
      strokeSegment(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], thickness, color);
    }
  };

  // Same "Desk" mark used in the app header (monitor + trend line + stand),
  // laid out on the same 52x52 grid as the source SVG so proportions match
  // exactly. Kept within a ~15% margin on every side for maskable safety.
  const s = size / 52;
  strokeRect(6 * s, 10 * s, 46 * s, 36 * s, Math.max(1, 3 * s), MARK);
  strokePolyline(
    [
      [12 * s, 28 * s],
      [20 * s, 22 * s],
      [27 * s, 26 * s],
      [34 * s, 17 * s],
      [41 * s, 20 * s],
    ],
    Math.max(1, 2.6 * s),
    MARK,
  );
  fillRect(20 * s, 40 * s, 32 * s, 43 * s, MARK);

  return encodePNG(size, size, rgba);
}

function encodeICO(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const entries = [];
  const images = [];
  for (const { size, data } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(data.length, 8); // bytes in resource
    entry.writeUInt32LE(offset, 12); // image offset
    offset += data.length;
    entries.push(entry);
    images.push(data);
  }
  return Buffer.concat([header, ...entries, ...images]);
}

const targets = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-512-maskable.png", 512],
  ["apple-touch-icon.png", 180],
];

const pngsBySize = {};
for (const [name, size] of targets) {
  const data = drawIcon(size);
  pngsBySize[size] = data;
  writeFileSync(join(outDir, name), data);
  console.log(`Wrote ${name} (${size}x${size})`);
}

// Static favicon.ico read by Next's app-router favicon convention.
const faviconSizes = [16, 32, 48];
const faviconPngs = faviconSizes.map((size) => ({ size, data: drawIcon(size) }));
const favicoPath = join(__dirname, "..", "src", "app", "favicon.ico");
writeFileSync(favicoPath, encodeICO(faviconPngs));
console.log(`Wrote favicon.ico (${faviconSizes.join("/")}px)`);
