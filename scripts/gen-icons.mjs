// Gera ícones PNG do PWA sem dependências (usa apenas node:zlib).
// Placeholder de branding — substitua por assets do designer na passada de design.
//   node scripts/gen-icons.mjs
import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "icons",
);

// Cor da marca (verde calmo) — mantenha em sincronia com lib/config.ts (APP_THEME_COLOR).
const BRAND = [47, 111, 79];
const WHITE = [255, 255, 255];

function encodePng(width, height, drawPixel) {
  const channels = 4;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro "none"
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y, width, height);
      const o = y * (stride + 1) + 1 + x * channels;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Ícone "any": quadrado arredondado com transparência fora do raio + círculo branco central.
function anyIcon(x, y, w, h) {
  const r = w * 0.22;
  const cx = Math.min(Math.max(x + 0.5, r), w - r);
  const cy = Math.min(Math.max(y + 0.5, r), h - r);
  if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) return [0, 0, 0, 0];
  const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2);
  return d < w * 0.2 ? [...WHITE, 255] : [...BRAND, 255];
}

// Ícone "maskable": full-bleed (o SO recorta) com o motivo dentro da zona segura.
function maskableIcon(x, y, w, h) {
  const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2);
  return d < w * 0.16 ? [...WHITE, 255] : [...BRAND, 255];
}

mkdirSync(OUT, { recursive: true });

const files = [
  ["icon-192.png", 192, anyIcon],
  ["icon-512.png", 512, anyIcon],
  ["maskable-192.png", 192, maskableIcon],
  ["maskable-512.png", 512, maskableIcon],
  ["apple-touch-icon.png", 180, maskableIcon],
];

for (const [name, size, draw] of files) {
  writeFileSync(join(OUT, name), encodePng(size, size, draw));
  console.log("✓", name, `${size}x${size}`);
}
console.log("Ícones gerados em public/icons/");
