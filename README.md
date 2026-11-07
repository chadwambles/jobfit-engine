# jobfit-engine

Turns a dump of job postings into three things: a profile of what that market
actually demands, the gap between it and what you can already evidence, and a
ranked set of portfolio projects that would close the widest gaps.

No model calls. Not in the parser, not in the scoring, not anywhere. The
whole package is regular expressions and arithmetic.

## Why that matters

A dump of 201 job postings is about 1.5 MB of text, which is roughly 370,000
tokens if you hand it to a language model. Parsed deterministically it becomes
a profile of about 139 tokens. Everything the product decides, it decides from
those 139 tokens, which is why a per-user request costs approximately nothing.

The model's job comes later and elsewhere: writing the framing for projects
this engine already picked, cached by profile shape.

## Install

```
git clone <this repo>
cd jobfit-engine
npm test
```

No dependencies to install. Node 20 or newer.

## Use

```
node cli.js profile postings.txt
node cli.js gap     postings.txt --have "Build dashboards,Write user stories"
node cli.js match   postings.txt --have "..." --limit 3
node cli.js vocab
```

As a module:

```js
import { buildProfile, digest, computeGap, matchProjects, catalogBlindSpots }
  from "jobfit-engine";

const profile = buildProfile(pastedText);   // what this market demands
const gap     = computeGap(profile, mine);  // minus what you can evidence
const picks   = matchProjects(gap, catalog);// projects that close the most
const missing = catalogBlindSpots(gap, catalog); // what no project covers
digest(profile);                            // the compact form for a model
```

## The three dimensions

**Capabilities** are things a portfolio project can demonstrate, and only
these drive the gap. 45 of them, derived from 201 real postings.

**Tools** are exposure rather than skill. "Has used SAP" is a fact about a CV,
not something a weekend project proves, so tools are tagged separately and
scored separately.

**Domains** are context. Healthcare, insurance, government, and so on.

The three live in `data/*.json` and are the single source of truth, read by
both this engine and the Python analysis that produced them, so the published
study and the running app cannot disagree.

## What is honest and what is approximate

Capability counts are pattern matches over posting text, which means they are
good but not exact. Every pattern is in `data/capabilities.json` alongside a
note explaining what it does and, where relevant, what it got wrong before.
Two capabilities are scoped to requirement bullets rather than whole postings,
because matching company prose inflated them badly.

The prioritization count is the weakest, with an honest range of 57 to 71 of
201 depending on whether generic "prioritization skills" mentions count as the
ask. It is recorded that way rather than given false precision.

Posting splitting is the known fragility. One format is supported properly
(a OneNote export of LinkedIn), with a loose and a generic fallback. Users
pasting from Indeed, from PDFs or from email alerts will need new splitters,
and that work is isolated in `src/parse.js` behind `detectFormat()`.

## Corpus

The 201 postings this was built from are not in this repository and will not
be. Raw scraped posting text does not get republished. `data/expected-201.json`
holds the derived counts so the cross-validation still runs, and
`fixtures/synthetic/` holds postings written by hand for the unit tests.

## License

MIT
