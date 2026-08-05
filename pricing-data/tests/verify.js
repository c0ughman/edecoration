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

const MOTORS = (CATALOG.find(t => t.type === "motor_options") || {}).items || [];

check("motorization cell adds the chosen motor's real catalogue price", () => {
  const c = cellWith(WELL, "motorization");
  const r = price({ tableIndex: WELL, w: c.w, h: c.h, clutch: 25, motorIndex: 3 });
  const m = MOTORS[3];
  return [near(parseMoney(r.display), c.base + m.price),
          `base ${c.base} + ${m.label} ${m.price} -> ${r.display}`];
});

check("clutch surcharge applies to clutch cells only, not motor cells", () => {
  const cl = cellWith(WELL, "clutch_large");
  const mo = cellWith(WELL, "motorization");
  const a = price({ tableIndex: WELL, w: cl.w, h: cl.h, clutch: 25 });
  const b = price({ tableIndex: WELL, w: mo.w, h: mo.h, clutch: 25, motorIndex: 0 });
  return [near(parseMoney(a.display), cl.base + 25)
          && near(parseMoney(b.display), mo.base + MOTORS[0].price),
          `clutch ${a.display}, motor ${b.display}`];
});

check("bottomrail (Delfin) flags the paño but adds no surcharge", () => {
  const c = cellWith(AXIO, "bottomrail_delfin");
  const r = price({ tableIndex: AXIO, w: c.w, h: c.h, clutch: 25 });
  return [near(parseMoney(r.display), c.base) && r.badges.includes("bottomrail"),
          `base ${c.base} -> ${r.display}; badge=${/>([^<]*)</.exec(r.badges)?.[1] || "none"}`];
});

check("thin-fabric warning flags the paño but adds no surcharge", () => {
  const c = cellWith(ZAKROS, "thin_fabric_smiles");
  const r = price({ tableIndex: ZAKROS, w: c.w, h: c.h, clutch: 25 });
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

const noteCount = html => (html.match(/<li>/g) || []).length;

check("an unremarkable paño shows no notes at all", () => {
  const r = price({ tableIndex: WELL, w: 36, h: 42 });
  return [r.notes === "", `${noteCount(r.notes)} notes rendered`];
});

check("the shading caveat appears only on a cell that carries the flag", () => {
  const plain = price({ tableIndex: WELL, w: 36, h: 42 });
  const c = cellWith(WELL, "clutch_large");
  const flagged = price({ tableIndex: WELL, w: c.w, h: c.h });
  return [!plain.notes.includes("garantía") && flagged.notes.includes("garantía"),
          `plain=${noteCount(plain.notes)}, flagged=${noteCount(flagged.notes)}`];
});

check("the motor notice carries the caveat instead of repeating it below", () => {
  const t = CATALOG[WELL];
  let c = null;
  for (let i = 0; i < t.requirements.length && !c; i++)
    for (let j = 0; j < t.requirements[i].length; j++)
      if (t.requirements[i][j] === "motorization" && t.widths_in[j] <= 108) {
        c = { w: t.widths_in[j], h: t.heights_in[i] };
        break;
      }
  const r = price({ tableIndex: WELL, w: c.w, h: c.h });
  // stated once, in the notice; not duplicated into the bullet list
  return [/motoriz/i.test(r.motorWhy) && !r.notes.includes("motorización"),
          `notice=yes, bullets=${noteCount(r.notes)}`];
});

check("a motorization cell shows no duplicate caveat in the bullets", () => {
  // pick one narrow enough that the >108" rule cannot also fire, so the count
  // isolates the shading caveat
  const t = CATALOG[WELL];
  let c = null;
  for (let i = 0; i < t.requirements.length && !c; i++)
    for (let j = 0; j < t.requirements[i].length; j++)
      if (t.requirements[i][j] === "motorization" && t.widths_in[j] <= 108) {
        c = { w: t.widths_in[j], h: t.heights_in[i] };
        break;
      }
  const r = price({ tableIndex: WELL, w: c.w, h: c.h });
  return [noteCount(r.notes) === 0 && r.motorShown,
          `${c.w}"x${c.h}" -> ${noteCount(r.notes)} bullet(s), notice shown`];
});

check("an unrelated caveat still shows alongside the motor notice", () => {
  // a motorization cell wider than 108" raises the max-height rule too; that
  // one is not in the notice, so it must still appear as a bullet
  const t = CATALOG[WELL];
  let c = null;
  for (let i = 0; i < t.requirements.length && !c; i++)
    for (let j = 0; j < t.requirements[i].length; j++)
      if (t.requirements[i][j] === "motorization" && t.widths_in[j] > 108) {
        c = { w: t.widths_in[j], h: t.heights_in[i] };
        break;
      }
  const r = price({ tableIndex: WELL, w: c.w, h: c.h });
  return [noteCount(r.notes) === 1 && r.notes.includes("termosellar")
          && r.motorShown,
          `${c.w}"x${c.h}" -> ${noteCount(r.notes)} bullet + notice`];
});

check("the width-conditional caveat appears only past its width", () => {
  const under = price({ tableIndex: WELL, w: 96, h: 42 });
  const over = price({ tableIndex: WELL, w: 114, h: 42 });
  return [!under.notes.includes("termosellar") && over.notes.includes("termosellar"),
          `at 96" -> ${under.notes.includes("termosellar")}, `
          + `at 114" -> ${over.notes.includes("termosellar")}`];
});

check("the blanket cost disclaimer is never shown on the panel", () => {
  const cells = [[36, 42], [96, 42], [114, 42]];
  const shown = cells.map(([w, h]) => price({ tableIndex: WELL, w, h }).notes)
                     .filter(n => /LOS COSTOS PUEDEN VARIAR/i.test(n));
  return [shown.length === 0, "boilerplate suppressed at every size tested"];
});

check("the thin-fabric caveat rides along with its flagged cell", () => {
  const c = cellWith(ZAKROS, "thin_fabric_smiles");
  const flagged = price({ tableIndex: ZAKROS, w: c.w, h: c.h });
  let plain = null;
  const t = CATALOG[ZAKROS];
  for (let i = 0; i < t.requirements.length && !plain; i++)
    for (let j = 0; j < t.requirements[i].length; j++)
      if (!t.requirements[i][j] && t.prices[i][j] != null) {
        plain = { w: t.widths_in[j], h: t.heights_in[i] };
        break;
      }
  const unflagged = price({ tableIndex: ZAKROS, w: plain.w, h: plain.h });
  return [flagged.notes.includes("SONRISAS") && !unflagged.notes.includes("SONRISAS"),
          `flagged=${noteCount(flagged.notes)}, unflagged=${noteCount(unflagged.notes)}`];
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

/* ---- one table, several fabrics: the quote must name only the chosen one ---- */
const multi = CATALOG.findIndex(t =>
  t.type === "fabric_matrix" && (t.fabrics || []).length >= 3);

check("a shared price table offers each fabric separately", () => {
  const t = CATALOG[multi];
  return [t.fabrics.length >= 3 && t.fabrics.every(f => !f.includes("/")
          || /\d\s*[”"]\s*\/\s*\d/.test(f)),
          `${t.name.slice(0, 44)} -> ${t.fabrics.length} fabrics`];
});

check("the quote names the selected fabric, not the whole table", () => {
  const fresh = boot();
  const t = CATALOG[multi];
  const i = t.heights_in.findIndex((_, k) => t.prices[k].some(p => p != null));
  const j = t.prices[i].findIndex(p => p != null);
  fresh.price({ tableIndex: multi, fabricIndex: 1,
                w: t.widths_in[j], h: t.heights_in[i] });
  const q = fresh.addAndTotal();
  const chosen = t.fabrics[1], other = t.fabrics[0];
  return [q.items.includes(chosen) && !q.items.includes(other),
          `shows "${chosen}", omits "${other}"`];
});

check("picking a different fabric changes the quoted name only", () => {
  const t = CATALOG[multi];
  const i = t.heights_in.findIndex((_, k) => t.prices[k].some(p => p != null));
  const j = t.prices[i].findIndex(p => p != null);
  const a = price({ tableIndex: multi, fabricIndex: 0, w: t.widths_in[j], h: t.heights_in[i] });
  const b = price({ tableIndex: multi, fabricIndex: 2, w: t.widths_in[j], h: t.heights_in[i] });
  return [a.display === b.display, `both ${a.display} (they share the table)`];
});

check("bolt widths stay on one fabric rather than splitting it", () => {
  // "Wellington 78” / 118”" is one fabric in two widths, not two fabrics
  const t = CATALOG[WELL];
  return [t.fabrics.length === 1 && t.fabrics[0].includes("78") && t.fabrics[0].includes("118"),
          `${t.fabrics.length} fabric: ${t.fabrics[0]}`];
});

check("no fabric name is duplicated inside a family", () => {
  const seen = new Map();
  const dups = [];
  CATALOG.forEach(t => {
    if (t.type !== "fabric_matrix") return;
    (t.fabrics || []).forEach(f => {
      const k = t.category + "|" + f;
      if (seen.has(k)) dups.push(k); else seen.set(k, 1);
    });
  });
  return [dups.length === 0, `${seen.size} fabrics, ${dups.length} duplicates`];
});

check("every fabric in the dropdown resolves to a priceable table", () => {
  let n = 0, bad = 0;
  CATALOG.forEach((t, ti) => {
    if (t.type !== "fabric_matrix" || !t.prices.length) return;
    (t.fabrics || []).forEach((_, fi) => {
      n++;
      const i = t.heights_in.findIndex((_, k) => t.prices[k].some(p => p != null));
      const j = t.prices[i].findIndex(p => p != null);
      const r = price({ tableIndex: ti, fabricIndex: fi,
                        w: t.widths_in[j], h: t.heights_in[i] });
      if (!/^\$[\d,]+\.\d\d$/.test(r.display)) bad++;
    });
  });
  return [bad === 0, `${n} fabric options priced, ${bad} failed`];
});

/* ---------------- motorisation: no silent zero, ever ---------------- */
const MOTO = cellWith(WELL, "motorization");

check("a motorised cell raises the notice with PRS's own wording", () => {
  const r = price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h });
  return [r.motorShown && /motoriz/i.test(r.motorWhy),
          `notice=${r.motorShown}, reason quoted=${r.motorWhy.length > 0}`];
});

check("a motorised paño cannot be quoted until a motor is chosen", () => {
  const r = price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h });
  return [r.disabled === true && r.warnHidden === false && r.motorTotalHidden,
          `add disabled=${r.disabled}, warning shown=${!r.warnHidden}`];
});

check("choosing a motor unblocks the paño and prices it", () => {
  const r = price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h, motorIndex: 3 });
  return [r.disabled === false
          && near(parseMoney(r.display), MOTO.base + MOTORS[3].price),
          `${MOTORS[3].label} -> ${r.display}`];
});

check("the motor total reflects quantity", () => {
  const r = price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h, qty: 3, motorIndex: 5 });
  return [near(parseMoney(r.motorTotal), MOTORS[5].price * 3),
          `${MOTORS[5].price} × 3 = ${r.motorTotal}`];
});

check("the live breakdown separates fabric from motor", () => {
  const r = price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h, motorIndex: 2 });
  return [r.meta.includes("tela") && r.meta.includes("motor"), r.meta];
});

check("an unshaded cell shows no motor notice and drops any motor", () => {
  const fresh = boot();
  fresh.price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h, motorIndex: 4 });
  const t = CATALOG[WELL];
  let cell = null;
  for (let i = 0; i < t.requirements.length && !cell; i++)
    for (let j = 0; j < t.requirements[i].length; j++)
      if (!t.requirements[i][j] && t.prices[i][j] != null) {
        cell = { w: t.widths_in[j], h: t.heights_in[i], base: t.prices[i][j] };
        break;
      }
  const r = fresh.price({ tableIndex: WELL, w: cell.w, h: cell.h });
  return [!r.motorShown && near(parseMoney(r.display), cell.base),
          `notice=${r.motorShown}, ${r.display} (fabric ${cell.base})`];
});

check("the motor does not carry over to the next paño", () => {
  const fresh = boot();
  fresh.price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h, motorIndex: 4 });
  fresh.addAndTotal();
  const r = fresh.price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h });
  return [r.disabled === true && r.motorTotalHidden,
          `next paño starts with no motor, add disabled=${r.disabled}`];
});

check("the quote line names the motor and its price", () => {
  const fresh = boot();
  fresh.price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h, motorIndex: 3 });
  const q = fresh.addAndTotal();
  return [q.items.includes(MOTORS[3].label)
          && q.items.includes(MOTORS[3].price.toFixed(2)),
          `line shows "${MOTORS[3].label}" at ${MOTORS[3].price}`];
});

check("quote totals include the motor", () => {
  const fresh = boot();
  fresh.price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h, qty: 2, motorIndex: 6 });
  const q = fresh.addAndTotal();
  const want = (MOTO.base + MOTORS[6].price) * 2;
  return [near(fresh.parseMoney(q.subtotal), want),
          `(${MOTO.base}+${MOTORS[6].price})×2 = ${want.toFixed(2)} -> ${q.subtotal}`];
});

check("every motor option carries a real price", () => {
  const zero = MOTORS.filter(m => !(m.price > 0));
  return [MOTORS.length >= 20 && zero.length === 0,
          `${MOTORS.length} motors, ${zero.length} priced at zero`];
});

check("no two motor options share a label at different prices", () => {
  const byLabel = {};
  MOTORS.forEach(m => (byLabel[m.label] = byLabel[m.label] || new Set()).add(m.price));
  const bad = Object.entries(byLabel).filter(([, s]) => s.size > 1);
  return [bad.length === 0,
          bad.length ? `ambiguous: ${bad[0][0]}` : "every label maps to one price"];
});

out.forEach(r => console.log(JSON.stringify(r)));
