# O*NET data

This directory contains artifacts derived from the **O\*NET 31.0 Database**
(August 2026 release) by the National Center for O\*NET Development.

> This site incorporates information from the O\*NET 31.0 Database by the U.S.
> Department of Labor, Employment and Training Administration (USDOL/ETA).
> Used under the CC BY 4.0 license. O\*NET® is a trademark of USDOL/ETA.
>
> Chad Wambles has modified the information by extracting a subset of fields,
> deduplicating technology examples, and reshaping the tables into JSON for
> text matching. USDOL/ETA has not approved or endorsed these modifications.

License: Creative Commons Attribution 4.0 International,
https://creativecommons.org/licenses/by/4.0/

Source: https://www.onetcenter.org/database.html

## Regenerating

The raw release is over 100 MB and is deliberately not committed. Download the
CSV bundle from the link above and run:

```
python scripts/build-onet.py path/to/db_31_0_csv
```

## What is here

| file | what it holds |
|---|---|
| `occupations.json` | every occupation with its description and the job titles people actually report using |
| `activities.json` | the detailed work activities |
| `tasks.json` | task statements, each with its occupation and the activities it maps to |
| `tools.json` | distinct technology examples, how many occupations use each, and whether O\*NET flags it as a hot technology |

## What O*NET does not cover

Checked directly against the release: across 18,838 task statements and 2,087
work activities there are zero mentions of user stories, acceptance criteria,
sprint, scrum, agile, UAT, traceability, product owner, kanban, wireframe or
process map. Two for backlog, five for dashboard, fourteen for stakeholder.

O\*NET is survey built and updates slowly, so it is strong on healthcare, the
trades, education, food service and finance, and nearly silent on modern
software delivery. That is why the hand built capability pack in
`data/capabilities.json` exists alongside it rather than being replaced by it.
