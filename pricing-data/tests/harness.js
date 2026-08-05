/* Loads the real calculator.js against the real catalog under a stub DOM, and
   exposes a small driving API so tests can price a paño the way the UI does. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { makeDocument } = require("./dom-stub");

const ROOT = path.join(__dirname, "..");

function boot() {
  const { document, get } = makeDocument();

  // defaults that the HTML ships with, so the harness starts where the UI does
  const defaults = {
    cfgTax: "7", cfgClutch: "25",
    cfgInstall: "0", cfgMargin: "0", lineMargin: "0",
    qtyInp: "1", widthInp: "", heightInp: "",
  };
  for (const [id, v] of Object.entries(defaults)) get(id).value = v;
  get("installChk").checked = false;
  get("mountSel").value = "Interior";

  const sandbox = { document, console, setTimeout, clearTimeout, Date, Math, JSON };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(fs.readFileSync(path.join(ROOT, "data/catalog.js"), "utf8"),
                  sandbox, { filename: "catalog.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "calculator.js"), "utf8"),
                  sandbox, { filename: "calculator.js" });

  const CATALOG = sandbox.window.PRS_CATALOG;

  /* Price one paño through the UI's own code path. */
  function price({ tableIndex, fabricIndex = 0, w, h, qty = 1, install = false,
                   lineMargin = "0", clutch = "25", tax = "7", motorIndex = null }) {
    get("cfgClutch").value = String(clutch);
    get("cfgTax").value = String(tax);
    get("installChk").checked = install;
    get("lineMargin").value = String(lineMargin);
    get("fabricSel").value = `${tableIndex}:${fabricIndex}`;
    get("qtyInp").value = String(qty);
    get("heightInp").value = String(h);
    get("widthInp").value = String(w);
    get("widthInp").fire("input");          // triggers compute()
    if (motorIndex !== null) {              // pick a motor the way the UI does
      const sel = get("motorSel");
      sel.value = String(motorIndex);
      sel.fire("change");
    }
    return {
      display: get("lpValue").textContent,
      meta: get("lpMeta").textContent,
      badges: get("reqBadges").innerHTML,
      notes: get("fabricNotes").innerHTML,
      disabled: get("addBtn").disabled,
      motorShown: !get("motorNotice").hidden,
      motorWhy: get("motorWhy").textContent,
      motorTotal: get("motorTotalValue").textContent,
      motorTotalHidden: get("motorTotal").hidden,
      warnHidden: get("motorWarn").hidden,
      motorOptions: get("motorSel").innerHTML,
    };
  }

  /* Add the current preview to the quote and read the totals back. */
  function addAndTotal() {
    get("addBtn").fire("click");
    return {
      subtotal: get("qdSubtotal").textContent,
      tax: get("qdTax").textContent,
      total: get("qdTotal").textContent,
      notes: get("qdNotes").innerHTML,
      items: get("qdItems").innerHTML,
    };
  }

  /* Flip the in/cm segmented control the way a click would. */
  function setUnit(u) {
    const btn = new (require("./dom-stub").El)();
    btn.dataset.unit = u;
    btn.closest = () => btn;
    get("unitSeg").fireWith("click", btn);
  }

  const parseMoney = s => parseFloat(String(s).replace(/[$,]/g, ""));

  return { CATALOG, get, price, addAndTotal, parseMoney, setUnit };
}

module.exports = { boot };
