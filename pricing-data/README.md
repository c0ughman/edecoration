# PRS / Edecoration price-list data

Structured pricing extracted from **`lista de precios nueva.pdf`** so it can be
consumed by an internal quoting tool (HTML/JS).

## How to (re)generate

```bash
# first time only
python3 -m venv .venv-pricing
.venv-pricing/bin/pip install pdfplumber

.venv-pricing/bin/python pricing-data/extract.py "lista de precios nueva.pdf"
.venv-pricing/bin/python pricing-data/tests/verify.py "lista de precios nueva.pdf"
```

Output is written to `pricing-data/data/`, which is **wiped first** so a family
PRS renames or drops cannot leave a stale file behind. Re-run both commands
whenever PRS sends a new PDF — the extractor raises on anything it does not
understand, and `verify.py` re-reads the PDF independently to confirm the result.

## What's in `data/`

| file | contents |
|------|----------|
| `index.json` | one entry per table: `{category, name, type, page, file}` — the manifest to load first |
| `catalog.json` | every table in one array (handy for a single fetch) |
| `<category>.json` | tables grouped by family (roller-shades, sheer-elegance, manhattan, roman-shades, honeycomb, panel-track, rieles-y-motores, accesorios-y-componentes, toldos, window-film) |
| `_unparsed.json` | pages the script could not structure (currently empty) |

### Coverage

- **77 fabric price matrices** — Roller Shades, Sheer Elegance, Manhattan, Roman
  Shades (each fabric has a *Con Varilla* and *Sin Varilla* table), Honeycomb,
  Panel Track and Axio drop shades.
- **37 width-priced tables** — cenefas/cassettes/fascias, Panel Track channel
  rails (2–5 canales), Romana and Coulisse rails, plus the drapery tracks the
  calculator excludes.
- **10 item lists / ~215 line items** — motors, remotes, hardware, accessories.
- **1 per-unit list** — Perfiles de Enmarcados, priced by the linear foot.
- **1 awning system** — the Awning System page, priced by projection × number of
  arms with a width range per arm count.

## Shaded cells

A shaded price cell means something, but *what* it means is written in prose on
the page, not in the colour. The same light yellow marks **clutch Large** on the
Roller pages and a special-order **bottomrail (Delfin)** on the Axio pages, so
the extractor never hardcodes a colour → meaning table. Instead it:

1. reads the raw fill behind every price cell;
2. treats a colour as a *flag* only when it covers a strict subset of the
   table's cells — a fill covering every cell is styling (this is what keeps the
   rail pages' striped header rows from being read as requirements);
3. resolves the meaning from that table's own notes, per clause, since one
   sentence routinely defines two colours at once;
4. **raises** if a flag colour has no note explaining it.

Step 4 matters: silence there is what previously let an unrecognised orange —
*"EN LAS MEDIDAS EN NARANJA LA TELA PUEDE PRESENTAR SONRISAS"* — disappear from
the quote entirely. Adding a colour means adding it to `COLOR_WORDS` (the
Spanish word a note uses for it) and, if the requirement is new, to
`MEANING_KEYWORDS` plus the `REQUIREMENTS` registry in `calculator.js`.

Current requirement keys: `clutch_large`, `motorization`, `bottomrail_delfin`,
`thin_fabric_smiles`.

## Tests

```bash
.venv-pricing/bin/python pricing-data/tests/verify.py "lista de precios nueva.pdf"
```

164 checks. The data half re-derives facts from the PDF by a different route
than `extract.py` uses (text lines rather than word geometry) and compare — the
strongest is a row-by-row re-read of all 1108 price rows. The rest boot the real
`calculator.js` under a stub DOM (`tests/harness.js`) and verify the arithmetic
end to end: table lookup, round-up, surcharges, margins, ITBMS, quote totals.

## The calculator

Open **`pricing-data/calculator.html`** directly in a browser (double-click — no
server needed; it reads `data/catalog.js`, an embed the extractor writes
alongside the JSON).

Flow: pick a family → fabric → enter width × height (in/cm) → quantity & options
→ "Agregar a la cotización". Build a multi-paño quote, then export to **PDF /
image / text**. Sizes round up to the next listed table size; a shaded cell
raises its badge and, where the requirement has a cost, its surcharge.

One PRS table often prices several fabrics that happen to cost the same, so each
is listed separately — 77 tables become 146 selectable fabrics, and a quote names
only the one chosen. A `/` between bare measurements is a bolt width, not another
fabric, so `Wellington 78” / 118”` stays one entry.

PRS's notes surface **only when they bear on the paño in front of you**: a
shading caveat when that cell carries the flag, a width rule once past its
width. The blanket "los costos pueden variar" disclaimer is suppressed.

### Motorisation

A grey-shaded cell cannot be built without a motor, so it raises a full notice
rather than a badge, quotes PRS's own warranty sentence, and makes you pick a
motor from the price list. The 24 options come from the catalogue with real
prices ($84–$489); the chosen motor is added per unit and named on the quote.

PRS's rule is a warranty condition, not a physical one — *"si no se siguen estas
recomendaciones, no se otorgará garantía"* — so the paño can still be added
without a motor. The notice is what stops it being forgotten, not a block.

This replaces a settings box that shipped at `0` — a quote could say "requires
motorization" and charge nothing for it. Note `Re-Lion 35E 1L` exists twice at
different prices (unidirectional $105, bidirectional $152), so the direction is
part of the label.

Only tube motors are offered. The MOVELITE / GLYDEA / "Riel Eléctrico" items
drive curtain tracks, not shades, and are deliberately excluded.

The **⚙ Ajustes** panel holds the numbers the PDF cannot supply: ITBMS %, clutch
cost, installation, margin. The clutch figure in particular is unsourced — there
is no clutch line item anywhere in the price list. The PDF lists *costs*, not
retail. PDF/image export use html2canvas + jsPDF from a CDN (needs internet).

### Complementos

Anything that hangs off a paño — motor, cenefa/cassette/fascia, riel, perfil,
componente, control/hub. More than one of each is allowed, since the
person quoting knows what a given job needs. `addon_options` normalises three
pricing modes so the UI does not have to know each table's layout:

| mode | meaning | source |
|------|---------|--------|
| `flat` | price as-is × qty | motors, componentes, controles |
| `width` | looked up on the paño's width, like the fabric | cenefas, cassettes, fascias, rieles |
| `per_foot` | price × feet of the paño's height or width | perfiles de enmarcado |

Width- and foot-priced complementos re-price when the paño's size changes; one
that has no price at the new size is dropped with a toast rather than left
stale. **Personalizado** is a free-text line for anything the price list does
not carry: it takes a **name** (catalogue items are named by what you pick, a
custom one has nothing until you type it), plus an optional description and a
price.

Everything hangs off a paño — there is no separate project-level section.
Controles and hubs are complementos like anything else.

**Cortinas de tela are excluded entirely.** The price list carries their
hardware (pages 31-36, the "Riel de Cortina" section: manual rails, MOVELITE /
GLYDEA / Motion tracks, master carriers, ripplefold and pinch-pleat parts) but
never prices the tela itself, so a drapery cannot be quoted here at all. The
exclusion is by page rather than by name — matching names had let 45 of these
through into the componente and control groups.

### Known gaps

- A fabric's own bolt width is not enforced: `Salvador 94”` is priced from a
  table with 120" columns, and 69 of the 146 options can be quoted wider than
  the fabric comes. Nothing warns.
- Only fabric matrices are quotable as paños. The Awning System is extracted
  but has no UI; the rail and accessory tables are reachable only as
  complementos.
- Coverage is 99.75% of the PDF's price tokens. What remains is the Axio side
  tables (p66–68) and the Clear Vinyl column, plus the `2 canales` row of the
  Panel Track 2-vías table whose prices sit on the axis line in the PDF.

## Data shapes

### `fabric_matrix` — the core lookup tables

A 2D grid: **rows = height (inches), columns = width (inches)**, value = price.

```jsonc
{
  "type": "fabric_matrix",
  "category": "Roller Shades",
  "name": "Roller Shades - Wellington 78” / 118”",
  "page": 3,
  "currency": "USD",
  "axis": { "rows": "height_in", "cols": "width_in" },
  "widths_in":  [36, 42, 48, ... 118],     // column keys
  "widths_m":   [0.91, 1.07, ...],          // same columns, in metres (or null)
  "heights_in": [42, 48, 54, ... 180],      // row keys
  "prices":     [[34.72, 36.11, ...], ...], // prices[rowIndex][colIndex], null = blank
  "requirements":[[null, ... "clutch_large", "motorization"], ...], // parallel to prices
  "requirement_legend": {
    "clutch_large":  "Medida sombreada amarillo: requiere clutch Large",
    "motorization":  "Medida sombreada gris: requiere motorizacion"
  },
  "notes": ["LOS COSTOS PUEDEN VARIAR...", "Si la roller mide más de 108”..."]
}
```

**Why `requirements` matters:** in the PDF those cells are colour-shaded
(yellow = needs a *clutch Large*, gray = needs *motorización*). That colouring is
**not** in the PDF text — the script recovers it from the cell fill colours, so
the calculator can automatically warn the user / add the right hardware and
honour the "no warranty if ignored" note.

**Lookup rule (important):** real measurements rarely hit an exact cell. PRS
price tables are "round up to the next listed size" — pick the smallest
`widths_in` ≥ ordered width and smallest `heights_in` ≥ ordered height, then read
`prices[row][col]`. If the measurement exceeds the largest listed size, the item
is out of standard range (quote manually / motorized).

### `width_priced` — rails priced by width only

```jsonc
{
  "type": "width_priced",
  "name": "RIEL HD CON BALINERAS",
  "subheader": "Balinera",
  "widths_in": [36, 48, 60, ... 228],
  "rows": [
    { "label": "Riel S/ Master", "prices": [11, 13, 15, ...] },
    { "label": "Riel 1-Vía",     "prices": [17, 19, 21, ...] }
  ]
}
```

Same round-up-by-width rule applies.

### `item_list` — fixed-price catalogue items

```jsonc
{
  "type": "item_list",
  "name": "MOTORES",
  "section_headers": ["MOTORES", "VERTILUX", "..."],
  "items": [
    { "name": "Re-Lion 35E 1L", "description": "Vti®RE-LION ...",
      "price": 105.0, "extra": "<sku/unit>", "context": "MOTORES RE-LION ..." }
  ]
}
```

## Known limitations

- The **Awning System** page (Toldos, p67) uses a transposed, range-based layout
  (projection ranges instead of a width ladder) and is intentionally left in
  `_unparsed.json` for manual entry rather than risk emitting wrong numbers.
  Always skim `_unparsed.json` after a regeneration.
- Width-table `name` is best-effort (taken from the nearest heading); the
  `subheader` field is the reliable discriminator (Balinera / WAVE / CORREDERAS…).
- Prices are floats as printed; treat them as USD with 2 decimals.

## Suggested next step: the quoting calculator

A minimal flow for `index.html` + `calc.js` that this data already supports:

1. **Select product family** → load that `<category>.json`.
2. **Select fabric / table** (`name`).
3. **Enter width × height** (inches; offer cm→in conversion).
4. **Round up** to the next listed size and read the base price.
5. **Read `requirements[row][col]`** → if `clutch_large`/`motorization`, surface
   the note and add the matching hardware from `rieles-y-motores.json`.
6. **Add-ons**: rail (from `width_priced`), motor + remote (from `item_list`),
   accessories (bottomrail, brackets, etc.).
7. **Quote output**: line items + subtotal + ITBMS (7% PA tax) + total, plus a
   printable summary.

Things worth adding to the model later, but not in the PDF (confirm with PRS):
installation labour, minimum order charge, delivery, markup/margin over these
**cost** prices, and whether these are dealer cost or retail.
