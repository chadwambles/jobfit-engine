/**
 * The two markets this engine can measure, and how it decides which one a
 * paste belongs to.
 *
 * The 45 business analyst capabilities and the 54 technical ones were derived
 * from separate corpora and barely overlap. Running the wrong one does not
 * fail loudly; it quietly reports a market the postings are not in. So the
 * engine runs both and lets the postings choose.
 *
 * The decision is density: capabilities matched per posting. A business
 * analyst dump fires about 8 of the BA pack per posting and about 2 of the
 * technical pack. A software engineering dump inverts that. This needs no
 * occupation inference, which is the part that proved untrustworthy: O*NET
 * read a backend posting as Earth Drillers at 0.71 while a real electrician
 * posting scored 0.74. Counting what actually matched needs no such guess.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { capabilities as baCapabilities, vocabVersion } from "./vocab.js";
import { seedCatalog } from "./catalog.js";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const load = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

const techRaw = load("technical-capabilities.json");
const techCatalog = load("catalog.technical.json");

const technicalCapabilities = techRaw.candidates.map((c, i) => ({
  id: c.id ?? `tech_${String(i + 1).padStart(2, "0")}`,
  name: c.name,
  family: c.family,
  scope: c.scope ?? "body",
  demonstrable: c.demonstrable,
  re: new RegExp(c.pattern, "i"),
}));

export const markets = Object.freeze([
  Object.freeze({
    id: "ba",
    name: "Business analysis and delivery",
    capabilities: baCapabilities,
    catalog: seedCatalog,
    derivedFrom: "201 LinkedIn business analyst postings, 2026-11-05",
    version: vocabVersion,
  }),
  Object.freeze({
    id: "technical",
    name: "Software and data engineering",
    capabilities: technicalCapabilities,
    catalog: techCatalog.projects,
    derivedFrom: techRaw.note ?? "2,639 technical postings, 2026-11-08",
    version: techCatalog.version,
  }),
]);

export const marketById = (id) => markets.find((m) => m.id === id) ?? null;

/**
 * Pick the market a set of postings belongs to.
 *
 * @param scores [{ id, matched, postings }]
 * @returns {{ id, density, runnerUp, margin, confident }}
 *   `confident` is false when the two markets are close enough that the
 *   choice is arbitrary, which the caller should say out loud rather than
 *   present a coin flip as a finding.
 */
const MIN_MARGIN = 0.5;
const RELATIVE_MARGIN = 0.2;
const MIN_DENSITY = 2.5;

export function chooseMarket(scores) {
  const ranked = scores
    .map((s) => ({ ...s, density: s.postings ? s.matched / s.postings : 0 }))
    .sort((a, b) => b.density - a.density);

  const [top, next] = ranked;
  const margin = next ? top.density - next.density : top.density;

  // Three things have to hold before the call is worth making. An absolute
  // gap, so a near tie is not dressed up as a finding. A relative gap, so
  // seven against six is reported as the straddle it is rather than a win.
  // And a floor on the winner itself, because a trades posting trips about
  // two capabilities by accident and would otherwise be confidently filed
  // under business analysis.
  const confident =
    margin >= MIN_MARGIN &&
    margin >= RELATIVE_MARGIN * top.density &&
    top.density >= MIN_DENSITY;

  return {
    id: top.id,
    density: Math.round(top.density * 100) / 100,
    runnerUp: next ? next.id : null,
    runnerUpDensity: next ? Math.round(next.density * 100) / 100 : 0,
    margin: Math.round(margin * 100) / 100,
    confident,
    ranked,
  };
}
