#!/usr/bin/env python3
"""
Edecoration / PRS price-list extractor.

Reads the Google-Docs PDF price list and emits structured JSON that an
internal HTML/JS quoting tool can consume.

Two kinds of tables are recognised:

1. fabric_matrix  -> 2D price grid keyed by [height_in][width_in].
                     Cell shading is recovered from the PDF (it is NOT in the
                     text layer): yellow = needs "clutch_large",
                     gray = needs "motorization".  This is stored in a parallel
                     `requirements` matrix so the calculator can warn / add the
                     right hardware automatically.

2. item_list      -> flat list of {name, description, price, sku, unit} rows,
                     used for motors, remotes, rails and accessories.

Anything the script cannot confidently classify is written to
`data/_unparsed.json` as raw text rows so nothing is silently lost.

Usage:
    python extract.py "Lista de precios 2026 PRS - Documentos de Google.pdf"
Output:
    pricing-data/data/*.json
"""

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pdfplumber

ZWSP = "​"  # the PDF wraps every run in a zero-width space

# ---------------------------------------------------------------------------
# Cell shading
#
# A shaded cell means something, but *what* it means is stated in prose on the
# page, not in the colour itself -- the same light yellow marks "requiere clutch
# Large" on the Roller pages and "requiere un bottomrail (Delfin)" on the Axio
# pages. So we never hardcode colour -> meaning. Instead:
#
#   1. read the raw fill behind every price cell,
#   2. treat a colour as a *flag* only if it covers a strict subset of the
#      table's cells (a fill covering every cell is decoration, not a flag),
#   3. resolve its meaning from the table's own note text, via the Spanish
#      colour word that note uses,
#   4. raise if a flag colour has no note explaining it -- silence here is what
#      previously let an unrecognised orange disappear from the quote.
#
# COLOR_WORDS maps a fill to the word a note would use to refer to it.
# ---------------------------------------------------------------------------
COLOR_WORDS = {
    (1.0, 0.898, 0.6): "amar",       # light yellow  ("amarillo", sic "amarllo")
    (1.0, 1.0, 0.0): "amar",         # saturated yellow
    (0.9373, 0.9373, 0.9373): "gris",
    (1.0, 0.6, 0.0): "naranja",
    (0.851, 0.851, 0.851): "gris",
}

# Meaning keywords, searched in the note that mentions the colour. Order
# matters: "bottomrail" must beat "clutch" on a note that happens to say both.
MEANING_KEYWORDS = [
    ("bottomrail", "bottomrail_delfin"),
    ("delfin", "bottomrail_delfin"),
    ("clutch", "clutch_large"),
    ("motoriz", "motorization"),
    ("sonrisa", "thin_fabric_smiles"),
    ("delgada", "thin_fabric_smiles"),
]

# Cells whose fill is one of these carry no requirement.
NEUTRAL_COLORS = {None, (1.0, 1.0, 1.0)}


CLAUSE_SPLIT = re.compile(r"[.,;]")


def meaning_of(note_text):
    """Map a note sentence to a stable requirement key."""
    low = note_text.lower()
    for kw, key in MEANING_KEYWORDS:
        if kw in low:
            return key
    return None


def meaning_for_color(note, word):
    """Meaning of the *clause* of `note` that talks about colour `word`.

    One sentence routinely covers two colours -- "las medidas sombreadas en
    amarillo requieren clutch Large, y las medidas sombreadas en gris requieren
    motorizacion" -- so reading the whole note would give both colours the same
    (first-matched) meaning. Resolve per clause instead.
    """
    for clause in CLAUSE_SPLIT.split(note):
        if word in clause.lower():
            key = meaning_of(clause)
            if key:
                return key
    # only safe to read the note as a whole when it discusses a single colour
    if len({w for w in set(COLOR_WORDS.values()) if w in note.lower()}) == 1:
        return meaning_of(note)
    return None


def resolve_requirements(colors, notes, page_no, table_name):
    """Work out what each shading colour means for one table.

    `colors` is the 2D grid of raw fills behind the price cells. Returns
    (requirement_grid, legend) where legend maps requirement key -> the note
    sentence, in PRS's own words, that defines it.
    """
    flat = [c for row in colors for c in row]
    cells = [c for c in flat if c is not None]
    present = {c for c in flat if c not in NEUTRAL_COLORS}

    # a fill covering every single cell is the table's styling, not a flag
    flags = {c for c in present if sum(1 for x in cells if x == c) < len(cells)}

    legend, unexplained = {}, []
    mapping = {}
    for color in flags:
        word = COLOR_WORDS.get(color)
        # a fabric name can contain the colour word by accident, so take the
        # first note that mentions it *and* resolves to a meaning
        candidates = [n for n in notes if word and word in n.lower()]
        resolved = next(((n, meaning_for_color(n, word)) for n in candidates
                         if meaning_for_color(n, word)), None)
        if resolved is None:
            unexplained.append((color, word))
            continue
        note, key = resolved
        mapping[color] = key
        legend[key] = note

    if unexplained:
        raise ValueError(
            f"page {page_no} '{table_name}': shaded cells with no note "
            f"explaining them: {unexplained}. Add the colour to COLOR_WORDS "
            f"and/or MEANING_KEYWORDS, or check the note capture."
        )

    grid = [[mapping.get(c) for c in row] for row in colors]
    return grid, legend


def clean(s: str) -> str:
    return s.replace(ZWSP, "").strip()


def is_int(tok: str) -> bool:
    return bool(re.fullmatch(r"\d{1,3}", tok))


PRICE_RE = re.compile(r"^\d{1,4}\.\d{2}$")          # 34.72 , 100.14
METER_RE = re.compile(r"^\d\.\d{2}$|^\d,\d{2}$")     # 1,07 or 0.91


def to_price(tok: str):
    tok = tok.replace(",", ".")
    try:
        return round(float(tok), 2)
    except ValueError:
        return None


def cluster_rows(words, tol=4):
    """Group words into visual rows by their 'top' coordinate."""
    rows = []
    for w in sorted(words, key=lambda w: w["top"]):
        placed = False
        for r in rows:
            if abs(r["top"] - w["top"]) <= tol:
                r["words"].append(w)
                r["top"] = (r["top"] * r["n"] + w["top"]) / (r["n"] + 1)
                r["n"] += 1
                placed = True
                break
        if not placed:
            rows.append({"top": w["top"], "n": 1, "words": [w]})
    for r in rows:
        r["words"].sort(key=lambda w: w["x0"])
    rows.sort(key=lambda r: r["top"])
    return rows


def build_rect_lookup(page):
    rects = [r for r in page.rects]

    def color_at(cx, cy):
        best = None
        for r in rects:
            if (r["x0"] - 0.5 <= cx <= r["x1"] + 0.5
                    and r["top"] - 0.5 <= cy <= r["bottom"] + 0.5):
                area = (r["x1"] - r["x0"]) * (r["bottom"] - r["top"])
                if best is None or area < best[0]:
                    best = (area, r.get("non_stroking_color"))
        return best[1] if best else None

    return color_at


def row_alpha(r):
    line = clean(" ".join(w["txt"] for w in r["words"]))
    return line if any(c.isalpha() for c in line) else ""


def join_wrapped(notes):
    """Re-join note sentences the PDF wrapped across two lines.

    A continuation line starts lowercase and follows a line that did not end on
    sentence-final punctuation -- e.g. "...requieren motorizacion. Si no se" +
    "siguen estas recomendaciones, no se otorgara garantia..."
    """
    out = []
    for n in notes:
        if out and n[:1].islower() and not out[-1].rstrip().endswith((".", ")", ":", "!")):
            out[-1] = out[-1].rstrip() + " " + n
        else:
            out.append(n)
    return out


NUMCELL_RE = re.compile(r"^\d{1,4}([.,]\d{1,2})?$")  # int or price cell


def header_ints(row):
    """Return the sorted integer tokens if `row` is a width-header, else None.

    A width header has >= 5 pure integers that strictly ascend (both in
    reading order and in value) and sit in a plausible inch range.
    """
    ints = sorted((w for w in row["words"] if is_int(w["txt"])),
                  key=lambda w: w["x0"])
    if len(ints) < 5:
        return None
    vals = [int(w["txt"]) for w in ints]
    if any(vals[k] >= vals[k + 1] for k in range(len(vals) - 1)):
        return None
    if min(vals) < 10 or max(vals) > 240:
        return None
    # a real width header steps in a regular increment (e.g. 36,42,48,...);
    # rail price rows ascend too but with irregular gaps - reject those.
    diffs = [vals[k + 1] - vals[k] for k in range(len(vals) - 1)]
    modal = Counter(diffs).most_common(1)[0][0]
    if sum(d == modal for d in diffs) < len(diffs) * 0.6:
        return None
    return ints


def col_geometry(ints):
    centers = [(w["x0"] + w["x1"]) / 2 for w in ints]
    spacing = (centers[-1] - centers[0]) / (len(centers) - 1)
    return centers, spacing, centers[0] - spacing * 0.55


def assign_cells(cells, centers, spacing):
    """Place price/number tokens into their nearest column slot."""
    slot = [None] * len(centers)
    for w in cells:
        cx = (w["x0"] + w["x1"]) / 2
        ci = min(range(len(centers)), key=lambda k: abs(centers[k] - cx))
        if abs(centers[ci] - cx) <= spacing * 0.6:
            slot[ci] = w
    return slot


def variant_above(rows, hi, stop):
    """Look for a 'Con/Sin Varilla' style sub-label above a header."""
    for j in range(hi - 1, stop, -1):
        a = row_alpha(rows[j])
        if a and "varilla" in a.lower():
            return a
    return None


def title_above_idx(rows, hi, stop):
    """(line, row index) of the nearest real title above a header.

    Skips metros/pulgadas axis labels and data rows (which carry several
    numbers) so we land on an actual section / table heading.
    """
    for j in range(hi - 1, stop, -1):
        a = row_alpha(rows[j])
        if not a:
            continue
        if a.lower().startswith(("metros", "pulgadas")):
            continue
        if sum(1 for w in rows[j]["words"] if NUMCELL_RE.match(w["txt"])) >= 3:
            continue  # this is a data row, not a heading
        return a, j
    return None, None


def title_above(rows, hi, stop):
    return title_above_idx(rows, hi, stop)[0]


VARIANT_RE = re.compile(r"\((con|sin)\s+varilla\)", re.I)
BARE_VARIANT_RE = re.compile(r"^\s*(con|sin)\s+varilla\s*$", re.I)
MEASURE_END_RE = re.compile(r"\d+\s*[”\"']?\s*$")


def wrap_separator(first_line, continuation):
    """How a wrapped title's second line attaches to the first.

    PRS drops the "/" when a fabric list wraps, so "… / Draper 118”" +
    "Mathilde 118”" is two fabrics while "… / Syros" + "BO 110”" is one. The
    tell is whether the last fabric on line one already carries its bolt width:
    if it does, its name is complete and the next line starts a new fabric.
    """
    if continuation.startswith("(") or continuation[:1].islower():
        return " "                       # a qualifier or a wrapped sentence
    last = first_line.split("/")[-1].strip()
    return " / " if MEASURE_END_RE.search(last) else " "


def joined_title(rows, page_title):
    """Page titles wrap, and row 1 is often the tail of row 0.

    "Panel Track - Sheer Zakynthos / Sheer Inspiration / Sheer" + "Creta", or
    "... / Shelter" + "Island / Nature 5%" -- keeping only the first line drops
    whole fabrics. A continuation is a fragment: it carries letters but is not
    itself a heading (headings contain the " - " family separator) and is not
    the Con/Sin Varilla label, which is picked up separately.
    """
    if len(rows) < 2:
        return page_title
    a = row_alpha(rows[1])
    if not a or " - " in a or len(a) > 40:
        return page_title
    if a.lower().startswith(("metros", "pulgadas")):
        return page_title
    if BARE_VARIANT_RE.match(a):
        return page_title
    if sum(1 for w in rows[1]["words"] if NUMCELL_RE.match(w["txt"])) >= 3:
        return page_title            # that is the metric axis row, not a title
    return clean(page_title + wrap_separator(page_title, a) + a)


def split_fabrics(name, category=""):
    """The individual fabrics a table prices, and any trailing rule.

    PRS puts several fabrics on one matrix when they share a price, separating
    them with "/". The same "/" also separates the bolt widths of a *single*
    fabric ("Wellington 78” / 118”"), so a segment carrying no letters
    continues the fabric before it instead of starting a new one.

    Returns (fabric names, caveat) where caveat is a trailing parenthetical
    sentence -- "(más de 108” se debe calcular como dos rollers)" -- which is a
    rule about the product, not part of anybody's name.
    """
    # The prefix is dropped only when it is just the family name. "Honeycomb
    # BU" and "Honeycomb TDBU" both sit in the Honeycomb family but are
    # different systems, and dropping the whole prefix would leave two
    # different products called "Rioja Blackout".
    prefix, sep, rest = name.partition(" - ")
    lead, base = "", name
    if sep:
        base = rest
        keep = prefix.strip()
        if keep == category:
            keep = ""
        elif category and keep.startswith(category):
            keep = keep[len(category):].strip(" -")
        lead = f"{keep} - " if keep else ""

    variant = ""                            # applies to every fabric listed
    m = VARIANT_RE.search(base)
    if m:
        variant = " " + m.group(0)
        base = VARIANT_RE.sub("", base).strip()

    caveat = None
    pm = re.search(r"\(([^()]{12,})\)\s*$", base)
    if pm and len(pm.group(1).split()) > 2:
        caveat = pm.group(0)
        base = base[:pm.start()].strip()

    out = []
    for seg in base.split("/"):
        seg = seg.strip()
        if not seg:
            continue
        if not any(c.isalpha() for c in seg) and out:
            out[-1] += " / " + seg          # another bolt width, same fabric
        else:
            out.append(seg)
    return [lead + s + variant for s in out] or [name], caveat


def second_table_title(rows, hi):
    """Heading of a *second* table stacked under the page's first one.

    Only needed when the first table on the page has no width header of its own
    (p67's single-column Clear Vinyl), which would otherwise hand its page title
    to the table below it. A long page title that merely wraps onto a second
    line is not a heading, so require real data rows to sit between the page
    title and the candidate -- a wrapped title has none.
    """
    cand, j = title_above_idx(rows, hi, -1)
    if cand is None or j is None or j <= 0:
        return None
    has_data = any(sum(1 for w in rows[k]["words"]
                       if PRICE_RE.match(w["txt"])) >= 2
                   for k in range(1, j))
    return cand if has_data else None


def is_brazos_row(r):
    """A '2 BRAZOS  3 BRAZOS  4 BRAZOS' column header."""
    toks = [w["txt"] for w in r["words"]]
    return bool(toks) and all(t == "BRAZOS" or is_int(t) for t in toks) \
        and toks.count("BRAZOS") >= 1


def brazos_columns(r):
    """[(arm_count, x_centre), ...] for a BRAZOS header row."""
    ws = sorted(r["words"], key=lambda w: w["x0"])
    cols = []
    for k, w in enumerate(ws):
        if w["txt"] == "BRAZOS" and k and is_int(ws[k - 1]["txt"]):
            cols.append((int(ws[k - 1]["txt"]),
                         (ws[k - 1]["x0"] + w["x1"]) / 2))
    return cols


def ranges_in(r, drop_labels):
    """Pull 'a - b' pairs out of a row, with each pair's x centre."""
    ws = [w for w in sorted(r["words"], key=lambda w: w["x0"])
          if w["txt"].lower() not in drop_labels]
    out = []
    for k in range(len(ws) - 2):
        if ws[k + 1]["txt"] == "-":
            a, b = ws[k]["txt"].replace(",", "."), ws[k + 2]["txt"].replace(",", ".")
            try:
                lo, hi_ = float(a), float(b)
            except ValueError:
                continue
            out.append((lo, hi_, (ws[k]["x0"] + ws[k + 2]["x1"]) / 2))
    return out


def nearest(cols, x):
    """Index of the arm column whose centre is closest to x."""
    return min(range(len(cols)), key=lambda i: abs(cols[i][1] - x))


def parse_awning(page, rows):
    """The Awning System page.

    Unlike every other table this one is a stack of small blocks: a BRAZOS
    column header, the width range each arm count covers (in metres, then in
    inches), and a single price row per projection. header_ints() cannot see it
    -- there is no ascending width header -- so it gets its own parser.
    """
    groups, accessories, notes = [], [], []
    i = 0
    while i < len(rows):
        r = rows[i]
        if not is_brazos_row(r):
            i += 1
            continue
        cols = brazos_columns(r)
        if not cols or i + 3 >= len(rows):
            i += 1
            continue

        m_ranges = ranges_in(rows[i + 1], {"metros", "ancho"})
        in_ranges = ranges_in(rows[i + 2], {"proyeccion", "pulgadas"})
        data = sorted(rows[i + 3]["words"], key=lambda w: w["x0"])
        prices = [w for w in data if PRICE_RE.match(w["txt"])]
        labels = [w for w in data if w not in prices]
        if not prices or len(labels) < 2:
            i += 1
            continue

        proj_m = to_price(labels[0]["txt"].replace(",", "."))
        proj_in = int(re.sub(r"[^\d]", "", labels[1]["txt"]) or 0)

        options = [{"arms": a, "width_m": None, "width_in": None, "price": None}
                   for a, _ in cols]
        for lo, hi_, x in m_ranges:
            options[nearest(cols, x)]["width_m"] = [lo, hi_]
        for lo, hi_, x in in_ranges:
            options[nearest(cols, x)]["width_in"] = [int(lo), int(hi_)]
        for w in prices:
            options[nearest(cols, (w["x0"] + w["x1"]) / 2)]["price"] = to_price(w["txt"])

        groups.append({
            "projection_m": proj_m,
            "projection_in": proj_in,
            "options": [o for o in options if o["price"] is not None],
        })
        i += 4

    # trailing accessory lines and the disclaimer
    for r in rows:
        toks = sorted(r["words"], key=lambda w: w["x0"])
        line = clean(" ".join(w["txt"] for w in toks))
        money = [w for w in toks if PRICE_RE.match(w["txt"])]
        if len(money) == 1 and money[-1] is toks[-1] and len(toks) > 1:
            name = clean(" ".join(w["txt"] for w in toks[:-1]))
            if sum(c.isalpha() for c in name) >= 3:
                accessories.append({"name": name, "price": to_price(money[0]["txt"])})
        elif line and sum(c.isalpha() for c in line) > 15 and not is_brazos_row(r):
            if "metros" not in line.lower() and "proyeccion" not in line.lower():
                notes.append(line)

    if not groups:
        return []
    return [{
        "type": "awning_system",
        "name": "Awning System",
        "page": page.page_number,
        "currency": "USD",
        "axis": {"rows": "projection", "cols": "arms"},
        "groups": groups,
        "accessories": accessories,
        "notes": join_wrapped([n for n in notes if n != "Awning System"]),
    }]


# "Side Channel (Par / 2 Piezas)   7.25 / Pie de Alto" -- these are sold by the
# linear foot of the paño's height or width, not from a size table, so they need
# their own shape: price x feet rather than a lookup.
PER_UNIT_RE = re.compile(
    r"^(?P<label>.+?)\s+(?P<price>\d{1,3}\.\d{2})\s*/\s*(?P<unit>.+)$")


def unit_basis(unit_text):
    """Which dimension a per-unit price multiplies, if any."""
    u = unit_text.lower()
    # "pieza" contains "pie", so the per-piece forms have to be ruled out first
    if "pieza" in u or "par" in u or "unidad" in u:
        return "each"
    if "alto" in u:
        return "height_ft"
    if "ancho" in u:
        return "width_ft"
    if "pie" in u:
        return "width_ft"          # a bare "/ Pie" runs along the paño
    return "each"


def parse_per_unit_section(rows, start, page_no, title):
    """Rows under a heading that price by the foot or by the piece."""
    items = []
    for j in range(start, len(rows)):
        line = clean(" ".join(w["txt"] for w in rows[j]["words"]))
        m = PER_UNIT_RE.match(line)
        if not m:
            continue
        items.append({
            "name": clean(m.group("label")),
            "price": to_price(m.group("price")),
            "unit": clean(m.group("unit")),
            "basis": unit_basis(m.group("unit")),
        })
    if not items:
        return []
    return [{
        "type": "per_unit_list",
        "name": title,
        "page": page_no,
        "currency": "USD",
        "items": items,
    }]


def process_page(page, page_title):
    """Return a list of structured blocks found on the page."""
    words = [w for w in page.extract_words() if clean(w["text"])]
    for w in words:
        w["txt"] = clean(w["text"])
    rows = cluster_rows(words)
    color_at = build_rect_lookup(page)

    if any(is_brazos_row(r) for r in rows):
        return parse_awning(page, rows)

    headers = [i for i, r in enumerate(rows) if header_ints(r)]
    consumed = set()
    blocks = []

    # A per-foot section sits under its own heading, after the size tables. Its
    # rows are claimed here so the accessory pass does not read them as flat
    # line items -- their price means "per foot", not "each".
    for i, r in enumerate(rows):
        if clean(" ".join(w["txt"] for w in r["words"])).lower().startswith("perfiles"):
            heading = clean(" ".join(w["txt"] for w in r["words"]))
            blocks += parse_per_unit_section(rows, i + 1, page.page_number, heading)
            consumed.update(range(i, len(rows)))
            break

    def labels_of(j, left_limit):
        return [w for w in rows[j]["words"]
                if (w["x0"] + w["x1"]) / 2 < left_limit]

    for hk, hi in enumerate(headers):
        ints = header_ints(rows[hi])
        centers, spacing, left_limit = col_geometry(ints)
        widths_in = [int(w["txt"]) for w in ints]

        # a block runs from its header to the next header (header rows are the
        # only reliable segment boundaries; titles/notes contain stray digits)
        end = headers[hk + 1] if hk + 1 < len(headers) else len(rows)

        def col_cells(j):
            return [w for w in rows[j]["words"]
                    if (w["x0"] + w["x1"]) / 2 >= left_limit
                    and NUMCELL_RE.match(w["txt"])]

        # A short heading carrying no digits at all starts a new section, and
        # its rows are not this table's ("Perfiles de Enmarcados" sits directly
        # under Cassette 130 and was being read as a row of it). Only the price
        # rows are cut here -- notes are still collected out to `end`.
        sec_end = end
        for j in range(hi + 1, end):
            line = clean(" ".join(w["txt"] for w in rows[j]["words"]))
            if (line and len(line) <= 45 and any(c.isalpha() for c in line)
                    and not any(c.isdigit() for c in line)):
                sec_end = j
                break

        data = [j for j in range(hi + 1, sec_end) if col_cells(j)]
        if not data:
            continue

        def has_alpha(j):
            return any(c.isalpha() for w in labels_of(j, left_limit)
                       for c in w["txt"])

        # A fabric matrix labels each row with its height. With no integer row
        # labels anywhere there are no heights, so it cannot be a matrix -- it
        # is a width-priced table whose single price row carries no label
        # (Cassette 130, Sistema Guiado Coulisse, Riel de Romana Coulisse).
        has_heights = any(any(is_int(w["txt"]) for w in labels_of(j, left_limit))
                          for j in data)
        alpha_rows = sum(has_alpha(j) for j in data)
        is_width = alpha_rows > len(data) / 2 or not has_heights

        if is_width:
            sub = clean(" ".join(w["txt"] for w in rows[hi]["words"]
                                 if not is_int(w["txt"])
                                 and (w["x0"] + w["x1"]) / 2 < left_limit))
            title = title_above(rows, hi, headers[hk - 1] if hk else -1) or page_title
            table_rows = []
            used = [hi]
            for j in data:
                label = clean(" ".join(w["txt"] for w in labels_of(j, left_limit)))
                # a table whose single price row has no label of its own is
                # named by the table itself (Cassette 130)
                if not label:
                    label = title
                cells = col_cells(j)
                # genuine rail/channel rows span several columns; a lone price
                # is an accessory line and belongs in the item list instead
                if label.lower() in ("metros", "pulgadas") or len(cells) < 2:
                    continue
                slots = assign_cells(cells, centers, spacing)
                # a prose line can carry stray numbers that survive the cell
                # filter ("Nota: En los cassettes 100 Y 120 ..."), but they will
                # not land in two separate columns the way real prices do
                if sum(1 for s in slots if s) < 2:
                    continue
                table_rows.append({
                    "label": label,
                    "prices": [to_price(s["txt"]) if s else None for s in slots],
                })
                used.append(j)
            if not table_rows:
                continue
            if hi > 0 and any(METER_RE.match(w["txt"]) for w in rows[hi - 1]["words"]):
                used.append(hi - 1)
            consumed.update(used)
            blocks.append({
                "type": "width_priced",
                "name": title,
                "subheader": sub,
                "page": page.page_number,
                "currency": "USD",
                "axis": {"cols": "width_in"},
                "widths_in": widths_in,
                "rows": table_rows,
            })
            continue

        # ---- fabric matrix ----
        heights, prices, colors, notes = [], [], [], []
        for j in data:
            lab_ints = [int(w["txt"]) for w in labels_of(j, left_limit)
                        if is_int(w["txt"])]
            if not lab_ints:
                continue
            cells = [w for w in rows[j]["words"]
                     if (w["x0"] + w["x1"]) / 2 >= left_limit
                     and PRICE_RE.match(w["txt"])]
            slots = assign_cells(cells, centers, spacing)
            row_prices, row_colors = [], []
            for s in slots:
                if s is None:
                    row_prices.append(None)
                    row_colors.append(None)
                else:
                    cx = (s["x0"] + s["x1"]) / 2
                    cy = (s["top"] + s["bottom"]) / 2
                    row_prices.append(to_price(s["txt"]))
                    c = color_at(cx, cy)
                    row_colors.append(tuple(c) if c is not None else None)
            heights.append(lab_ints[-1])
            prices.append(row_prices)
            colors.append(row_colors)

        ascending = all(heights[k] < heights[k + 1] for k in range(len(heights) - 1))
        if len(heights) < 3 or not ascending or (heights and min(heights) < 30):
            continue  # not a real fabric grid; leave rows for the item pass

        # human-readable notes that sit inside the block span
        for j in range(hi + 1, end):
            if j in (data):
                continue
            line = clean(" ".join(w["txt"] for w in rows[j]["words"]))
            if line and sum(c.isalpha() for c in line) > 15:
                notes.append(line)
        notes = join_wrapped(notes)
        for j in range(hi, end):
            consumed.add(j)

        widths_m = None
        if hi > 0:
            above = rows[hi - 1]["words"]
            meters = [to_price(w["txt"]) for w in above if METER_RE.match(w["txt"])]
            if len(meters) >= len(widths_in) - 1:
                widths_m = meters[:len(widths_in)]

        # naming: Con/Sin Varilla variants share the page fabric name;
        # otherwise a stacked second table takes the nearest title line
        full_title = joined_title(rows, page_title)
        v = variant_above(rows, hi, headers[hk - 1] if hk else -1)
        if v:
            v = v.strip().title()
            title = f"{full_title} ({v})"
        elif hk > 0:
            title = title_above(rows, hi, headers[hk - 1]) or full_title
        else:
            title = second_table_title(rows, hi) or full_title

        reqs, legend = resolve_requirements(colors, notes, page.page_number, title)

        blocks.append({
            "type": "fabric_matrix",
            "name": title,
            "page": page.page_number,
            "currency": "USD",
            "axis": {"rows": "height_in", "cols": "width_in"},
            "widths_in": widths_in,
            "widths_m": widths_m,
            "heights_in": heights,
            "prices": prices,
            "requirements": reqs,
            "requirement_legend": legend,
            "notes": notes,
        })

    # ---- leftover rows -> item list (motors / remotes / accessories) ----
    items, sections = [], []
    for i, r in enumerate(rows):
        if i in consumed or header_ints(r):
            continue
        toks = r["words"]
        line = clean(" ".join(w["txt"] for w in toks))
        if not line:
            continue
        money = [w for w in toks if re.fullmatch(r"\d{1,4}\.\d{2}", w["txt"])
                 and w["x0"] > page.width * 0.40]
        if not money:
            if line.isupper() or len(toks) <= 3:
                sections.append(line)
            continue
        price = to_price(money[-1]["txt"])
        px = money[-1]["x0"]
        lw = [w for w in toks if w["x1"] < px]
        name, desc = "", ""
        if lw:
            gaps = [(lw[k + 1]["x0"] - lw[k]["x1"], k) for k in range(len(lw) - 1)]
            if gaps and max(gaps)[0] > 25:
                gi = max(gaps)[1]
                name = clean(" ".join(w["txt"] for w in lw[:gi + 1]))
                desc = clean(" ".join(w["txt"] for w in lw[gi + 1:]))
            else:
                name = clean(" ".join(w["txt"] for w in lw))
        # a real line item has an alphabetic name; pure-number "names" and bare
        # axis labels are stray header/meter cells that leaked through
        # a whole axis row can collapse into one "name" when it has no wide gap
        # to split on, so match the prefix rather than the exact label
        if not name or sum(c.isalpha() for c in name) < 2 \
                or name.lower().startswith(("metros", "pulgadas", "proyeccion")):
            continue
        trailing = clean(" ".join(w["txt"] for w in toks if w["x0"] > money[-1]["x1"]))
        items.append({"name": name, "description": desc, "price": price,
                      "extra": trailing, "context": sections[-1] if sections else ""})

    if items:
        blocks.append({
            "type": "item_list",
            "name": page_title,
            "page": page.page_number,
            "currency": "USD",
            "section_headers": sections,
            "items": items,
        })

    return blocks


# a table's family is most reliably read from its own name / content
FAMILY_KEYWORDS = [
    ("roller shades", "Roller Shades"),
    ("sheer elegance", "Sheer Elegance"),
    ("manhattan", "Manhattan"),
    ("roman shades", "Roman Shades"),
    ("honeycomb", "Honeycomb"),
    ("panel track", "Panel Track"),
    ("axio", "Toldos"),
    ("awning", "Toldos"),
    ("toldo", "Toldos"),
    ("window film", "Window Film"),
    ("somfy", "Rieles y Motores"),
    ("re-lion", "Rieles y Motores"),
    ("motor", "Rieles y Motores"),
    ("riel", "Rieles y Motores"),
    ("control remoto", "Rieles y Motores"),
    ("cenefa", "Accesorios y Componentes"),
    ("cassette", "Accesorios y Componentes"),
    ("componente", "Accesorios y Componentes"),
    ("accesorio", "Accesorios y Componentes"),
    ("bottomrail", "Accesorios y Componentes"),
]


def category_for(block, fallback):
    """Pick a family from the block name, its section headers, and row labels."""
    haystack = block.get("name", "")
    haystack += " " + " ".join(block.get("section_headers", []))
    haystack += " " + " ".join(r.get("label", "") for r in block.get("rows", []))
    haystack += " " + block.get("subheader", "")
    low = haystack.lower()
    for kw, fam in FAMILY_KEYWORDS:
        if kw in low:
            return fam
    return fallback


# Tube motors, the ones a motorised shade actually takes. The track motors on
# the Rieles pages (MOVELITE / GLYDEA / "Riel Eléctrico") drive curtain tracks,
# not shades, so they are deliberately not here.
MOTOR_NAME_RE = re.compile(r"re-?lion|motion\s*cm|lt50|sonesse|motor\s*promo", re.I)
MOTOR_EXCLUDE_RE = re.compile(
    r"cargador|control|corona|rueda|hub|bridge|canal|cinta|bracket|gancho"
    r"|adapter|interfaz|convertidor|smart|tapa|soporte", re.I)


def collect_motors(catalog):
    """The motor list a quote can choose from, with PRS's own prices.

    The same model appears under more than one section and, worse, "Re-Lion 35E
    1L" exists twice at different prices -- once unidirectional ($105) and once
    bidirectional ($152). Only the description tells them apart, so the
    direction is folded into the label; two identical rows in a picker would be
    the same defect as a quote naming three fabrics at once.
    """
    seen, out = set(), []
    for b in catalog:
        if b["type"] != "item_list":
            continue
        for i in b["items"]:
            if not (i.get("context") or "").upper().startswith("MOTORES"):
                continue
            name = i["name"]
            if not MOTOR_NAME_RE.search(name) or MOTOR_EXCLUDE_RE.search(name):
                continue
            desc = i.get("description") or ""
            # the PDF runs words together ("CelticUnidi."), so no word boundary
            suffix = ""
            if re.search(r"unidi", desc + name, re.I):
                suffix = " (unidireccional)"
            elif re.search(r"bidi", desc + name, re.I):
                suffix = " (bidireccional)"
            # a row with no wide gap keeps its whole spec string in the name
            short = re.split(r"\s*VTi®|\s*Vti®", name)[0].strip() or name
            label = short + suffix
            if (label, i["price"]) in seen:
                continue
            seen.add((label, i["price"]))
            out.append({"name": name, "label": label, "price": i["price"],
                        "description": desc, "page": b["page"]})
    out.sort(key=lambda x: x["price"])
    return out


# ---------------------------------------------------------------------------
# Add-on catalogue
#
# The quoting tool needs one normalised list of everything that can hang off a
# paño or off the job, whatever shape the PDF stored it in. Three pricing modes
# cover all of it:
#
#   flat      price as-is, times quantity      (motors, components, controls)
#   width     look the price up by the paño's width, like the fabric does
#             (cenefas, cassettes, fascias, rails)
#   per_foot  price x feet of the paño's height or width   (perfiles)
#
# Cortinas de tela are excluded entirely. The price list carries their hardware
# (pages 31-36, the "Riel de Cortina" section: manual rails, MOVELITE / GLYDEA /
# Motion tracks, master carriers, ripplefold and pinch-pleat parts) but never
# prices the tela itself, so a drapery cannot be quoted here at all. Excluding
# by page rather than by name catches the whole section -- matching names had
# let 45 of these through into the componente and control groups.
# ---------------------------------------------------------------------------
DRAPERY_PAGES = set(range(31, 37))
CENEFA_RE = re.compile(r"cenefa|carcaza|cassette|fascia", re.I)
RAIL_RE = re.compile(r"riel|sistema guiado", re.I)
CONTROL_RE = re.compile(r"control|remoto|hub|bridge|canales|situo|telis|smoove"
                        r"|intertec|inteo|convertidor|cargador", re.I)


def collect_addons(catalog):
    """Everything quotable as an add-on, grouped by kind."""
    groups = {
        "motor": {"kind": "motor", "label": "Motor",
                  "scope": "pano", "pricing": "flat", "items": []},
        "cenefa": {"kind": "cenefa", "label": "Cenefa / cassette / fascia",
                   "scope": "pano", "pricing": "width", "items": []},
        "riel": {"kind": "riel", "label": "Riel",
                 "scope": "pano", "pricing": "width", "items": []},
        "perfil": {"kind": "perfil", "label": "Perfil de enmarcado",
                   "scope": "pano", "pricing": "per_foot", "items": []},
        "componente": {"kind": "componente", "label": "Componente",
                       "scope": "pano", "pricing": "flat", "items": []},
        "control": {"kind": "control", "label": "Control / hub",
                    "scope": "pano", "pricing": "flat", "items": []},
    }

    groups["motor"]["items"] = [
        {"label": m["label"], "price": m["price"], "page": m["page"]}
        for m in collect_motors(catalog)]

    seen_width = set()
    for b in catalog:
        if b.get("page") in DRAPERY_PAGES:
            continue                       # cortinas de tela, not quoted here
        if b["type"] == "width_priced":
            kind = ("cenefa" if CENEFA_RE.search(b["name"])
                    else "riel" if RAIL_RE.search(b["name"]) else None)
            if not kind:
                continue
            for r in b["rows"]:
                label = r["label"] if r["label"] != b["name"] else b["name"]
                if label != b["name"]:
                    label = f"{b['name']} · {label}"
                # PRS repeats the Panel Track rail table on every fabric page
                if label in seen_width:
                    continue
                seen_width.add(label)
                groups[kind]["items"].append({
                    "label": label, "widths_in": b["widths_in"],
                    "prices": r["prices"], "page": b["page"]})

        elif b["type"] == "per_unit_list":
            for i in b["items"]:
                groups["perfil"]["items"].append({
                    "label": i["name"], "price": i["price"],
                    "unit": i["unit"], "basis": i["basis"], "page": b["page"]})

        elif b["type"] == "item_list":
            for i in b["items"]:
                ctx = (i.get("context") or "").upper()
                name = i["name"]
                if ctx.startswith("MOTORES"):
                    continue                       # already in the motor group
                kind = "control" if CONTROL_RE.search(name) or "CONTROL" in ctx \
                    else "componente"
                key = (kind, name, i["price"])
                if key in seen_width:
                    continue
                seen_width.add(key)
                groups[kind]["items"].append(
                    {"label": name, "price": i["price"], "page": b["page"]})

    for g in groups.values():
        g["items"].sort(key=lambda x: x.get("price", 0) or 0)
    return [g for g in groups.values() if g["items"]]


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "untitled"


def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else \
        "lista de precios nueva.pdf"
    out_dir = Path(__file__).parent / "data"
    out_dir.mkdir(exist_ok=True)
    # wipe first: writing by name leaves orphaned files from a previous list
    # behind (a family PRS renamed or dropped would keep its stale prices)
    for old in out_dir.glob("*.json"):
        old.unlink()
    for old in out_dir.glob("*.js"):
        old.unlink()

    pdf = pdfplumber.open(pdf_path)

    current_category = "General"
    catalog = []
    unparsed = []

    for page in pdf.pages:
        words = [w for w in page.extract_words() if clean(w["text"])]
        text = clean(page.extract_text() or "")
        first_line = text.splitlines()[0] if text else ""

        # divider / section pages carry the family name and little else
        if len(words) <= 10:
            if first_line and first_line.upper() not in ("PANAMA ROLLER & SHADES",):
                current_category = first_line
            else:
                current_category = "Rieles y Motores"
            continue

        blocks = process_page(page, first_line)
        if blocks:
            for b in blocks:
                b["category"] = category_for(b, current_category)
                # one table can price several fabrics, and a quote has to name
                # the one that was chosen -- needs the family, so it happens here
                if b["type"] == "fabric_matrix":
                    b["fabrics"], caveat = split_fabrics(b["name"], b["category"])
                    if caveat and caveat not in b["notes"]:
                        b["notes"].append(caveat)
                catalog.append(b)
        else:
            unparsed.append({
                "category": current_category,
                "page": page.page_number,
                "title": first_line,
                "text": text,
            })

    # A motorised paño has to price a real motor, so publish the choices as a
    # first-class block rather than leaving the calculator to guess a number.
    motors = collect_motors(catalog)
    if motors:
        catalog.append({
            "type": "motor_options",
            "name": "Motores",
            "category": "Rieles y Motores",
            "page": min(m["page"] for m in motors),
            "currency": "USD",
            "items": motors,
        })

    # everything else that can hang off a paño or the job, in one normalised
    # shape so the calculator does not have to know each table's layout
    addons = collect_addons(catalog)
    if addons:
        catalog.append({
            "type": "addon_options",
            "name": "Complementos",
            "category": "Rieles y Motores",
            # an aggregate block; point it at the earliest page it draws from
            "page": min((i.get("page", 1) for g in addons for i in g["items"]),
                        default=1),
            "currency": "USD",
            "groups": addons,
        })

    # A table heading that sits inside a block span looks exactly like a note
    # to the >15-letter rule. Now that every title is known, drop the notes
    # that are really just a neighbouring table's name.
    titles = {t["name"].lower() for t in catalog}
    for t in catalog:
        if t.get("notes"):
            t["notes"] = [n for n in t["notes"] if n.lower() not in titles]

    # write one file per category plus a combined index
    by_cat = defaultdict(list)
    for t in catalog:
        by_cat[t["category"]].append(t)

    index = []
    for cat, tables in by_cat.items():
        fname = f"{slugify(cat)}.json"
        (out_dir / fname).write_text(
            json.dumps({"category": cat, "tables": tables},
                       ensure_ascii=False, indent=2))
        for t in tables:
            index.append({"category": cat, "name": t["name"],
                          "type": t["type"], "page": t["page"], "file": fname})

    (out_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2))
    (out_dir / "_unparsed.json").write_text(
        json.dumps(unparsed, ensure_ascii=False, indent=2))
    (out_dir / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2))
    # JS embed so the calculator works when opened directly (file://)
    (out_dir / "catalog.js").write_text(
        "window.PRS_CATALOG = " +
        json.dumps(catalog, ensure_ascii=False) + ";")

    # summary to stderr
    by_type = Counter(t["type"] for t in catalog)
    reqs = Counter(r for t in catalog for row in t.get("requirements", [])
                   for r in row if r)
    print(f"source          : {pdf_path}", file=sys.stderr)
    print(f"categories      : {len(by_cat)}", file=sys.stderr)
    for tp, n in sorted(by_type.items()):
        print(f"{tp:16}: {n}", file=sys.stderr)
    print("flagged cells   :", file=sys.stderr)
    for k, n in sorted(reqs.items()):
        print(f"  {k:22}: {n}", file=sys.stderr)
    print(f"unparsed pages  : {len(unparsed)}"
          f"{' -> ' + str([u['page'] for u in unparsed]) if unparsed else ''}",
          file=sys.stderr)
    print(f"output          : {out_dir}", file=sys.stderr)


if __name__ == "__main__":
    main()
