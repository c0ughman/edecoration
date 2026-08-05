/* Edecoration / PRS internal quoting calculator
   Data comes from data/catalog.js (window.PRS_CATALOG).               */
(function () {
  "use strict";

  const CATALOG = window.PRS_CATALOG || [];
  const FABRICS = CATALOG.filter(t => t.type === "fabric_matrix" && t.prices.length);

  // ---- element refs ----
  const $ = id => document.getElementById(id);
  const familySel = $("familySel"), fabricSel = $("fabricSel");
  const widthInp = $("widthInp"), heightInp = $("heightInp"), qtyInp = $("qtyInp");
  const mountSel = $("mountSel"), installChk = $("installChk");
  const lineMarginInp = $("lineMargin");
  const lpValue = $("lpValue"), lpMeta = $("lpMeta"), reqBadges = $("reqBadges");
  const addBtn = $("addBtn");
  const cfg = { tax: $("cfgTax"), clutch: $("cfgClutch"),
                install: $("cfgInstall"), margin: $("cfgMargin") };

  /* Motors, with PRS's own prices. A motorised paño used to add whatever was
     typed into a settings box -- which shipped at 0, so a quote could say
     "requires motorization" and charge nothing for it. The motor is now an
     explicit choice from the price list. */
  const MOTORS = (CATALOG.find(t => t.type === "motor_options") || {}).items || [];
  let motor = null;                 // the motor chosen for the current paño

  /* Add-ons: everything that hangs off a paño or off the job. The extractor
     normalises three pricing modes so the UI does not need to know how each
     table was laid out in the PDF:
       flat      price as-is
       width     looked up by the paño's width, like the fabric
       per_foot  price x feet of the paño's height or width
     "Personalizado" is a free-text line for anything not in the price list. */
  const ADDONS = (CATALOG.find(t => t.type === "addon_options") || {}).groups || [];
  const CUSTOM_KIND = "personalizado";
  const groupOf = kind => ADDONS.find(g => g.kind === kind);
  const kindsFor = scope => [
    ...ADDONS.filter(g => g.scope === scope),
    { kind: CUSTOM_KIND, label: "Personalizado", pricing: "flat", items: [] },
  ];

  /* Unit price of one add-on for a given paño, or null if it cannot be priced
     at that size. Frozen onto the line when added, like the paño itself. */
  function addonUnitPrice(group, item, dims) {
    if (group.kind === CUSTOM_KIND) return item.price;
    if (group.pricing === "flat") return item.price;
    if (group.pricing === "width") {
      if (!dims) return null;
      const i = pickIndex(item.widths_in, dims.w);
      return i < 0 ? null : item.prices[i];
    }
    if (group.pricing === "per_foot") {
      if (item.basis === "each") return item.price;
      if (!dims) return null;
      const inches = item.basis === "height_ft" ? dims.h : dims.w;
      return item.price * Math.ceil(inches / 12);   // extrusion sells by the foot
    }
    return null;
  }

  /* What to print under the add-on so the number is explainable. */
  function addonDetail(group, item, dims) {
    if (group.pricing === "width" && dims) {
      const i = pickIndex(item.widths_in, dims.w);
      return i < 0 ? "" : `tabla ${item.widths_in[i]}"`;
    }
    if (group.pricing === "per_foot" && item.basis !== "each" && dims) {
      const inches = item.basis === "height_ft" ? dims.h : dims.w;
      const ft = Math.ceil(inches / 12);
      return `${ft} pie${ft === 1 ? "" : "s"} de ${item.basis === "height_ft" ? "alto" : "ancho"}`;
    }
    return "";
  }

  /* Shaded-cell requirements.
     The extractor decides what a shading colour means per table (the same
     yellow is "clutch Large" on Roller pages and "bottomrail (Delfin)" on Axio
     pages) and emits a stable key plus PRS's own wording in
     table.requirement_legend. Everything the UI does with a requirement is
     driven from here -- an unknown key still renders a badge and still reaches
     the quote rather than disappearing. */
  const REQUIREMENTS = {
    clutch_large: {
      label: "clutch Large", cls: "clutch",
      cost: () => num(cfg.clutch.value),
    },
    motorization: {
      label: "motorización", cls: "motor",
      cost: () => 0,               // priced by the chosen motor, not a guess
    },
    bottomrail_delfin: {
      label: "bottomrail (Delfin) · sólo por pedido", cls: "order",
      cost: () => 0,
    },
    thin_fabric_smiles: {
      label: "tela delgada · puede presentar sonrisas", cls: "warn",
      cost: () => 0,
    },
  };
  const reqInfo = key => key
    ? (REQUIREMENTS[key] || { label: key, cls: "warn", cost: () => 0 })
    : null;

  // ---- custom dropdowns ----
  function initCustomSelect(dropId, hiddenSel, onChange) {
    const drop = $(dropId);
    const trigger = drop.querySelector(".cs-trigger");
    const valueEl = drop.querySelector(".cs-value");
    const menu = drop.querySelector(".cs-menu");

    function open() {
      menu.hidden = false;
      drop.classList.add("open");
      document.addEventListener("click", outsideClick, true);
    }
    function close() {
      menu.hidden = true;
      drop.classList.remove("open");
      document.removeEventListener("click", outsideClick, true);
    }
    function outsideClick(e) {
      if (!drop.contains(e.target)) close();
    }
    trigger.addEventListener("click", e => {
      e.stopPropagation();
      drop.classList.contains("open") ? close() : open();
    });
    drop._setValue = function(val, label) {
      valueEl.textContent = label;
      hiddenSel.value = val;
      menu.querySelectorAll(".cs-option").forEach(o =>
        o.classList.toggle("selected", o.dataset.value === val));
    };
    drop._rebuild = function(opts) { // opts = [{value, label}]
      // sync hidden select so .value reads back correctly
      hiddenSel.innerHTML = opts.map(o =>
        `<option value="${o.value}">${o.label}</option>`).join("");
      menu.innerHTML = opts.map(o =>
        `<button class="cs-option" data-value="${o.value}" type="button">${o.label}</button>`
      ).join("");
      menu.querySelectorAll(".cs-option").forEach(btn => {
        btn.addEventListener("click", () => {
          drop._setValue(btn.dataset.value, btn.textContent);
          close();
          if (onChange) onChange(btn.dataset.value);
        });
      });
      if (opts.length) drop._setValue(opts[0].value, opts[0].label);
    };
    // static options (mount): wire existing buttons
    menu.querySelectorAll(".cs-option").forEach(btn => {
      btn.addEventListener("click", () => {
        drop._setValue(btn.dataset.value, btn.textContent);
        close();
        if (onChange) onChange(btn.dataset.value);
      });
    });
  }

  initCustomSelect("familyDrop", familySel, val => { familySel.value = val; buildFabrics(); });
  initCustomSelect("fabricDrop", fabricSel, val => { fabricSel.value = val; compute(); });
  initCustomSelect("mountDrop", mountSel, () => compute());
  initCustomSelect("motorDrop", $("motorSel"), val => {
    motor = val === "" ? null : MOTORS[+val];
    compute();
  });
  // remove native-select change listeners — custom dropdowns handle changes above

  let unit = "in";
  let marginMode = "pct";      // universal margin: "pct" or "fixed"
  let lineMarginMode = "pct";  // per-paño margin: "pct" or "fixed"
  let current = null;          // current computed line preview
  const lines = [];            // quote line items
  const panoAddons = [];       // complementos for the paño being configured
  let panoPicker = null;

  // ---------- helpers ----------
  const money = n => "$" + (n || 0).toLocaleString("en-US",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const toIn = v => unit === "cm" ? v / 2.54 : v;

  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // round UP to the next listed size; returns index or -1 if over range
  function pickIndex(sortedVals, target) {
    for (let i = 0; i < sortedVals.length; i++)
      if (sortedVals[i] >= target - 1e-6) return i;
    return -1;
  }

  // ---------- populate selectors ----------
  function buildFamilies() {
    const fams = [...new Set(FABRICS.map(f => f.category))];
    $("familyDrop")._rebuild(fams.map(f => ({ value: f, label: f })));
    familySel.value = fams[0] || "";
    buildFabrics();
  }
  /* One PRS table often prices several fabrics that happen to cost the same
     ("Zakros 110” / Stratos 110” / Paros 110”"). They are separate products,
     so each gets its own entry and a quote names only the one chosen. The
     option value is "<table index>:<fabric index>". */
  function buildFabrics() {
    const fam = familySel.value;
    const opts = [];
    CATALOG.forEach((t, ti) => {
      if (t.type !== "fabric_matrix" || t.category !== fam || !t.prices.length) return;
      (t.fabrics && t.fabrics.length ? t.fabrics : [t.name])
        .forEach((name, fi) => opts.push({ value: `${ti}:${fi}`, label: name }));
    });
    opts.sort((a, b) => a.label.localeCompare(b.label, "es"));
    $("fabricDrop")._rebuild(opts);
    fabricSel.value = opts[0]?.value || "";
    compute();
  }

  /* "12:3" -> the table and the single fabric selected within it. */
  function selectedFabric() {
    const parts = String(fabricSel.value || "").split(":");
    const table = CATALOG[+parts[0]];
    if (!table) return { table: null, name: "" };
    const list = table.fabrics && table.fabrics.length ? table.fabrics : [table.name];
    return { table, name: list[+(parts[1] || 0)] || list[0] };
  }

  // ---------- compute current preview ----------
  function compute() {
    current = null;
    reqBadges.innerHTML = "";
    const { table, name: fabricName } = selectedFabric();
    const w = toIn(parseFloat(widthInp.value));
    const h = toIn(parseFloat(heightInp.value));
    const qty = Math.max(1, parseInt(qtyInp.value) || 1);

    // covers the early-return paths below; re-run with the requirement once the
    // cell is known, so a shading caveat appears only when it applies
    renderFabricNotes(table, null, w);
    renderMotorNotice(false);

    if (!table || !w || !h) {
      lpValue.textContent = "—"; lpMeta.textContent = ""; addBtn.disabled = true;
      return;
    }

    const wi = pickIndex(table.widths_in, w);
    const hi = pickIndex(table.heights_in, h);

    if (wi < 0 || hi < 0) {
      lpValue.textContent = "Fuera de rango";
      lpMeta.textContent = `Máximo ${Math.max(...table.widths_in)}" ancho × ${Math.max(...table.heights_in)}" alto`;
      reqBadges.innerHTML = `<span class="badge range">⚠ Medida fuera de tabla · cotizar manualmente</span>`;
      addBtn.disabled = true;
      return;
    }

    const unitPrice = table.prices[hi][wi];
    if (unitPrice == null) {
      lpValue.textContent = "Consultar";
      lpMeta.textContent = "Celda sin precio en la lista";
      addBtn.disabled = true;
      return;
    }

    const req = table.requirements[hi][wi];
    const needsMotor = req === "motorization";
    // moving off a motorised cell must drop the motor, not carry it silently
    if (!needsMotor) clearMotor();
    renderMotorNotice(needsMotor, table, req, qty);

    // the size may have changed since a complemento was added
    repriceAddons(panoAddons, { w, h });
    if (panoPicker) { panoPicker.render(); panoPicker.refresh(); }

    current = {
      table, fabric: fabricName, category: table.category,
      reqWidth: table.widths_in[wi], reqHeight: table.heights_in[hi],
      askW: round1(w), askH: round1(h), qty, unitPrice, req,
      motor: needsMotor ? motor : null,
      addons: panoAddons.map(a => ({ ...a })),
      mount: mountSel.value, install: installChk.checked,
      lineMargin: num(lineMarginInp.value), lineMarginMode,
    };

    const finalUnit = lineUnit(current);
    lpValue.textContent = money(finalUnit);
    const bits = [`Tabla ${table.widths_in[wi]}" × ${table.heights_in[hi]}"`,
                  `${qty} ud`];
    if (current.motor) bits.push(`tela ${money(unitPrice)} + motor ${money(current.motor.price)}`);
    bits.push(`${money(finalUnit * qty)} subtotal`);
    lpMeta.textContent = bits.join(" · ");

    const info = reqInfo(req);
    // the motor notice says this far more loudly; a pill as well is just noise
    if (info && !needsMotor) addBadge(info.cls, "Requiere " + info.label);
    renderFabricNotes(table, req, w);
    // PRS's requirement is a warranty condition, not a physical one: the paño
    // can be sold manual, it just loses its warranty. So warn loudly, but let
    // it through -- the notice above is what stops the motor being forgotten.
    addBtn.disabled = false;
  }

  /* PRS's blanket cost disclaimer. True of every table at all times, so it
     tells the person quoting nothing about the paño in front of them. */
  const BOILERPLATE = /LOS COSTOS PUEDEN VARIAR/i;
  /* "Si la roller mide más de 108” de ancho, el alto máximo sería de 102”" */
  const WIDTH_RULE = /m[áa]s de\s*(\d+)\s*["”'']?\s*de ancho/i;

  /* Which of a table's notes actually bear on the current selection.

     A note that explains a shading colour only matters when this paño's cell
     carries that flag; a note conditioned on a width only matters past that
     width. Anything we cannot classify is kept -- dropping a caveat we do not
     understand is the failure we are trying to avoid. */
  function relevantNotes(table, req, widthIn) {
    if (!table) return [];
    const legend = table.requirement_legend || {};
    const explained = new Set(Object.values(legend));
    const active = req ? legend[req] : null;
    return (table.notes || []).filter(n => {
      if (BOILERPLATE.test(n)) return false;
      if (explained.has(n)) return n === active;
      const m = n.match(WIDTH_RULE);
      if (m) return widthIn != null && widthIn > parseFloat(m[1]);
      return true;
    });
  }

  /* The motorisation notice. Shown only when the chosen cell is shaded for it,
     and it gates "Agregar" until a motor is picked -- adding the paño with no
     motor is precisely the silent under-quote this replaces. */
  /* One picker component, used for the paño section and the project section.
     `dims()` returns the current paño's size for width/per-foot pricing, or
     null at job level where there is no paño to measure against. */
  function makeAddonPicker(prefix, scope, store, dims, onChange) {
    const kinds = kindsFor(scope);
    let kind = kinds[0], item = null;

    const kindDrop = $(prefix + "KindDrop"), itemDrop = $(prefix + "ItemDrop");
    const custom = $(prefix + "Custom");
    const qtyEl = $(prefix + "AddonQty"), listEl = $(prefix + "AddonList");

    function rebuildItems() {
      const isCustom = kind.kind === CUSTOM_KIND;
      custom.hidden = !isCustom;
      itemDrop.hidden = isCustom;
      // a catalogue item is named by what you pick; a custom one needs a name
      // typed in, so it takes the item picker's place in the row
      $(prefix + "CustomTitle").hidden = !isCustom;
      if (isCustom) { item = null; return; }
      const opts = kind.items.map((it, i) => {
        const p = addonUnitPrice(kind, it, dims());
        return { value: String(i),
                 label: p == null ? `${it.label} · —` : `${it.label} · ${money(p)}` };
      });
      itemDrop._rebuild(opts);
      item = kind.items[0] || null;
      itemDrop._setValue("0", opts[0] ? opts[0].label : "Ítem");
    }

    initCustomSelect(prefix + "KindDrop", $(prefix + "KindSel"), val => {
      kind = kinds.find(k => k.kind === val) || kinds[0];
      rebuildItems();
    });
    initCustomSelect(prefix + "ItemDrop", $(prefix + "ItemSel"), val => {
      item = kind.items[+val] || null;
    });
    kindDrop._rebuild(kinds.map(k => ({ value: k.kind, label: k.label })));
    kindDrop._setValue(kinds[0].kind, kinds[0].label);

    $(prefix + "AddonAdd").addEventListener("click", () => {
      const qty = Math.max(1, parseInt(qtyEl.value) || 1);
      let entry = null;
      if (kind.kind === CUSTOM_KIND) {
        const name = $(prefix + "CustomTitle").value.trim();
        const desc = $(prefix + "CustomDesc").value.trim();
        const price = num($(prefix + "CustomPrice").value);
        if (!name) return toast("Escribe el nombre del complemento");
        entry = { kind: CUSTOM_KIND, label: name, price, qty, detail: desc };
        $(prefix + "CustomTitle").value = "";
        $(prefix + "CustomDesc").value = "";
        $(prefix + "CustomPrice").value = "";
      } else {
        if (!item) return;
        const price = addonUnitPrice(kind, item, dims());
        if (price == null)
          return toast("Ese ítem no tiene precio para esta medida");
        // keep the source so a later size change can re-price it
        entry = { kind: kind.kind, label: item.label, price, qty,
                  detail: addonDetail(kind, item, dims()),
                  ref: { kind: kind.kind, idx: kind.items.indexOf(item) } };
      }
      store.push(entry);
      qtyEl.value = "1";
      render();
      onChange();
    });

    function render() {
      listEl.innerHTML = store.map((a, i) => `
        <li>
          <span class="ad-name">${escapeHtml(a.label)}</span>
          ${a.detail ? `<span class="ad-detail">${escapeHtml(a.detail)}</span>` : ""}
          <span class="ad-price">${a.qty > 1 ? a.qty + " × " : ""}${money(a.price)}</span>
          <button class="ad-del" data-i="${i}" type="button" title="Quitar">×</button>
        </li>`).join("");
    }

    listEl.addEventListener("click", e => {
      const b = e.target.closest ? e.target.closest(".ad-del") : null;
      if (!b) return;
      store.splice(+b.dataset.i, 1);
      render();
      onChange();
    });

    rebuildItems();
    return { render, refresh: rebuildItems };
  }

  const addonsTotal = list =>
    (list || []).reduce((s, a) => s + a.price * a.qty, 0);

  /* Width- and foot-priced add-ons depend on the paño's size, so changing the
     size after adding one has to re-price it rather than leave a stale figure. */
  function repriceAddons(list, dims) {
    let dropped = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (!a.ref) continue;                       // custom or flat, nothing to do
      const g = groupOf(a.ref.kind);
      if (!g || g.pricing === "flat") continue;
      const item = g.items[a.ref.idx];
      const p = addonUnitPrice(g, item, dims);
      if (p == null) { list.splice(i, 1); dropped++; continue; }
      a.price = p;
      a.detail = addonDetail(g, item, dims);
    }
    if (dropped) toast("Se quitó un complemento sin precio para esta medida");
    return dropped;
  }

  function clearMotor() {
    motor = null;
    if ($("motorSel")) $("motorSel").value = "";
    const drop = $("motorDrop");
    if (drop && drop._setValue) drop._setValue("", "Elegir motor");
  }

  function renderMotorNotice(required, table, req, qty) {
    const box = $("motorNotice");
    if (!box) return;
    box.hidden = !required;
    // note this never clears the selection: compute() runs it once defensively
    // before the cell is known, and clearing there would discard the motor the
    // user just picked (choosing one re-enters compute)
    if (!required) return;

    // PRS's own sentence, so the reason comes from the price list not from us
    $("motorWhy").textContent = (table.requirement_legend || {})[req] || "";

    const chosen = motor;
    $("motorTotal").hidden = !chosen;
    $("motorWarn").hidden = !!chosen;
    if (chosen) {
      $("motorTotalValue").textContent = money(chosen.price * qty);
      $("motorTotalSub").textContent = qty > 1
        ? `${money(chosen.price)} × ${qty} ud` : "por paño";
    }
  }

  function renderFabricNotes(table, req, widthIn) {
    const el = $("fabricNotes");
    if (!el) return;
    let ns = relevantNotes(table, req, widthIn);
    // the motor notice already prints this sentence in full, prominently
    if (req === "motorization" && table) {
      const shown = (table.requirement_legend || {})[req];
      ns = ns.filter(n => n !== shown);
    }
    el.innerHTML = ns.length
      ? `<ul>${ns.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : "";
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  const round1 = n => Math.round(n * 10) / 10;
  function addBadge(cls, txt) {
    reqBadges.insertAdjacentHTML("beforeend", `<span class="badge ${cls}">● ${txt}</span>`);
  }

  // ---------- quote lines ----------
  function addLine() {
    if (!current) return;
    lines.push({ ...current });
    lineMarginInp.value = "0";
    // the next paño must choose its own motor and complementos, not inherit
    clearMotor();
    panoAddons.length = 0;
    if (panoPicker) panoPicker.render();
    renderQuote();
    toast("Paño agregado a la cotización");
  }

  function renderQuote() {
    const body = $("qdItems");
    if (!lines.length) {
      body.innerHTML = `<tr class="qd-empty"><td colspan="6">Aún no has agregado paños a la cotización.</td></tr>`;
    } else {
      body.innerHTML = lines.map((l, idx) => {
        const tags = [];
        const info = reqInfo(l.req);
        if (info) tags.push(`<span class="tag ${info.cls}">${escapeHtml(info.label)}</span>`);
        if (l.install) tags.push(`<span class="tag motor">instalación</span>`);
        // data-label drives the stacked card layout on narrow screens, where
        // the header row is hidden and each cell prints its own label
        return `<tr>
          <td class="cell-desc">
            <div class="desc-main">${l.fabric}</div>
            <div class="desc-sub">${l.category} · ${l.mount} ${tags.join(" ")}</div>
            ${l.motor ? `<div class="desc-motor">Motor ${escapeHtml(l.motor.label)}
              · <b>${money(l.motor.price)}</b> c/u</div>` : ""}
            ${(l.addons || []).map(a => `<div class="desc-addon">${escapeHtml(a.label)}${
              a.detail ? ` <span class="desc-sub">(${escapeHtml(a.detail)})</span>` : ""}
              · ${a.qty > 1 ? a.qty + " × " : ""}<b>${money(a.price)}</b></div>`).join("")}
          </td>
          <td data-label="Medida">${l.askW}×${l.askH}<div class="desc-sub">tabla ${l.reqWidth}"×${l.reqHeight}"</div></td>
          <td class="num" data-label="Cant.">${l.qty}</td>
          <td class="num" data-label="P. unit.">${money(lineUnit(l))}</td>
          <td class="num" data-label="Total">${money(lineUnit(l) * l.qty)}</td>
          <td class="act"><button class="row-del" data-i="${idx}" title="Quitar">×</button></td>
        </tr>`;
      }).join("");
    }
    computeTotals();
  }

  // unit price incl. per-paño add-ons (hardware + install + per-paño margin)
  function lineUnit(l) {
    let p = l.unitPrice;
    const info = reqInfo(l.req);
    if (info) p += info.cost();
    if (l.motor) p += l.motor.price;          // one motor per paño
    p += addonsTotal(l.addons);               // complementos, per paño
    if (l.install) p += num(cfg.install.value);
    if (l.lineMargin > 0)
      p += l.lineMarginMode === "fixed" ? l.lineMargin : p * l.lineMargin / 100;
    return p;
  }
  const num = v => parseFloat(v) || 0;

  function computeTotals() {
    let subtotal = lines.reduce((s, l) => s + lineUnit(l) * l.qty, 0);
    const marginVal = num(cfg.margin.value);
    const margin = marginMode === "fixed" ? marginVal : subtotal * marginVal / 100;
    const taxPct = num(cfg.tax.value);
    const taxable = subtotal + margin;
    const tax = taxable * taxPct / 100;
    const total = taxable + tax;

    $("qdSubtotal").textContent = money(subtotal);
    $("qdMarginRow").hidden = marginVal <= 0;
    $("qdMargin").textContent = money(margin);
    $("qdTaxLabel").textContent = `ITBMS (${taxPct}%)`;
    $("qdTax").textContent = money(tax);
    $("qdTotal").textContent = money(total);

    renderNotes();
  }

  /* The quote goes to the client, so it carries only what the client needs to
     know. PRS's own sentences talk about shaded cells in a supplier price list
     and how to build a wide roller -- internal manufacturing language that has
     no place on a customer document. Those stay in the tool, on the fabric
     panel and in the motorisation notice, where the person quoting sees them. */
  function renderNotes() {
    const notes = [];
    // one bullet per distinct requirement actually present in the quote
    const seen = new Set();
    lines.forEach(l => {
      const info = reqInfo(l.req);
      if (!info || seen.has(l.req)) return;
      seen.add(l.req);
      notes.push(`Una o más medidas requieren <b>${escapeHtml(info.label)}</b>.`);
    });
    notes.push("Precios sujetos a verificación de medidas en sitio.");
    $("qdNotes").innerHTML = notes.length
      ? `<h4>Notas</h4><ul>${notes.map(n => `<li>${n}</li>`).join("")}</ul>` : "";
  }

  // ---------- header meta ----------
  function refreshMeta() {
    const d = new Date();
    $("qdNumber").textContent = "N.º " + d.getFullYear() + "-" +
      String(Math.floor(d.getTime() / 1000) % 100000).padStart(5, "0");
    $("qdDate").textContent = d.toLocaleDateString("es-PA",
      { day: "2-digit", month: "long", year: "numeric" });
    syncClient();
  }
  function syncClient() {
    $("qdClient").textContent = $("clientName").value.trim() || "—";
    $("qdProject").textContent = $("projectName").value.trim() || "—";
  }

  // ---------- exports ----------
  function quoteText() {
    const L = [];
    L.push("EDECORATION S.A. — COTIZACIÓN");
    L.push($("qdNumber").textContent + "  ·  " + $("qdDate").textContent);
    L.push("Cliente: " + $("qdClient").textContent);
    L.push("Proyecto: " + $("qdProject").textContent);
    L.push("".padEnd(56, "─"));
    lines.forEach(l => {
      L.push(`${l.qty} × ${l.fabric}  (${l.askW}×${l.askH} → tabla ${l.reqWidth}"×${l.reqHeight}")`);
      const extras = [];
      const info = reqInfo(l.req);
      if (info) extras.push(info.label);
      if (l.motor) extras.push(`${l.motor.label} ${money(l.motor.price)}`);
      (l.addons || []).forEach(a => extras.push(
        `${a.label}${a.qty > 1 ? ` x${a.qty}` : ""} ${money(a.price)}`));
      if (l.install) extras.push("instalación");
      if (extras.length) L.push("    + " + extras.join(", "));
      L.push("    " + money(lineUnit(l)) + " c/u   =   " + money(lineUnit(l) * l.qty));
    });
    L.push("".padEnd(56, "─"));
    L.push("Subtotal:  " + $("qdSubtotal").textContent);
    if (!$("qdMarginRow").hidden) L.push("Margen:    " + $("qdMargin").textContent);
    L.push($("qdTaxLabel").textContent + ":  " + $("qdTax").textContent);
    L.push("TOTAL:     " + $("qdTotal").textContent);
    return L.join("\n");
  }

  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function fileBase() {
    const c = ($("clientName").value.trim() || "cotizacion").replace(/[^\w]+/g, "-").toLowerCase();
    return "edecoration-" + c;
  }

  async function canvasOfQuote() {
    return html2canvas($("quoteDoc"), { scale: 2, backgroundColor: "#fffefb" });
  }

  function guardEmpty() {
    if (!lines.length) { toast("Agrega al menos un paño primero"); return true; }
    return false;
  }

  async function exportImg() {
    if (guardEmpty()) return;
    const canvas = await canvasOfQuote();
    canvas.toBlob(b => download(b, fileBase() + ".png"));
    toast("Imagen descargada");
  }

  async function exportPdf() {
    if (guardEmpty()) return;
    const canvas = await canvasOfQuote();
    const img = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const w = pdf.internal.pageSize.getWidth();
    const h = canvas.height * w / canvas.width;
    pdf.addImage(img, "PNG", 0, 0, w, h);
    pdf.save(fileBase() + ".pdf");
    toast("PDF descargado");
  }

  function exportTxt() {
    if (guardEmpty()) return;
    download(new Blob([quoteText()], { type: "text/plain" }), fileBase() + ".txt");
    toast("Texto descargado");
  }

  // ---------- events ----------
  [widthInp, heightInp, qtyInp, mountSel, installChk, lineMarginInp].forEach(el =>
    el.addEventListener("input", compute));
  Object.values(cfg).forEach(el => el.addEventListener("input", () => { renderQuote(); }));
  $("unitSeg").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    unit = b.dataset.unit;
    [...$("unitSeg").children].forEach(x => x.classList.toggle("active", x === b));
    $("wUnit").textContent = $("hUnit").textContent = "(" + unit + ")";
    compute();
  });
  $("marginModeSeg").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    marginMode = b.dataset.mode;
    [...$("marginModeSeg").children].forEach(x => x.classList.toggle("active", x === b));
    computeTotals();
  });
  $("lineMarginSeg").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    lineMarginMode = b.dataset.mode;
    [...$("lineMarginSeg").children].forEach(x => x.classList.toggle("active", x === b));
    compute();
  });
  // The custom dropdown above drives selection; this keeps the underlying
  // <select> authoritative too, so the field still works if it is set directly.
  $("motorSel").addEventListener("change", e => {
    const i = e.target.value;
    motor = i === "" ? null : MOTORS[+i];
    // keep the visible trigger in step; _setValue does not re-fire change
    const drop = $("motorDrop");
    if (drop && drop._setValue) {
      drop._setValue(i, motor ? `${motor.label} · ${money(motor.price)}`
                              : "Elegir motor");
    }
    compute();
  });
  addBtn.addEventListener("click", addLine);
  $("qdItems").addEventListener("click", e => {
    const row = e.target.closest(".row-del");
    if (row) { lines.splice(+row.dataset.i, 1); renderQuote(); }
  });
  ["clientName", "projectName"].forEach(id => $(id).addEventListener("input", syncClient));
  $("settingsToggle").addEventListener("click", () =>
    $("settingsPanel").hidden = !$("settingsPanel").hidden);
  $("exportPdf").addEventListener("click", exportPdf);
  $("exportImg").addEventListener("click", exportImg);
  $("exportTxt").addEventListener("click", exportTxt);

  // ---------- init ----------
  if (!FABRICS.length) {
    document.querySelector(".config").innerHTML =
      "<p style='color:#9a2b2b'>No se pudo cargar la lista de precios (data/catalog.js).</p>";
    return;
  }
  // the motor list never changes, so build it once (needs money(), so not
  // alongside initCustomSelect above)
  if (MOTORS.length) {
    $("motorDrop")._rebuild(MOTORS.map((m, i) =>
      ({ value: String(i), label: `${m.label} · ${money(m.price)}` })));
    clearMotor();
  }
  // paño-level complementos price against the size currently entered; project
  // items have no paño to measure against, so their pickers get no dims
  panoPicker = makeAddonPicker("pano", "pano", panoAddons,
    () => {
      const w = toIn(parseFloat(widthInp.value));
      const h = toIn(parseFloat(heightInp.value));
      return (w && h) ? { w, h } : null;
    },
    () => compute());
  buildFamilies();
  refreshMeta();
})();
