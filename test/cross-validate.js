/**
 * Cross-validates the JavaScript engine against the Python reference.
 *
 * The capability patterns were written in Python and ported to JS, and the two
 * regex dialects are close but not identical. Every one of the 45 capability
 * counts must match exactly. A divergence means the published study and the
 * running app disagree about what a capability is, which is the failure this
 * whole data-file-as-source-of-truth arrangement exists to prevent.
 *
 *   node test/cross-validate.js "C:\\path\\to\\postings.txt"
 *
 * With no argument it looks in a few obvious places, then falls back to the
 * JOBFIT_CORPUS environment variable.
 *
 * The corpus is raw scraped posting text and is deliberately not in this repo.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { buildProfile, profileSize, profileBucket, digest } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const expected = JSON.parse(readFileSync(join(ROOT, "data", "expected-201.json"), "utf8"));

const GUESSES = [
  join(ROOT, "..", "corpus", "postings.txt"),
  join(ROOT, "corpus", "postings.txt"),
  join(ROOT, "..", "postings.txt"),
];

function findCorpus() {
  const given = process.argv[2];
  if (given) {
    const p = resolve(given);
    if (!existsSync(p)) {
      console.error("NOT FOUND: %s", p);
      console.error("That path does not exist. Check the file name and that it saved where you think.");
      process.exit(2);
    }
    return p;
  }
  for (const g of GUESSES) if (existsSync(g)) return g;
  if (process.env.JOBFIT_CORPUS) {
    const p = resolve(process.env.JOBFIT_CORPUS);
    if (!existsSync(p)) {
      console.error("JOBFIT_CORPUS is set to a path that does not exist: %s", p);
      process.exit(2);
    }
    return p;
  }
  console.error("NO CORPUS GIVEN.\n");
  console.error("Pass the file as an argument:");
  console.error('   node test/cross-validate.js "C:\\\\path\\\\to\\\\postings.txt"\n');
  console.error("I also looked in these places and found nothing:");
  for (const g of GUESSES) console.error("   %s", g);
  process.exit(2);
}

const corpus = findCorpus();
const text = readFileSync(corpus, "utf8");
console.log("corpus: %s", corpus);
console.log("size:   %s characters\n", text.length.toLocaleString("en-US"));

const profile = buildProfile(text);
const got = new Map(profile.capabilities.map((c) => [c.name, c.postings]));
const pad = (s, n) => String(s).slice(0, n).padEnd(n);
const rp = (s, n) => String(s).padStart(n);

let fail = 0;
const okPostings = profile.postings === expected.postings;
console.log("postings found:  JS %d   Python reference %d   %s",
            profile.postings, expected.postings, okPostings ? "ok" : "MISMATCH");
if (!okPostings) {
  fail++;
  console.log("\n   The splitter found a different number of postings, so every count below");
  console.log("   will be off. This usually means the export lost the");
  console.log("   'From <https://www.linkedin.com...>' link footers that mark posting");
  console.log("   boundaries. Report the number above and the splitter can be adjusted.");
}

const diffs = [];
for (const [name, py] of Object.entries(expected.capabilities)) {
  const js = got.get(name) ?? 0;
  if (js !== py) diffs.push([name, js, py]);
}
if (diffs.length) {
  console.log("\n%s %s %s", pad("CAPABILITY", 54), rp("JS", 5), rp("PY", 5));
  console.log("-".repeat(68));
  for (const [name, js, py] of diffs) {
    console.log("   %s %s %s   <<< MISMATCH", pad(name, 54), rp(js, 5), rp(py, 5));
  }
  fail += diffs.length;
} else {
  console.log("capability counts: all %d identical to the Python reference",
              Object.keys(expected.capabilities).length);
}

console.log("\nfull profile:  ~%d tokens", profileSize(profile));
console.log("model digest:  ~%d tokens  (this is all a model ever sees)",
            profileSize(digest(profile)));
console.log("cache bucket:  %s", profileBucket(profile));
console.log(fail ? `\nFAILED: ${fail} divergence(s)` : "\nPASS: the port is faithful");
process.exit(fail ? 1 : 0);
