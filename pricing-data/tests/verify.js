/* Calculation checks. These drive the real calculator.js through the stub DOM,
   so they exercise the shipped lookup / rounding / surcharge code rather than a
   reimplementation of it. One JSON result per line, consumed by verify.py. */
const { boot } = require("./harness");

const out = [];
const check = (name, fn) => {
  try {
    const [ok, detail] = fn();
    out.push([ok, name, detail]);
  } catch (e) {
    out.push([false, name, `${e.name}: ${e.message}`]);
  }
};

const h = boot();
const { CATALOG, price, parseMoney } = h;
const find = (frag) => CATALOG.findIndex(t => t.name.includes(frag));
const near = (a, b) => Math.abs(a - b) < 0.005;

const WELL = find("Wellington");              // p3, clutch + motorization table

/* Select the other fixtures by the requirement they carry rather than by name,
   so a corrected table title cannot silently invalidate the test. */
const withReq = (req) => CATALOG.findIndex(t =>
  t.type === "fabric_matrix" &&
  (t.requirements || []).some(row => row.some(r => r === req)));

const ZAKROS = withReq("thin_fabric_smiles");   // orange / thin fabric, p23
const AXIO = withReq("bottomrail_delfin");      // yellow = special-order bottomrail

/* Locate a cell carrying a given requirement, for surcharge tests. */
function cellWith(idx, req) {
  const t = CATALOG[idx];
  for (let i = 0; i < t.requirements.length; i++)
    for (let j = 0; j < t.requirements[i].length; j++)
      if (t.requirements[i][j] === req && t.prices[i][j] != null)
        return { w: t.widths_in[j], h: t.heights_in[i], base: t.prices[i][j] };
  return null;
}

check("exact table cell returns the PDF's price", () => {
  const r = price({ tableIndex: WELL, w: 36, h: 42 });
  return [r.display === "$18.39", `Wellington 36x42 -> ${r.display} (PDF 18.39)`];
});

check("a size between rows rounds UP to the next listed size", () => {
  const r = price({ tableIndex: WELL, w: 35, h: 41 });
  const ok = r.display === "$18.39" && r.meta.includes('36" × 42"');
  return [ok, `35x41 -> ${r.display}, ${r.meta}`];
});

check("an exact listed size does not round up to the next one", () => {
  const a = price({ tableIndex: WELL, w: 42, h: 42 });
  const b = price({ tableIndex: WELL, w: 43, h: 42 });
  // 42 must hit the 42 column (21.37); 43 must move to the 48 column (23.04)
  return [a.display === "$21.37" && b.display === "$23.04",
          `42->${a.display} (want 21.37), 43->${b.display} (want 23.04)`];
});

check("cm input converts to inches before lookup", () => {
  const fresh = boot();
  fresh.setUnit("cm");
  // 91.44cm x 106.68cm is exactly 36" x 42"
  const r = fresh.price({ tableIndex: WELL, w: 91.44, h: 106.68 });
  return [r.display === "$18.39" && r.meta.includes('36" × 42"'),
          `91.44cm x 106.68cm -> ${r.display}, ${r.meta}`];
});

check("over-range size is refused, not silently clamped", () => {
  const t = CATALOG[WELL];
  const r = price({ tableIndex: WELL,
                    w: Math.max(...t.widths_in) + 10, h: 42 });
  return [r.display === "Fuera de rango" && r.disabled === true,
          `${r.display}, add disabled=${r.disabled}`];
});

check("clutch_large cell adds the configured clutch surcharge", () => {
  const c = cellWith(WELL, "clutch_large");
  const r = price({ tableIndex: WELL, w: c.w, h: c.h, clutch: 25 });
  return [near(parseMoney(r.display), c.base + 25),
          `base ${c.base} +25 -> ${r.display}`];
});

check("motorization cell adds the configured motor surcharge", () => {
  const c = cellWith(WELL, "motorization");
  const r = price({ tableIndex: WELL, w: c.w, h: c.h, clutch: 25, motor: 40 });
  return [near(parseMoney(r.display), c.base + 40),
          `base ${c.base} +40 -> ${r.display}`];
});

check("clutch surcharge applies to clutch cells only, not motor cells", () => {
  const cl = cellWith(WELL, "clutch_large");
  const mo = cellWith(WELL, "motorization");
  const a = price({ tableIndex: WELL, w: cl.w, h: cl.h, clutch: 25, motor: 40 });
  const b = price({ tableIndex: WELL, w: mo.w, h: mo.h, clutch: 25, motor: 40 });
  return [near(parseMoney(a.display), cl.base + 25)
          && near(parseMoney(b.display), mo.base + 40),
          `clutch ${a.display}, motor ${b.display}`];
});

check("bottomrail (Delfin) flags the paño but adds no surcharge", () => {
  const c = cellWith(AXIO, "bottomrail_delfin");
  const r = price({ tableIndex: AXIO, w: c.w, h: c.h, clutch: 25, motor: 40 });
  return [near(parseMoney(r.display), c.base) && r.badges.includes("bottomrail"),
          `base ${c.base} -> ${r.display}; badge=${/>([^<]*)</.exec(r.badges)?.[1] || "none"}`];
});

check("thin-fabric warning flags the paño but adds no surcharge", () => {
  const c = cellWith(ZAKROS, "thin_fabric_smiles");
  const r = price({ tableIndex: ZAKROS, w: c.w, h: c.h, clutch: 25, motor: 40 });
  return [near(parseMoney(r.display), c.base) && r.badges.includes("sonrisas"),
          `base ${c.base} -> ${r.display}; badge shown=${r.badges.includes("sonrisas")}`];
});

check("an unshaded cell carries no badge and no surcharge", () => {
  const t = CATALOG[WELL];
  let cell = null;
  for (let i = 0; i < t.requirements.length && !cell; i++)
    for (let j = 0; j < t.requirements[i].length; j++)
      if (!t.requirements[i][j] && t.prices[i][j] != null) {
        cell = { w: t.widths_in[j], h: t.heights_in[i], base: t.prices[i][j] };
        break;
      }
  const r = price({ tableIndex: WELL, w: cell.w, h: cell.h, clutch: 25 });
  return [near(parseMoney(r.display), cell.base) && r.badges === "",
          `base ${cell.base} -> ${r.display}, badges="${r.badges}"`];
});

check("installation surcharge is added per paño", () => {
  const a = price({ tableIndex: WELL, w: 36, h: 42, install: false });
  const b = price({ tableIndex: WELL, w: 36, h: 42, install: true });
  // cfgInstall defaults to 0, so set it via the harness config
  h.get("cfgInstall").value = "15";
  const c = price({ tableIndex: WELL, w: 36, h: 42, install: true });
  h.get("cfgInstall").value = "0";
  return [near(parseMoney(c.display), parseMoney(a.display) + 15),
          `${a.display} -> +15 install -> ${c.display}`];
});

check("per-paño percentage margin compounds on the surcharged price", () => {
  const c = cellWith(WELL, "clutch_large");
  const r = price({ tableIndex: WELL, w: c.w, h: c.h, clutch: 25, lineMargin: 20 });
  const want = (c.base + 25) * 1.20;
  return [near(parseMoney(r.display), want),
          `(${c.base}+25)*1.20 = ${want.toFixed(2)} -> ${r.display}`];
});

check("per-paño margin of zero leaves the price untouched", () => {
  const a = price({ tableIndex: WELL, w: 36, h: 42, lineMargin: 0 });
  return [a.display === "$18.39", `${a.display}`];
});

check("fabric notes from the PDF reach the fabric panel", () => {
  const r = price({ tableIndex: WELL, w: 36, h: 42 });
  return [r.notes.includes("termosellar") && r.notes.includes("garantía"),
          `${(r.notes.match(/<li>/g) || []).length} notes rendered`];
});

check("quantity multiplies into the line subtotal", () => {
  const r = price({ tableIndex: WELL, w: 36, h: 42, qty: 4 });
  return [r.meta.includes("$73.56"), `4 x 18.39 -> ${r.meta}`];
});

check("quote subtotal equals unit x qty", () => {
  const fresh = boot();
  fresh.price({ tableIndex: WELL, w: 36, h: 42, qty: 3 });
  const t = fresh.addAndTotal();
  return [near(fresh.parseMoney(t.subtotal), 18.39 * 3),
          `3 x 18.39 = 55.17 -> subtotal ${t.subtotal}`];
});

check("ITBMS is applied to the subtotal at the configured rate", () => {
  const fresh = boot();
  fresh.price({ tableIndex: WELL, w: 36, h: 42, qty: 3, tax: 7 });
  const t = fresh.addAndTotal();
  const sub = fresh.parseMoney(t.subtotal);
  return [near(fresh.parseMoney(t.tax), sub * 0.07)
          && near(fresh.parseMoney(t.total), sub * 1.07),
          `subtotal ${t.subtotal}, tax ${t.tax}, total ${t.total}`];
});

check("two paños from different tables sum correctly", () => {
  const fresh = boot();
  fresh.price({ tableIndex: WELL, w: 36, h: 42, qty: 2 });
  fresh.addAndTotal();
  const c = cellWith(AXIO, "bottomrail_delfin");
  fresh.price({ tableIndex: AXIO, w: c.w, h: c.h, qty: 1 });
  const t = fresh.addAndTotal();
  const want = 18.39 * 2 + c.base;
  return [near(fresh.parseMoney(t.subtotal), want),
          `2x18.39 + ${c.base} = ${want.toFixed(2)} -> ${t.subtotal}`];
});

check("PRS's own wording reaches the quote's notes block", () => {
  const fresh = boot();
  const c = cellWith(AXIO, "bottomrail_delfin");
  fresh.price({ tableIndex: AXIO, w: c.w, h: c.h });
  const t = fresh.addAndTotal();
  return [t.notes.includes("bottomrail") && t.notes.includes("pedido"),
          `quote notes mention the special-order bottomrail`];
});

out.forEach(r => console.log(JSON.stringify(r)));
