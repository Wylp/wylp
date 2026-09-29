// node scripts/test.mjs — offline checks with a synthetic dataset (no network, no token).
import assert from "node:assert/strict";
import { streaks, levels, topRepos, privateNames } from "./github.mjs";
import { esc, measure } from "./render.mjs";
import { guard, renderAll } from "./build.mjs";
import { PROJECTS } from "./config.mjs";

const day = (date, c) => ({ date, contributionCount: c });

// Streaks: an empty "today" does not break the current streak.
assert.deepEqual(streaks([day("2026-01-01", 1), day("2026-01-02", 0), day("2026-01-03", 2), day("2026-01-04", 3), day("2026-01-05", 0)], "2026-01-05"), { current: 2, longest: 2 });
assert.deepEqual(streaks([day("2026-01-01", 1), day("2026-01-02", 1), day("2026-01-03", 1)], "2026-01-03"), { current: 3, longest: 3 });
assert.equal(streaks([day("2026-01-01", 1), day("2026-01-02", 0), day("2026-01-03", 0)], "2026-01-03").current, 0);

// Heat levels: 0 stays empty, the max lands on the top bucket.
const lvl = levels([0, 1, 2, 3, 4, 10]);
assert.equal(lvl(0), 0);
assert.equal(lvl(10), 4);

// Private repos never keep their name.
const samples = [
  ...Array(5).fill({ repo: "acme/secret-billing", private: true }),
  ...Array(3).fill({ repo: "acme/secret-infra", private: true }),
  ...Array(4).fill({ repo: "me/public-app", private: false }),
].map((s, i) => ({ ...s, date: `2026-03-0${1 + (i % 9)}T1${i % 10}:00:00-03:00` }));
const top = topRepos(samples);
assert.deepEqual(top.map(r => r.name), ["2 private repos", "me/public-app"]);
assert.equal(top[0].count, 8);
assert.ok(privateNames(samples).includes("secret-billing"));

// Guard: blocks private names and the token, passes clean output.
assert.throws(() => guard({ "a.svg": "<svg>acme/secret-billing</svg>" }, privateNames(samples)), /private identifier/);
assert.throws(() => guard({ "a.svg": "<svg>ghp_abc123</svg>" }, ["ghp_abc123"]), /private identifier/);
assert.throws(() => guard({ "a.svg": "<svg>NaN</svg>" }, []), /invalid value/);
guard({ "a.svg": "<svg>ok</svg>" }, privateNames(samples));

// Escaping and measuring.
assert.equal(esc(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
assert.equal(measure("abc", { mono: true, size: 10 }), 18);
assert.ok(measure("MMMM", { weight: 700, size: 10 }) > measure("iiii", { weight: 700, size: 10 }));

// Full render on synthetic data: every file renders and none leaks a private name.
const start = Date.UTC(2025, 8, 28);
const weeks = Array.from({ length: 53 }, (_, w) => ({ contributionDays: Array.from({ length: w === 52 ? 3 : 7 }, (_, d) => day(new Date(start + (w * 7 + d) * 864e5).toISOString().slice(0, 10), (w * 7 + d) % 5)) }));
const data = {
  login: "Tester", name: "Test <User>", location: "Santos, SP", createdAt: "2019-10-17T00:00:00Z", now: "2026-09-29T12:00:00Z",
  repos: [{ name: "public-app", nameWithOwner: "me/public-app", stargazerCount: 3, pushedAt: "2026-09-20T00:00:00Z", languages: { edges: [{ size: 900, node: { name: "TypeScript" } }, { size: 100, node: { name: "Rust" } }] } }],
  publicRepos: 1, calendar: { totalContributions: 700, weeks },
  years: [[2025, 300], [2026, 400]], allDays: weeks.flatMap(w => w.contributionDays),
  samples, counts: { commitsAll: 10, prsMergedAll: 5, prs12: 4, merged12: 3, reviews12: 2 },
  featured: PROJECTS.map(p => ({ ...p, nameWithOwner: p.repo, description: null, stargazerCount: 1, forkCount: 0, pushedAt: "2026-09-01T00:00:00Z", primaryLanguage: { name: "Swift" }, myPrsMerged: 1, myCommits: 2 })),
};
const files = renderAll(data);
guard(files, privateNames(samples));
assert.ok(files["header.svg"].includes("Test &lt;User&gt;"));
assert.equal(Object.keys(files).length, 5 + PROJECTS.length);
for (const [name, svg] of Object.entries(files)) assert.ok(svg.startsWith("<svg") && svg.trimEnd().endsWith("</svg>"), name);

console.log("ok: all checks passed");
