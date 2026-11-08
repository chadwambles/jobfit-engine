"""Turn the O*NET CSV release into the compact artifacts the engine ships.

The raw database is over 100 MB and does not belong in a repository. This
produces four small JSON files from it. Rerun when a new O*NET release lands.

usage:  python scripts/build-onet.py path/to/db_31_0_csv

O*NET data is CC BY 4.0, US Department of Labor, Employment and Training
Administration. See data/onet/ATTRIBUTION.md.
"""
import csv, json, sys, os, re, math, collections

src = sys.argv[1] if len(sys.argv) > 1 else "db_31_0_csv"
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "onet")
os.makedirs(out, exist_ok=True)
csv.field_size_limit(10_000_000)

def rows(name):
    with open(os.path.join(src, name), encoding="utf-8-sig") as f:
        yield from csv.DictReader(f)

# ---- occupations, with every reported title people actually use -----------
occ = {}
for r in rows("occupation_data.csv"):
    occ[r["O*NET-SOC Code"]] = {"soc": r["O*NET-SOC Code"], "title": r["Title"],
                                "desc": r["Description"], "alts": []}
for r in rows("sample_of_reported_titles.csv"):
    o = occ.get(r["O*NET-SOC Code"])
    if o and r["Reported Job Title"] not in o["alts"]:
        o["alts"].append(r["Reported Job Title"])
json.dump(list(occ.values()), open(f"{out}/occupations.json", "w"), separators=(",", ":"))
print("occupations.json  %5d occupations, %d reported titles"
      % (len(occ), sum(len(o["alts"]) for o in occ.values())))

# ---- detailed work activities --------------------------------------------
dwa = {}
for r in rows("gwas_to_iwas_to_dwas.csv"):
    dwa[r["DWA Element ID"]] = {"id": r["DWA Element ID"], "name": r["DWA Element Name"],
                                "gwa": r["GWA Element Name"]}
json.dump(list(dwa.values()), open(f"{out}/activities.json", "w"), separators=(",", ":"))
print("activities.json   %5d detailed work activities" % len(dwa))

# ---- tasks, the bridge between posting language and activities -----------
t2d = collections.defaultdict(list)
dwa_key = None
for r in rows("tasks_to_dwas.csv"):
    if dwa_key is None:
        dwa_key = "DWA ID" if "DWA ID" in r else ("DWA Element ID" if "DWA Element ID" in r else None)
        if dwa_key is None:
            raise SystemExit("tasks_to_dwas.csv columns: %s" % list(r))
    t2d[r["Task ID"]].append(r[dwa_key])

tasks = []
for r in rows("task_statements.csv"):
    tasks.append({"id": r["Task ID"], "soc": r["O*NET-SOC Code"],
                  "text": r["Task"], "dwas": t2d.get(r["Task ID"], [])})
json.dump(tasks, open(f"{out}/tasks.json", "w"), separators=(",", ":"))
print("tasks.json        %5d task statements, %d linked to activities"
      % (len(tasks), sum(1 for t in tasks if t["dwas"])))

# ---- tools, which replace the hand written list of 22 --------------------
tools = {}
for r in rows("software_skills.csv"):
    n = r["Workplace Example"]
    t = tools.setdefault(n, {"name": n, "category": r["Element Name"], "hot": False, "occ": 0})
    t["occ"] += 1
    if r["Hot Technology"] == "Y":
        t["hot"] = True
ranked = sorted(tools.values(), key=lambda t: -t["occ"])
json.dump(ranked, open(f"{out}/tools.json", "w"), separators=(",", ":"))

# which occupation uses which tool. The aggregate above answers "how common is
# this tool"; a prefill needs "what does a nurse use", which is the other way.
occ_tools = collections.defaultdict(list)
for r in rows("software_skills.csv"):
    occ_tools[r["O*NET-SOC Code"]].append(r["Workplace Example"])
occ_tools = {k: sorted(set(v)) for k, v in occ_tools.items()}
json.dump(occ_tools, open(f"{out}/occupation_tools.json", "w"), separators=(",", ":"))
print("occupation_tools.json %3d occupations, %d links"
      % (len(occ_tools), sum(len(v) for v in occ_tools.values())))
print("tools.json        %5d distinct tools, %d flagged hot"
      % (len(ranked), sum(1 for t in ranked if t["hot"])))

for f in ("occupations", "activities", "tasks", "tools", "occupation_tools"):
    p = f"{out}/{f}.json"
    print("   %-18s %6.1f MB" % (f + ".json", os.path.getsize(p) / 1e6))
