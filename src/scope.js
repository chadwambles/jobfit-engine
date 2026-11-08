/**
 * What this vocabulary is entitled to measure, and how loudly to say so.
 *
 * The 45 capabilities were derived from business analyst postings, so the
 * vocabulary speaks analyst work and nothing else. The question is what to do
 * with a paste from somewhere else.
 *
 * Two answers were tried and both were wrong, for the same reason.
 *
 * The first refused the paste outright when O*NET inferred an occupation
 * outside the covered groups. The second kept the result but named the
 * occupation in a disclosure. Both trusted inferOccupation, which matches
 * posting prose against O*NET task statements, and on technical postings that
 * signal is noise: a backend posting full of Go, gRPC, Kubernetes and
 * Terraform infers Earth Drillers at 0.71, while a genuine electrician posting
 * infers Electricians at 0.74. No threshold separates those, so nothing in the
 * product may rest on them.
 *
 * Note the contrast with findOccupations, which matches a typed job title
 * against 8,189 reported titles and is reliable across nursing, the trades and
 * data work. Occupation identification is available, but only when a person
 * types their title. It cannot be read off a paste.
 *
 * What is left is the one signal that needs no inference at all: how much of
 * the vocabulary actually fired. A near-silent vocabulary earns a disclosure.
 * Nothing is ever withheld on the strength of a guess.
 */

/** SOC major groups this vocabulary was drawn from. */
const GROUPS = Object.freeze({
  11: "Management",
  13: "Business and Financial Operations",
  15: "Computer and Mathematical",
});

export const vocabularyScope = Object.freeze({
  derivedFrom: "201 LinkedIn business analyst postings, 2026-11-05",
  socMajorGroups: GROUPS,
  describe: Object.values(GROUPS).join(", "),
});

/** True when an O*NET SOC code sits inside what the vocabulary was drawn from. */
export function inVocabularyScope(soc) {
  return typeof soc === "string" && Object.hasOwn(GROUPS, soc.slice(0, 2));
}

/**
 * Below this many capabilities a result is too thin to present without saying
 * so. Analyst pastes fire 15. The backend and trades pastes that motivated
 * this fire 2 and 1.
 */
export const QUIET = 5;

/**
 * @returns {{status: "covered"|"thin", fired: number, of: number}}
 *   "thin" means say something before showing the numbers. It never means
 *   withhold them, and it never names a field.
 */
export function assessScope(profile, { of = 45 } = {}) {
  const fired = profile?.capabilities?.length ?? 0;
  return { status: fired >= QUIET ? "covered" : "thin", fired, of };
}
