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

# Fill colours used for cell shading (RGB 0..1, as pdfplumber reports them).
COLOR_CLUTCH = (1.0, 0.898, 0.6)          # light yellow
COLOR_MOTOR = (0.9373, 0.9373, 0.9373)    # light gray


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


def requirement_for(color):
    if color is None:
        return None
    if color == COLOR_CLUTCH:
        return "clutch_large"
    if color == COLOR_MOTOR:
        return "motorization"
    return None


def row_alpha(r):
    line = clean(" ".join(w["txt"] for w in r["words"]))
    return line if any(c.isalpha() for c in line) else ""


NUMCELL_RE = re.compile(r"^\d{1,4}([.,]\d{1,2})?$")  # int or price cell
LEGEND = {
    "clutch_large": "Medida sombreada amarillo: requiere clutch Large",
    "motorization": "Medida sombreada gris: requiere motorizacion",
}


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


def title_above(rows, hi, stop):
    """Nearest real title line above a header.

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
        return a
    return None


def process_page(page, page_title):
    """Return a list of structured blocks found on the page."""
    words = [w for w in page.extract_words() if clean(w["text"])]
    for w in words:
        w["txt"] = clean(w["text"])
    rows = cluster_rows(words)
    color_at = build_rect_lookup(page)

    headers = [i for i, r in enumerate(rows) if header_ints(r)]
    consumed = set()
    blocks = []

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

        data = [j for j in range(hi + 1, end) if col_cells(j)]
        if not data:
            continue

        def has_alpha(j):
            return any(c.isalpha() for w in labels_of(j, left_limit)
                       for c in w["txt"])

        alpha_rows = sum(has_alpha(j) for j in data)
        is_width = alpha_rows > len(data) / 2

        if is_width:
            sub = clean(" ".join(w["txt"] for w in rows[hi]["words"]
                                 if not is_int(w["txt"])
                                 and (w["x0"] + w["x1"]) / 2 < left_limit))
            title = title_above(rows, hi, headers[hk - 1] if hk else -1) or page_title
            table_rows = []
            used = [hi]
            for j in data:
                label = clean(" ".join(w["txt"] for w in labels_of(j, left_limit)))
                cells = col_cells(j)
                # genuine rail/channel rows span several columns; a lone price
                # is an accessory line and belongs in the item list instead
                if not label or label.lower() in ("metros", "pulgadas") \
                        or len(cells) < 2:
                    continue
                slots = assign_cells(cells, centers, spacing)
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
        heights, prices, reqs, notes = [], [], [], []
        for j in data:
            lab_ints = [int(w["txt"]) for w in labels_of(j, left_limit)
                        if is_int(w["txt"])]
            if not lab_ints:
                continue
            cells = [w for w in rows[j]["words"]
                     if (w["x0"] + w["x1"]) / 2 >= left_limit
                     and PRICE_RE.match(w["txt"])]
            slots = assign_cells(cells, centers, spacing)
            row_prices, row_reqs = [], []
            for s in slots:
                if s is None:
                    row_prices.append(None)
                    row_reqs.append(None)
                else:
                    cx = (s["x0"] + s["x1"]) / 2
                    cy = (s["top"] + s["bottom"]) / 2
                    row_prices.append(to_price(s["txt"]))
                    row_reqs.append(requirement_for(color_at(cx, cy)))
            heights.append(lab_ints[-1])
            prices.append(row_prices)
            reqs.append(row_reqs)

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
        v = variant_above(rows, hi, headers[hk - 1] if hk else -1)
        if v:
            v = v.strip().title()
            title = f"{page_title} ({v})"
        elif hk > 0:
            title = title_above(rows, hi, headers[hk - 1]) or page_title
        else:
            title = page_title

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
            "requirement_legend": LEGEND,
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
        if not name or sum(c.isalpha() for c in name) < 2 \
                or name.lower() in ("metros", "pulgadas", "proyeccion"):
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


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "untitled"


def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else \
        "Lista de precios 2026 PRS - Documentos de Google.pdf"
    out_dir = Path(__file__).parent / "data"
    out_dir.mkdir(exist_ok=True)

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
                catalog.append(b)
        else:
            unparsed.append({
                "category": current_category,
                "page": page.page_number,
                "title": first_line,
                "text": text,
            })

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
    from collections import Counter
    by_type = Counter(t["type"] for t in catalog)
    print(f"categories      : {len(by_cat)}", file=sys.stderr)
    for tp, n in by_type.items():
        print(f"{tp:16}: {n}", file=sys.stderr)
    print(f"unparsed pages  : {len(unparsed)}", file=sys.stderr)
    print(f"output          : {out_dir}", file=sys.stderr)


if __name__ == "__main__":
    main()
