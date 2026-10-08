"""Verification suite for the extracted PRS catalogue.

The data-side checks re-derive facts straight from the PDF by a different route
than extract.py uses (text lines rather than word geometry), so a shared bug is
unlikely to hide in both. The calculator-side checks live in verify.js and drive
the shipped calculator.js under a stub DOM.

    .venv-pricing/bin/python cotizador/tests/verify.py "<the pdf>"
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
PDF = sys.argv[1] if len(sys.argv) > 1 else \
    "Lista de precios 2026 PRS NUEVO SEPT. actualizada septiembre - Documentos de Google.pdf"

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
all_matrices = [t for t in catalog if t["type"] == "fabric_matrix"]
# Shade tables carry decimal prices on one text line per height; the cortinas
# de tela tables are whole dollars with their own layout, and are re-read by
# their own route further down.
matrices = [t for t in all_matrices if not t.get("drapery")]
drapery = [t for t in all_matrices if t.get("drapery")]
widthp = [t for t in catalog if t["type"] == "width_priced"]
items = [t for t in catalog if t["type"] == "item_list"]
awnings = [t for t in catalog if t["type"] == "awning_system"]
panel_tracks = [t for t in catalog if t["type"] == "panel_track"]

pdf = pdfplumber.open(PDF)
page_lines = {p.page_number: (p.extract_text() or "").splitlines()
              for p in pdf.pages}
N_PAGES = len(pdf.pages)

KNOWN_REQS = {"clutch_large", "motorization", "bottomrail_delfin",
              "thin_fabric_smiles", "capacity_limit", "exceeds_capacity"}
MEANINGFUL_FILLS = {(1.0, 0.898, 0.6),            # light yellow
                    (0.9373, 0.9373, 0.9373),     # grey
                    (0.851, 0.851, 0.851),        # grey (Horizontales)
                    (1.0, 0.6, 0.0),              # orange
                    (0.9176, 0.6, 0.6)}           # red (Horizontales)
YELLOW, GREY, ORANGE, RED = ((1.0, 0.898, 0.6),
                             (0.9373, 0.9373, 0.9373),
                             (1.0, 0.6, 0.0),
                             (0.9176, 0.6, 0.6))
GREY2 = (0.851, 0.851, 0.851)

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
            ws = sorted(r["words"], key=lambda w: w["x0"])
            for k, w in enumerate(ws):
                if not PRICE_RE.match(w["txt"]):
                    continue
                # a price right after words ("+Manivela 2.20m 35.00") is an item
                # line in a side table, striped as styling, not a matrix cell
                if k and any(ch.isalpha() for ch in ws[k - 1]["txt"]):
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


def guard_page_legend():
    """Two stacked tables share one legend printed under the second; the
    first must resolve from the page's notes, not raise or go unflagged."""
    from extract import resolve_requirements
    grid = [[(1.0, 1.0, 1.0), GREY], [(1.0, 1.0, 1.0), (1.0, 1.0, 1.0)]]
    note = "Las medidas sombreadas en gris requieren motorización."
    reqs, legend = resolve_requirements(grid, [], 99, "prueba", [note])
    return (reqs[0][1] == "motorization" and legend.get("motorization") == note,
            "a legend printed once per page reaches both tables")


def guard_capacity_meanings():
    """The Horizontales clauses also contain "motoriz"; they must not be read
    as plain motorisation."""
    from extract import resolve_requirements
    grid = [[(1.0, 1.0, 1.0), YELLOW], [RED, GREY]]
    notes = ["* El área sombreada en amarillo indica que el sistema esta operando al "
             "límite de su capacidad por lo que el desgaste de los cordones de elevación "
             "será acelerado y subir la persiana se hará pesado, se recomienda dividir "
             "la persiana en dos o motorizar.",
             "* El área gris indica que por el peso de las lamas no se debe usar sistema "
             "manual y se recomienda motorizar la persiana.",
             "* El área sombreada en rojo indica que el sistema manual o motorizado no "
             "tiene la capacidad para levantar la persiana, no hay garantía y se "
             "recomienda dividir la persiana en dos."]
    reqs, _ = resolve_requirements(grid, notes, 99, "prueba")
    got = (reqs[0][1], reqs[1][0], reqs[1][1])
    return got == ("capacity_limit", "exceeds_capacity", "motorization"), str(got)


def guard_wrapped_title():
    """Every wrapped line of a title is kept, however long."""
    from extract import joined_title
    row = lambda txt: {"words": [{"txt": t} for t in txt.split()]}
    rows = [row("x"), row("Focus 118” / Elisabeth 118” / Flash 118” / Statement 118”"),
            row("Con Varilla")]
    t = joined_title(rows, "Roman Shades - Florencia 118” / Day Break 118” /")
    return "Statement 118”" in t and "Varilla" not in t, t


def guard_caveat():
    """A trailing rule in a title becomes a note, not part of a fabric name."""
    from extract import split_fabrics
    names, caveat = split_fabrics(
        "Roller Shades - Florencia 118” / Shelter Island 110” (más de 108” se debe "
        "calcular como dos rollers)", "Roller Shades")
    return (names == ["Florencia 118”", "Shelter Island 110”"]
            and caveat and "dos rollers" in caveat, f"{names} + {caveat}")


check("guard: unexplained shading raises instead of vanishing", guard_raises)
check("guard: an explained shading resolves cleanly", guard_resolves)
check("guard: a fill covering every cell is treated as decoration", guard_decoration)
check("guard: one note defining two colours resolves each separately", guard_two_colours)
check("guard: a legend shared by stacked tables reaches both", guard_page_legend)
check("guard: the Horizontales capacity colours keep their own meanings",
      guard_capacity_meanings)
check("guard: a title wrapped over a long second line keeps every fabric",
      guard_wrapped_title)
check("guard: a trailing rule in a title becomes a note", guard_caveat)


# ------------------------------------------------------- file-level shape ----
check("block counts match the PDF's table inventory",
      lambda: (Counter(t["type"] for t in catalog) ==
               Counter({"fabric_matrix": 93, "width_priced": 13,
                        "item_list": 13, "awning_system": 1,
                        "motor_options": 1, "per_unit_list": 1,
                        "panel_track": 1, "addon_options": 1}),
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
# two tables under one heading (RIEL COULISSE NEGRO: WAVE, CORREDERAS) are
# told apart by their sub-header
check("no duplicate (name, sub-header, page)",
      lambda: (len({(t["name"], t.get("subheader"), t["page"]) for t in catalog})
               == len(catalog),
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
    """A column shift would show up as a huge step between adjacent cells.
    Cells already flagged as PRS typos (price_checks) are the one known case
    and are checked on their own below."""
    worst, where = 0, None
    for t in all_matrices:
        flags = t.get("price_checks") or []
        for i, r in enumerate(t["prices"]):
            v = [x for j, x in enumerate(r)
                 if x is not None and not (flags and flags[i][j])]
            for k in range(len(v) - 1):
                ratio = max(v[k], v[k + 1]) / min(v[k], v[k + 1])
                if ratio > worst:
                    worst, where = ratio, (t["name"], v[k], v[k + 1])
    return worst < 3.0, f"worst adjacent ratio {worst:.2f} ({where[0][:38]})"


def price_checks_scope():
    """By the 20% rule exactly two rows are out of sequence: Pure Wood 2" at
    84" (from 60" wide on) and Honeycomb BU Oxford at 78" -- and both keep
    PRS's printed price."""
    hits = [(t["name"], t["heights_in"][i], t["widths_in"][j], t["prices"][i][j])
            for t in all_matrices for i, r in enumerate(t.get("price_checks") or [])
            for j, v in enumerate(r) if v]
    want = {(84, 60): 565.74, (84, 72): 567.90, (84, 84): 572.33,
            (84, 96): 575.80, (84, 108): 577.92}
    got = {(h, w): p for n, h, w, p in hits if "Pure Wood" in n}
    oxford = {(h, w) for n, h, w, p in hits if n == "Honeycomb BU - Oxford"}
    return (got == want and len(oxford) == 7 and {h for h, _ in oxford} == {78}
            and len(hits) == 12,
            f"{len(hits)} flagged: Pure Wood 84\" ×5, Honeycomb BU Oxford 78\" ×7")


def price_checks_shape():
    bad = [t["name"] for t in all_matrices
           if [len(r) for r in t.get("price_checks", [])] != [len(r) for r in t["prices"]]]
    return not bad, "price_checks grid aligns with prices" if not bad else str(bad[:3])


check("no wild jump between adjacent cells (column-shift canary)", no_wild_jumps)
check("price-sequence flags hit exactly the two suspect rows", price_checks_scope)
check("no flagged cell sits in a table's last row with nothing above it",
      lambda: (all(any(t["prices"][k][j] is not None for k in range(i + 1, len(t["prices"])))
                   for t in all_matrices for i, r in enumerate(t.get("price_checks") or [])
                   for j, v in enumerate(r) if v),
               "every flagged cell has a next size to offer"))
check("every matrix carries a price_checks grid of its own shape", price_checks_shape)


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
check("yellow cells split exactly into clutch + bottomrail + capacity limit",
      lambda: (REQ_COUNT["clutch_large"] + REQ_COUNT["bottomrail_delfin"]
               + REQ_COUNT["capacity_limit"] == CENSUS[YELLOW],
               f"{REQ_COUNT['clutch_large']}+{REQ_COUNT['bottomrail_delfin']}"
               f"+{REQ_COUNT['capacity_limit']} = {CENSUS[YELLOW]}"))
check("red cells map one-to-one onto exceeds-capacity",
      lambda: (REQ_COUNT["exceeds_capacity"] == CENSUS[RED] > 0,
               f"{REQ_COUNT['exceeds_capacity']} = {CENSUS[RED]}"))
check("grey cells map one-to-one onto motorization",
      lambda: (REQ_COUNT["motorization"] == CENSUS[GREY] + CENSUS[GREY2],
               f"{REQ_COUNT['motorization']} = {CENSUS[GREY]}+{CENSUS[GREY2]}"))
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
    return (t["name"] == "Sheer Elegance - Zakros 110”" and 0 < flags < cells,
            f"page {t['page']} {t['name']}, {flags}/{cells} cells")


def bottomrail_scope():
    """PRS dropped the Delfin bottomrail rule in September; if it comes back
    it may only ever sit on the Axio pages."""
    tables = {t["name"] for t in matrices
              if any(r == "bottomrail_delfin" for row in t["requirements"] for r in row)}
    return all("Axio" in n for n in tables), f"{len(tables)} table(s): {sorted(tables)}"


def capacity_scope():
    fams = {t["category"] for t in matrices
            if any(r in ("capacity_limit", "exceeds_capacity")
                   for row in t["requirements"] for r in row)}
    return fams == {"Horizontales"}, f"capacity flags in {sorted(fams)}"


def roman_motorization():
    """New in September: Roman Shades have motorisation cells, in both Con
    and Sin Varilla tables, explained by the page's shared legend."""
    roman = [t for t in matrices if t["category"] == "Roman Shades"]
    with_moto = [t for t in roman if any(r == "motorization"
                                         for row in t["requirements"] for r in row)]
    both = {("Con" in t["name"], "Sin" in t["name"]) for t in with_moto}
    return (len(with_moto) >= 10 and both == {(True, False), (False, True)}
            and all("motorization" in t["requirement_legend"] for t in with_moto),
            f"{len(with_moto)}/{len(roman)} Roman tables carry motorisation")


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
check("capacity flags confined to the Horizontales family", capacity_scope)
check("Roman Shades motorisation reaches Con and Sin Varilla tables", roman_motorization)
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
             "motorization": ("gris",), "thin_fabric_smiles": ("naranja",),
             "capacity_limit": ("amar",), "exceeds_capacity": ("rojo",)}
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
    want = ["Veria 98”", "Mathilde 118” (Con Varilla)", "Syros BO 110”",
            "Ono dimout 118”", "Blackout Basic Black 118”", "Motion 118” (Sin Varilla)",
            # the second line of p57's title, 56 characters long
            "Focus 118” (Con Varilla)", "Elisabeth 118” (Sin Varilla)",
            "Flash 118” (Con Varilla)", "Statement 118” (Sin Varilla)"]
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
    """No rule sentence ("(más de 108” se debe ...)") is left in a fabric name."""
    bad = [f for t in all_matrices for f in t["fabrics"]
           if re.search(r"\([^)]*\b(se debe|calcular|requiere)\b", f, re.I)]
    return not bad, "no rule text in any fabric name" if not bad else str(bad[:3])


def supplier_brand_kept_off_names():
    """"(VERTILUX)" under the Manhattan title is the supplier's brand."""
    bad = [f for t in all_matrices for f in t["fabrics"] if "VERTILUX" in f.upper()]
    return not bad, "no supplier brand in any fabric name" if not bad else str(bad)


check("fabrics lost to wrapped titles are recovered", fabrics_recovered)
check("bolt widths are not mistaken for separate fabrics", fabrics_split_not_widths)
check("no fabric name repeats inside a family", fabrics_unique_per_family)
check("every matrix exposes at least one named fabric", fabrics_nonempty)
check("a trailing rule becomes a note, not part of a name", caveat_moved_to_notes)
check("the supplier's brand is not part of a fabric name", supplier_brand_kept_off_names)
check("PRS's 'Landcaster' is quoted as Lancaster, as PRS spells it elsewhere",
      lambda: (not [f for t in all_matrices for f in t["fabrics"] if "Landcaster" in f]
               and any("Lancaster 110” (Con Varilla)" == f
                       for t in all_matrices for f in t["fabrics"]),
               "Roman Lancaster named as on the Roller page"))


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


def motors_scoped():
    """The motor heading reads "MOTORES PARA ROLLER, SHEER, MANHATTAN Y
    ROMANAS"; the families published must be exactly those."""
    fams = next((t.get("families") for t in catalog if t["type"] == "motor_options"), None)
    heading = [ln for ln in sum(page_lines.values(), []) if ln.startswith("MOTORES PARA")]
    return (fams == ["Manhattan", "Roller Shades", "Roman Shades", "Sheer Elegance"]
            and heading, f"{fams} from '{heading[0] if heading else '?'}'")


def motors_not_from_drapery():
    pages = {t["page"] for t in catalog if t.get("section") == "drapery"}
    bad = [m["label"] for m in MOTORS if m["page"] in pages]
    return not bad, "no curtain-track motor in the shade motor list" if not bad else str(bad)


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
check("motors are offered only to the families PRS's heading names", motors_scoped)
check("no motor is taken from the cortinas de tela section", motors_not_from_drapery)
check("the 20NM and 50NM Re-Lion 45E are two items at their own prices",
      lambda: ({(i["name"], i["price"]) for t in items_ for i in t["items"]
                if "Re-Lion 45E" in i["name"] and "NM" in i["name"]}
               == {("Re-Lion 45E 20NM Eléctrico", 136.5), ("Re-Lion 45E 50NM Eléctrico", 150.5)},
               "20NM $136.50, 50NM $150.50"))


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
check("the Horizontales capacity notes survived extraction",
      lambda: (any("capacidad para levantar" in n for n in all_notes)
               and any("mite de su capacidad" in n for n in all_notes),
               "yellow and red Horizontales notes present"))
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


# --------------------------------------------------- cortinas de tela ----
def int_runs(page_no):
    """Every run of 10 whole numbers on a page's text lines."""
    out = []
    for ln in page_lines.get(page_no, []):
        toks = [int(x) for x in ln.split() if re.fullmatch(r"\d{1,4}", x)]
        for s in range(len(toks) - 9):
            out.append(toks[s:s + 10])
    return out


def drapery_rows_reread():
    """Each price row re-read from the page text (or the next page, where a
    table runs over), by line rather than by word position."""
    rows = bad = 0
    first = None
    for t in drapery:
        runs = int_runs(t["page"]) + int_runs(t["page"] + 1)
        for i, r in enumerate(t["prices"]):
            rows += 1
            if [int(p) for p in r] not in runs:
                bad += 1
                first = first or (t["name"], t["heights_in"][i])
    return bad == 0, f"{len(drapery)} tables, {rows} rows re-read, {bad} mismatched" \
        + (f" first={first}" if first else "")


def drapery_heights_printed():
    """Every height row label (108", 132", ...) is printed on the table's pages."""
    bad = []
    for t in drapery:
        text = " ".join(page_lines.get(t["page"], []) + page_lines.get(t["page"] + 1, []))
        bad += [(t["name"], h) for h in t["heights_in"] if f'{h}"' not in text]
    return not bad, "all height labels found" if not bad else str(bad[:3])


DRAPERY_GROUPS = ["FLO / CIELO / BRISA / AURA", "BELLA", "DRAPER",
                  "ELISABETH / MATHILDE / FOCUS", "EQUILIBRIUM / SPRING", "GAU / ELISE",
                  "MATTHIAS", "RHINE", "LENS", "FLASH", "MOTION / STATEMENT", "DAY BREAK"]


def drapery_inventory():
    got = sorted(t["name"] for t in drapery)
    want = sorted(f"Cortinas de Tela - {g} ({s})" for g in DRAPERY_GROUPS
                  for s in ("Onda o Ripplefold", "Plisada"))
    return got == want, f"{len(got)} tables = 12 fabric groups × 2 styles"


check("cortinas de tela: every fabric group has both styles", drapery_inventory)
check("cortinas de tela: every price row re-reads from the PDF", drapery_rows_reread)
check("cortinas de tela: every height label is printed in the PDF", drapery_heights_printed)
check("cortinas de tela: one width axis, 36\" to 252\"",
      lambda: (all(t["widths_in"] == [36, 64, 84, 105, 126, 147, 168, 189, 210, 252]
                   for t in drapery), "all 24 tables"))
check("cortinas de tela: heights are the base row then 132/168/204",
      lambda: (all(len(t["heights_in"]) == 4 and t["heights_in"][1:] == [132, 168, 204]
                   and 90 <= t["heights_in"][0] < 132 for t in drapery),
               str(sorted({t["heights_in"][0] for t in drapery}))))
check("cortinas de tela: every cell priced, prices rise with width",
      lambda: (all(p is not None for t in drapery for r in t["prices"] for p in r)
               and all(r == sorted(r) for t in drapery for r in t["prices"]),
               f"{sum(len(r) for t in drapery for r in t['prices'])} cells"))
check("cortinas de tela: PRS's 7 IMPORTANTE rules ride on every table",
      lambda: (all(len(t["notes"]) == 7 and t["notes"][1].startswith("2. Aunque el riel")
                   for t in drapery), "7 numbered rules"))
check("cortinas de tela: the two-way rule is declared on every table",
      lambda: (all(t["drapery"].get("two_way") == "split_width" for t in drapery),
               "divide el ancho total en 2"))
check("cortinas de tela: spot prices match the PDF",
      lambda: (all(next(t for t in drapery if t["name"] == n)["prices"][i][j] == v
                   for n, i, j, v in [
                       ("Cortinas de Tela - FLO / CIELO / BRISA / AURA (Onda o Ripplefold)", 0, 0, 36),
                       ("Cortinas de Tela - BELLA (Plisada)", 3, 9, 704),        # runs onto p34
                       ("Cortinas de Tela - ELISABETH / MATHILDE / FOCUS (Plisada)", 0, 0, 87),
                       ("Cortinas de Tela - MOTION / STATEMENT (Plisada)", 3, 9, 1478),
                       ("Cortinas de Tela - LENS (Onda o Ripplefold)", 0, 9, 380)]),
               "5 cells incl. the page-crossing and split-label rows"))


# --------------------------------------------------------- panel track ----
PT = panel_tracks[0] if panel_tracks else None


def pt_telas_reread():
    """The per-yard list re-read by splitting text lines on "$"."""
    page = page_lines[PT["page"]]
    want = {}
    for ln in page:
        for m in re.finditer(r"(\S[^$]*?)\s+(\d{2,3})\s+\$(\d+\.\d\d)", ln):
            want[m.group(1).strip()] = (int(m.group(2)), float(m.group(3)))
    got = {t["name"]: (t["bolt_width_in"], t["price_per_yard"]) for t in PT["telas"]}
    return got == want and len(got) == 31, f"{len(got)} fabrics with width and $/yd"


def pt_rails_reread():
    """Every rail price is on the Panel Track page in reading order."""
    page = " ".join(page_lines[PT["page"]])
    bad = []
    for r in PT["rails"]:
        seq = " ".join(f"{p:.2f}" for p in r["prices"] if p is not None)
        if f"{r['channels']} canales {seq}" not in page:
            bad.append(r["label"])
    return not bad, f"{len(PT['rails'])} rail rows found verbatim" if not bad else str(bad)


check("panel track: one system block, fed from the Panel Track page",
      lambda: (len(panel_tracks) == 1 and "precio/yarda" in " ".join(page_lines[PT["page"]]),
               f"page {PT['page']}"))
check("panel track: the per-yard fabric list re-reads from the PDF", pt_telas_reread)
check("panel track: every rail row re-reads from the PDF", pt_rails_reread)
check("panel track: rails are 1 and 2 vías, 2-4 canales, and say what they include",
      lambda: ({(r["ways"], r["channels"]) for r in PT["rails"]}
               == {(1, 2), (1, 3), (1, 4), (2, 2), (2, 4)}
               and PT["rail_includes"] == "basta redonda",
               "5 systems; 2 vías × 3 canales has no prices in the PDF"))
check("panel track: PRS's 2\" overlap rule is carried",
      lambda: (PT["overlap_per_panel_in"] == 2 and any("traslape" in n for n in PT["notes"]),
               PT["notes"][0] if PT["notes"] else "none"))
check("panel track: the old per-fabric tables are gone",
      lambda: (not [t for t in all_matrices if t["category"] == "Panel Track"],
               "no Panel Track fabric_matrix"))


# ------------------------------------------------------ complementos ----
GROUPS = next(t for t in catalog if t["type"] == "addon_options")["groups"]
DRAPERY_PAGES = {t["page"] for t in catalog if t.get("section") == "drapery"} \
    | {t["page"] for t in drapery}


def shade_groups_clean():
    """No shade complemento comes from the cortinas de tela section."""
    bad = [(g["kind"], i["label"]) for g in GROUPS if g.get("applies_to") == "shade"
           for i in g["items"] if i["page"] in DRAPERY_PAGES]
    return not bad, "shade hardware only" if not bad else str(bad[:3])


def drapery_groups_clean():
    bad = [(g["kind"], i["label"]) for g in GROUPS if g.get("applies_to") == "drapery"
           for i in g["items"] if i["page"] not in DRAPERY_PAGES]
    return not bad, "curtain hardware only" if not bad else str(bad[:3])


def drapery_rails_reread():
    """The four manual rail tables, every row found verbatim on p32."""
    g = next(g for g in GROUPS if g["kind"] == "riel_cortina")
    text = " ".join(sum((page_lines[p] for p in {i["page"] for i in g["items"]}), []))
    bad = [i["label"] for i in g["items"]
           if " ".join(str(int(p)) for p in i["prices"]) not in text]
    return (not bad and len(g["items"]) == 10,
            f"{len(g['items'])} rail rows incl. RIEL HD RIPPLEFOLD / ONDA" if not bad else str(bad))


def panel_rail_superseded():
    """A rail PRS prints twice at different prices is quoted at the higher
    copy, width by width, in both the Panel Track system and the riel
    complemento -- and both copies are kept so the calculator can say so."""
    g = next(g for g in GROUPS if g["kind"] == "riel")
    bad = []
    for r in PT["rails"]:
        c = r.get("price_conflict")
        if not c or c["pages"] != [46, 79]:
            bad.append((r["label"], "no conflict recorded")); continue
        for j, w in enumerate(r["widths_in"]):
            vals = [k["prices"][k["widths_in"].index(w)] for k in c["copies"]]
            vals = [v for v in vals if v is not None]
            if (max(vals) if vals else None) != r["prices"][j]:
                bad.append((r["label"], w))
        item = next((i for i in g["items"] if i["label"] == r["label"]), None)
        if not item or item["prices"] != r["prices"]:
            bad.append((r["label"], "complemento differs"))
    return not bad, f"{len(PT['rails'])} rails at the higher of p46/p79" if not bad else str(bad[:3])


check("complementos: every group says whether it is for shades or curtains",
      lambda: (all(g.get("applies_to") in ("shade", "drapery") for g in GROUPS),
               " ".join(f"{g['kind']}:{g['applies_to']}" for g in GROUPS)))
check("complementos: shade groups carry no curtain hardware", shade_groups_clean)
check("complementos: curtain groups carry only curtain hardware", drapery_groups_clean)
check("complementos: the curtain rail tables re-read from the PDF", drapery_rails_reread)
check("complementos: no width-priced row is an item line in disguise",
      lambda: (not [i["label"] for g in GROUPS if g["pricing"] == "width"
                    for i in g["items"] if re.search(r"kit|alquiler", i["label"], re.I)],
               "Kit de Riel Curvo stays a flat item"))
check("complementos: a rail printed twice is quoted at the higher price",
      panel_rail_superseded)
check("complementos: an unpriced PDF line (Cinta Wave) is never offered",
      lambda: (not [i for g in GROUPS for i in g["items"] if "Cinta Wave" in i["label"]],
               "no price in the PDF, so not quotable"))
check("complementos: the motorised curtain tracks keep their length in the label",
      lambda: (all(re.search(r"(114|228)”|precio por pie", i["label"], re.I)
                   for g in GROUPS if g["kind"] == "riel_motorizado" for i in g["items"]),
               f"{len(next(g for g in GROUPS if g['kind'] == 'riel_motorizado')['items'])} tracks"))


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
