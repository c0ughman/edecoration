# PRS / Edecoration price-list data

Structured pricing extracted from **`Lista de precios 2026 PRS - Documentos de
Google.pdf`** so it can be consumed by an internal quoting tool (HTML/JS).

## How to (re)generate

```bash
python3 -m venv .venv-pricing
.venv-pricing/bin/pip install pdfplumber
.venv-pricing/bin/python pricing-data/extract.py "Lista de precios 2026 PRS - Documentos de Google.pdf"
```

Output is written to `pricing-data/data/`. Re-run whenever PRS sends a new PDF.

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
- **34 width-priced tables** — curtain rails (Balinera / Ripplefold / Coulisse /
  Correderas) and Panel Track channel rails (2–5 canales).
- **13 item lists / ~209 line items** — motorts, remotes, hardware, accessories.

## The calculator

Open **`pricing-data/calculator.html`** directly in a browser (double-click — no
server needed; it reads `data/catalog.js`, an embed the extractor writes
alongside the JSON).

Flow: pick a family → fabric → enter width × height (in/cm) → quantity & options
→ "Agregar a la cotización". Build a multi-paño quote, then export to **PDF /
image / text**. Sizes round up to the next listed table size; cells shaded in the
PDF auto-show a *clutch Large* / *motorización* badge and surcharge.

The **⚙ Ajustes** panel exposes the configurable numbers (ITBMS %, clutch/motor
cost, installation, margin) — these are placeholders since the PDF lists *costs*,
not retail. PDF/image export use html2canvas + jsPDF from a CDN (needs internet).

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
