// Turns collected data into standalone SVGs. They are served through <img>, so: no scripts,
// no external requests; fonts are embedded and every dynamic string is XML-escaped.
import { readFileSync } from "node:fs";
import { levels } from "./github.mjs";

const font = f => readFileSync(new URL(`../assets/fonts/${f}`, import.meta.url));
const METRICS = JSON.parse(font("metrics.json"));
const FONT_CSS = `@font-face{font-family:'Space Grotesk';src:url(data:font/woff2;base64,${font("SpaceGrotesk.woff2").toString("base64")}) format('woff2');font-weight:300 700}
@font-face{font-family:'JetBrains Mono';src:url(data:font/woff2;base64,${font("JetBrainsMono.woff2").toString("base64")}) format('woff2');font-weight:100 800}`;
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SANS = "'Space Grotesk',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function measure(text, { mono = false, weight = 400, size, ls = 0 }) {
  const w = METRICS[mono ? "JetBrains Mono" : "Space Grotesk"][weight];
  return [...text].reduce((a, ch) => a + (w[ch] ?? 0.6) * size + ls, 0);
}
const fmt = n => n.toLocaleString("en-US");
const k = n => n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "k" : String(n);
const pad = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n, " ");
const ago = (iso, now) => {
  const d = Math.max(0, Math.floor((new Date(now) - new Date(iso)) / 864e5));
  if (d < 1) return "today";
  if (d < 31) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

const O = { bg: "#181411", deep: "#120f0d", fg: "#ffffff", dim: "rgba(255,255,255,.45)", dim2: "rgba(255,255,255,.62)", faint: "rgba(255,255,255,.1)", acc: "#f27f0d", acc2: "#f7a04b", ok: "#22c55e", off: "#6b6158" };
const T = { bg: "#120f0d", bar: "#1f1915", line: "#3a2e24", fg: "#f5ede6", dim: "#8a7a6c", acc: "#f27f0d", acc2: "#f7a04b" };
const HEAT = ["#2a211a", "#5a3514", "#9a5410", "#d46e0e", "#f7a04b"];
const RM = "@media (prefers-reduced-motion: reduce){*{animation:none!important}}";

const CSS = `text{font-family:${SANS}}
.m{font-family:${MONO}}
.fade{animation:fade .5s ease-out backwards}
.grow{transform-box:fill-box;transform-origin:bottom;animation:grow .6s cubic-bezier(.2,.8,.2,1) backwards}
.growx{transform-box:fill-box;transform-origin:left;animation:growx .7s cubic-bezier(.2,.8,.2,1) backwards}
.draw{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.4s ease-out .3s forwards}
.hc{animation:fade .3s ease-out backwards}
.pulse{animation:pulse 1.6s ease-in-out infinite}
.ping{transform-box:fill-box;transform-origin:center;animation:ping 1.6s cubic-bezier(0,0,.2,1) infinite}
@keyframes fade{from{opacity:0}}
@keyframes grow{from{transform:scaleY(0)}}
@keyframes growx{from{transform:scaleX(0)}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes pulse{50%{opacity:.35}}
@keyframes ping{75%,100%{transform:scale(2.4);opacity:0}}
${RM}`;

function shell(W, H, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>${FONT_CSS}
${CSS}</style>
<defs>
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${O.acc}" stroke-opacity=".06"/></pattern>
<radialGradient id="glow" cx=".2" cy=".15" r=".7"><stop offset="0" stop-color="${O.acc}" stop-opacity=".09"/><stop offset="1" stop-color="${O.acc}" stop-opacity="0"/></radialGradient>
<linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${O.acc}" stop-opacity=".35"/><stop offset="1" stop-color="${O.acc}" stop-opacity="0"/></linearGradient>
<clipPath id="oc"><rect width="${W}" height="${H}" rx="12"/></clipPath>
</defs>
<g clip-path="url(#oc)">
<rect width="${W}" height="${H}" fill="${O.bg}"/><rect width="${W}" height="${H}" fill="url(#grid)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>
${body}
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="none" stroke="${O.faint}"/>
</svg>`;
}
const lbl = (x, y, t, anchor = "start", col = O.acc) => `<text class="m" x="${x}" y="${y}" text-anchor="${anchor}" fill="${col}" font-size="9" letter-spacing="1.2"${col === O.acc ? ' opacity=".85"' : ""}>${esc(t)}</text>`;
const panel = (x, y, w, h, title, right = "") => `<rect x="${x + .5}" y="${y + .5}" width="${w - 1}" height="${h - 1}" rx="8" fill="${O.deep}" fill-opacity=".75" stroke="${O.faint}"/>${lbl(x + 14, y + 20, "// " + title)}${right ? lbl(x + w - 14, y + 20, right, "end", O.dim) : ""}`;

// Weeks are columns, weekday (from the date itself) is the row.
function heat(weeks, x0, y0, s, g) {
  const lvl = levels(weeks.flatMap(w => w.contributionDays.map(d => d.contributionCount)));
  return weeks.map((w, wi) => w.contributionDays.map(d => {
    const row = new Date(d.date + "T00:00:00Z").getUTCDay();
    return `<rect class="hc" x="${x0 + wi * (s + g)}" y="${y0 + row * (s + g)}" width="${s}" height="${s}" rx="2" fill="${HEAT[lvl(d.contributionCount)]}" style="animation-delay:${wi * 16}ms"/>`;
  }).join("")).join("");
}

export function header(d, s, profile) {
  const peak = s.hours.indexOf(Math.max(...s.hours));
  const status = (x, label, on = true, pulse = false) => `<circle class="${pulse ? "pulse" : ""}" cx="${x}" cy="14" r="2.6" fill="${on ? O.ok : O.off}"/><text class="m" x="${x + 8}" y="17.5" fill="${O.dim}" font-size="9" letter-spacing="1.5">${esc(label)}</text>`;
  const left = [["GITHUB_API: SYNCED", true, true], [`STREAK: ${s.current ? "ACTIVE" : "IDLE"}`, s.current > 0], ["BUILD: PASSING", true]];
  let x = 24, statusSvg = "";
  for (const [t, on, pulse] of left) { statusSvg += status(x, t, on, pulse); x += 8 + measure(t, { mono: true, size: 9, ls: 1.5 }) + 22; }
  const region = (d.location ?? "").split(",").map(p => p.trim().toUpperCase().replace(/\s+/g, "-")).filter(Boolean).join("-");
  // Most important first; drop from the end until it fits next to the status lights.
  const parts = [`SYNC: ${d.now.slice(0, 10)}`, `UPTIME: ${s.age.toUpperCase()}`, region && `REGION: ${region}`, `PEAK: ${String(peak).padStart(2, "0")}:00`].filter(Boolean);
  const fits = p => measure(p.join("  ·  "), { mono: true, size: 9, ls: 1.5 }) < 816 - x;
  while (parts.length > 1 && !fits(parts)) parts.pop();

  const ymax = Math.max(1, ...d.years.map(y => y[1])), n = d.years.length, bw = 292 / n, bar = Math.min(26, bw * .72);
  const years = d.years.map(([yr, v], i) => {
    const h = Math.max(2, v / ymax * 84), bx = 510 + i * bw + (bw - bar) / 2;
    return `<rect class="grow" x="${bx.toFixed(1)}" y="${(164 - h).toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${O.acc}" opacity="${i === n - 1 ? 1 : (.35 + .5 * v / ymax).toFixed(2)}" style="animation-delay:${.3 + i * .07}s"/>
<text class="m" x="${(bx + bar / 2).toFixed(1)}" y="${(160 - h).toFixed(1)}" text-anchor="middle" fill="${O.dim2}" font-size="8.5">${k(v)}</text>
<text class="m" x="${(bx + bar / 2).toFixed(1)}" y="178" text-anchor="middle" fill="${O.dim}" font-size="8.5">'${String(yr).slice(2)}</text>`;
  }).join("");

  // Only calendar aggregates here: they are complete, private work included.
  const kp = [[fmt(s.allTime), "ALL-TIME CONTRIB"], [fmt(s.total), "LAST 12 MONTHS"], [fmt(d.private12), "PRIVATE · 12 MO"], [s.longest + "d", "BEST STREAK"], [Math.round(s.active / s.days.length * 100) + "%", "ACTIVE DAYS / YR"], [fmt(d.publicRepos), "PUBLIC REPOS"]];
  const kpis = kp.map(([v, l], i) => `<g class="fade" style="animation-delay:${.5 + i * .07}s"><rect x="${28 + i * 131}" y="208" width="2" height="42" fill="${O.acc}"/><text x="${42 + i * 131}" y="231" fill="${O.fg}" font-size="22" font-weight="700">${esc(v)}</text><text class="m" x="${42 + i * 131}" y="246" fill="${O.dim}" font-size="8.5" letter-spacing="1">${l}</text></g>`).join("");

  const pillW = 44 + measure(profile.role, { weight: 700, size: 9.5, ls: 1.6 }) + 14;
  const tag = line => esc(line).replace(/\|([^|]+)\|/g, `<tspan fill="${O.acc}" opacity="1">$1</tspan>`);

  const recent = s.recent.map(([n, t]) => `<tspan fill="${O.fg}">${esc(n)}</tspan> ${ago(t, d.now)}`);
  let now = `<tspan fill="${O.acc}">▸ RECENTLY PUSHED  </tspan>${recent.join("   ·   ")}`;
  const plain = `▸ RECENTLY PUSHED  ${s.recent.map(([n, t]) => `${n} ${ago(t, d.now)}`).join("   ·   ")}   ·   "${profile.quote}"`;
  if (measure(plain, { mono: true, size: 9.5, ls: .6 }) < 784) now += `   ·   "${esc(profile.quote)}"`;

  return shell(840, 300, `
<rect width="840" height="28" fill="${O.deep}"/><rect y="28" width="840" height="1" fill="${O.acc}" opacity=".12"/>
${statusSvg}
<text class="m" x="816" y="17.5" text-anchor="end" fill="${O.dim}" font-size="9" letter-spacing="1.5">${esc(parts.join("  ·  "))}</text>
<g class="fade">
<rect x="28.5" y="50.5" width="${pillW.toFixed(1)}" height="22" rx="11" fill="${O.acc}" fill-opacity=".1" stroke="${O.acc}" stroke-opacity=".25"/>
<circle class="ping" cx="44" cy="61.5" r="3" fill="${O.acc}" opacity=".7"/><circle cx="44" cy="61.5" r="3" fill="${O.acc}"/>
<text x="56" y="65" fill="${O.acc}" font-size="9.5" font-weight="700" letter-spacing="1.6">${esc(profile.role)}</text>
<text x="28" y="116" fill="${O.fg}" font-size="34" font-weight="700" letter-spacing="-.5">${esc(d.name ?? d.login)}</text>
${profile.tagline.map((l, i) => `<text x="28" y="${146 + i * 20}" fill="${O.fg}" font-size="15" opacity=".6">${tag(l)}</text>`).join("")}
</g>
${panel(496, 44, 316, 146, `CONTRIB/YEAR · ${d.years[0][0]}→${d.years.at(-1)[0]}`)}
${years}
${kpis}
<rect x="28" y="270" width="784" height="1" fill="${O.faint}"/>
<text class="m fade" x="28" y="288" fill="${O.dim}" font-size="9.5" letter-spacing=".6" style="animation-delay:1s">${now}</text>`, `${d.name}: ${fmt(s.allTime)} contributions since ${d.years[0][0]}`);
}

const TERM_CSS = `.t text{font-family:${MONO};font-size:12.5px;white-space:pre}
.ln{animation:tfade .35s ease-out backwards}
.cover{animation:type 1s steps(22) .2s forwards}
.cur{animation:blink 1s steps(1) infinite}
@keyframes tfade{from{opacity:0;transform:translateY(3px)}}
@keyframes type{to{transform:translateX(170px)}}
@keyframes blink{50%{opacity:0}}`;

export function terminal(d, s) {
  const C = T, h = 470;
  const logo = ["██╗    ██╗", "██║    ██║", "██║ █╗ ██║", "██║███╗██║", "╚███╔███╔╝", " ╚══╝╚══╝ "];
  const info = [["user", d.login.toLowerCase()], ["name", d.name ?? d.login], ["host", d.location ?? "—"], ["uptime", `${s.age} on GitHub`], ["repos", `${d.publicRepos} public · ${s.stars} ★`], ["contrib", `${fmt(s.total)} in 12 months`], ["private", `${fmt(d.private12)} contributions`], ["prs", `${fmt(d.counts.prs12)} opened · ${fmt(d.counts.reviews12)} reviewed`], ["streak", `${s.current}d now · ${s.longest}d best`]];
  const top5 = s.langs.slice(0, 5), other = Math.max(0, 100 - top5.reduce((a, l) => a + l[1], 0));
  const meters = [...top5, ["Other", other]];
  const infoTxt = info.map(([key, v], i) => `<text class="ln" x="150" y="${96 + i * 20}" style="animation-delay:${1.2 + i * .08}s"><tspan fill="${C.acc}">${key.padEnd(8, " ")}</tspan><tspan fill="${C.fg}">${esc(pad(v, 34))}</tspan></text>`).join("");
  const meterTxt = meters.map(([n, p], i) => {
    const b = Math.max(1, Math.round(p / 5));
    return `<text class="ln" x="480" y="${118 + i * 21}" style="animation-delay:${1.5 + i * .08}s"><tspan fill="${C.fg}">${esc(pad(n, 11))}</tspan><tspan fill="${C.dim}">[</tspan><tspan fill="${C.acc}">${"|".repeat(b)}</tspan><tspan fill="${C.line}">${"·".repeat(20 - b)}</tspan><tspan fill="${C.dim}">]</tspan><tspan fill="${C.acc2}"> ${p.toFixed(1).padStart(5, " ")}%</tspan></text>`;
  }).join("");
  const tot = s.top.reduce((a, r) => a + r.count, 0) || 1;
  const rows = s.top.map((r, i) => {
    const pct = r.count / tot * 100, b = Math.max(1, Math.round(pct / 100 * 14));
    const pid = String(1024 + ((i * 7919) % 8000)).padStart(5, " ");
    return `<text class="ln" x="28" y="${316 + i * 19}" style="animation-delay:${2.3 + i * .07}s"><tspan fill="${C.dim}">${pid}  </tspan><tspan fill="${r.private ? C.dim : C.fg}">${esc(pad(r.name, 30))}</tspan><tspan fill="${C.dim}">${r.private ? "private  " : "public   "}</tspan><tspan fill="${C.acc2}">${String(r.count).padStart(7, " ")}  </tspan><tspan fill="${C.acc}">${"█".repeat(b)}</tspan><tspan fill="${C.line}">${"░".repeat(14 - b)}</tspan><tspan fill="${C.fg}"> ${pct.toFixed(1).padStart(5, " ")}%</tspan></text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="${h}" viewBox="0 0 840 ${h}" role="img" aria-label="Terminal: profile, languages and most active repositories">
<title>Terminal: profile, languages and most active repositories</title>
<style>${FONT_CSS}
${TERM_CSS}
${RM}</style>
<defs><pattern id="scan" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#fff" opacity=".025"/></pattern></defs>
<g class="t">
<rect x=".5" y=".5" width="839" height="${h - 1}" rx="12" fill="${C.bg}" stroke="${C.line}"/>
<path d="M12 .5H828A11.5 11.5 0 0 1 839.5 12V32H.5V12A11.5 11.5 0 0 1 12 .5Z" fill="${C.bar}"/>
<circle cx="20" cy="16" r="5.5" fill="#ff5f57"/><circle cx="38" cy="16" r="5.5" fill="#febc2e"/><circle cx="56" cy="16" r="5.5" fill="#28c840"/>
<text x="420" y="20" text-anchor="middle" fill="${C.dim}" style="font-size:12px">${esc(d.login.toLowerCase())}@github: ~</text>
<text x="28" y="62"><tspan fill="${C.acc}">❯ </tspan><tspan fill="${C.fg}">neofetch --user ${esc(d.login.toLowerCase())}</tspan></text>
<rect class="cover" x="44" y="48" width="170" height="20" fill="${C.bg}"/>
${logo.map((l, i) => `<text class="ln" x="28" y="${100 + i * 17}" fill="${C.acc}" style="animation-delay:${1.1 + i * .05}s;font-size:13px">${l}</text>`).join("")}
${infoTxt}
<text class="ln" x="480" y="96" fill="${C.dim}" style="animation-delay:1.4s">languages ─ public repos, by bytes</text>
${meterTxt}
<text class="ln" x="28" y="272" style="animation-delay:2s"><tspan fill="${C.acc}">❯ </tspan><tspan fill="${C.fg}">top -o commits --since=12mo --scope=public,personal</tspan></text>
<rect x="28" y="283" width="784" height="18" fill="${C.acc}" opacity=".14"/>
<text class="ln" x="28" y="296" style="animation-delay:2.2s" fill="${C.acc2}">  PID  ${"REPO".padEnd(30, " ")}VISIBILITY COMMITS  SHARE</text>
${rows}
<text x="28" y="${h - 18}" fill="${C.acc}">❯ </text><rect class="cur" x="44" y="${h - 29}" width="8" height="15" fill="${C.acc2}"/>
</g>
<rect width="840" height="${h}" rx="12" fill="url(#scan)"/>
</svg>`;
}

export function observability(d, s) {
  const W = s.weekly, max = Math.max(1, ...W), avg = W.reduce((a, b) => a + b, 0) / W.length;
  const bw = 358 / W.length, base = 221;
  const p1 = W.map((v, i) => { const hh = Math.max(1.5, v / max * 130); return `<rect class="grow" x="${(42 + i * bw).toFixed(1)}" y="${(base - hh).toFixed(1)}" width="${(bw - 1.6).toFixed(1)}" height="${hh.toFixed(1)}" fill="${O.acc}" opacity="${v > avg ? 1 : .45}" style="animation-delay:${.2 + i * .012}s"/>`; }).join("");
  const avgY = base - avg / max * 130;

  const cx = 540, cy = 150, r0 = 22, hm = Math.max(1, ...s.hours), htot = s.hours.reduce((a, b) => a + b, 0) || 1;
  const spokes = s.hours.map((v, i) => {
    const a = (i / 24) * 2 * Math.PI - Math.PI / 2, len = 4 + v / hm * 42;
    const [x1, y1, x2, y2] = [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len)].map(n => n.toFixed(1));
    return `<line class="fade" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${O.acc}" stroke-width="6" stroke-linecap="round" opacity="${(.25 + .75 * v / hm).toFixed(2)}" style="animation-delay:${.3 + i * .03}s"/>`;
  }).join("");
  const hl = [0, 6, 12, 18].map(i => { const a = i / 24 * 2 * Math.PI - Math.PI / 2; return `<text class="m" x="${(cx + Math.cos(a) * 81).toFixed(1)}" y="${(cy + Math.sin(a) * 81 + 3).toFixed(1)}" text-anchor="middle" fill="${O.dim}" font-size="8.5">${String(i).padStart(2, "0")}</text>`; }).join("");
  const sum = (a, b) => s.hours.slice(a, b).reduce((x, y) => x + y, 0) / htot * 100;
  const peak = s.hours.indexOf(hm);

  const dmax = Math.max(1, ...s.dow.map(x => x[1])), dtot = s.dow.reduce((a, x) => a + x[1], 0) || 1;
  const p3 = s.dow.map(([day, v], i) => `<text class="m" x="42" y="${289 + i * 20}" fill="${i > 4 ? O.dim : O.dim2}" font-size="9">${day}</text><rect class="growx" x="76" y="${280 + i * 20}" width="${Math.max(1, v / dmax * 262).toFixed(1)}" height="11" rx="2" fill="${O.acc}" opacity="${i > 4 ? .4 : 1}" style="animation-delay:${.4 + i * .06}s"/><text class="m" x="400" y="${289 + i * 20}" text-anchor="end" fill="${O.fg}" font-size="9">${fmt(v)}</text>`).join("");
  const wkend = (s.dow[5][1] + s.dow[6][1]) / dtot * 100;

  const M = s.months, mm = Math.max(1, ...M.map(x => x[1]));
  const pts = M.map(([, v], i) => [454 + i * (330 / Math.max(1, M.length - 1)), 422 - v / mm * 110]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const area = `${line}L${pts.at(-1)[0].toFixed(1)},422L${pts[0][0].toFixed(1)},422Z`;
  const q = a => a.reduce((x, m) => x + m[1], 0);
  const first3 = q(M.slice(0, 3)), last3 = q(M.slice(-4, -1)); // skip the running month
  const trend = first3 ? `${last3 >= first3 ? "+" : ""}${Math.round((last3 / first3 - 1) * 100)}% VS FIRST QUARTER` : "";
  const peakM = M.reduce((b, m, i) => m[1] > M[b][1] ? i : b, 0);
  const mon = ym => "JFMAMJJASOND"[Number(ym.slice(5, 7)) - 1];

  return shell(840, 460, `
${lbl(28, 24, "// OBSERVABILITY · LAST 12 MONTHS")}${lbl(812, 24, "SRC: GITHUB GRAPHQL + SEARCH API", "end", O.dim)}
${panel(28, 36, 386, 204, "THROUGHPUT · CONTRIB/WEEK", `AVG ${Math.round(avg)}/WK · PEAK ${max}`)}
${p1}
<line x1="42" x2="400" y1="${avgY.toFixed(1)}" y2="${avgY.toFixed(1)}" stroke="${O.fg}" stroke-opacity=".35" stroke-dasharray="3 3"/>
${panel(426, 36, 386, 204, "COMMIT CLOCK · PUBLIC + PERSONAL", `${fmt(s.commits12)} COMMITS`)}
<circle cx="${cx}" cy="${cy}" r="${r0 - 6}" fill="none" stroke="${O.faint}"/>
<circle cx="${cx}" cy="${cy}" r="70" fill="none" stroke="${O.faint}" stroke-dasharray="2 4"/>
${spokes}${hl}
<text x="660" y="112" fill="${O.fg}" font-size="28" font-weight="700">${String(peak).padStart(2, "0")}:00</text>
<text class="m" x="660" y="128" fill="${O.dim}" font-size="8.5" letter-spacing="1">PEAK HOUR</text>
<text x="660" y="162" fill="${O.fg}" font-size="18" font-weight="700">${sum(10, 18).toFixed(0)}%</text>
<text class="m" x="660" y="176" fill="${O.dim}" font-size="8.5" letter-spacing="1">BETWEEN 10H–18H</text>
<text x="660" y="206" fill="${O.fg}" font-size="18" font-weight="700">${sum(0, 6).toFixed(1)}%</text>
<text class="m" x="660" y="220" fill="${O.dim}" font-size="8.5" letter-spacing="1">00H–06H · NIGHT OWL</text>
${panel(28, 252, 386, 196, "LOAD BY WEEKDAY", `WEEKEND ${wkend.toFixed(1)}%`)}
${p3}
${panel(426, 252, 386, 196, "MONTHLY TREND", trend)}
<path class="fade" d="${area}" fill="url(#area)" style="animation-delay:.6s"/>
<path class="draw" d="${line}" pathLength="1" fill="none" stroke="${O.acc}" stroke-width="2" stroke-linejoin="round"/>
${pts.map((p, i) => `<text class="m" x="${p[0].toFixed(1)}" y="438" text-anchor="middle" fill="${O.dim}" font-size="8.5">${mon(M[i][0])}</text>`).join("")}
<circle cx="${pts[peakM][0].toFixed(1)}" cy="${pts[peakM][1].toFixed(1)}" r="4" fill="${O.bg}" stroke="${O.acc}" stroke-width="2"/>
<text class="m" x="${(pts[peakM][0] + (peakM > M.length - 3 ? -8 : 8)).toFixed(1)}" y="${(pts[peakM][1] + 3).toFixed(1)}" text-anchor="${peakM > M.length - 3 ? "end" : "start"}" fill="${O.fg}" font-size="9">${fmt(M[peakM][1])}</text>`, "Observability: weekly throughput, commit clock, weekday load and monthly trend");
}

export function deployLog(d, s) {
  const names = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  // Label a column only when the 1st of a month falls in it.
  const months = s.weeks.map((w, wi) => {
    const first = w.contributionDays.find(x => x.date.endsWith("-01"));
    if (!first || wi > s.weeks.length - 3) return "";
    return `<text class="m" x="${28 + wi * 14}" y="46" fill="${O.dim}" font-size="8.5">${names[Number(first.date.slice(5, 7)) - 1]}</text>`;
  }).join("");
  const days = ["", "MON", "", "WED", "", "FRI", ""].map((x, i) => x ? `<text class="m" x="796" y="${63 + i * 14}" fill="${O.dim}" font-size="8">${x}</text>` : "").join("");
  const st = [[`${s.active}/${s.days.length}`, "ACTIVE DAYS"], [s.bestDay, "BEST DAY"], [s.current + "d", "CURRENT STREAK"], [s.longest + "d", "LONGEST STREAK"]];
  return shell(840, 220, `
${lbl(28, 24, `// DEPLOY_LOG · LAST ${s.weeks.length} WEEKS`)}${lbl(812, 24, fmt(s.total) + " EVENTS", "end", O.dim)}
${months}${days}
${heat(s.weeks, 28, 54, 11, 3)}
<text class="m" x="28" y="184" fill="${O.dim}" font-size="8.5">LESS</text>
${HEAT.map((c, i) => `<rect x="${56 + i * 13}" y="176" width="10" height="10" rx="2" fill="${c}"/>`).join("")}
<text class="m" x="124" y="184" fill="${O.dim}" font-size="8.5">MORE</text>
${st.map(([v, l], i) => `<rect x="${300 + i * 130}" y="166" width="2" height="36" fill="${O.acc}"/><text x="${312 + i * 130}" y="184" fill="${O.fg}" font-size="18" font-weight="700">${esc(v)}</text><text class="m" x="${312 + i * 130}" y="198" fill="${O.dim}" font-size="8" letter-spacing="1">${l}</text>`).join("")}`, `Contribution calendar: ${fmt(s.total)} contributions in the last year`);
}

// Greedy word wrap using real glyph widths.
function wrap(text, max, opts, lines = 2) {
  const out = [""];
  for (const word of text.split(/\s+/)) {
    const next = out.at(-1) ? `${out.at(-1)} ${word}` : word;
    if (measure(next, opts) <= max) { out[out.length - 1] = next; continue; }
    if (out.length === lines) { out[out.length - 1] += "…"; break; }
    out.push(word);
  }
  return out;
}

export function project(p, now) {
  const name = p.nameWithOwner.split("/")[1];
  const nameSize = measure(name, { weight: 700, size: 22 }) > 372 ? 17 : 22;
  const descOpts = { size: 12.5 };
  const desc = wrap(p.description || p.desc || "", 372, descOpts);
  const spec = p.external
    ? [["OWNER", p.nameWithOwner.split("/")[0]], ["LANGUAGE", p.primaryLanguage?.name ?? "—"], ["PROJECT STARS", fmt(p.stargazerCount)], ["LAST PUSH", p.pushedAt.slice(0, 10)]]
    : [["LANGUAGE", p.primaryLanguage?.name ?? "—"], ["STARS", fmt(p.stargazerCount)], ["FORKS", fmt(p.forkCount)], ["LAST PUSH", p.pushedAt.slice(0, 10)]];
  const metrics = p.external
    ? [[fmt(p.myPrsMerged), "MY PRS MERGED"], [fmt(p.myCommits), "MY COMMITS"]]
    : [[fmt(p.myCommits), "COMMITS / 12MO"], [fmt(p.myPrsMerged), "PRS MERGED"], [ago(p.pushedAt, now).toUpperCase(), "LAST ACTIVITY"]];
  const specSvg = spec.map(([a, b], i) => { const x = 20 + (i % 2) * 196, y = 128 + Math.floor(i / 2) * 22; return `<text class="m" x="${x}" y="${y}" fill="${O.dim}" font-size="9" letter-spacing=".8">${a}</text><text class="m" x="${x + 176}" y="${y}" text-anchor="end" fill="${O.fg}" font-size="9">${esc(b)}</text><rect x="${x}" y="${y + 7}" width="176" height="1" fill="${O.faint}"/>`; }).join("");
  return shell(412, 236, `
<text x="20" y="34" fill="${O.acc}" font-size="10" font-weight="700" letter-spacing="1.6">${esc(p.cat)}</text>
<text class="m" x="392" y="34" text-anchor="end" fill="${O.dim}" font-size="9">↗ ${p.external ? "EXTERNAL REPO" : "OPEN REPO"}</text>
<text x="20" y="66" fill="${O.fg}" font-size="${nameSize}" font-weight="700">${esc(name)}</text>
${desc.map((l, i) => `<text x="20" y="${88 + i * 16}" fill="${O.dim2}" font-size="12.5">${esc(l)}</text>`).join("")}
${specSvg}
<rect x="20" y="180" width="372" height="1" fill="${O.faint}"/>
${metrics.map(([v, l], i) => `<text x="${20 + i * 130}" y="208" fill="${O.acc}" font-size="20" font-weight="700">${esc(v)}</text><text class="m" x="${20 + i * 130}" y="222" fill="${O.dim}" font-size="8" letter-spacing="1">${l}</text>`).join("")}`, `${p.nameWithOwner}: ${p.description || p.desc || ""}`);
}

export function stack(groups) {
  const cols = 3, gapX = 20, rowH = 22, colW = (784 - gapX * (cols - 1)) / cols;
  const chipOpts = { weight: 500, size: 10.5 };
  const layout = groups.map(([t, items]) => {
    let x = 0, y = 0;
    const chips = items.map(([n, fav]) => {
      const w = measure(n, chipOpts) + (fav ? 30 : 20);
      if (x > 0 && x + w > colW) { x = 0; y += rowH + 5; }
      const c = { n, fav, x, y, w };
      x += w + 5;
      return c;
    });
    return { t, chips, h: y + rowH };
  });
  const rows = Math.ceil(groups.length / cols);
  const rowH2 = Array.from({ length: rows }, (_, r) => Math.max(...layout.slice(r * cols, r * cols + cols).map(g => g.h)));
  const rowY = rowH2.map((_, r) => 56 + rowH2.slice(0, r).reduce((a, h) => a + h + 42, 0));
  const total = groups.reduce((a, g) => a + g[1].length, 0);
  const out = layout.map((g, i) => {
    const gx = 28 + (i % cols) * (colW + gapX), gy = rowY[Math.floor(i / cols)];
    return lbl(gx, gy, "// " + g.t) + g.chips.map((c, j) => {
      const cx = gx + c.x, cy = gy + 11 + c.y;
      const tx = c.fav ? cx + 20 + (c.w - 30) / 2 : cx + c.w / 2;
      return `<g class="fade" style="animation-delay:${.06 * i + .02 * j}s"><rect x="${(cx + .5).toFixed(1)}" y="${cy + .5}" width="${c.w.toFixed(1)}" height="${rowH - 1}" rx="5" fill="${c.fav ? O.acc : "#fff"}" fill-opacity="${c.fav ? .1 : .03}" stroke="${c.fav ? O.acc : O.faint}" stroke-opacity="${c.fav ? .45 : 1}"/>${c.fav ? `<circle cx="${(cx + 11).toFixed(1)}" cy="${cy + 11}" r="2.3" fill="${O.acc}"/>` : ""}<text x="${tx.toFixed(1)}" y="${cy + 14.5}" text-anchor="middle" fill="${c.fav ? O.fg : O.dim2}" font-size="10.5" font-weight="500">${esc(c.n)}</text></g>`;
    }).join("");
  }).join("");
  const H = rowY.at(-1) + rowH2.at(-1) + 32;
  return shell(840, H, `${lbl(28, 24, `// STACK_MANIFEST · ${total} TECHNOLOGIES`)}${lbl(812, 24, "● DAILY DRIVER", "end", O.dim)}
<rect x="28" y="34" width="784" height="1" fill="${O.faint}"/>${out}`, `Stack: ${total} technologies`);
}
