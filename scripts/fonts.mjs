// One-off: vendors the fonts embedded in the SVGs and extracts advance widths,
// so the renderer can size boxes to real text. Run: node scripts/fonts.mjs
import { mkdir, writeFile } from "node:fs/promises";

const OUT = new URL("../assets/fonts/", import.meta.url);
const CSS = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;700&display=swap";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const EXTRA = "·•█░─❯★▸→↗…—áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ";

const get = async (url, ua) => {
  const res = await fetch(url, { headers: ua ? { "user-agent": ua } : {} });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
};

// Parses the @font-face blocks of a Google Fonts stylesheet.
const faces = css => [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}|@font-face\s*{([^}]*)}/g)].map(m => {
  const body = m[2] ?? m[3];
  return {
    subset: m[1] ?? "",
    family: body.match(/font-family:\s*'([^']+)'/)[1],
    weight: Number(body.match(/font-weight:\s*(\d+)/)[1]),
    url: body.match(/url\(([^)]+)\)/)[1],
  };
});

// Minimal TrueType reader: unitsPerEm + advance width per code point (cmap format 4).
export function advanceWidths(buf, chars) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tables = {};
  for (let i = 0, n = dv.getUint16(4); i < n; i++) {
    const o = 12 + i * 16;
    tables[String.fromCharCode(...buf.subarray(o, o + 4))] = dv.getUint32(o + 8);
  }
  const upm = dv.getUint16(tables.head + 18);
  const numH = dv.getUint16(tables.hhea + 34);
  const adv = g => dv.getUint16(tables.hmtx + 4 * Math.min(g, numH - 1));
  const cmap = tables.cmap;
  let sub = -1;
  for (let i = 0, n = dv.getUint16(cmap + 2); i < n; i++) {
    const o = cmap + 4 + i * 8, off = cmap + dv.getUint32(o + 4);
    if (dv.getUint16(off) === 4) { sub = off; break; }
  }
  if (sub < 0) throw new Error("no cmap format 4");
  const segs = dv.getUint16(sub + 6) / 2;
  const ends = sub + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
  const glyph = cp => {
    for (let i = 0; i < segs; i++) {
      if (cp > dv.getUint16(ends + i * 2)) continue;
      if (cp < dv.getUint16(starts + i * 2)) return 0;
      const ro = dv.getUint16(ranges + i * 2), delta = dv.getInt16(deltas + i * 2);
      if (ro === 0) return (cp + delta) & 0xffff;
      const g = dv.getUint16(ranges + i * 2 + ro + (cp - dv.getUint16(starts + i * 2)) * 2);
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
  const widths = {};
  for (const ch of chars) {
    const g = glyph(ch.codePointAt(0));
    if (g) widths[ch] = adv(g) / upm;
  }
  return widths;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const metrics = {};
  const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") + EXTRA;

  // Static TTF instances (served to a bare user agent) give exact per-weight widths.
  for (const f of faces(await (await get(CSS)).text())) {
    const buf = new Uint8Array(await (await get(f.url)).arrayBuffer());
    (metrics[f.family] ??= {})[f.weight] = advanceWidths(buf, ascii);
  }

  // The latin woff2 is a variable font, one file per family covers every weight.
  const seen = new Set();
  for (const f of faces(await (await get(CSS, CHROME)).text()).filter(f => f.subset === "latin")) {
    if (seen.has(f.family)) continue;
    seen.add(f.family);
    const file = f.family.replace(/\s+/g, "") + ".woff2";
    await writeFile(new URL(file, OUT), new Uint8Array(await (await get(f.url)).arrayBuffer()));
  }

  await writeFile(new URL("metrics.json", OUT), JSON.stringify(metrics));
  console.log("fonts:", [...seen].join(", "), "| weights:", Object.entries(metrics).map(([k, v]) => `${k} ${Object.keys(v)}`).join("; "));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
