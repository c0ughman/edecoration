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
  const cfg = { tax: $("cfgTax"), clutch: $("cfgClutch"), motor: $("cfgMotor"),
                install: $("cfgInstall"), margin: $("cfgMargin") };

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
  // remove native-select change listeners — custom dropdowns handle changes above

  let unit = "in";
  let marginMode = "pct";      // universal margin: "pct" or "fixed"
  let lineMarginMode = "pct";  // per-paño margin: "pct" or "fixed"
  let current = null;          // current computed line preview
  const lines = [];            // quote line items

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
  function buildFabrics() {
    const fam = familySel.value;
    const list = FABRICS.filter(f => f.category === fam);
    const opts = list.map(f => ({ value: String(CATALOG.indexOf(f)), label: cleanName(f.name) }));
    $("fabricDrop")._rebuild(opts);
    fabricSel.value = opts[0]?.value || "";
    compute();
  }
  function cleanName(n) {
    return n.replace(/^[^-]+-\s*/, "").trim() || n;   // drop family prefix
  }

  // ---------- compute current preview ----------
  function compute() {
    current = null;
    reqBadges.innerHTML = "";
    const table = CATALOG[+fabricSel.value];
    const w = toIn(parseFloat(widthInp.value));
    const h = toIn(parseFloat(heightInp.value));
    const qty = Math.max(1, parseInt(qtyInp.value) || 1);

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
    current = {
      table, fabric: cleanName(table.name), category: table.category,
      reqWidth: table.widths_in[wi], reqHeight: table.heights_in[hi],
      askW: round1(w), askH: round1(h), qty, unitPrice, req,
      mount: mountSel.value, install: installChk.checked,
      lineMargin: num(lineMarginInp.value), lineMarginMode,
    };

    const finalUnit = lineUnit(current);
    lpValue.textContent = money(finalUnit);
    lpMeta.textContent = `Tabla ${table.widths_in[wi]}" × ${table.heights_in[hi]}" · ${qty} ud · ${money(finalUnit * qty)} subtotal`;

    if (req === "clutch_large")
      addBadge("clutch", "Requiere clutch Large");
    if (req === "motorization")
      addBadge("motor", "Requiere motorización");
    addBtn.disabled = false;
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
        if (l.req === "clutch_large") tags.push(`<span class="tag clutch">clutch Large</span>`);
        if (l.req === "motorization") tags.push(`<span class="tag motor">motorización</span>`);
        if (l.install) tags.push(`<span class="tag motor">instalación</span>`);
        return `<tr>
          <td>
            <div class="desc-main">${l.fabric}</div>
            <div class="desc-sub">${l.category} · ${l.mount} ${tags.join(" ")}</div>
          </td>
          <td>${l.askW}×${l.askH}<div class="desc-sub">tabla ${l.reqWidth}"×${l.reqHeight}"</div></td>
          <td class="num">${l.qty}</td>
          <td class="num">${money(lineUnit(l))}</td>
          <td class="num">${money(lineUnit(l) * l.qty)}</td>
          <td class="act"><button class="row-del" data-i="${idx}" title="Quitar">×</button></td>
        </tr>`;
      }).join("");
    }
    computeTotals();
  }

  // unit price incl. per-paño add-ons (hardware + install + per-paño margin)
  function lineUnit(l) {
    let p = l.unitPrice;
    if (l.req === "clutch_large") p += num(cfg.clutch.value);
    if (l.req === "motorization") p += num(cfg.motor.value);
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

  function renderNotes() {
    const notes = [];
    if (lines.some(l => l.req === "clutch_large"))
      notes.push("Una o más medidas requieren <b>clutch Large</b>.");
    if (lines.some(l => l.req === "motorization"))
      notes.push("Una o más medidas requieren <b>motorización</b> (sin ella no aplica garantía).");
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
      if (l.req === "clutch_large") extras.push("clutch Large");
      if (l.req === "motorization") extras.push("motorización");
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
  addBtn.addEventListener("click", addLine);
  $("qdItems").addEventListener("click", e => {
    const b = e.target.closest(".row-del"); if (!b) return;
    lines.splice(+b.dataset.i, 1); renderQuote();
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
  buildFamilies();
  refreshMeta();
})();
