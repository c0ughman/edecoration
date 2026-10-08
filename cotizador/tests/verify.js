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

const ZAKROS = withReq("thin_fabric_smiles");   // orange / thin fabric (Sheer Zakros)
// PRS dropped the Delfin bottomrail rule in September; the yellow that now
// means something other than clutch Large is the Horizontales capacity limit
const HORIZ = withReq("capacity_limit");
const HORIZ_RED = withReq("exceeds_capacity");

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

check("a yellow that is not clutch Large adds no clutch surcharge", () => {
  // the same yellow is clutch Large on a Roller page and the capacity limit on
  // the Horizontales page; only the former costs anything
  const c = cellWith(HORIZ, "capacity_limit");
  const r = price({ tableIndex: HORIZ, w: c.w, h: c.h, clutch: 25 });
  return [near(parseMoney(r.display), c.base) && r.badges.includes("límite de su capacidad"),
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
  const c = cellWith(ZAKROS, "thin_fabric_smiles");
  fresh.price({ tableIndex: ZAKROS, w: c.w, h: c.h, qty: 1 });
  const t = fresh.addAndTotal();
  const want = 18.39 * 2 + c.base;
  return [near(fresh.parseMoney(t.subtotal), want),
          `2x18.39 + ${c.base} = ${want.toFixed(2)} -> ${t.subtotal}`];
});

check("the client quote states the requirement without the supplier's wording", () => {
  const fresh = boot();
  const c = cellWith(ZAKROS, "thin_fabric_smiles");
  fresh.price({ tableIndex: ZAKROS, w: c.w, h: c.h });
  const t = fresh.addAndTotal();
  // the requirement is named; the price-list sentence explaining it is not
  return [t.notes.includes("sonrisas") && !t.notes.includes("NARANJA")
          && !t.notes.includes("sombreadas"),
          `requirement stated, supplier sentence withheld`];
});

check("no supplier shading language ever reaches the client quote", () => {
  const fresh = boot();
  const moto = cellWith(WELL, "motorization");
  fresh.price({ tableIndex: WELL, w: moto.w, h: moto.h, motorIndex: 2 });
  fresh.addAndTotal();
  const clutch = cellWith(WELL, "clutch_large");
  fresh.price({ tableIndex: WELL, w: clutch.w, h: clutch.h });
  const t = fresh.addAndTotal();
  const leaked = ["sombreadas", "amarillo", "termosellar", "dos rollers",
                  "LOS COSTOS"].filter(s => t.notes.includes(s));
  return [leaked.length === 0,
          leaked.length ? `leaked: ${leaked.join(", ")}` : "quote is clean"];
});

check("the quote keeps the requirement and the site-check disclaimer", () => {
  const fresh = boot();
  const m = cellWith(WELL, "motorization");
  fresh.price({ tableIndex: WELL, w: m.w, h: m.h, motorIndex: 1 });
  const t = fresh.addAndTotal();
  return [t.notes.includes("motorización") && t.notes.includes("verificación"),
          `${(t.notes.match(/<li>/g) || []).length} notes on the quote`];
});

check("the quote line names the motor without an emoji", () => {
  const fresh = boot();
  const m = cellWith(WELL, "motorization");
  fresh.price({ tableIndex: WELL, w: m.w, h: m.h, motorIndex: 3 });
  const t = fresh.addAndTotal();
  // the motor has its own row since it was split off the paño's price
  return [t.items.includes("Motorización · ") && !/[\u{1F300}-\u{1FAFF}⚡]/u.test(t.items),
          `line reads "Motorización · <model>", no emoji`];
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

check("a motorised paño warns loudly but can still be added without a motor", () => {
  const r = price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h });
  // PRS's rule is a warranty condition, not a physical one -- warn, do not block
  return [r.disabled === false && r.warnHidden === false && r.motorTotalHidden,
          `add enabled=${!r.disabled}, warning shown=${!r.warnHidden}`];
});

check("choosing a motor prices it into the paño", () => {
  const r = price({ tableIndex: WELL, w: MOTO.w, h: MOTO.h, motorIndex: 3 });
  return [r.warnHidden === true
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
  return [r.motorTotalHidden && !r.warnHidden,
          `next paño starts with no motor, warning back=${!r.warnHidden}`];
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

/* ------------------- complementos: per paño and per project ------------------ */
const ADDONS = (CATALOG.find(t => t.type === "addon_options") || {}).groups || [];
const grp = k => ADDONS.find(g => g.kind === k);

function panoAt(w, h) {                       // a fresh calculator on one paño
  const f = boot();
  f.get("fabricSel").value = "0:0";
  f.get("heightInp").value = String(h);
  f.get("widthInp").value = String(w);
  f.get("widthInp").fire("input");
  return f;
}

check("the add-on catalogue exposes every kind with items", () => {
  const want = ["motor", "cenefa", "riel", "perfil", "componente", "control"];
  const missing = want.filter(k => !grp(k) || !grp(k).items.length);
  return [missing.length === 0,
          ADDONS.map(g => `${g.kind}(${g.items.length})`).join(" ")];
});

check("drapery tracks are kept out of the shade add-ons", () => {
  const bad = ADDONS.filter(g => (g.applies_to || "shade") === "shade")
    .flatMap(g => g.items)
    .filter(i => /riel hd|coulisse negro|rieles manuales|balineras/i.test(i.label));
  return [bad.length === 0,
          bad.length ? `leaked: ${bad[0].label}` : "curtain rails only on curtains"];
});

check("a width-priced cenefa is looked up on the paño's width", () => {
  const f = panoAt(60, 72);
  const before = f.parseMoney(f.get("lpValue").textContent);
  f.addAddon("pano", { kind: "cenefa", itemIndex: 1 });
  const item = grp("cenefa").items[1];
  const col = item.widths_in.findIndex(x => x >= 60);
  const want = before + item.prices[col];
  return [near(f.parseMoney(f.get("lpValue").textContent), want),
          `${item.label} at 60" -> ${item.prices[col]}`];
});

check("a per-foot perfil multiplies by the paño's feet", () => {
  const f = panoAt(60, 72);                   // 72" high = 6 ft
  const before = f.parseMoney(f.get("lpValue").textContent);
  const item = grp("perfil").items.find(i => i.basis === "height_ft");
  const idx = grp("perfil").items.indexOf(item);
  f.addAddon("pano", { kind: "perfil", itemIndex: idx });
  return [near(f.parseMoney(f.get("lpValue").textContent), before + item.price * 6),
          `${item.price} × 6 ft = ${(item.price * 6).toFixed(2)}`];
});

check("a per-piece perfil is not multiplied by any dimension", () => {
  const f = panoAt(60, 72);
  const before = f.parseMoney(f.get("lpValue").textContent);
  const item = grp("perfil").items.find(i => i.basis === "each");
  const idx = grp("perfil").items.indexOf(item);
  f.addAddon("pano", { kind: "perfil", itemIndex: idx });
  return [near(f.parseMoney(f.get("lpValue").textContent), before + item.price),
          `${item.label} stays ${item.price}`];
});

check("the same add-on can be added more than once", () => {
  const f = panoAt(60, 72);
  const before = f.parseMoney(f.get("lpValue").textContent);
  const item = grp("componente").items[0];
  f.addAddon("pano", { kind: "componente", itemIndex: 0 });
  f.addAddon("pano", { kind: "componente", itemIndex: 0, qty: 2 });
  return [near(f.parseMoney(f.get("lpValue").textContent), before + item.price * 3),
          `3 × ${item.price} across two entries`];
});

check("a custom line adds its own description and price", () => {
  const f = panoAt(60, 72);
  const before = f.parseMoney(f.get("lpValue").textContent);
  f.addAddon("pano", { kind: "personalizado",
                       customName: "Mano de obra especial", customPrice: 45 });
  return [near(f.parseMoney(f.get("lpValue").textContent), before + 45)
          && f.get("panoAddonList").innerHTML.includes("Mano de obra especial"),
          `+45 -> ${f.get("lpValue").textContent}`];
});

check("changing the size re-prices a width-based add-on", () => {
  const f = panoAt(60, 72);
  f.addAddon("pano", { kind: "cenefa", itemIndex: 1 });
  const at60 = f.parseMoney(f.get("lpValue").textContent);
  f.get("widthInp").value = "120";
  f.get("widthInp").fire("input");
  const item = grp("cenefa").items[1];
  const c60 = item.prices[item.widths_in.findIndex(x => x >= 60)];
  const c120 = item.prices[item.widths_in.findIndex(x => x >= 120)];
  const at120 = f.parseMoney(f.get("lpValue").textContent);
  return [c120 !== c60 && at120 !== at60,
          `cenefa ${c60} at 60" -> ${c120} at 120", not left stale`];
});

check("complementos clear after the paño is added", () => {
  const f = panoAt(60, 72);
  f.addAddon("pano", { kind: "componente", itemIndex: 0 });
  f.addAndTotal();
  return [f.get("panoAddonList").innerHTML === "",
          "next paño starts empty"];
});

check("complementos reach the quote line and its total", () => {
  const f = panoAt(60, 72);
  const base = f.parseMoney(f.get("lpValue").textContent);
  const item = grp("componente").items[0];
  f.addAddon("pano", { kind: "componente", itemIndex: 0 });
  const t = f.addAndTotal();
  return [t.items.includes(item.label)
          && near(f.parseMoney(t.subtotal), base + item.price),
          `line names it; subtotal ${t.subtotal}`];
});

check("controls are available as a paño complemento", () => {
  const g = grp("control");
  const f = panoAt(60, 72);
  const before = f.parseMoney(f.get("lpValue").textContent);
  f.addAddon("pano", { kind: "control", itemIndex: 2, qty: 2 });
  return [g.scope === "pano"
          && near(f.parseMoney(f.get("lpValue").textContent),
                  before + g.items[2].price * 2),
          `${g.items[2].label} × 2 on the paño`];
});

check("there is no separate project-items section any more", () => {
  const f = boot();
  const gone = f.get("jobAddonList").innerHTML === ""
            && f.get("jobKindDrop").children.length === 0;
  return [gone, "project section removed; everything is per paño"];
});

check("a custom complemento carries its own name", () => {
  const f = panoAt(60, 72);
  f.addAddon("pano", { kind: "personalizado",
                       customName: "Refuerzo estructural", customPrice: 30 });
  const html = f.get("panoAddonList").innerHTML;
  return [html.includes("Refuerzo estructural"),
          "name shown, not the category"];
});

check("a custom complemento keeps name and description apart", () => {
  const f = panoAt(60, 72);
  f.addAddon("pano", { kind: "personalizado", customName: "Refuerzo",
                       customDesc: "perfil extra en el cabezal", customPrice: 30 });
  const html = f.get("panoAddonList").innerHTML;
  const t = f.addAndTotal();
  return [html.includes("Refuerzo") && html.includes("perfil extra")
          && t.items.includes("Refuerzo") && t.items.includes("perfil extra"),
          "name is the label, description is the detail"];
});

check("a custom complemento without a name is refused", () => {
  const f = panoAt(60, 72);
  const before = f.parseMoney(f.get("lpValue").textContent);
  f.addAddon("pano", { kind: "personalizado", customName: "", customPrice: 30 });
  return [near(f.parseMoney(f.get("lpValue").textContent), before)
          && f.get("panoAddonList").innerHTML === "",
          "nothing added without a name"];
});

check("no cortina de tela hardware is offered on a shade", () => {
  const pat = /movelite|glydea|ripplefold|pinch pleat|master carrier|huesitos|balinera|coulisse negro|riel hd|bracket de pared|riel el.ctrico|riel de bater/i;
  const f = panoAt(60, 72);              // a Roller paño
  const kinds = f.get("panoKindDrop").querySelector(".cs-menu").children
                 .map(c => c.dataset.value);
  const leaked = ADDONS.filter(g => kinds.includes(g.kind))
                       .flatMap(g => g.items.map(i => [g.kind, i.label]))
                       .filter(([, l]) => pat.test(l));
  return [leaked.length === 0,
          leaked.length ? `leaked: ${leaked[0][1]}` : `shade kinds: ${kinds.join(", ")}`];
});

check("the extra-items list defaults to Personalizado", () => {
  const f = boot();
  const kinds = f.get("extraKindDrop").querySelector(".cs-menu")
                 .children.map(c => c.dataset.value);
  return [kinds[0] === "personalizado", kinds.join(", ")];
});

check("extra items offer only kinds that price without a paño", () => {
  const f = boot();
  const kinds = f.get("extraKindDrop").querySelector(".cs-menu")
                 .children.map(c => c.dataset.value);
  const dimensional = ["cenefa", "riel", "perfil"].filter(k => kinds.includes(k));
  return [dimensional.length === 0,
          dimensional.length ? `offered without a size: ${dimensional}` : kinds.join(", ")];
});

check("a custom extra item reaches the quote and the subtotal", () => {
  const f = panoAt(60, 72);
  f.addAndTotal();
  const base = f.parseMoney(f.get("qdSubtotal").textContent);
  f.addAddon("extra", { kind: "personalizado", customName: "Flete e instalación",
                        customDesc: "Costa del Este", customPrice: 120 });
  const html = f.get("qdItems").innerHTML;
  return [near(f.parseMoney(f.get("qdSubtotal").textContent), base + 120)
          && html.includes("Flete e instalación") && html.includes("Costa del Este"),
          `subtotal ${f.get("qdSubtotal").textContent}, name and detail both shown`];
});

check("a catalogue item can be added as an extra on its own", () => {
  const f = boot();
  const item = grp("control").items[2];
  f.addAddon("extra", { kind: "control", itemIndex: 2, qty: 2 });
  return [near(f.parseMoney(f.get("qdSubtotal").textContent), item.price * 2)
          && f.get("qdItems").innerHTML.includes(item.label),
          `${item.label} × 2 with no paño present`];
});

check("extra items are taxed with everything else", () => {
  const f = panoAt(60, 72);
  f.addAndTotal();
  f.addAddon("extra", { kind: "personalizado",
                        customName: "Flete", customPrice: 100 });
  const sub = f.parseMoney(f.get("qdSubtotal").textContent);
  return [near(f.parseMoney(f.get("qdTax").textContent), sub * 0.07),
          `tax ${f.get("qdTax").textContent} of ${f.get("qdSubtotal").textContent}`];
});

check("removing an extra item takes it off the total", () => {
  const f = boot();
  f.addAddon("extra", { kind: "personalizado", customName: "Temporal",
                        customPrice: 75 });
  const withIt = f.parseMoney(f.get("qdSubtotal").textContent);
  // the handler is delegated on qdItems, and the stub does not bubble
  const btn = f.get("qdItems").children.find(c => c.className.includes("extra-del"));
  f.get("qdItems").fireWith("click", btn);
  return [near(withIt, 75) && f.parseMoney(f.get("qdSubtotal").textContent) === 0,
          `75 -> ${f.get("qdSubtotal").textContent}`];
});

/* ------------- September 2026 list: new families, rules and limits ------------- */
const tIdx = name => CATALOG.findIndex(t => t.name === name);
const FLO = tIdx("Cortinas de Tela - FLO / CIELO / BRISA / AURA (Onda o Ripplefold)");
const PURE = CATALOG.findIndex(t => t.type === "fabric_matrix" && t.name.includes("Pure Wood"));
const inFamilyWith = (cat, req) => CATALOG.findIndex(t => t.type === "fabric_matrix"
  && t.category === cat && t.requirements.some(r => r.includes(req)));
const ROMAN_M = inFamilyWith("Roman Shades", "motorization");
const HORIZ_M = inFamilyWith("Horizontales", "motorization");
const menuOf = (f, id) => f.get(id).querySelector(".cs-menu").children.map(c => c.dataset.value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check("families are offered in price-list order, new ones included", () => {
  const fams = menuOf(boot(), "familyDrop");
  const want = ["Roller Shades", "Sheer Elegance", "Manhattan", "Cortinas de Tela",
                "Roman Shades", "Honeycomb", "Toldos", "Panel Track", "Horizontales"];
  return [same(fams, want), fams.join(" · ")];
});

check("a Roman Shades motorisation cell offers the motor list and prices it", () => {
  const c = cellWith(ROMAN_M, "motorization");
  const r = price({ tableIndex: ROMAN_M, w: c.w, h: c.h, motorIndex: 3 });
  return [r.motorShown && !r.motorFieldHidden
          && near(parseMoney(r.display), c.base + MOTORS[3].price),
          `${c.w}"x${c.h}" base ${c.base} + ${MOTORS[3].price} -> ${r.display}`];
});

check("Horizontales motorisation warns but offers no roller tube motor", () => {
  const f = boot();
  const c = cellWith(HORIZ_M, "motorization");
  const r = f.price({ tableIndex: HORIZ_M, w: c.w, h: c.h, motorIndex: 3 });
  return [r.motorShown && r.motorFieldHidden && !r.warnHidden
          && /no incluye un motor/.test(r.warnText)
          && near(parseMoney(r.display), c.base) && !r.disabled,
          `notice shown, no picker, price stays ${r.display} (base ${c.base})`];
});

check("a motor picked on a roller never rides onto a Horizontales paño", () => {
  const f = boot();
  const m = cellWith(WELL, "motorization");
  f.price({ tableIndex: WELL, w: m.w, h: m.h, motorIndex: 4 });
  const c = cellWith(HORIZ_M, "motorization");
  const r = f.price({ tableIndex: HORIZ_M, w: c.w, h: c.h });
  const t = f.addAndTotal();
  return [near(parseMoney(r.display), c.base) && !t.items.includes("Motorización"),
          `Horizontales line ${r.display}, no motor row`];
});

check("a red Horizontales cell warns as beyond capacity and adds nothing", () => {
  const c = cellWith(HORIZ_RED, "exceeds_capacity");
  const r = price({ tableIndex: HORIZ_RED, w: c.w, h: c.h, clutch: 25 });
  return [near(parseMoney(r.display), c.base) && r.badges.includes("Excede la capacidad")
          && r.badges.includes("badge range") && !r.disabled,
          `base ${c.base} -> ${r.display}, red badge, still quotable`];
});

check("the client quote words the capacity rules without PRS's shading language", () => {
  const f = boot();
  const a = cellWith(HORIZ_RED, "exceeds_capacity");
  f.price({ tableIndex: HORIZ_RED, w: a.w, h: a.h });
  f.addAndTotal();
  const b = cellWith(HORIZ, "capacity_limit");
  f.price({ tableIndex: HORIZ, w: b.w, h: b.h });
  const t = f.addAndTotal();
  return [t.notes.includes("exceden la capacidad") && t.notes.includes("límite de capacidad")
          && !/sombreada|amarillo|rojo/i.test(t.notes),
          `${(t.notes.match(/<li>/g) || []).length} notes, no supplier wording`];
});

check("the out-of-sequence Pure Wood 84\" cell keeps PRS's price and is flagged", () => {
  const r = price({ tableIndex: PURE, w: 60, h: 84 });
  return [r.display === "$565.74" && r.badges.includes("fuera de secuencia"),
          `${r.display}, flagged=${r.badges.includes("fuera de secuencia")}`];
});

check("an ordinary Pure Wood cell carries no flag at all", () => {
  const r = price({ tableIndex: PURE, w: 36, h: 36 });
  return [r.display === "$109.64" && r.badges === "", `${r.display}, badges="${r.badges}"`];
});

check("a note the calculator already enforces is not repeated on the panel", () => {
  // "Para garantizar ... no se recomienda fabricarlas fuera de las medidas"
  const z = CATALOG.findIndex(t => t.type === "fabric_matrix"
    && (t.notes || []).some(n => /^Para garantizar la calidad/.test(n)));
  const t = CATALOG[z];
  const r = price({ tableIndex: z, w: t.widths_in[0], h: t.heights_in[0] });
  return [!r.notes.includes("Para garantizar"), `${t.name.slice(0, 40)}: suppressed`];
});

/* cortinas de tela */
check("cortina de tela: an exact cell returns the PDF's price", () => {
  const r = price({ tableIndex: FLO, w: 36, h: 108 });
  return [r.display === "$36.00", `Flo 36x108 -> ${r.display} (PDF 36)`];
});

check("cortina de tela: the base row covers heights up to its printed height", () => {
  const a = price({ tableIndex: FLO, w: 36, h: 100 });
  const b = price({ tableIndex: FLO, w: 36, h: 109 });   // past 108" -> con empates 132"
  return [a.display === "$36.00" && b.display === "$55.00",
          `100" -> ${a.display}, 109" -> ${b.display} (132" row)`];
});

check("cortina de tela: a width between columns rounds up", () => {
  const r = price({ tableIndex: FLO, w: 37, h: 100 });
  return [r.display === "$71.00" && r.meta.includes('64" × 108"'), `${r.display}, ${r.meta}`];
});

check("cortina de tela: two vías price two curtains of half the width", () => {
  const f = boot();
  f.pickOption("familyDrop", "Cortinas de Tela");
  f.setWays(2);
  const r = f.price({ tableIndex: FLO, w: 128, h: 100 });   // 2 × 64" -> 2 × $71
  return [r.display === "$142.00" && r.meta.includes('2 paños de 64"'),
          `128" two-way -> ${r.display}; ${r.meta}`];
});

check("cortina de tela: a two-way line names both paños on the quote", () => {
  const f = boot();
  f.pickOption("familyDrop", "Cortinas de Tela");
  f.setWays(2);
  f.price({ tableIndex: FLO, w: 128, h: 100, qty: 3 });
  const t = f.addAndTotal();
  return [t.items.includes('2 paños · tabla 64"×108"') && t.items.includes("Apertura a 2 vías")
          && near(f.parseMoney(t.subtotal), 142 * 3),
          `subtotal ${t.subtotal} (3 × 142)`];
});

check("cortina de tela: two vías refuse a total width past twice the table", () => {
  const f = boot();
  f.pickOption("familyDrop", "Cortinas de Tela");
  f.setWays(2);
  const r = f.price({ tableIndex: FLO, w: 505, h: 100 });
  return [r.display === "Fuera de rango" && r.meta.includes('504"') && r.disabled,
          r.meta];
});

check("cortina de tela: leaving the family resets the opening to one way", () => {
  const f = boot();
  f.pickOption("familyDrop", "Cortinas de Tela");
  f.setWays(2);
  f.pickOption("familyDrop", "Roller Shades");
  const r = f.price({ tableIndex: FLO, w: 128, h: 100 });   // one way -> 147" column
  return [r.display === "$149.00" && f.get("waysField").hidden,
          `${r.display}, apertura hidden`];
});

check("a curtain is offered curtain hardware only", () => {
  const f = boot();
  f.pickOption("familyDrop", "Cortinas de Tela");
  const k = menuOf(f, "panoKindDrop");
  return [same(k, ["riel_cortina", "riel_motorizado", "accesorio_cortina",
                   "control_cortina", "personalizado"]), k.join(", ")];
});

check("a shade is offered exactly the complementos it always had", () => {
  const k = menuOf(boot(), "panoKindDrop");
  return [same(k, ["motor", "cenefa", "riel", "perfil", "componente", "control",
                   "personalizado"]), k.join(", ")];
});

check("a curtain rail is priced on the full width of a two-way curtain", () => {
  const f = boot();
  f.pickOption("familyDrop", "Cortinas de Tela");
  f.setWays(2);
  f.price({ tableIndex: FLO, w: 128, h: 100 });
  const before = f.parseMoney(f.get("lpValue").textContent);
  const g = grp("riel_cortina");
  const idx = g.items.findIndex(i => i.label === "RIEL HD CON BALINERAS · Riel 2-Vías");
  f.addAddon("pano", { kind: "riel_cortina", itemIndex: idx });
  const item = g.items[idx];
  const rail = item.prices[item.widths_in.findIndex(x => x >= 128)];   // 132" column
  return [near(f.parseMoney(f.get("lpValue").textContent), before + rail),
          `${before} + rail ${rail} at 132" (full width, not 64")`];
});

check("changing family drops complementos that do not apply to it", () => {
  const f = panoAt(60, 72);
  f.addAddon("pano", { kind: "cenefa", itemIndex: 1 });
  const had = f.get("panoAddonList").innerHTML !== "";
  f.pickOption("familyDrop", "Cortinas de Tela");
  return [had && f.get("panoAddonList").innerHTML === "", "cenefa removed on the curtain"];
});

check("every curtain fabric and style is quotable", () => {
  const f = boot();
  f.pickOption("familyDrop", "Cortinas de Tela");
  const opts = menuOf(f, "fabricDrop");
  const bad = opts.filter(v => {
    f.pickOption("fabricDrop", v);
    f.get("heightInp").value = "100"; f.get("widthInp").value = "100";
    f.get("widthInp").fire("input");
    return !/^\$[\d,]+\.\d\d$/.test(f.get("lpValue").textContent);
  });
  return [opts.length === 40 && bad.length === 0, `${opts.length} options, ${bad.length} failed`];
});

/* panel track */
const PTB = CATALOG.find(t => t.type === "panel_track");
const ptRail = (ways, ch) => PTB.rails.findIndex(r => r.ways === ways && r.channels === ch);
const ptTela = name => PTB.telas.findIndex(t => t.name === name);

check("panel track: offers every fabric on PRS's per-yard list", () => {
  const f = boot();
  f.pickOption("familyDrop", "Panel Track");
  const opts = menuOf(f, "fabricDrop");
  return [opts.length === 31 && opts.every(v => v.startsWith("pt:"))
          && !f.get("ptFields").hidden, `${opts.length} fabrics`];
});

check("panel track: rail plus yards at the per-yard price", () => {
  const f = boot();
  const r = f.panelTrack({ telaIndex: ptTela("Zakros"), railIndex: ptRail(1, 2),
                           w: 50, h: 96, yards: 6 });
  // 1 vía 2 canales at 50" = 55.90, Zakros $6.00/yd x 6 = 36.00
  return [r.display === "$91.90" && !r.disabled, `${r.display}; ${r.meta}`];
});

check("panel track: a width between columns rounds up to the next rail size", () => {
  const f = boot();
  const r = f.panelTrack({ telaIndex: ptTela("Zakros"), railIndex: ptRail(1, 2),
                           w: 55, h: 96, yards: 6 });
  return [r.display === "$97.29" && r.meta.includes('tabla 60"'), `${r.display} (61.29 + 36)`];
});

check("panel track: no yards, no price", () => {
  const f = boot();
  const r = f.panelTrack({ telaIndex: 0, railIndex: ptRail(1, 2), w: 50, h: 96, yards: "" });
  return [r.display === "—" && r.disabled && /yardas/.test(r.meta), r.meta];
});

check("panel track: a blank rail cell is Consultar, never the next column", () => {
  const f = boot();
  // 1 vía 4 canales starts at 60"; 50" is blank in the PDF
  const r = f.panelTrack({ telaIndex: 0, railIndex: ptRail(1, 4), w: 50, h: 96, yards: 5 });
  return [r.display === "Consultar" && r.disabled, `${r.display}; ${r.meta}`];
});

check("panel track: beyond the rail table is out of range", () => {
  const f = boot();
  const r = f.panelTrack({ telaIndex: 0, railIndex: ptRail(2, 4), w: 161, h: 96, yards: 5 });
  return [r.display === "Fuera de rango" && r.disabled && r.meta.includes('160"'), r.meta];
});

check("panel track: fractional yards price the fabric to the cent", () => {
  const f = boot();
  const r = f.panelTrack({ telaIndex: ptTela("Wellington"), railIndex: ptRail(1, 2),
                           w: 50, h: 96, yards: 6.333 });
  // 6.333 x 16.00 = 101.328 -> 101.33; + 55.90 = 157.23
  return [r.display === "$157.23", `${r.display}; ${r.meta}`];
});

check("panel track: each panel's width follows PRS's 2\" overlap rule", () => {
  const f = boot();
  const r = f.panelTrack({ telaIndex: 0, railIndex: ptRail(1, 3), w: 90, h: 96,
                           yards: 5, panels: 3 });
  return [r.info.includes('Cada panel: 32"') && r.notes.includes("traslape")
          && r.notes.includes("basta redonda"), r.info];
});

check("panel track: the quote names what is built, not PRS's cost of each part", () => {
  const f = boot();
  f.panelTrack({ telaIndex: ptTela("Zakros"), railIndex: ptRail(1, 2), w: 50, h: 96,
                 yards: 6, qty: 2 });
  const t = f.addAndTotal();
  return [t.items.includes("Zakros") && t.items.includes('riel 50"')
          && t.items.includes("Riel 1 vía · 2 canales · tela 6 yd")
          && !t.items.includes("yd ×") && !t.items.includes("55.90")
          && near(f.parseMoney(t.subtotal), 91.90 * 2),
          `subtotal ${t.subtotal} (2 × 91.90)`];
});

check("panel track: the quote prints exactly the yards it charges", () => {
  const f = boot();
  f.panelTrack({ telaIndex: ptTela("Zakros"), railIndex: ptRail(1, 2), w: 50, h: 96, yards: 6.25 });
  const t = f.addAndTotal();
  // 6.25 x 6.00 = 37.50 + 55.90 -- and the line must say 6.25, not 6.3
  return [t.items.includes("tela 6.25 yd") && near(f.parseMoney(t.subtotal), 93.40),
          `subtotal ${t.subtotal}, line says 6.25 yd`];
});

check("panel track: the yards field clears for the next paño", () => {
  const f = boot();
  f.panelTrack({ telaIndex: 0, railIndex: ptRail(1, 2), w: 50, h: 96, yards: 6 });
  f.addAndTotal();
  return [f.get("ptYards").value === "", "next panel track starts without yards"];
});

check("panel track: ITBMS and margin apply like any paño", () => {
  const f = boot();
  f.get("cfgTax").value = "7";
  f.panelTrack({ telaIndex: ptTela("Zakros"), railIndex: ptRail(1, 2), w: 50, h: 96, yards: 6 });
  f.get("lineMargin").value = "10";
  f.get("lineMargin").fire("input");
  const t = f.addAndTotal();
  const sub = 91.90 * 1.10;
  return [near(f.parseMoney(t.subtotal), sub) && near(f.parseMoney(t.tax), sub * 0.07),
          `subtotal ${t.subtotal}, tax ${t.tax}`];
});

/* drafts saved before this update */
check("a draft saved before this update restores with its totals unchanged", () => {
  const draft = {
    meta: { number: "N.º 2026-12345", date: "01 de septiembre de 2026" },
    client: "Cliente", project: "Proyecto",
    lines: [{ fabric: "Wellington 78” / 118”", category: "Roller Shades",
              reqWidth: 36, reqHeight: 42, askW: 36, askH: 42, qty: 2,
              unitPrice: 18.39, req: null, motor: null, addons: [],
              mount: "Interior", install: false, lineMargin: 0, lineMarginMode: "pct" }],
    extras: [], cfg: { tax: "7", clutch: "25", install: "0", margin: "0" },
    marginMode: "pct",
  };
  const f = boot({ draft });
  return [f.get("qdItems").innerHTML.includes('tabla 36"×42"')
          && near(f.parseMoney(f.get("qdSubtotal").textContent), 36.78),
          `restored line reads "tabla 36"×42"", subtotal ${f.get("qdSubtotal").textContent}`];
});

out.forEach(r => console.log(JSON.stringify(r)));
