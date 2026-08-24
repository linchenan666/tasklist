// ===== 生成应用图标(PNG) =====
// 运行:node generate-icons.js
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

function crc32(buf) {
  if (!crc32.table) {
    crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crc32.table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crc32.table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const r = size * 0.2;
  const segs = [
    [0.28 * size, 0.50 * size, 0.45 * size, 0.67 * size],
    [0.45 * size, 0.67 * size, 0.74 * size, 0.32 * size],
  ];
  const thick = size * 0.075;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const minX = r, minY = r, maxX = size - r, maxY = size - r;
      let inside = true;
      if (x < minX && y < minY) inside = Math.hypot(x - minX, y - minY) <= r;
      else if (x > maxX && y < minY) inside = Math.hypot(x - maxX, y - minY) <= r;
      else if (x < minX && y > maxY) inside = Math.hypot(x - minX, y - maxY) <= r;
      else if (x > maxX && y > maxY) inside = Math.hypot(x - maxX, y - maxY) <= r;
      if (!inside) continue;
      let R = 79, G = 70, B = 229;
      for (const [ax, ay, bx, by] of segs) {
        if (distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by) <= thick) { R = 255; G = 255; B = 255; }
      }
      const i = (y * size + x) * 4;
      buf[i] = R; buf[i + 1] = G; buf[i + 2] = B; buf[i + 3] = 255;
    }
  }
  return encodePNG(size, size, buf);
}

const out = path.join(__dirname, "icons");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "icon-512.png"), makeIcon(512));
fs.writeFileSync(path.join(out, "icon-192.png"), makeIcon(192));
fs.writeFileSync(path.join(out, "apple-touch-icon.png"), makeIcon(180));
console.log("图标已生成到 icons/ 目录");
