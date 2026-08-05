"""Verification suite for the extracted PRS catalogue.

The data-side checks re-derive facts straight from the PDF by a different route
than extract.py uses (text lines rather than word geometry), so a shared bug is
unlikely to hide in both. The calculator-side checks live in verify.js and drive
the shipped calculator.js under a stub DOM.

    .venv-pricing/bin/python pricing-data/tests/verify.py "<the pdf>"
"""
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import pdfplumber
from extract import clean, cluster_rows, build_rect_lookup, PRICE_RE

ROOT = Path(__file__).resolve().parent.parent
PDF = sys.argv[1] if len(sys.argv) > 1 else "lista de precios nueva.pdf"

results = []


def check(name, fn):
    try:
        ok, detail = fn()
    except Exception as exc:                      # a crash is a failed check
        ok, detail = False, f"{type(exc).__name__}: {exc}"
    results.append((ok, name, detail))


catalog = json.loads((ROOT / "data/catalog.json").read_text())
index = json.loads((ROOT / "data/index.json").read_text())
unparsed = json.loads((ROOT / "data/_unparsed.json").read_text())
matrices = [t for t in catalog if t["type"] == "fabric_matrix"]
widthp = [t for t in catalog if t["type"] == "width_priced"]
items = [t for t in catalog if t["type"] == "item_list"]
awnings = [t for t in catalog if t["type"] == "awning_system"]

pdf = pdfplumber.open(PDF)
page_lines = {p.page_number: (p.extract_text() or "").splitlines()
              for p in pdf.pages}
N_PAGES = len(pdf.pages)

KNOWN_REQS = {"clutch_large", "motorization",
              "bottomrail_delfin", "thin_fabric_smiles"}
MEANINGFUL_FILLS = {(1.0, 0.898, 0.6),            # light yellow
                    (0.9373, 0.9373, 0.9373),     # grey
                    (1.0, 0.6, 0.0)}              # orange
YELLOW, GREY, ORANGE = ((1.0, 0.898, 0.6),
                        (0.9373, 0.9373, 0.9373),
                        (1.0, 0.6, 0.0))

all_prices = [p for t in matrices for row in t["prices"] for p in row
              if p is not None]
families = sorted({t["category"] for t in matrices})


# --------------------------------------------------------------- helpers ----
def row_matches_pdf(table, i):
    """True if row `i` of `table` appears verbatim in the PDF's page text."""
    want = [p for p in table["prices"][i] if p is not None]
    if not want:
        return True
    height = table["heights_in"][i]
    for ln in page_lines.get(table["page"], []):
        toks = ln.split()
        if str(height) not in toks:
            continue
        got = [float(x) for x in toks if PRICE_RE.match(x)]
        for s in range(len(got) - len(want) + 1):
            if got[s:s + len(want)] == want:
                return True
    return False


def cell_in_pdf(table, i, j):
    """True if the single cell (i, j) is found at the right offset in the PDF."""
    price = table["prices"][i][j]
    if price is None:
        return True
    height = table["heights_in"][i]
    offset = sum(1 for k in range(j) if table["prices"][i][k] is not None)
    for ln in page_lines.get(table["page"], []):
        toks = ln.split()
        if str(height) not in toks:
            continue
        got = [float(x) for x in toks if PRICE_RE.match(x)]
        row = [p for p in table["prices"][i] if p is not None]
        for s in range(len(got) - len(row) + 1):
            if got[s:s + len(row)] == row:
                return got[s + offset] == price
    return False


def shaded_price_cells(page, skip_axis_rows=True):
    """Price tokens on `page` sitting on a meaningful fill, from raw geometry.
    The metros/pulgadas rows are the tables' header band -- shaded as styling,
    never as a per-cell flag -- so they are skipped."""
    words = [w for w in page.extract_words() if clean(w["text"])]
    for w in words:
        w["txt"] = clean(w["text"])
    color_at = build_rect_lookup(page)
    n = 0
    for r in cluster_rows(words):
        label = clean(" ".join(w["txt"] for w in r["words"]
                              if not PRICE_RE.match(w["txt"]))).lower()
        if skip_axis_rows and label.startswith(("metros", "pulgadas")):
            continue
        for w in r["words"]:
            if not PRICE_RE.match(w["txt"]):
                continue
            c = color_at((w["x0"] + w["x1"]) / 2, (w["top"] + w["bottom"]) / 2)
            if c is not None and tuple(c) in MEANINGFUL_FILLS:
                n += 1
    return n


def fill_census():
    """Count each meaningful fill across the pages that carry a matrix."""
    mp = {t["page"] for t in matrices}
    cc = Counter()
    for page in pdf.pages:
        if page.page_number not in mp:
            continue
        words = [w for w in page.extract_words() if clean(w["text"])]
        for w in words:
            w["txt"] = clean(w["text"])
        color_at = build_rect_lookup(page)
        for r in cluster_rows(words):
            label = clean(" ".join(w["txt"] for w in r["words"]
                                  if not PRICE_RE.match(w["txt"]))).lower()
            if label.startswith(("metros", "pulgadas")):
                continue
            for w in r["words"]:
                if not PRICE_RE.match(w["txt"]):
                    continue
                c = color_at((w["x0"] + w["x1"]) / 2,
                             (w["top"] + w["bottom"]) / 2)
                if c is not None and tuple(c) in MEANINGFUL_FILLS:
                    cc[tuple(c)] += 1
    return cc


CENSUS = fill_census()
REQ_COUNT = Counter(r for t in matrices for row in t["requirements"]
                    for r in row if r)


# ------------------------------------------------------- guard behaviour ----
def guard_raises():
    from extract import resolve_requirements
    grid = [[(1.0, 1.0, 1.0), ORANGE], [(1.0, 1.0, 1.0), (1.0, 1.0, 1.0)]]
    try:
        resolve_requirements(grid, ["Una nota que no menciona ningun color."],
                             99, "prueba")
    except ValueError:
        return True, "unexplained fill raises ValueError"
    return False, "unexplained colour was accepted silently"


def guard_resolves():
    from extract import resolve_requirements
    grid = [[(1.0, 1.0, 1.0), ORANGE], [(1.0, 1.0, 1.0), (1.0, 1.0, 1.0)]]
    reqs, legend = resolve_requirements(
        grid, ["EN LAS MEDIDAS EN NARANJA LA TELA PUEDE PRESENTAR SONRISAS"],
        99, "prueba")
    return (reqs[0][1] == "thin_fabric_smiles" and reqs[0][0] is None
            and "thin_fabric_smiles" in legend), "resolves once a note explains it"


def guard_decoration():
    """A fill covering every cell is styling, and must not become a flag."""
    from extract import resolve_requirements
    grid = [[YELLOW, YELLOW], [YELLOW, YELLOW]]
    reqs, legend = resolve_requirements(
        grid, ["Las medidas sombreadas en amarillo requieren clutch Large"],
        99, "prueba")
    flat = [r for row in reqs for r in row]
    return all(r is None for r in flat), f"full-coverage fill ignored ({flat})"


def guard_two_colours():
    """One sentence defining two colours must not collapse to one meaning."""
    from extract import resolve_requirements
    grid = [[(1.0, 1.0, 1.0), YELLOW], [GREY, (1.0, 1.0, 1.0)]]
    reqs, _ = resolve_requirements(
        grid, ["Las medidas sombreadas en amarillo requieren clutch Large, y "
               "las medidas sombreadas en gris requieren motorización."],
        99, "prueba")
    return (reqs[0][1] == "clutch_large" and reqs[1][0] == "motorization",
            f"yellow->{reqs[0][1]}, grey->{reqs[1][0]}")


check("guard: unexplained shading raises instead of vanishing", guard_raises)
check("guard: an explained shading resolves cleanly", guard_resolves)
check("guard: a fill covering every cell is treated as decoration", guard_decoration)
check("guard: one note defining two colours resolves each separately", guard_two_colours)


# ------------------------------------------------------- file-level shape ----
check("block counts match the PDF's table inventory",
      lambda: (Counter(t["type"] for t in catalog) ==
               Counter({"fabric_matrix": 77, "width_priced": 34,
                        "item_list": 10, "awning_system": 1,
                        "motor_options": 1}),
               str(dict(Counter(t["type"] for t in catalog)))))
check("no unparsed pages",
      lambda: (not unparsed, f"{len(unparsed)} unparsed page(s)"))
check("index.json has one entry per catalogue table",
      lambda: (len(index) == len(catalog), f"index {len(index)} vs catalog {len(catalog)}"))
check("index entries point at files that exist",
      lambda: (all((ROOT / "data" / e["file"]).exists() for e in index),
               f"{len({e['file'] for e in index})} distinct files"))
check("per-category files sum to the full catalogue",
      lambda: (sum(len(json.loads(p.read_text())["tables"])
                   for p in (ROOT / "data").glob("*.json")
                   if p.name not in ("catalog.json", "index.json", "_unparsed.json"))
               == len(catalog), "per-family totals reconcile"))
check("catalog.js embed is byte-equivalent to catalog.json",
      lambda: (json.loads((ROOT / "data/catalog.js").read_text()
                          [len("window.PRS_CATALOG = "):-1]) == catalog,
               "JS embed matches the JSON"))
check("no stale files left in data/",
      lambda: (not [p.name for p in (ROOT / "data").glob("*")
                    if p.suffix not in (".json", ".js")],
               f"{len(list((ROOT / 'data').glob('*')))} files, all json/js"))
check("every table declares USD",
      lambda: ({t.get("currency") for t in catalog} == {"USD"},
               str({t.get("currency") for t in catalog})))
check("every page number is inside the PDF",
      lambda: (all(1 <= t["page"] <= N_PAGES for t in catalog),
               f"pages 1..{N_PAGES}"))
check("no duplicate (name, page) pair",
      lambda: (len({(t["name"], t["page"]) for t in catalog}) == len(catalog),
               f"{len(catalog)} tables, all distinct"))
check("no table landed in the 'General' fallback category",
      lambda: (not [t for t in catalog if t.get("category") in (None, "General")],
               f"{len(families)} matrix families"))


# --------------------------------------------------- matrix shape / sanity ----
check("every price grid is rectangular",
      lambda: (not [t["name"] for t in matrices
                    if len(t["prices"]) != len(t["heights_in"])
                    or any(len(r) != len(t["widths_in"]) for r in t["prices"])],
               f"{len(matrices)} matrices rectangular"))
check("requirement grid aligns with price grid",
      lambda: (not [t["name"] for t in matrices
                    if len(t["requirements"]) != len(t["prices"])
                    or any(len(a) != len(b)
                           for a, b in zip(t["requirements"], t["prices"]))],
               "requirement grid matches price grid"))
check("width axes strictly ascending",
      lambda: (all(t["widths_in"] == sorted(t["widths_in"]) for t in matrices),
               "widths ascend in all 77"))
check("height axes strictly ascending",
      lambda: (all(t["heights_in"] == sorted(t["heights_in"]) for t in matrices),
               "heights ascend in all 77"))
check("no duplicate width on an axis",
      lambda: (all(len(set(t["widths_in"])) == len(t["widths_in"]) for t in matrices),
               "widths unique"))
check("no duplicate height on an axis",
      lambda: (all(len(set(t["heights_in"])) == len(t["heights_in"]) for t in matrices),
               "heights unique"))
check("metric width axis matches the inch axis where present",
      lambda: (not [t["name"] for t in matrices if t.get("widths_m")
                    and len(t["widths_m"]) != len(t["widths_in"])],
               "widths_m aligned"))
check("every matrix carries at least one price",
      lambda: (all(any(p is not None for r in t["prices"] for p in r)
                   for t in matrices), f"{len(all_prices)} priced cells"))
check("every price is positive",
      lambda: (all(p > 0 for p in all_prices), f"min {min(all_prices)}"))
check("every price has at most 2 decimal places",
      lambda: (all(round(p, 2) == p for p in all_prices), "all 2dp"))
check("no price is implausibly large",
      lambda: (max(all_prices) < 5000, f"max {max(all_prices)}"))
check("dimensions sit in a plausible inch range",
      lambda: (all(10 <= v <= 300 for t in matrices
                   for v in t["widths_in"] + t["heights_in"]),
               "10-300 inches"))


def no_wild_jumps():
    """A column shift would show up as a huge step between adjacent cells."""
    worst, where = 0, None
    for t in matrices:
        for r in t["prices"]:
            v = [x for x in r if x is not None]
            for i in range(len(v) - 1):
                ratio = max(v[i], v[i + 1]) / min(v[i], v[i + 1])
                if ratio > worst:
                    worst, where = ratio, (t["name"], v[i], v[i + 1])
    return worst < 3.0, f"worst adjacent ratio {worst:.2f} ({where[0][:38]})"


check("no wild jump between adjacent cells (column-shift canary)", no_wild_jumps)


# ------------------------------------------------------------ shading ----
check("no requirement flag on an empty cell",
      lambda: (not [(t["name"], i, j) for t in matrices
                    for i, row in enumerate(t["requirements"])
                    for j, r in enumerate(row)
                    if r and t["prices"][i][j] is None],
               "no flag on an empty cell"))
check("shaded-cell count re-derived from the PDF matches the catalogue",
      lambda: (sum(REQ_COUNT.values()) == sum(CENSUS.values()),
               f"catalogue {sum(REQ_COUNT.values())} vs pdf {sum(CENSUS.values())}"))
check("yellow cells split exactly into clutch + bottomrail",
      lambda: (REQ_COUNT["clutch_large"] + REQ_COUNT["bottomrail_delfin"]
               == CENSUS[YELLOW],
               f"{REQ_COUNT['clutch_large']}+{REQ_COUNT['bottomrail_delfin']} "
               f"= {CENSUS[YELLOW]}"))
check("grey cells map one-to-one onto motorization",
      lambda: (REQ_COUNT["motorization"] == CENSUS[GREY],
               f"{REQ_COUNT['motorization']} = {CENSUS[GREY]}"))
check("orange cells map one-to-one onto the thin-fabric warning",
      lambda: (REQ_COUNT["thin_fabric_smiles"] == CENSUS[ORANGE],
               f"{REQ_COUNT['thin_fabric_smiles']} = {CENSUS[ORANGE]}"))
check("only known requirement keys appear",
      lambda: (set(REQ_COUNT) <= KNOWN_REQS, str(sorted(REQ_COUNT))))


def rail_shading():
    mp = {t["page"] for t in matrices}
    offenders = [(p.page_number, shaded_price_cells(p))
                 for p in pdf.pages
                 if p.page_number not in mp and shaded_price_cells(p)]
    return not offenders, ("rail-page shading is header striping only"
                           if not offenders else f"unexpected: {offenders}")


def orange_scope():
    t = [x for x in matrices
         if any(r == "thin_fabric_smiles" for row in x["requirements"] for r in row)]
    if len(t) != 1:
        return False, f"{len(t)} tables carry thin_fabric_smiles"
    t = t[0]
    flags = sum(1 for row in t["requirements"] for r in row if r)
    cells = sum(1 for row in t["prices"] for p in row if p is not None)
    return (t["page"] == 23 and 0 < flags < cells,
            f"page {t['page']}, {flags}/{cells} cells")


def bottomrail_scope():
    pages = sorted({t["page"] for t in matrices
                    if any(r == "bottomrail_delfin"
                           for row in t["requirements"] for r in row)})
    return pages == [66, 67], f"pages {pages} (the Axio drop shades)"


def flags_are_subsets():
    """No table may be entirely flagged -- that would mean decoration read as a flag."""
    bad = []
    for t in matrices:
        flags = sum(1 for row in t["requirements"] for r in row if r)
        cells = sum(1 for row in t["prices"] for p in row if p is not None)
        if cells and flags == cells:
            bad.append(t["name"])
    return not bad, "every flag set is a strict subset" if not bad else str(bad[:3])


check("rail-page shading is decorative striping, not a dropped flag", rail_shading)
check("thin-fabric flag confined to its page and is a subset", orange_scope)
check("bottomrail flag confined to the Axio drop-shade pages", bottomrail_scope)
check("no table is flagged in its entirety", flags_are_subsets)


def legend_complete():
    bad = []
    for t in matrices:
        used = {r for row in t["requirements"] for r in row if r}
        legend = t.get("requirement_legend") or {}
        for key in used:
            if key not in legend:
                bad.append((t["name"], key))
    return not bad, "every flag has a legend entry" if not bad else str(bad[:3])


def legend_sourced():
    bad = [(t["name"], k) for t in matrices
           for k, v in (t.get("requirement_legend") or {}).items()
           if v not in (t.get("notes") or [])]
    return not bad, "every legend quotes a note on its own table" if not bad else str(bad[:3])


def legend_mentions_colour():
    """The sentence behind a flag must actually name a colour."""
    words = {"clutch_large": ("amar",), "bottomrail_delfin": ("amar",),
             "motorization": ("gris",), "thin_fabric_smiles": ("naranja",)}
    bad = [(t["name"], k) for t in matrices
           for k, v in (t.get("requirement_legend") or {}).items()
           if not any(w in v.lower() for w in words.get(k, ()))]
    return not bad, "each legend names its colour" if not bad else str(bad[:3])


check("every requirement in use has a legend entry", legend_complete)
check("every legend quotes a note from its own table", legend_sourced)
check("every legend sentence names the colour it explains", legend_mentions_colour)


# -------------------------------------------------------------- fabrics ----
def fabrics_recovered():
    """Fabrics that only appear on the wrapped second line of a title."""
    names = {f for t in matrices for f in t["fabrics"]}
    want = ["Veria 98”", "Mathilde 118” (Con Varilla)", "Nature 5%",
            "Sheer Creta", "Syros BO 110”"]
    missing = [w for w in want if w not in names]
    return not missing, (f"{len(names)} distinct fabric names"
                         if not missing else f"missing {missing}")


def fabrics_split_not_widths():
    """A "/" between bare measurements is a bolt width, not another fabric."""
    bad = []
    for t in matrices:
        for f in t["fabrics"]:
            for seg in f.split("/")[1:]:
                # a trailing segment with letters would mean we failed to split
                if any(c.isalpha() for c in seg) and "varilla" not in seg.lower() \
                        and "mm" not in seg.lower():
                    bad.append((t["page"], f))
    return not bad, "no unsplit fabric list remains" if not bad else str(bad[:3])


def fabrics_unique_per_family():
    seen = Counter((t["category"], f) for t in matrices for f in t["fabrics"])
    dups = {k: v for k, v in seen.items() if v > 1}
    return not dups, f"{len(seen)} fabrics across {len(families)} families"


def fabrics_nonempty():
    bad = [t["name"] for t in matrices
           if not t.get("fabrics") or any(not f.strip() for f in t["fabrics"])]
    return not bad, f"{sum(len(t['fabrics']) for t in matrices)} total options"


def caveat_moved_to_notes():
    """The p13 rule is a note, not part of a fabric's name."""
    t = next((x for x in matrices if x["page"] == 13), None)
    in_note = any("dos rollers" in n for n in (t["notes"] or []))
    in_name = any("dos rollers" in f for f in t["fabrics"])
    return in_note and not in_name, f"note={in_note}, leaked into name={in_name}"


check("fabrics lost to wrapped titles are recovered", fabrics_recovered)
check("bolt widths are not mistaken for separate fabrics", fabrics_split_not_widths)
check("no fabric name repeats inside a family", fabrics_unique_per_family)
check("every matrix exposes at least one named fabric", fabrics_nonempty)
check("a trailing rule becomes a note, not part of a name", caveat_moved_to_notes)


# -------------------------------------------------------------- motors ----
MOTORS = next((t["items"] for t in catalog if t["type"] == "motor_options"), [])


def motors_traceable():
    """Every motor price must exist as a line item in the PDF."""
    items = {(i["name"], i["price"]) for t in items_ for i in t["items"]}
    bad = [m["label"] for m in MOTORS if (m["name"], m["price"]) not in items]
    return not bad, f"{len(MOTORS)} motors, all traced to a line item" \
        if not bad else str(bad[:3])


def motors_are_tube_motors():
    """Track motors (MOVELITE / GLYDEA / Riel Eléctrico) drive curtain tracks,
    not shades, and must not appear in a shade's motor picker."""
    bad = [m["label"] for m in MOTORS
           if re.search(r"movelite|glydea|riel", m["label"], re.I)]
    return not bad, "no track motors offered" if not bad else str(bad[:3])


def motors_disambiguated():
    """Re-Lion 35E 1L exists twice at different prices; the label must say which."""
    by_label = defaultdict(set)
    for m in MOTORS:
        by_label[m["label"]].add(m["price"])
    bad = {k: v for k, v in by_label.items() if len(v) > 1}
    return not bad, "each label maps to one price" if not bad else str(bad)


items_ = [t for t in catalog if t["type"] == "item_list"]
check("motor options exist and are priced", lambda: (
    len(MOTORS) >= 20 and all(m["price"] > 0 for m in MOTORS),
    f"{len(MOTORS)} motors, ${min(m['price'] for m in MOTORS)}"
    f"-${max(m['price'] for m in MOTORS)}"))
check("every motor price traces back to a PDF line item", motors_traceable)
check("only tube motors are offered, not curtain-track motors", motors_are_tube_motors)
check("motors sharing a name are disambiguated by direction", motors_disambiguated)


# --------------------------------------------------------------- notes ----
all_notes = [n for t in catalog for n in (t.get("notes") or [])]
check("notes carry no leaked table titles",
      lambda: (not [n for n in all_notes
                    if n.lower() in {t["name"].lower() for t in catalog}],
               f"{len(set(all_notes))} distinct notes, 0 titles"))
check("the clutch/warranty sentence is rejoined, not split",
      lambda: (all(("garantía" in n or "garantia" in n)
                   for n in all_notes if "clutch Large" in n)
               and any("clutch Large" in n for n in all_notes),
               f"{sum(1 for n in all_notes if 'clutch Large' in n)} clutch notes, all complete"))
check("no note is an empty or whitespace string",
      lambda: (all(n.strip() for n in all_notes), f"{len(all_notes)} notes"))
check("no note ends mid-word on a hyphen",
      lambda: (not [n for n in all_notes if n.rstrip().endswith("-")],
               "no dangling hyphens"))
check("the max-width caveat survived extraction",
      lambda: (any("108" in n and "102" in n for n in all_notes),
               "Wellington 108\"/102\" rule present"))
check("the thin-fabric warning survived extraction",
      lambda: (any("SONRISAS" in n for n in all_notes), "SONRISAS note present"))
check("the special-order bottomrail note survived extraction",
      lambda: (any("bottomrail" in n.lower() for n in all_notes),
               "bottomrail note present"))
check("every matrix carries the cost-variation disclaimer",
      lambda: (sum(1 for t in matrices
                   if any("LOS COSTOS PUEDEN VARIAR" in n
                          for n in (t.get("notes") or []))) >= 40,
               f"{sum(1 for t in matrices if any('LOS COSTOS PUEDEN VARIAR' in n for n in (t.get('notes') or [])))} matrices"))


# ------------------------------------------------------- awning system ----
AW = awnings[0] if awnings else None
check("the Awning System page produced exactly one block",
      lambda: (len(awnings) == 1, f"{len(awnings)} awning block(s)"))
check("awning projections match the PDF",
      lambda: ([g["projection_in"] for g in AW["groups"]] == [58, 78, 98, 118, 137],
               str([g["projection_in"] for g in AW["groups"]])))
check("awning metric projections match the inch projections",
      lambda: ([g["projection_m"] for g in AW["groups"]] == [1.5, 2, 2.5, 3, 3.5],
               str([g["projection_m"] for g in AW["groups"]])))
check("awning arm prices match the PDF",
      lambda: (all({(g["projection_in"], o["arms"]): o["price"]
                    for g in AW["groups"] for o in g["options"]}[k] == v
                   for k, v in {(58, 2): 1644.49, (58, 3): 2130.36,
                                (58, 4): 3198.20, (78, 2): 1843.70,
                                (78, 3): 2636.91, (78, 4): 3535.39,
                                (98, 2): 2009.89, (98, 3): 3166.92,
                                (118, 2): 2690.41, (118, 3): 3572.78,
                                (137, 2): 2907.32}.items()),
               "all 11 awning prices verified"))
check("awning options all carry a price",
      lambda: (all(o["price"] is not None
                   for g in AW["groups"] for o in g["options"]),
               f"{sum(len(g['options']) for g in AW['groups'])} options"))
check("awning width ranges are ordered low-high",
      lambda: (all(o["width_in"][0] < o["width_in"][1]
                   for g in AW["groups"] for o in g["options"] if o["width_in"]),
               "inch ranges ascend"))
check("awning arm counts descend in coverage as arms increase",
      lambda: (all([o["arms"] for o in g["options"]] ==
                   sorted(o["arms"] for o in g["options"])
                   for g in AW["groups"]), "arm columns in order"))
check("awning accessories captured with prices",
      lambda: ({x["name"]: x["price"] for x in AW["accessories"]} ==
               {"+Manivela 1.50m": 25.0, "+Manivela 2.2m": 35.0,
                "Re-Lion 50NM Eléctrico": 150.5},
               str({x["name"]: x["price"] for x in AW["accessories"]})))
check("awning lands in the Toldos family",
      lambda: (AW["category"] == "Toldos", AW["category"]))


# ------------------------------------------- width-priced and item lists ----
check("every width-priced row carries a label",
      lambda: (all(r["label"] for t in widthp for r in t["rows"]),
               f"{sum(len(t['rows']) for t in widthp)} rail rows"))
check("width-priced rows align with their width axis",
      lambda: (all(len(r["prices"]) == len(t["widths_in"])
                   for t in widthp for r in t["rows"]),
               "rail rows aligned"))
check("width-priced rows carry at least two prices",
      lambda: (all(sum(1 for p in r["prices"] if p is not None) >= 2
                   for t in widthp for r in t["rows"]),
               "no single-price rail rows"))
check("width-priced prices are positive",
      lambda: (all(p > 0 for t in widthp for r in t["rows"]
                   for p in r["prices"] if p is not None), "all positive"))
check("every line item has a name and a price",
      lambda: (all(i["name"] and i["price"] is not None
                   for t in items for i in t["items"]),
               f"{sum(len(t['items']) for t in items)} line items"))
check("no line item has a numeric-only name",
      lambda: (not [i["name"] for t in items for i in t["items"]
                    if sum(c.isalpha() for c in i["name"]) < 2],
               "all item names alphabetic"))
check("line item prices are positive",
      lambda: (all(i["price"] > 0 for t in items for i in t["items"]),
               "all positive"))


# ------------------------------- per-family re-read of every price row ----
def family_rows(fam):
    def run():
        ts = [t for t in matrices if t["category"] == fam]
        rows = bad = 0
        first = None
        for t in ts:
            for i in range(len(t["heights_in"])):
                if not any(p is not None for p in t["prices"][i]):
                    continue
                rows += 1
                if not row_matches_pdf(t, i):
                    bad += 1
                    first = first or (t["name"], t["heights_in"][i])
        return bad == 0, (f"{len(ts)} tables, {rows} rows re-read, {bad} mismatched"
                          + (f" first={first}" if first else ""))
    return run


for fam in families:
    check(f"every price row re-reads from the PDF — {fam}", family_rows(fam))


# --------------------------------- deterministic single-cell spot checks ----
def spot(t, i, j):
    def run():
        ok = cell_in_pdf(t, i, j)
        return ok, (f"p{t['page']} {t['name'][:34]} "
                    f"{t['heights_in'][i]}\"x{t['widths_in'][j]}\" "
                    f"= {t['prices'][i][j]}")
    return run


def pick_spots(n):
    """Spread n cells deterministically across tables, rows and columns."""
    out = []
    ts = sorted(matrices, key=lambda t: (t["page"], t["name"]))
    step = max(1, len(ts) // n)
    k = 0
    for t in ts[::step]:
        if len(out) >= n:
            break
        rows = [i for i in range(len(t["heights_in"]))
                if any(p is not None for p in t["prices"][i])]
        if not rows:
            continue
        i = rows[(k * 3) % len(rows)]
        cols = [j for j in range(len(t["widths_in"]))
                if t["prices"][i][j] is not None]
        j = cols[(k * 5) % len(cols)]
        out.append((t, i, j))
        k += 1
    return out


SPOTS = pick_spots(20)
for t, i, j in SPOTS:
    check(f"spot price p{t['page']} {t['heights_in'][i]}x{t['widths_in'][j]} "
          f"— {t['name'][:30]}", spot(t, i, j))


# ------------------------------- calculator checks, run under node ----------
js = subprocess.run(["node", str(Path(__file__).parent / "verify.js")],
                    capture_output=True, text=True)
if js.returncode != 0 and not js.stdout.strip():
    results.append((False, "calculator suite failed to run", js.stderr.strip()[:400]))
else:
    for line in js.stdout.strip().splitlines():
        ok, name, detail = json.loads(line)
        results.append((ok, name, detail))

print("=" * 78)
print("VERIFICATION —", PDF)
print("=" * 78)
for n, (ok, name, detail) in enumerate(results, 1):
    print(f"{n:3}. [{'PASS' if ok else 'FAIL'}] {name}")
    print(f"          {detail}")
failed = sum(1 for ok, _, _ in results if not ok)
print("=" * 78)
print(f"{len(results) - failed}/{len(results)} passed"
      + (f", {failed} FAILED" if failed else ""))
sys.exit(1 if failed else 0)
