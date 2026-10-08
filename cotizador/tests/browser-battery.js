/* Runs inside the real cotizador page (see browser.mjs). Each check is one
   "PASS|FAIL name :: detail" line in <pre id="battery">. */
(async () => {
  const R = [], errs = [];
  addEventListener("error", e => errs.push(e.message));
  const ok = (name, cond, detail = "") => R.push([!!cond, name, String(detail)]);
  const $ = id => document.getElementById(id);
  const vis = id => { const el = $(id); return !!el && getComputedStyle(el).display !== "none" && !el.closest("[hidden]"); };
  const shown = el => el && getComputedStyle(el).display !== "none";
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const money = n => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pm = s => parseFloat(String(s).replace(/[$,]/g, ""));
  const near = (a, b) => Math.abs(a - b) < 0.005;
  const pick = (drop, val) => { const o = document.querySelector(`#${drop} .cs-option[data-value="${CSS.escape(String(val))}"]`); if (!o) throw new Error(`no ${drop}=${val}`); o.click(); };
  const set = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new Event("input")); };
  const size = (w, h) => { set("heightInp", String(h)); set("widthInp", String(w)); };
  const C = window.PRS_CATALOG;
  window.confirm = () => true;
  try { localStorage.clear(); } catch (e) {}

  try {
    // ---- families, field visibility, every fabric priced against the catalogue ----
    const fams = [...document.querySelectorAll("#familyDrop .cs-option")].map(b => b.dataset.value);
    ok("families listed", fams.length === 9, fams.join(" | "));
    let priced = 0, wrong = [];
    for (const fam of fams) {
      pick("familyDrop", fam);
      const isPT = fam === "Panel Track", isDrape = fam === "Cortinas de Tela";
      ok(`[${fam}] apertura visible only for curtains`, vis("waysField") === isDrape, vis("waysField"));
      ok(`[${fam}] panel track fields visible only for Panel Track`, vis("ptFields") === isPT, vis("ptFields"));
      const opts = [...document.querySelectorAll("#fabricDrop .cs-option")].map(b => b.dataset.value);
      if (isPT) continue;
      for (const v of opts) {
        const [ti, fi] = v.split(":").map(Number); const t = C[ti];
        let cell = null;
        for (let i = 0; i < t.heights_in.length && !cell; i++)
          for (let j = 0; j < t.widths_in.length; j++)
            if (t.prices[i][j] != null && !t.requirements[i][j] && !(t.price_checks && t.price_checks[i][j])) { cell = [t.widths_in[j], t.heights_in[i], t.prices[i][j]]; break; }
        pick("fabricDrop", v); size(cell[0], cell[1]);
        priced++;
        if ($("lpValue").textContent !== money(cell[2])) wrong.push(`${t.fabrics[fi]} ${cell}: ${$("lpValue").textContent}`);
      }
    }
    ok("every fabric option prices exactly its catalogue cell", wrong.length === 0 && priced === 162, `${priced} priced, wrong: ${wrong.slice(0,3).join("; ")}`);

    // ---- panel track: every fabric and every rail system ----
    pick("familyDrop", "Panel Track");
    const PT = C.find(t => t.type === "panel_track");
    let ptBad = [];
    PT.telas.forEach((tela, i) => {
      pick("fabricDrop", `pt:${i}`);
      PT.rails.forEach((r, ri) => {
        pick("ptSystemDrop", ri);
        const j = r.prices.findIndex(p => p != null);
        set("ptPanels", "2"); set("ptYards", "3.25"); size(r.widths_in[j], 96);
        const want = Math.round((r.prices[j] + Math.round(3.25 * tela.price_per_yard * 100) / 100) * 100) / 100;
        if ($("lpValue").textContent !== money(want)) ptBad.push(`${tela.name} ${ri}: ${$("lpValue").textContent} want ${money(want)}`);
      });
    });
    ok("panel track: 31 fabrics × 5 rail systems all price rail + yards", ptBad.length === 0, ptBad.slice(0, 3).join("; ") || "155 combinations");
    set("ptYards", "");
    ok("panel track: no yards keeps Agregar disabled", $("addBtn").disabled && $("lpValue").textContent === "—", $("lpMeta").textContent);
    pick("fabricDrop", "pt:" + PT.telas.findIndex(t => t.name === "Zakros")); pick("ptSystemDrop", "0");
    set("ptPanels", "2"); set("ptYards", "1.2"); size(50, 96);
    ok("panel track: too few yards to cover the panels is refused", $("addBtn").disabled && $("lpValue").textContent === "Revisar yardas", $("lpMeta").textContent);
    set("ptYards", "6");
    ok("panel track: the rail printed twice warns and quotes the higher", !$("addBtn").disabled && $("lpValue").textContent === "$91.90" && $("reqBadges").textContent.includes("dos precios"), $("reqBadges").textContent);

    // ---- a suspect price: the alert box, real clicks on its two choices ----
    pick("familyDrop", "Horizontales");
    const pw = C.findIndex(t => t.type === "fabric_matrix" && t.name.includes("Pure Wood"));
    pick("fabricDrop", `${pw}:0`); size(60, 84);
    ok("suspect price: alert visible and Agregar disabled", vis("priceAlert") && $("addBtn").disabled && vis("priceAlertWarn"), $("priceAlertWhy").textContent);
    $("priceChoiceNext").click();
    ok("suspect price: 'medida siguiente' quotes $365.48 and enables Agregar", $("lpValue").textContent === "$365.48" && !$("addBtn").disabled && !vis("priceAlertWarn") && $("priceChoiceNext").classList.contains("active"), $("lpValue").textContent);
    $("priceChoiceList").click();
    ok("suspect price: 'precio de la lista' quotes $565.74", $("lpValue").textContent === "$565.74" && !$("addBtn").disabled, $("lpValue").textContent);
    size(36, 36);
    ok("suspect price: the alert goes away on an ordinary cell", !vis("priceAlert") && !$("addBtn").disabled, $("lpValue").textContent);

    // ---- motor notice visibility (computed) ----
    const findCell = (pred, req) => { for (let ti = 0; ti < C.length; ti++) { const t = C[ti]; if (t.type !== "fabric_matrix" || !pred(t)) continue;
      for (let i = 0; i < t.heights_in.length; i++) for (let j = 0; j < t.widths_in.length; j++) if (t.requirements[i][j] === req) return { ti, w: t.widths_in[j], h: t.heights_in[i], p: t.prices[i][j], t }; } };
    const roller = findCell(t => t.category === "Roller Shades", "motorization");
    pick("familyDrop", "Roller Shades"); pick("fabricDrop", `${roller.ti}:0`); size(roller.w, roller.h);
    ok("roller motor cell: notice and picker visible", shown($("motorNotice")) && vis("motorField"), "");
    pick("motorDrop", "3");
    const M = C.find(t => t.type === "motor_options").items;
    ok("roller motor cell: motor priced in", $("lpValue").textContent === money(roller.p + M[3].price), $("lpValue").textContent);
    const hz = findCell(t => t.category === "Horizontales", "motorization");
    pick("familyDrop", "Horizontales"); pick("fabricDrop", `${hz.ti}:0`); size(hz.w, hz.h);
    ok("horizontales motor cell: notice visible, picker hidden, no motor charged",
       shown($("motorNotice")) && !vis("motorField") && $("lpValue").textContent === money(hz.p), $("motorWarn").textContent);

    // ---- complemento custom fields only for Personalizado ----
    pick("familyDrop", "Roller Shades"); size(60, 72);
    ok("custom description/price hidden for catalogue kinds", !vis("panoCustom"), getComputedStyle($("panoCustom")).display);
    pick("panoKindDrop", "personalizado");
    ok("custom description/price shown for Personalizado", vis("panoCustom") && vis("panoCustomTitle"), "");
    pick("panoKindDrop", "motor");

    // ---- curtain complementos and two-way ----
    pick("familyDrop", "Cortinas de Tela");
    const kinds = [...document.querySelectorAll("#panoKindDrop .cs-option")].map(b => b.dataset.value);
    ok("curtain complementos offered", kinds.join(",") === "riel_cortina,riel_motorizado,accesorio_cortina,control_cortina,personalizado", kinds.join(","));
    const flo = C.findIndex(t => t.name === "Cortinas de Tela - FLO / CIELO / BRISA / AURA (Onda o Ripplefold)");
    pick("fabricDrop", `${flo}:0`);
    document.querySelector('#waysSeg button[data-ways="2"]').click();
    size(128, 100);
    ok("2 vías: 2 × $71 = $142", $("lpValue").textContent === "$142.00", $("lpMeta").textContent);

  } catch (e) { errs.push("BATTERY: " + e.message); }

  try {
    $("newQuote").click(); await sleep(50);
    $("cfgTax").value = "7"; $("cfgTax").dispatchEvent(new Event("input"));
    const added = [];
    const add = () => { const v = $("lpValue").textContent; $("addBtn").click(); added.push(v); };
    // curtain 2 vías with a rail
    pick("familyDrop", "Cortinas de Tela");
    const flo = C.findIndex(t => t.name === "Cortinas de Tela - FLO / CIELO / BRISA / AURA (Onda o Ripplefold)");
    pick("fabricDrop", `${flo}:1`); document.querySelector('#waysSeg button[data-ways="2"]').click(); size(128, 100);
    pick("panoKindDrop", "riel_cortina"); pick("panoItemDrop", "1"); $("panoAddonAdd").click();
    add();
    // panel track
    pick("familyDrop", "Panel Track"); pick("fabricDrop", "pt:0"); pick("ptSystemDrop", "1"); set("ptYards", "6.25"); set("ptPanels", "3"); size(90, 96); add();
    // horizontales red cell
    const red = (() => { for (let ti = 0; ti < C.length; ti++) { const t = C[ti]; if (t.type !== "fabric_matrix") continue; for (let i = 0; i < t.heights_in.length; i++) for (let j = 0; j < t.widths_in.length; j++) if (t.requirements[i][j] === "exceeds_capacity") return { ti, w: t.widths_in[j], h: t.heights_in[i] }; } })();
    pick("familyDrop", "Horizontales"); pick("fabricDrop", `${red.ti}:0`); size(red.w, red.h); add();
    // roman with motor, qty 2, 10% line margin
    const rm = (() => { for (let ti = 0; ti < C.length; ti++) { const t = C[ti]; if (t.category !== "Roman Shades") continue; for (let i = 0; i < t.heights_in.length; i++) for (let j = 0; j < t.widths_in.length; j++) if (t.requirements[i][j] === "motorization") return { ti, w: t.widths_in[j], h: t.heights_in[i] }; } })();
    pick("familyDrop", "Roman Shades"); pick("fabricDrop", `${rm.ti}:0`); size(rm.w, rm.h); set("qtyInp", "2"); pick("motorDrop", "2"); set("lineMargin", "10"); add();
    set("qtyInp", "1");
    // extra item
    pick("extraKindDrop", "personalizado"); $("extraCustomTitle").value = "Flete"; $("extraCustomPrice").value = "40"; $("extraAddonAdd").click();

    const rows = [...$("qdItems").querySelectorAll("tr")];
    const totals = rows.map(r => pm(r.querySelector('td[data-label="Total"]')?.textContent));
    const sum = totals.reduce((a, b) => a + b, 0);
    const sub = pm($("qdSubtotal").textContent), tax = pm($("qdTax").textContent), tot = pm($("qdTotal").textContent);
    ok("quote: 4 paños + motor row + extra row", rows.length === 6, rows.length);
    ok("quote: subtotal = sum of row totals", near(sum, sub), `${sum.toFixed(2)} vs ${sub}`);
    ok("quote: ITBMS 7% and total", near(tax, sub * 0.07) && near(tot, sub * 1.07), `${sub} ${tax} ${tot}`);
    const html = $("qdItems").innerHTML;
    ok("quote: curtain line names both paños", html.includes("2 paños · tabla 64\"×108\"") && html.includes("Cielo (Onda o Ripplefold)"), "");
    ok("quote: panel track line shows exact yards, no PRS cost", html.includes("tela 6.25 yd") && !html.includes("yd ×"), "");
    ok("quote: exceeds-capacity tag is styled", (() => { const t = $("qdItems").querySelector(".tag.range"); return t && getComputedStyle(t).backgroundColor !== "rgba(0, 0, 0, 0)"; })(), "");
    const notes = $("qdNotes").textContent;
    ok("quote notes: capacity + motorization, no supplier wording", /exceden la capacidad/.test(notes) && /motorización/.test(notes) && !/sombread|rojo|amarill/i.test(notes), notes.slice(0, 160));

    // ---- text export ----
    let blob = null; const orig = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return "blob:x"; };
    HTMLAnchorElement.prototype.click = function () {};
    $("exportTxt").click(); await sleep(50);
    const txt = blob ? await blob.text() : "";
    ok("text export: every line and the total", txt.includes("Cielo (Onda o Ripplefold)") && txt.includes("tela 6.25 yd") && txt.includes("Motorización") && txt.includes("Flete") && txt.includes("TOTAL:") && txt.includes($("qdTotal").textContent), txt.split("\n").length + " lines");

    // ---- PDF export through the real html2canvas + jsPDF ----
    if (window.html2canvas && window.jspdf) {
      let pages = 0; const J = window.jspdf.jsPDF;
      window.jspdf.jsPDF = function (...x) { const d = new J(...x); d.save = () => { pages = d.getNumberOfPages(); }; return d; };
      $("exportPdf").click();
      for (let k = 0; k < 100 && !pages; k++) await sleep(100);
      ok("PDF export renders", pages >= 1, `${pages} page(s) · toast "${$("toast").textContent}"`);
    } else ok("PDF export renders (CDN libraries unavailable offline — skipped)", true, "skipped");
    URL.createObjectURL = orig;

    // ---- draft saved, then Nueva cotización clears ----
    await sleep(400);
    let d = null; try { d = JSON.parse(localStorage.getItem("edecoration.cotizador.draft.v1")); } catch (e) {}
    ok("draft saved with all 4 lines and the extra", d && d.lines.length === 4 && d.extras.length === 1, d ? d.lines.length : "no storage");
    $("newQuote").click(); await sleep(50);
    ok("Nueva cotización clears the quote", $("qdItems").querySelectorAll("tr.qd-empty").length === 1 && $("qdSubtotal").textContent === "$0.00", $("qdSubtotal").textContent);
  } catch (e) { errs.push("BATTERY2: " + e.message); }

  ok("no JavaScript errors", errs.length === 0, errs.join(" | "));
  const pre = document.createElement("pre"); pre.id = "battery";
  pre.textContent = "BATTERY_START\n" + R.map(([o, n, d]) => `${o ? "PASS" : "FAIL"} ${n} :: ${d}`).join("\n") + "\nBATTERY_END";
  document.body.appendChild(pre);
})();
