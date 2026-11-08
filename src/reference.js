/**
 * The reference market: the 201 postings behind the published study.
 *
 * Someone who has not pasted anything still has a market to be measured
 * against. These are the same counts the study reports and the same counts
 * cross-validate.js holds the engine to, so the running app and the published
 * analysis can never quietly disagree about what the market asks for.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { capabilities, vocabVersion } from "./vocab.js";
import { markets } from "./markets.js";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const raw = JSON.parse(readFileSync(join(DATA, "expected-201.json"), "utf8"));

const meta = new Map(capabilities.map((c) => [c.name, c]));

function build(file, marketId) {
  const r = JSON.parse(readFileSync(join(DATA, file), "utf8"));
  const mk = markets.find((m) => m.id === marketId);
  const lookup = new Map(mk.capabilities.map((c) => [c.name, c]));
  return Object.freeze({
    vocabVersion,
    reference: r.corpus,
    market: { id: mk.id, name: mk.name, derivedFrom: mk.derivedFrom, confident: true,
              density: 0, runnerUp: null, runnerUpDensity: 0, chosen: "reference" },
    postings: r.postings,
    capabilities: Object.entries(r.capabilities)
      .map(([name, n]) => {
        const c = lookup.get(name);
        if (!c) throw new Error(`${file} names a capability absent from ${marketId}: ${name}`);
        return { id: c.id, name, family: c.family, demonstrable: c.demonstrable,
                 postings: n, pct: Math.round((1000 * n) / r.postings) / 10 };
      })
      .filter((c) => c.postings > 0)
      .sort((a, b) => b.postings - a.postings || a.name.localeCompare(b.name)),
    tools: [], domains: [], certifications: [],
  });
}

/** The market a person is measured against when they paste no postings. */
export const referenceFor = (id) =>
  id === "technical" ? technicalReference : baReference;

/**
 * A profile in exactly the shape buildProfile returns, so computeGap and the
 * matcher cannot tell the difference between this and a real paste.
 */
const baReferenceLegacy = Object.freeze({
  vocabVersion,
  /** Set only on this profile. The UI uses it to say what you were measured against. */
  reference: raw.corpus,
  postings: raw.postings,
  capabilities: Object.entries(raw.capabilities)
    .map(([name, n]) => {
      const c = meta.get(name);
      // A capability rename in the vocabulary would otherwise silently drop
      // demand out of this profile and quietly inflate everybody's coverage.
      if (!c) throw new Error(`reference names a capability absent from the vocabulary: ${name}`);
      return {
        id: c.id,
        name,
        family: c.family,
        demonstrable: c.demonstrable,
        postings: n,
        pct: Math.round((1000 * n) / raw.postings) / 10,
      };
    })
    .filter((c) => c.postings > 0)
    .sort((a, b) => b.postings - a.postings || a.name.localeCompare(b.name)),
  tools: [],
  domains: [],
  certifications: [],
});

export const baReference = build("expected-201.json", "ba");
export const technicalReference = build("expected-technical.json", "technical");

/** Kept for callers that predate the second market. */
export const referenceProfile = baReference;
