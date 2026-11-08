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

// ---------------------------------------------------------------- O*NET

test("the O*NET artifacts load at the expected size", async () => {
  const { onetMeta } = await import("../src/index.js");
  assert.equal(onetMeta.occupations, 1016);
  assert.equal(onetMeta.activities, 2087);
  assert.equal(onetMeta.tasks, 18838);
  assert.equal(onetMeta.tools, 8753);
});

test("occupation inference names the right job from its own language", async () => {
  const { inferOccupation } = await import("../src/index.js");
  const nurse = inferOccupation([
    "Administer medications and monitor patients for adverse reactions.",
    "Assess patient condition, record vital signs and update care plans.",
  ], { limit: 3 });
  assert.ok(nurse.some((o) => /Nurse/i.test(o.title)),
    "nursing text should surface a nursing occupation, got " + nurse.map(o => o.title));

  const sparky = inferOccupation([
    "Install and repair electrical wiring, fixtures and control devices.",
    "Inspect electrical systems for hazards and code compliance.",
  ], { limit: 3 });
  assert.ok(sparky.some((o) => /Electric/i.test(o.title)),
    "electrical text should surface an electrical occupation, got " + sparky.map(o => o.title));
});

test("O*NET stays silent where it has no vocabulary", async () => {
  const { matchActivities } = await import("../src/index.js");
  // Checked directly against the release: zero mentions of user stories,
  // acceptance criteria, sprint, scrum, agile or UAT. Reaching for a match
  // here is how "write user stories" became "Clear equipment jams".
  const agile = matchActivities([
    "Write user stories with clear acceptance criteria.",
    "Run sprint planning and backlog refinement with the scrum team.",
    "Maintain requirements traceability through UAT.",
  ]);
  assert.equal(agile.length, 0,
    "should return nothing, got " + agile.map((a) => a.name).join("; "));
});

test("tool matching finds whole phrases and not prose", async () => {
  const { matchTools } = await import("../src/index.js");
  const hits = matchTools(
    "Build dashboards in Tableau and query the warehouse with SQL. " +
    "Document the process in Microsoft Visio and track work in Atlassian JIRA.");
  const names = hits.map((h) => h.name);
  for (const want of ["Tableau", "Microsoft Visio", "Atlassian JIRA"]) {
    assert.ok(names.includes(want), `expected ${want}, got ${names.join(", ")}`);
  }
  // "Word" is a tool name and also an ordinary word; prose must not trigger it
  const prose = matchTools("Choose every word of the requirement with care.");
  assert.ok(!prose.some((h) => h.name === "Microsoft Word"),
    "the word 'word' in prose must not match Microsoft Word");
});

test("the O*NET pass can be skipped", async () => {
  const prof = buildProfile(FIX, { onet: false });
  assert.equal(prof.onet, undefined);
  const withOnet = buildProfile(FIX);
  assert.ok(withOnet.onet, "default should include the O*NET pass");
  assert.equal(withOnet.onet.release, "O*NET 31.0 Database, August 2026");
});

test("occupation lookup finds reported titles, not just official ones", async () => {
  const { findOccupations } = await import("../src/index.js");
  // "Business Analyst" is not an official O*NET title. It only reaches an
  // occupation through the reported-titles list, which is the whole reason
  // that file is loaded.
  const ba = findOccupations("business analyst");
  assert.ok(ba.length > 0, "business analyst should resolve to something");
  const titles = ba.map((o) => o.title);
  assert.ok(
    titles.some((t) => /Business Intelligence Analysts|Management Analysts/.test(t)),
    "expected an analyst occupation, got " + titles.join(" | "));

  // A partial word should still resolve, so the field can autocomplete.
  assert.ok(findOccupations("data scien").some((o) => o.title === "Data Scientists"),
    "prefix matching should reach Data Scientists");
});

test("occupation lookup covers trades, not only office work", async () => {
  const { findOccupations } = await import("../src/index.js");
  const want = {
    "registered nurse": "Registered Nurses",
    electrician: "Electricians",
    welder: "Welders, Cutters, Solderers, and Brazers",
    "chef": "Chefs and Head Cooks",
  };
  for (const [query, title] of Object.entries(want)) {
    const hits = findOccupations(query);
    assert.equal(hits[0]?.title, title,
      `"${query}" should rank ${title} first, got ${hits[0]?.title}`);
  }
});

test("occupation lookup ignores job-board names", async () => {
  const { findOccupations } = await import("../src/index.js");
  // "LinkedIn" appears in O*NET as a tool, and reported titles carry site
  // names. A user typing a board name should get nothing rather than a
  // confident wrong occupation.
  for (const junk of ["linkedin", "indeed"]) {
    assert.equal(findOccupations(junk).length, 0,
      `"${junk}" should not resolve to an occupation`);
  }
});

test("the tool prefill surfaces distinctive software, not Microsoft Office", async () => {
  const { findOccupations, occupationProfile } = await import("../src/index.js");
  const soc = findOccupations("registered nurse")[0].soc;
  const prof = occupationProfile(soc, { toolLimit: 10 });

  assert.equal(prof.title, "Registered Nurses");
  assert.ok(prof.activities.length > 0, "a nurse should have work activities");

  const names = prof.tools.map((t) => t.name);
  // The bug this guards: sorting by how many occupations use a tool put
  // Word, Excel and Outlook at the top of every occupation's prefill.
  for (const generic of ["Microsoft Word", "Microsoft Excel", "Microsoft Outlook",
                         "Microsoft PowerPoint", "Microsoft Office software"]) {
    assert.ok(!names.includes(generic),
      `${generic} is used by hundreds of occupations and tells a nurse nothing`);
  }
  assert.ok(
    names.some((n) => /EHR|Allscripts|PointClickCare|healthcare|medical|patient/i.test(n)),
    "expected clinical software in a nurse's prefill, got " + names.join(", "));
});

test("an unknown occupation code returns null rather than an empty shell", async () => {
  const { occupationProfile } = await import("../src/index.js");
  assert.equal(occupationProfile("00-0000.00"), null);
});

test("the reference market is a profile the gap engine cannot distinguish", async () => {
  const { referenceProfile, computeGap, matchProjects, seedCatalog } =
    await import("../src/index.js");

  assert.equal(referenceProfile.postings, 201);
  assert.equal(referenceProfile.capabilities.length, 45,
    "every capability in the study should carry demand");
  assert.ok(referenceProfile.reference.includes("201"),
    "the profile should say what it is a reference to");

  // Sorted by demand, and percentages consistent with the counts.
  const top = referenceProfile.capabilities[0];
  assert.equal(top.pct, Math.round((1000 * top.postings) / 201) / 10);
  for (let i = 1; i < referenceProfile.capabilities.length; i++) {
    assert.ok(referenceProfile.capabilities[i - 1].postings >=
              referenceProfile.capabilities[i].postings, "should be ranked by demand");
  }

  // The whole point: computeGap and the matcher work on it unchanged.
  const none = computeGap(referenceProfile, []);
  assert.equal(none.coverage, 0);
  const all = computeGap(referenceProfile, referenceProfile.capabilities.map((c) => c.name));
  assert.equal(all.coverage, 100);
  assert.ok(matchProjects(none, seedCatalog, { limit: 3 }).length > 0,
    "the matcher should find projects against the reference market");
});

test("scope is decided by occupation, not by how many patterns fired", async () => {
  const { buildProfile, inVocabularyScope, vocabularyScope } =
    await import("../src/index.js");

  assert.ok(inVocabularyScope("15-2051.00"), "Business Intelligence Analysts is in scope");
  assert.ok(inVocabularyScope("13-1111.00"), "Management Analysts is in scope");
  assert.ok(!inVocabularyScope("29-1141.00"), "Registered Nurses is out of scope");
  assert.ok(!inVocabularyScope("47-2111.00"), "Electricians is out of scope");
  assert.ok(!inVocabularyScope(undefined) && !inVocabularyScope(""), "junk is out of scope");
  assert.ok(vocabularyScope.derivedFrom.includes("201"));

  // The case that motivates all of this: postings from a field the vocabulary
  // has never seen still trip a pattern or two. A count-based guard would let
  // them through and report a market that was never measured.
  const trades = [
    "Install, maintain and repair electrical wiring, equipment and fixtures in",
    "commercial buildings. Inspect electrical systems, equipment and components to",
    "identify hazards and defects and the need for repair. Read and interpret",
    "blueprints and electrical code specifications to determine wiring layouts.",
    "Test continuity of circuits using ohmmeters, voltmeters and oscilloscopes.",
    "Connect wires to circuit breakers, transformers or other components.",
    "State journeyman license and four years of commercial experience required.",
  ].join(" ");

  const prof = buildProfile(trades);
  assert.ok(prof.capabilities.length > 0,
    "this is the hard case precisely because some patterns do fire");
  const top = prof.onet?.occupations?.[0];
  assert.ok(top, "O*NET should name an occupation for a trades posting");
  assert.ok(!inVocabularyScope(top.soc),
    `expected an out-of-scope occupation, got ${top.title} (${top.soc})`);
});

test("the postings choose the market, not an occupation guess", async () => {
  const { buildProfile, markets, chooseMarket } = await import("../src/index.js");

  assert.equal(markets.length, 2);
  for (const mk of markets) {
    assert.ok(mk.capabilities.length > 0, `${mk.id} has no capabilities`);
    assert.ok(mk.catalog.length > 0, `${mk.id} has no projects`);
    // A project may only claim capabilities its own market can measure.
    const names = new Set(mk.capabilities.map((c) => c.name));
    for (const p of mk.catalog) {
      for (const c of p.capabilities) {
        assert.ok(names.has(c), `${mk.id}/${p.id} claims "${c}", absent from that market`);
      }
    }
  }

  // A backend posting. This used to be refused as out of scope, then merely
  // disclosed as thin. With a technical vocabulary it is simply covered.
  const backend = [
    "Design, build and maintain backend services in Go and Python. Write clean,",
    "well tested code and participate in code review. Build and maintain RESTful",
    "and gRPC APIs. Deploy services with Docker and Kubernetes and manage",
    "infrastructure as code with Terraform. Debug and resolve production incidents",
    "and participate in an on-call rotation. Write unit and integration tests and",
    "keep the CI pipeline green. Design relational database schemas and write",
    "efficient SQL queries. Profile and optimize application performance.",
  ].join(" ");

  const swe = buildProfile(backend, { onet: false });
  assert.equal(swe.market.id, "technical",
    `a backend posting belongs to the technical market, got ${swe.market.id}`);
  assert.equal(swe.market.confident, true);
  assert.ok(swe.market.density > swe.market.runnerUpDensity * 2,
    "the technical vocabulary should fire far harder than the BA one here");

  // And the reverse, so the rule is not simply "always technical".
  const ba = buildProfile(FIX, { onet: false });
  assert.equal(ba.market.id, "ba");
  assert.equal(ba.market.confident, true);

  // Caller override still wins, for when the market is already known.
  assert.equal(buildProfile(backend, { onet: false, market: "ba" }).market.id, "ba");
  assert.equal(buildProfile(backend, { onet: false, market: "ba" }).market.chosen, "by caller");
});

test("a close call is reported as a straddle, not a finding", async () => {
  const { chooseMarket, buildProfile } = await import("../src/index.js");

  // Clear win.
  const clear = chooseMarket([
    { id: "ba", matched: 1200, postings: 150 },
    { id: "technical", matched: 330, postings: 150 }]);
  assert.equal(clear.id, "ba");
  assert.equal(clear.confident, true);

  // Seven against six is a straddle. Reporting it as a win would be a coin
  // flip dressed up as a measurement.
  const close = chooseMarket([
    { id: "ba", matched: 900, postings: 150 },
    { id: "technical", matched: 1050, postings: 150 }]);
  assert.equal(close.id, "technical");
  assert.equal(close.confident, false, "a 7 vs 6 split must not read as confident");

  // A paste from neither market trips a capability or two by accident. The
  // winner there is noise, so it must never be confident however big the
  // relative gap looks.
  const faint = chooseMarket([
    { id: "ba", matched: 300, postings: 150 },
    { id: "technical", matched: 100, postings: 150 }]);
  assert.equal(faint.confident, false,
    "two capabilities per posting is not enough to claim a market");

  const trades = buildProfile([
    "Install, maintain and repair electrical wiring, equipment and fixtures in",
    "commercial buildings. Inspect electrical systems to identify hazards and",
    "defects. Read blueprints and electrical code specifications to determine",
    "wiring layouts. Test continuity of circuits using ohmmeters and voltmeters.",
    "State journeyman license and four years of commercial experience required.",
  ].join(" "), { onet: false });
  assert.equal(trades.market.confident, false,
    "a trades paste must not be confidently filed under either market");
});

test("every market's projects only close what a project can close", async () => {
  const { markets } = await import("../src/index.js");
  for (const mk of markets) {
    const demo = new Map(mk.capabilities.map((c) => [c.name, c.demonstrable]));
    for (const p of mk.catalog) {
      for (const c of p.capabilities) {
        // Outreach is fair game: a project can involve interviewing people at
        // a volunteer organisation or maintaining something in the open. What
        // no project may claim is a capability that needs an employer, which
        // is the dishonesty this whole axis exists to prevent.
        assert.notEqual(demo.get(c), "employment",
          `${mk.id}/${p.id} claims to close "${c}", which needs a real organisation`);
        assert.ok(demo.get(c), `${mk.id}/${p.id} claims "${c}", which has no demonstrability`);
      }
    }
    // And every solo capability has somewhere to go.
    const covered = new Set(mk.catalog.flatMap((p) => p.capabilities));
    const orphans = mk.capabilities
      .filter((c) => c.demonstrable === "solo" && !covered.has(c.name))
      .map((c) => c.name);
    assert.deepEqual(orphans, [], `${mk.id} has solo capabilities no project closes`);
  }
});

test("CRLF files split the same as LF files", async () => {
  const { splitPostings, buildProfile } = await import("../src/index.js");

  const lf =
    "Senior Backend Engineer at Acme\nRemote\nAbout the job\n" +
    "Design and build backend services. TOKEN_A\n\n" +
    "Data Engineer at Beta\nBerlin\nAbout the job\n" +
    "Build pipelines and model the warehouse. TOKEN_B\n";
  const crlf = lf.replace(/\n/g, "\r\n");

  const a = splitPostings(lf);
  const b = splitPostings(crlf);

  assert.equal(a.length, 2);
  assert.equal(b.length, a.length, "CRLF must split into the same number of postings");

  // The regression that motivated this: markers still split under CRLF, but
  // every header came back empty, so postings could not be traced to source.
  for (const [i, part] of b.entries()) {
    assert.ok(part.header.length > 0, `CRLF posting ${i} lost its header entirely`);
    assert.equal(part.header.replace(/\r/g, ""), a[i].header,
      `CRLF header ${i} should match the LF header`);
    assert.equal(part.body.replace(/\r/g, ""), a[i].body);
  }
  assert.ok(b[0].header.includes("Acme"));
  assert.ok(b[1].header.includes("Beta"));

  assert.equal(buildProfile(crlf, { onet: false }).postings,
               buildProfile(lf, { onet: false }).postings);
});
