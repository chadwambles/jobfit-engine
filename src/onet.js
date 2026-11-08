/**
 * O*NET matching: occupation inference, work activities, and tools.
 *
 * Deterministic information retrieval, no model. Three things to know about
 * why it is shaped this way:
 *
 * 1. Matching posting text straight onto work activities does not work. The
 *    activities are three words long, so a bullet agrees with them only on
 *    generic verbs, and "write user stories" comes back as "Clear equipment
 *    jams". Tasks are full sentences carrying the domain language, so the
 *    match goes through tasks and then follows the link to activities.
 * 2. Each task carries an occupation code, so matching tasks infers the
 *    occupation as a side effect.
 * 3. O*NET has no vocabulary for modern software delivery. Zero mentions of
 *    user stories, sprint, scrum, agile or UAT in the whole release. The hand
 *    built capability pack covers that ground; this covers everything else.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "onet");
const load = (f) => JSON.parse(readFileSync(join(DIR, f), "utf8"));

export const occupations = load("occupations.json");
export const activities = load("activities.json");
const tasks = load("tasks.json");
export const tools = load("tools.json");
const occTools = load("occupation_tools.json");

const STOP = new Set(("a an the and or of to in for with on at by from as is are be been being this " +
  "that these those it its their our your you we they will would can could should may might must " +
  "have has had do does did not no nor so than then there here when where which who whom whose " +
  "what why how all any both each few more most other some such only own same too very up down out " +
  "off over under again further once also within across into onto per about between during before " +
  "after above below while if because although though new others including include includes " +
  "included etc via use used using uses ensure provide support work working").split(" "));

function toks(s) {
  const out = [];
  for (const m of s.toLowerCase().matchAll(/[a-z][a-z0-9+#/.-]*/g)) {
    if (m[0].length > 2 && !STOP.has(m[0])) out.push(m[0]);
  }
  return out;
}

// ---------------------------------------------------------------- index
const byId = new Map(activities.map((a) => [a.id, a]));
const N = tasks.length;
const df = new Map();
const taskTerms = tasks.map((t) => {
  const s = new Set(toks(t.text));
  for (const w of s) df.set(w, (df.get(w) ?? 0) + 1);
  return s;
});
const idf = new Map([...df].map(([w, c]) => [w, Math.log(N / (1 + c))]));
const inv = new Map();
taskTerms.forEach((s, i) => {
  for (const w of s) {
    let a = inv.get(w);
    if (!a) inv.set(w, (a = []));
    a.push(i);
  }
});
const taskMass = taskTerms.map((s) => {
  let m = 0;
  for (const w of s) m += idf.get(w) ?? 0;
  return m || 1;
});

/** Tools indexed by first token, so a posting is checked against a handful
 *  of candidates rather than all 8,753. */
function norm(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\.(?![a-z0-9])/g, " ")   // drop sentence periods, keep node.js
    .replace(/\s+/g, " ")
    .trim();
}

const toolHead = new Map();
for (const t of tools) {
  const parts = norm(t.name).split(" ").filter(Boolean);
  if (!parts.length) continue;
  let a = toolHead.get(parts[0]);
  if (!a) toolHead.set(parts[0], (a = []));
  a.push({ ...t, phrase: parts.join(" "), parts });
}

/** Named in almost every posting because of where postings are copied from,
 *  not because the job uses them. */
const SOURCE_ARTEFACTS = new Set(["LinkedIn", "Facebook", "Twitter", "Indeed"]);

// ------------------------------------------------------------- matching
/**
 * Match one chunk of text to O*NET tasks.
 * Thresholds exist to make the matcher willing to return nothing, which is the
 * correct answer for language O*NET does not have.
 */
export function matchTasks(text, { limit = 5, minTerms = 3, minCov = 0.3 } = {}) {
  const q = new Set(toks(text));
  if (q.size < minTerms) return [];
  const shared = new Map();
  for (const w of q) {
    const list = inv.get(w);
    if (!list) continue;
    for (const i of list) {
      let a = shared.get(i);
      if (!a) shared.set(i, (a = []));
      a.push(w);
    }
  }
  const out = [];
  for (const [i, words] of shared) {
    if (words.length < minTerms) continue;
    let mass = 0;
    for (const w of words) mass += idf.get(w) ?? 0;
    const cov = mass / taskMass[i];
    if (cov >= minCov) out.push({ i, cov, words });
  }
  out.sort((a, b) => b.cov - a.cov);
  return out.slice(0, limit).map(({ i, cov, words }) => ({
    taskId: tasks[i].id,
    soc: tasks[i].soc,
    text: tasks[i].text,
    coverage: Math.round(cov * 100) / 100,
    matchedOn: words.sort(),
    activities: tasks[i].dwas.map((d) => byId.get(d)?.name).filter(Boolean),
  }));
}

/** Which occupations do these postings look like? */
export function inferOccupation(chunks, { limit = 5 } = {}) {
  // Per chunk, not one blob. A whole dump as a single query puts thousands of
  // tasks over the term threshold and the signal smears into noise.
  const list = Array.isArray(chunks) ? chunks : [chunks];
  const score = new Map();
  for (const c of list) {
    const hits = matchTasks(c, { limit: 6, minTerms: 3, minCov: 0.3 });
    // square the coverage so confident matches dominate weak ones
    for (const h of hits) score.set(h.soc, (score.get(h.soc) ?? 0) + h.coverage * h.coverage);
  }
  const byCode = new Map(occupations.map((o) => [o.soc, o]));
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([soc, s]) => ({
      soc, title: byCode.get(soc)?.title ?? soc,
      score: Math.round(s * 100) / 100,
    }));
}

/** Work activities this text describes, ranked by how often they were reached. */
export function matchActivities(chunks, { limit = 12, minCov = 0.42, minChunks = 2 } = {}) {
  // Deliberately strict. O*NET has no language for software delivery, so for
  // those postings the right answer is to return little or nothing rather
  // than reach for "Research engineering aspects of biological processes".
  const score = new Map();
  const seenIn = new Map();
  for (const c of chunks) {
    const local = new Set();
    for (const h of matchTasks(c, { limit: 2, minTerms: 3, minCov })) {
      for (const a of h.activities) {
        score.set(a, (score.get(a) ?? 0) + h.coverage * h.coverage);
        local.add(a);
      }
    }
    for (const a of local) seenIn.set(a, (seenIn.get(a) ?? 0) + 1);
  }
  return [...score.entries()]
    .filter(([a]) => (seenIn.get(a) ?? 0) >= minChunks)   // one lucky hit is not evidence
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, s]) => ({ name, score: Math.round(s * 100) / 100,
                           postings: seenIn.get(name) }));
}

/** Tools named in the text, as whole phrases so "Word" does not match prose. */
export function matchTools(text, { limit = 25 } = {}) {
  // Periods are kept so names like Node.js survive, but a period that is not
  // between two characters is sentence punctuation and would turn "jira." into
  // something that never equals "jira".
  const low = " " + norm(text) + " ";
  const seen = new Map();
  for (const w of new Set(toks(text))) {
    const cands = toolHead.get(w);
    if (!cands) continue;
    for (const t of cands) {
      if (seen.has(t.name)) continue;
      // single generic words are too risky unless they are distinctive
      if (t.parts.length === 1 && t.occ > 300 && t.name.length < 7) continue;
      if (SOURCE_ARTEFACTS.has(t.name)) continue;
      if (low.includes(" " + t.phrase + " ")) {
        seen.set(t.name, { name: t.name, hot: t.hot, occupations: t.occ });
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.occupations - a.occupations).slice(0, limit);
}

// ------------------------------------------------- lookup and prefill

/** Occupation titles indexed by word, for autocomplete over 9,205 strings. */
const titleIndex = new Map();
for (const o of occupations) {
  const names = [o.title, ...o.alts];
  for (const n of names) {
    for (const w of norm(n).split(" ")) {
      if (w.length < 2) continue;
      let a = titleIndex.get(w);
      if (!a) titleIndex.set(w, (a = new Set()));
      a.add(o.soc);
    }
  }
}
const bySoc = new Map(occupations.map((o) => [o.soc, o]));

/**
 * Find occupations by a typed job title.
 *
 * Ranks an exact match on a reported title above a partial one, because
 * "Registered Nurse" should land on Registered Nurses rather than on every
 * occupation with "nurse" somewhere in it.
 */
export function findOccupations(query, { limit = 8 } = {}) {
  const q = norm(query);
  if (q.length < 2) return [];
  const words = q.split(" ").filter((w) => w.length > 1);
  if (!words.length) return [];

  const cand = new Map();
  for (const w of words) {
    for (const [key, socs] of titleIndex) {
      if (key !== w && !key.startsWith(w)) continue;
      const exact = key === w ? 1 : 0.6;
      for (const soc of socs) cand.set(soc, (cand.get(soc) ?? 0) + exact);
    }
  }
  const out = [];
  for (const [soc, hits] of cand) {
    const o = bySoc.get(soc);
    if (!o) continue;
    const all = [o.title, ...o.alts].map(norm);
    let best = hits / words.length;
    if (all.includes(q)) best += 2;                       // typed it exactly
    else if (all.some((n) => n.startsWith(q))) best += 1; // typed the start of it
    const matched = [o.title, ...o.alts].find(
      (n) => norm(n) === q || norm(n).startsWith(q)) ?? o.title;
    out.push({ soc, title: o.title, matched,
               score: Math.round(best * 100) / 100 });
  }
  out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return out.slice(0, limit);
}

/**
 * What an occupation does, as a prefillable list.
 *
 * This is the supply side of the gap when someone has not pasted postings:
 * they name their job, and these are the things to untick.
 */
export function occupationProfile(soc, { activityLimit = 30, toolLimit = 20 } = {}) {
  const o = bySoc.get(soc);
  if (!o) return null;
  const counts = new Map();
  for (const t of tasks) {
    if (t.soc !== soc) continue;
    for (const d of t.dwas) {
      const name = byId.get(d)?.name;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const acts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, activityLimit)
    .map(([name, n]) => ({ name, tasks: n }));

  // Rarest first, not commonest. Microsoft Word is used by 784 occupations and
  // says nothing about being a nurse; the nursing specific software is what a
  // prefill should surface. Tools used by only one occupation are skipped as
  // too incidental to be worth a checkbox.
  const toolMeta = new Map(tools.map((t) => [t.name, t]));
  const myTools = (occTools[soc] ?? [])
    .map((n) => toolMeta.get(n))
    .filter((t) => t && t.occ > 1)
    .sort((a, b) => a.occ - b.occ || (b.hot ? 1 : 0) - (a.hot ? 1 : 0))
    .slice(0, toolLimit)
    .map((t) => ({ name: t.name, hot: t.hot, occupations: t.occ }));

  return { soc, title: o.title, description: o.desc,
           activities: acts, tools: myTools };
}

export const onetMeta = {
  release: "O*NET 31.0 Database, August 2026",
  license: "CC BY 4.0, USDOL/ETA",
  occupations: occupations.length,
  activities: activities.length,
  tasks: tasks.length,
  tools: tools.length,
};
