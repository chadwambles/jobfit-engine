/**
 * Scores a project catalog against a gap.
 *
 * The model never picks projects. It only writes prose about the ones this
 * function returns, which is why the catalog's quality is the product's
 * quality.
 */

/**
 * @param gap     from computeGap()
 * @param catalog array of { id, title, capabilities[], tools[], artifact, effort, dataSource, reachable }
 * @param opts.limit how many to return
 * @param opts.requireReachable drop projects whose data source is not actually obtainable
 */
export function matchProjects(gap, catalog, opts = {}) {
  const { limit = 3, requireReachable = true } = opts;
  const weight = new Map(gap.missing.map((c) => [c.name, c.pct]));

  const scored = catalog
    .filter((p) => (requireReachable ? p.reachable !== false : true))
    .map((p) => {
      const closes = (p.capabilities ?? []).filter((c) => weight.has(c));
      const already = (p.capabilities ?? []).filter((c) => !weight.has(c));
      const score = closes.reduce((s, c) => s + weight.get(c), 0);
      return {
        id: p.id,
        title: p.title,
        artifact: p.artifact ?? null,
        effort: p.effort ?? null,
        dataSource: p.dataSource ?? null,
        /** Gap capabilities this project would let you evidence. */
        closes,
        /** Capabilities it also covers that you already had. */
        redundant: already,
        score: Math.round(score * 10) / 10,
        /** Score per capability claimed, so a project tagged with everything
         *  does not beat a focused one purely on breadth. */
        focus: closes.length ? Math.round((score / (p.capabilities ?? []).length) * 10) / 10 : 0,
      };
    })
    .filter((p) => p.closes.length > 0)
    .sort((a, b) => b.score - a.score || b.focus - a.focus || a.closes.length - b.closes.length);

  return scored.slice(0, limit);
}

/** What the whole catalog cannot close, which is a gap in the catalog itself. */
export function catalogBlindSpots(gap, catalog) {
  const covered = new Set(catalog.flatMap((p) => p.capabilities ?? []));
  return gap.missing.filter((c) => !covered.has(c.name));
}
