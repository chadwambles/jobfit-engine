/**
 * The gap: what the postings demand minus what the person can already evidence.
 *
 * This is arithmetic, not generation, and it is the part of the product worth
 * paying for. A suggestion is a commodity; a measured gap is not.
 */

/**
 * @param profile   from buildProfile()
 * @param evidenced array of capability names the person can already show
 * @param opts.minPct ignore anything demanded by fewer than this share of postings
 */
export function computeGap(profile, evidenced = [], opts = {}) {
  const { minPct = 0 } = opts;
  const have = new Set(evidenced);
  const demanded = profile.capabilities.filter((c) => c.pct >= minPct);

  const missing = demanded.filter((c) => !have.has(c.name));
  const covered = demanded.filter((c) => have.has(c.name));

  const demandTotal = demanded.reduce((s, c) => s + c.pct, 0);
  const coveredWeight = covered.reduce((s, c) => s + c.pct, 0);

  return {
    postings: profile.postings,
    demanded: demanded.length,
    covered,
    missing,
    /** Share of weighted demand the person already evidences, 0 to 100. */
    coverage: demandTotal ? Math.round((1000 * coveredWeight) / demandTotal) / 10 : 0,
    /** The gaps worth acting on, biggest demand first. */
    priorities: missing.slice(0, 10),
  };
}
