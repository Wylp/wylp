// Fetches everything the dashboard shows. Totals come from the contribution calendar, which GitHub
// publishes with private work included as one anonymous aggregate. Details (PRs, commit times, repos)
// come from the Search API and only cover what the token owner can see: public + personal repos.
// Nothing here reads repositories of organizations the token isn't scoped to.
const API = "https://api.github.com";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = d => d.toISOString().slice(0, 10);
const DAY = 864e5;

export function client(token) {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "wylp-profile-dashboard" };
  let lastSearch = 0;

  async function req(url, init = {}, tries = 3) {
    const res = await fetch(url, { ...init, headers: { ...headers, ...init.headers } });
    if ((res.status === 403 || res.status === 429) && tries > 1) {
      const wait = Number(res.headers.get("retry-after") || 60) * 1000;
      await sleep(wait);
      return req(url, init, tries - 1);
    }
    // Only status + path: never echo headers, bodies or the token.
    if (!res.ok) throw new Error(`GitHub API ${res.status} on ${new URL(url).pathname}`);
    return res.json();
  }

  return {
    async gql(query, variables = {}) {
      const json = await req(`${API}/graphql`, { method: "POST", body: JSON.stringify({ query, variables }) });
      if (json.errors) throw new Error("GraphQL: " + json.errors.map(e => e.message).join("; "));
      return json.data;
    },
    // Search allows 30 req/min per token: space calls ~2.1s apart.
    async search(kind, q, { page = 1, per = 100 } = {}) {
      const wait = lastSearch + 2100 - Date.now();
      if (wait > 0) await sleep(wait);
      lastSearch = Date.now();
      return req(`${API}/search/${kind}?q=${encodeURIComponent(q)}&per_page=${per}&page=${page}`);
    },
  };
}

const count = async (gh, kind, q) => (await gh.search(kind, q, { per: 1 })).total_count;

// Search caps results at 1000 per query, so walk month-sized windows and split any that overflow.
async function commitsBetween(gh, login, from, to) {
  const q = `author:${login} author-date:${iso(from)}..${iso(to)}`;
  const first = await gh.search("commits", q);
  if (first.total_count > 1000 && to - from >= DAY) {
    const mid = new Date(from.getTime() + Math.floor((to - from) / DAY / 2) * DAY);
    return [...await commitsBetween(gh, login, from, mid), ...await commitsBetween(gh, login, new Date(mid.getTime() + DAY), to)];
  }
  const items = [...first.items];
  for (let p = 2; p <= Math.ceil(Math.min(first.total_count, 1000) / 100); p++) items.push(...(await gh.search("commits", q, { page: p })).items);
  return items.map(i => ({ date: i.commit.author.date, repo: i.repository.full_name, private: i.repository.private }));
}

const CAL = "contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } }";

export async function collect(gh, login, projects, now = new Date()) {
  const base = await gh.gql(`query($login:String!){ user(login:$login){
    name login location createdAt
    repositories(ownerAffiliations:OWNER, privacy:PUBLIC, isFork:false, first:100, orderBy:{field:PUSHED_AT, direction:DESC}){
      totalCount nodes{ name nameWithOwner stargazerCount pushedAt languages(first:10){ edges{ size node{ name } } } } }
    contributionsCollection{ restrictedContributionsCount ${CAL} } } }`, { login });
  const u = base.user;

  // One aliased query for every calendar year since the account exists (each range must be <= 1 year).
  const firstYear = new Date(u.createdAt).getUTCFullYear(), thisYear = now.getUTCFullYear();
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => firstYear + i);
  const yq = years.map(y => `y${y}: contributionsCollection(from:"${y}-01-01T00:00:00Z", to:"${y}-12-31T23:59:59Z"){ ${CAL} }`).join("\n");
  const yd = (await gh.gql(`query($login:String!){ user(login:$login){ ${yq} } }`, { login })).user;

  const since = new Date(now.getTime() - 365 * DAY);
  const since12 = `>=${iso(since)}`;
  const samples = [];
  for (let m = 0; m < 12; m++) {
    const from = new Date(since.getTime() + Math.round(m * 365 / 12) * DAY);
    const to = new Date(since.getTime() + (Math.round((m + 1) * 365 / 12) * DAY) - DAY);
    samples.push(...await commitsBetween(gh, login, from, m === 11 ? now : to));
  }

  const counts = {
    prs12: await count(gh, "issues", `author:${login} type:pr created:${since12}`),
    reviews12: await count(gh, "issues", `reviewed-by:${login} -author:${login} type:pr created:${since12}`),
  };

  const pq = projects.map((p, i) => { const [owner, name] = p.repo.split("/"); return `p${i}: repository(owner:"${owner}", name:"${name}"){ nameWithOwner isPrivate description stargazerCount forkCount pushedAt primaryLanguage{ name } }`; }).join("\n");
  const pd = await gh.gql(`query{ ${pq} }`);
  const featured = [];
  for (const [i, p] of projects.entries()) {
    const r = pd[`p${i}`];
    if (!r) throw new Error(`Featured repo not found: ${p.repo}`);
    if (r.isPrivate) throw new Error(`Featured repo is private: ${p.repo}`);
    featured.push({
      ...p, ...r,
      myPrsMerged: await count(gh, "issues", `author:${login} repo:${p.repo} type:pr is:merged`),
      myCommits: p.external ? await count(gh, "commits", `author:${login} repo:${p.repo}`) : samples.filter(s => s.repo === r.nameWithOwner).length,
    });
  }

  return {
    login: u.login, name: u.name, location: u.location, createdAt: u.createdAt, now: now.toISOString(),
    repos: u.repositories.nodes.filter(r => r.nameWithOwner.toLowerCase() !== `${login}/${login}`.toLowerCase()),
    publicRepos: u.repositories.totalCount,
    calendar: u.contributionsCollection.contributionCalendar,
    private12: u.contributionsCollection.restrictedContributionsCount,
    years: years.map(y => [y, yd[`y${y}`].contributionCalendar.totalContributions]),
    allDays: years.flatMap(y => yd[`y${y}`].contributionCalendar.weeks.flatMap(w => w.contributionDays)),
    samples, counts, featured,
  };
}

// ---------- derived stats (pure, covered by scripts/test.mjs) ----------

export function streaks(days, today) {
  const seen = new Map();
  for (const d of days) if (d.date <= today) seen.set(d.date, d.contributionCount);
  const list = [...seen].sort(([a], [b]) => a.localeCompare(b));
  let longest = 0, run = 0;
  for (const [, c] of list) { run = c > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = list.length - 1;
  if (i >= 0 && list[i][1] === 0) i--; // today may still be empty
  let current = 0;
  for (; i >= 0 && list[i][1] > 0; i--) current++;
  return { current, longest };
}

export function levels(counts) {
  const nz = counts.filter(x => x > 0).sort((a, b) => a - b);
  const t = [.25, .5, .75].map(p => nz[Math.floor(p * (nz.length - 1))] ?? 0);
  return x => x === 0 ? 0 : 1 + t.filter(v => x > v).length;
}

// Public repos keep their name; every private repo collapses into one anonymous row.
export function topRepos(samples, n = 6) {
  const by = new Map();
  for (const s of samples) {
    const e = by.get(s.repo) ?? { name: s.repo, private: s.private, count: 0 };
    e.count++;
    by.set(s.repo, e);
  }
  const all = [...by.values()];
  const priv = all.filter(r => r.private);
  const rows = all.filter(r => !r.private).sort((a, b) => b.count - a.count).slice(0, n);
  if (priv.length) rows.push({ name: `${priv.length} private repos`, private: true, count: priv.reduce((a, r) => a + r.count, 0) });
  return rows.sort((a, b) => b.count - a.count);
}

export const privateNames = samples => [...new Set(samples.filter(s => s.private).flatMap(s => [s.repo, s.repo.split("/")[1]]))];

export function derive(d) {
  const days = d.calendar.weeks.flatMap(w => w.contributionDays);
  const today = d.now.slice(0, 10);
  const last = streaks(days, today), all = streaks(d.allDays, today);
  const dow = Array(7).fill(0);
  for (const x of days) dow[new Date(x.date + "T00:00:00Z").getUTCDay()] += x.contributionCount;
  const monthMap = new Map();
  for (const x of days) monthMap.set(x.date.slice(0, 7), (monthMap.get(x.date.slice(0, 7)) ?? 0) + x.contributionCount);
  const hours = Array(24).fill(0);
  for (const s of d.samples) hours[Number(s.date.slice(11, 13))]++; // author's local clock, as committed
  const langs = new Map();
  for (const r of d.repos) for (const e of r.languages.edges) langs.set(e.node.name, (langs.get(e.node.name) ?? 0) + e.size);
  const bytes = [...langs.values()].reduce((a, b) => a + b, 0) || 1;
  const created = new Date(d.createdAt), now = new Date(d.now);
  const months = (now.getUTCFullYear() - created.getUTCFullYear()) * 12 + now.getUTCMonth() - created.getUTCMonth();
  return {
    days, weeks: d.calendar.weeks, total: d.calendar.totalContributions,
    weekly: d.calendar.weeks.map(w => w.contributionDays.reduce((a, x) => a + x.contributionCount, 0)),
    allTime: d.years.reduce((a, [, v]) => a + v, 0),
    current: last.current, longest: all.longest,
    active: days.filter(x => x.contributionCount > 0).length, bestDay: Math.max(...days.map(x => x.contributionCount)),
    dow: [1, 2, 3, 4, 5, 6, 0].map(i => [["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][i], dow[i]]),
    months: [...monthMap].slice(-12), // the calendar spans ~53 weeks: drops the partial first month
    hours, commits12: d.samples.length,
    langs: [...langs].sort((a, b) => b[1] - a[1]).map(([n, v]) => [n, v / bytes * 100]),
    stars: d.repos.reduce((a, r) => a + r.stargazerCount, 0),
    age: `${Math.floor(months / 12)}y ${months % 12}m`,
    top: topRepos(d.samples),
    recent: d.repos.slice(0, 3).map(r => [r.name, r.pushedAt]),
  };
}
