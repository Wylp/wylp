// Entry point: node scripts/build.mjs (needs GH_TOKEN; in CI it comes from the PROFILE_TOKEN secret).
import { mkdir, writeFile } from "node:fs/promises";
import { LOGIN, PROFILE, PROJECTS, STACK } from "./config.mjs";
import { client, collect, derive, privateNames } from "./github.mjs";
import * as R from "./render.mjs";

// Refuses to publish if any output could leak a private repo name or the token itself.
export function guard(files, secrets) {
  const needles = secrets.filter(n => n && n.length >= 4).map(n => n.toLowerCase());
  for (const [file, svg] of Object.entries(files)) {
    const hay = svg.toLowerCase();
    const hit = needles.find(n => hay.includes(n));
    if (hit !== undefined) throw new Error(`Refusing to write ${file}: it contains a private identifier`);
    if (/undefined|NaN|\[object /.test(svg)) throw new Error(`Refusing to write ${file}: rendering produced an invalid value`);
  }
}

export function renderAll(data) {
  const s = derive(data);
  const files = {
    "header.svg": R.header(data, s, PROFILE),
    "terminal.svg": R.terminal(data, s),
    "observability.svg": R.observability(data, s),
    "deploy-log.svg": R.deployLog(data, s),
    "stack.svg": R.stack(STACK),
  };
  for (const p of data.featured) files[`project-${p.nameWithOwner.split("/")[1].toLowerCase()}.svg`] = R.project(p, data.now);
  return files;
}

async function main() {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error("GH_TOKEN is not set. Add the PROFILE_TOKEN repository secret.");
  const data = await collect(client(token), LOGIN, PROJECTS);
  // An empty calendar means the API answered badly: keep yesterday's SVGs instead of publishing zeros.
  if (!data.calendar.totalContributions || !data.samples.length) throw new Error("GitHub returned no activity; keeping the previous SVGs");
  const files = renderAll(data);
  guard(files, [...privateNames(data.samples), token]);
  const out = new URL("../assets/", import.meta.url);
  await mkdir(out, { recursive: true });
  for (const [name, svg] of Object.entries(files)) await writeFile(new URL(name, out), svg);
  console.log(`wrote ${Object.keys(files).length} SVGs · ${data.calendar.totalContributions} contributions · ${data.samples.length} commits sampled`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
