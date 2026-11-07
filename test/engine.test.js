import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildProfile, computeGap, matchProjects, catalogBlindSpots,
         splitPostings, tagPosting, bullets, detectFormat, capabilities } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = readFileSync(join(HERE, "..", "fixtures", "synthetic", "three-postings.txt"), "utf8");
const CATALOG = JSON.parse(readFileSync(join(HERE, "..", "data", "catalog.seed.json"), "utf8"));
const named = (profile, n) => profile.capabilities.find((c) => c.name === n);

test("detects the OneNote LinkedIn format", () => {
  assert.equal(detectFormat(FIX), "linkedin-onenote");
});

test("splits into exactly three postings, each with a url and a body", () => {
  const p = splitPostings(FIX);
  assert.equal(p.length, 3);
  for (const x of p) {
    assert.match(x.url, /linkedin\.com/);
    assert.ok(x.body.length > 100, "body should carry the posting text");
  }
});

test("bullets exclude benefits and legal boilerplate", () => {
  const bl = bullets(splitPostings(FIX)[0].body);
  assert.ok(bl.some((b) => /Elicit requirements/.test(b)));
  assert.ok(!bl.some((b) => /401\(k\)|dental|equal opportunity/i.test(b)),
            "boilerplate must never become a requirement bullet");
});

test("AI in company branding does not count as an AI requirement", () => {
  // Posting 1 says "supercharged by AI" in prose and asks for no AI tooling.
  const one = buildProfile(splitPostings(FIX).slice(0, 1).map((p) => p.raw).join("\n") +
                           "\nFrom <https://www.linkedin.com/jobs/view/1/>");
  assert.equal(named(one, "Use AI tools in the analysis workflow"), undefined,
               "'supercharged by AI' is branding, not a requirement");
});

test("AI as a stated requirement does count, and the hiring disclosure does not", () => {
  // Posting 2 contains BOTH the applicant-screening disclosure and a real ask.
  const prof = buildProfile(FIX);
  const ai = named(prof, "Use AI tools in the analysis workflow");
  assert.ok(ai, "a real 'use approved AI tools' bullet must tag");
  assert.equal(ai.postings, 1, "only posting 2 genuinely asks for AI tooling");
});

test("generic prioritization skills do not count, owning a backlog does", () => {
  const prof = buildProfile(FIX);
  const p = named(prof, "Prioritize a backlog or competing requests");
  assert.ok(p, "real prioritization asks must tag");
  assert.equal(p.postings, 2,
    "postings 1 and 3 ask for it; the soft-skill phrasings in both must not inflate it");
});

test("profile stays small regardless of input size", () => {
  const prof = buildProfile(FIX + FIX + FIX + FIX);
  assert.ok(JSON.stringify(prof).length < 6000,
            "the profile is the only thing that reaches a model and must stay compact");
});

test("every capability named in the catalog exists in the vocabulary", () => {
  const known = new Set(capabilities.map((c) => c.name));
  const bad = [];
  for (const p of CATALOG.projects) {
    for (const c of p.capabilities) if (!known.has(c)) bad.push(`${p.id}: ${c}`);
  }
  assert.deepEqual(bad, [],
    "a typo'd capability name scores zero silently, so this guard matters more than it looks");
});

test("gap coverage is 100 percent when you evidence everything demanded", () => {
  const prof = buildProfile(FIX);
  const all = prof.capabilities.map((c) => c.name);
  const gap = computeGap(prof, all);
  assert.equal(gap.missing.length, 0);
  assert.equal(gap.coverage, 100);
});

test("gap coverage is 0 percent when you evidence nothing", () => {
  const prof = buildProfile(FIX);
  const gap = computeGap(prof, []);
  assert.equal(gap.covered.length, 0);
  assert.equal(gap.coverage, 0);
  assert.equal(gap.missing.length, prof.capabilities.length);
});

test("evidencing a capability removes it from the gap and raises coverage", () => {
  const prof = buildProfile(FIX);
  const top = prof.capabilities[0].name;
  const before = computeGap(prof, []);
  const after = computeGap(prof, [top]);
  assert.ok(after.coverage > before.coverage);
  assert.ok(!after.missing.some((c) => c.name === top));
});

test("matcher returns projects that close real gaps, ranked by demand closed", () => {
  const prof = buildProfile(FIX);
  const gap = computeGap(prof, []);
  const hits = matchProjects(gap, CATALOG.projects, { limit: 3 });
  assert.equal(hits.length, 3);
  for (const h of hits) assert.ok(h.closes.length > 0, "never recommend a project that closes nothing");
  assert.ok(hits[0].score >= hits[1].score, "must be ranked by demand closed");
  assert.ok(hits[1].score >= hits[2].score);
});

test("matcher drops projects whose data source is not reachable", () => {
  const prof = buildProfile(FIX);
  const gap = computeGap(prof, []);
  const poisoned = CATALOG.projects.map((p, i) => (i === 0 ? { ...p, reachable: false } : p));
  const hits = matchProjects(gap, poisoned, { limit: 99 });
  assert.ok(!hits.some((h) => h.id === CATALOG.projects[0].id),
            "the job-titles project died on reachability; the engine should not repeat that");
});

test("blind spots name demand the catalog cannot close", () => {
  const prof = buildProfile(FIX);
  const gap = computeGap(prof, []);
  const blind = catalogBlindSpots(gap, CATALOG.projects);
  const covered = new Set(CATALOG.projects.flatMap((p) => p.capabilities));
  for (const b of blind) assert.ok(!covered.has(b.name));
});

test("an empty paste does not throw", () => {
  const prof = buildProfile("");
  assert.equal(prof.postings, 0);
  assert.deepEqual(computeGap(prof, []).missing, []);
});

test("the model digest stays inside its token budget", async () => {
  const { digest, profileSize } = await import("../src/index.js");
  // Four copies of the fixture, to prove the digest does not grow with input.
  const small = digest(buildProfile(FIX));
  const big = digest(buildProfile(FIX + FIX + FIX + FIX));
  assert.ok(profileSize(small) < 200, `digest was ${profileSize(small)} tokens`);
  assert.ok(profileSize(big) < 200, "the digest must not grow with the size of the paste");
});

test("the full profile and the digest describe the same top demand", async () => {
  const { digest } = await import("../src/index.js");
  const prof = buildProfile(FIX);
  const d = digest(prof);
  assert.equal(d.n, prof.postings);
  assert.ok(d.demands[0].startsWith(prof.capabilities[0].name),
            "the digest must not reorder what the screen shows");
});

test("every solo-demonstrable capability has at least one project", () => {
  const solo = capabilities.filter((c) => c.demonstrable === "solo").map((c) => c.name);
  const covered = new Set(CATALOG.projects.flatMap((p) => p.capabilities));
  const orphans = solo.filter((n) => !covered.has(n));
  assert.deepEqual(orphans, [],
    "a solo capability with no project is a hole in the catalog, and the tool would " +
    "report a gap it cannot act on");
});

test("every capability is classified for demonstrability", () => {
  const bad = capabilities.filter(
    (c) => !["solo", "outreach", "employment"].includes(c.demonstrable));
  assert.deepEqual(bad.map((c) => c.name), []);
});

test("the matcher never scores a gap no project can evidence", () => {
  const prof = buildProfile(FIX);
  const gap = computeGap(prof, []);
  const hits = matchProjects(gap, CATALOG.projects, { limit: 99 });
  const soloNames = new Set(capabilities.filter((c) => c.demonstrable === "solo").map((c) => c.name));
  for (const h of hits) {
    for (const c of h.closes) {
      assert.ok(soloNames.has(c),
        `${h.id} claims to close "${c}", which is not solo-demonstrable`);
    }
  }
});

test("gaps split three ways and the parts sum to the whole", () => {
  const prof = buildProfile(FIX);
  const gap = computeGap(prof, []);
  assert.equal(
    gap.closableSolo.length + gap.closableByOutreach.length + gap.needsEmployment.length,
    gap.missing.length);
});
