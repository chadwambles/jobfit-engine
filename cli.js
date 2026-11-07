#!/usr/bin/env node
/**
 * jobfit: profile a dump of job postings, measure the gap, match projects.
 *
 *   jobfit profile  <file>
 *   jobfit gap      <file> --have "Write user stories,Build dashboards"
 *   jobfit match    <file> --have "..." [--catalog path.json] [--limit 3]
 *   jobfit vocab
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildProfile, profileSize, profileBucket, digest, computeGap, matchProjects,
         catalogBlindSpots, capabilities, dimensions } from "./src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n, d = null) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 ? argv[i + 1] : d;
};
const file = argv[1] && !argv[1].startsWith("--") ? argv[1] : null;
const have = (flag("have") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function bar(pct, width = 28) {
  return "#".repeat(Math.max(0, Math.round((pct / 100) * width)));
}

/** Node's console.log supports %s and %d but no width or precision, so rows
 *  are padded by hand rather than with printf-style specifiers. */
const pad = (s, n) => String(s).slice(0, n).padEnd(n);
const num = (v, n, dp = 0) => Number(v).toFixed(dp).padStart(n);
function row(name, postings, pct) {
  return `   ${pad(name, 52)} ${num(postings, 4)} (${num(pct, 4, 1)}%) ${bar(pct)}`;
}

function need(f) {
  if (!f) { console.error("a file of pasted postings is required"); process.exit(2); }
  return readFileSync(f, "utf8");
}

if (cmd === "vocab") {
  console.log("vocabulary dimensions:", JSON.stringify(dimensions));
  let fam = null;
  for (const c of capabilities) {
    if (c.family !== fam) { fam = c.family; console.log("\n" + fam.toUpperCase()); }
    console.log("   " + c.name);
  }
} else if (cmd === "profile" || cmd === "gap" || cmd === "match") {
  const profile = buildProfile(need(file));
  console.log("postings read: %d   full profile ~%d tokens   model digest ~%d tokens   vocab v%s",
              profile.postings, profileSize(profile), profileSize(digest(profile)),
              profile.vocabVersion);

  if (cmd === "profile") {
    for (const dim of ["capabilities", "tools", "domains", "certifications"]) {
      if (!profile[dim].length) continue;
      console.log("\n-- %s --", dim.toUpperCase());
      for (const x of profile[dim].slice(0, 20)) console.log(row(x.name, x.postings, x.pct));
    }
    console.log("\ncache bucket: %s", profileBucket(profile));
    process.exit(0);
  }

  const gap = computeGap(profile, have);
  console.log("\nyou evidence %d of %d demanded capabilities, %s%% of weighted demand",
              gap.covered.length, gap.demanded, gap.coverage);
  console.log("\n-- BIGGEST GAPS --");
  for (const g of gap.priorities) console.log(row(g.name, g.postings, g.pct));

  if (cmd === "match") {
    const cat = JSON.parse(readFileSync(flag("catalog") ?? join(HERE, "data", "catalog.seed.json"), "utf8"));
    const hits = matchProjects(gap, cat.projects, { limit: Number(flag("limit", 3)) });
    console.log("\n-- PROJECTS THAT CLOSE THE MOST DEMAND --");
    for (const [i, h] of hits.entries()) {
      console.log("\n%d. %s", i + 1, h.title);
      console.log("   score %s   effort %s", h.score, h.effort);
      console.log("   artifact: %s", h.artifact);
      console.log("   data: %s", h.dataSource);
      console.log("   closes: %s", h.closes.join("; "));
      if (h.redundant.length) console.log("   you already have: %s", h.redundant.join("; "));
    }
    const blind = catalogBlindSpots(gap, cat.projects);
    if (blind.length) {
      console.log("\n-- NOTHING IN THE CATALOG CLOSES THESE --");
      for (const b of blind) console.log(`   ${pad(b.name, 52)} (${num(b.pct, 4, 1)}%)`);
    }
  }
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].split("/**")[1]);
}
