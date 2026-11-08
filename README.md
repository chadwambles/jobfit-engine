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

## Two vocabularies

**45 hand built capabilities** derived from 201 business analyst postings, deep
on software delivery.

**O*NET 31.0**, the US Department of Labor occupational database: 1,016
occupations, 2,087 work activities, 18,838 task statements and 8,753 tools,
covering nursing, the trades, teaching, food service, finance and the rest.

They are complementary rather than competing, and the reason is checkable. In
the entire O*NET release there are zero mentions of user stories, acceptance
criteria, sprint, scrum, agile or UAT. Fourteen mentions of "stakeholder". So
O*NET cannot describe a modern delivery team, and the hand built pack cannot
describe a welder.

Matching runs posting text into O*NET task statements and then follows the link
to work activities, rather than matching activities directly. Activities are
three words long, so a bullet agrees with them only on generic verbs: matched
directly, "write user stories" returns "Clear equipment jams". Tasks are full
sentences carrying domain language, and each carries an occupation code, so
inferring the occupation falls out of the same pass.

The matcher is tuned for precision and will return nothing rather than reach.

Cost: about 260 ms for 20 postings, 2.6 s for 201. Pass `{ onet: false }` to
`buildProfile` to skip it. None of it reaches a model; the digest is still 139
tokens.

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
const missing = catalogBlindSpots(gap, catalog); // holes in the catalog
gap.closableSolo;        // gaps a project can close
gap.closableByOutreach;  // gaps needing other people, but not a job
gap.needsEmployment;     // gaps no project can evidence, stated honestly
digest(profile);                            // the compact form for a model
```

## The three dimensions

**Capabilities** are things a portfolio project can demonstrate, and only
these drive the gap. 45 of them, derived from 201 real postings.

**Tools** are exposure rather than skill. "Has used SAP" is a fact about a CV,
not something a weekend project proves, so tools are tagged separately and
scored separately.

**Domains** are context. Healthcare, insurance, government, and so on.

Each capability is also marked **solo**, **outreach** or **employment**, and
the gap splits on it:

- *solo* (36 of 45): one person with public data. A project can evidence it.
- *outreach* (6): needs other people but not a job. Open source maintainers,
  a volunteer organization, user interviews.
- *employment* (3): needs a real organization. No portfolio project can
  honestly evidence it, and the tool says so rather than inventing one.

The matcher only scores solo gaps. This is the difference between a tool that
tells you the truth and one that recommends a weekend project for "drive
change management and user adoption".

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
