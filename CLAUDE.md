# jobfit-engine

Deterministic engine behind a tool that turns a dump of job postings into a
capability profile, a gap against what the user can evidence, and ranked
portfolio project matches.

## The one rule that matters

**No model call appears in parse, profile, gap or match. Ever.**

This is not a performance preference, it is the product's unit economics. A
201 posting dump is roughly 370,000 tokens of raw text and roughly 139 tokens
of digest. The model's only job, in a separate package, is writing prose about
projects this engine has already chosen, cached by profile bucket. If you find
yourself adding an LLM call to make the parser more robust, stop: that cost
scales with input size rather than with users, and one power user doing what
the corpus owner did in one sitting would cost more than a thousand cache hits.

## Stack conventions

- Plain JavaScript, ESM. No TypeScript.
- No runtime dependencies. Tests use `node:test`. Keep it that way.
- The consuming app is Next.js App Router, MySQL 8 with raw mysql2 and no ORM,
  deployed to DigitalOcean with PM2, Nginx and GitHub Actions.
- Anthropic SDK server-side only, and not in this package.
- Never use em dashes, anywhere, including code comments and CLI output.

## Why the vocabulary is a data file

`data/*.json` is the single source of truth for what a capability, tool,
domain and certification are. The published study reads the same files from
Python. If the vocabulary lived in code, the analysis and the app would drift
and nobody would notice until a number disagreed in public.

Three separate dimensions, deliberately. Capabilities are what a portfolio
project can demonstrate. Tools are exposure. Domains are context. Only the
capability dimension drives the gap.

Every capability also carries `demonstrable`: solo, outreach or employment.
This exists because the engine's own blind-spot output showed it recommending
nothing for capabilities like "run sprint ceremonies", which no solo project
can evidence at all. The gap splits three ways and **the matcher only ever
scores solo gaps**. Recommending a project for an employment-gated capability
would be a lie, so the tool names those and says plainly that nothing here
will fix them. If you add a capability, classify it, or a test fails.

## Testing discipline

Two kinds, and both are load-bearing.

`npm test` runs unit tests against synthetic fixtures committed to this repo.

`npm run validate` cross-validates against the Python reference implementation
over the private corpus, and every one of the 45 capability counts must match
exactly. Point `JOBFIT_CORPUS` at the corpus file. It skips when unset.

The corpus is raw scraped job posting text and is **not in this repo and must
not be added to it**, same rule as every other scraped source in this
portfolio. `data/expected-201.json` holds the reference counts, which are
numbers rather than content.

## Things that have already gone wrong here

Read these before trusting a pattern you just wrote.

- **Check what a pattern rejects, not what it matches.** Hits look correct by
  construction. Every pattern bug so far was found by reading rejections.
- A capability counted 121 postings because one loose branch (`efficienc`)
  matched company goals rather than requirements.
- A capability counted 95 because `cross-functional` is boilerplate in half of
  all job postings. The real figure was 32.
- The AI capability counted 62 until company branding and one employer's
  disclosure that *they* screen applicants with AI were excluded. Real: 34.
- Prioritization went 79, then 22 after over-tightening (it rejected
  "prioritize product backlog items", the clearest example of the ask), then
  57. The honest range is 57 to 71. Patterns scoped to requirement bullets
  rather than whole bodies carry `scope: "bullets"`.
- `console.log` in Node supports `%s` and `%d` but **no width or precision**.
  `%-52s` prints literally. Pad by hand.
- A typo'd capability name in the catalog scores zero silently. There is a
  test guarding this; keep it.

## Phase position

A and B (collection, vocabulary, published study) are upstream. C is the
engine. D is the catalog, now at 17 projects covering all 36 solo
capabilities, with a test enforcing that. E is the web app.

`catalogBlindSpots()` reports solo gaps no project covers, which is the
specification for every catalog addition. It currently returns nothing.
