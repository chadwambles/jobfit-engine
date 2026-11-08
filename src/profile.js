/**
 * Aggregates tagged postings into a requirement profile.
 *
 * The profile is deliberately small. It is the only thing that ever reaches a
 * model, so it stays in the low hundreds of tokens no matter how many postings
 * went in. A 201 posting dump is about 370,000 tokens of raw text and about
 * 350 tokens of profile.
 */
import { capabilities, tools, domains, certifications, vocabVersion } from "./vocab.js";
import { splitPostings, tagPosting, bullets } from "./parse.js";
import { inferOccupation, matchActivities, matchTools, onetMeta } from "./onet.js";

function tally(postings, vocab) {
  const counts = new Map();
  for (const p of postings) {
    for (const hit of tagPosting(p, vocab)) {
      counts.set(hit.name, (counts.get(hit.name) ?? 0) + 1);
    }
  }
  return counts;
}

function rank(counts, vocab, total) {
  return vocab
    .filter((v) => counts.has(v.name))
    .map((v) => ({
      id: v.id ?? null,
      name: v.name,
      family: v.family ?? null,
      postings: counts.get(v.name),
      pct: Math.round((1000 * counts.get(v.name)) / total) / 10,
      demonstrable: v.demonstrable ?? null,
    }))
    .sort((a, b) => b.postings - a.postings);
}

/**
 * @returns a compact profile of what this set of postings demands.
 *
 * Two vocabularies, deliberately. The hand built capability pack is deep on
 * software delivery, where O*NET is silent (zero mentions of user stories,
 * sprint, scrum or UAT in its whole release). O*NET covers the other ~900
 * occupations the pack knows nothing about. Neither one replaces the other.
 *
 * Pass `{ onet: false }` to skip the O*NET pass, which is the slow half.
 */
export function buildProfile(text, { onet = true, maxChunks = 2500 } = {}) {
  const postings = splitPostings(text);
  const total = postings.length || 1;
  const profile = {
    vocabVersion,
    postings: postings.length,
    capabilities: rank(tally(postings, capabilities), capabilities, total),
    tools: rank(tally(postings, tools), tools, total),
    domains: rank(tally(postings, domains), domains, total),
    certifications: rank(tally(postings, certifications), certifications, total),
  };
  if (onet && postings.length) {
    const bodies = postings.map((p) => p.body);
    const chunks = postings.flatMap((p) => bullets(p.body)).slice(0, maxChunks);
    profile.onet = {
      release: onetMeta.release,
      occupations: inferOccupation(bodies, { limit: 5 }),
      activities: matchActivities(chunks.length ? chunks : bodies, { limit: 12 }),
      tools: matchTools(bodies.join("\n"), { limit: 20 }),
      chunksScanned: chunks.length,
    };
  }
  return profile;
}

/**
 * The compact form that actually reaches a model.
 *
 * The full profile exists for the screen: the user wants to see all 45
 * capabilities with their counts. A model needs only enough to write three
 * paragraphs of framing, so this trims to the head of each dimension and
 * drops ids, families and posting counts. On a 201 posting dump the full
 * profile is roughly 2,000 tokens and this is roughly 150.
 */
export function digest(profile, opts = {}) {
  const { caps = 8, tools = 5, domains = 2, certs = 4 } = opts;
  const slim = (arr, n) => arr.slice(0, n).map((x) => `${x.name} ${x.pct}%`);
  return {
    n: profile.postings,
    demands: slim(profile.capabilities, caps),
    tools: slim(profile.tools, tools),
    domains: slim(profile.domains, domains),
    certs: slim(profile.certifications, certs),
  };
}

/** Rough token cost of sending this to a model, for the cache math. */
export function profileSize(profile) {
  return Math.ceil(JSON.stringify(profile).length / 4);
}

/**
 * The cache key. Two users whose markets look the same get the same answer,
 * so this buckets rather than hashing the exact profile: role-shaping
 * capabilities (top 5), top 5 tools, and the certification set.
 */
export function profileBucket(profile) {
  const top = (arr, n) => arr.slice(0, n).map((x) => x.name).sort().join("|");
  return [top(profile.capabilities, 5), top(profile.tools, 5), top(profile.certifications, 99)]
    .join(" :: ");
}
