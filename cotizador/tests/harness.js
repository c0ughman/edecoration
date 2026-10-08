/* Loads the real calculator.js against the real catalog under a stub DOM, and
   exposes a small driving API so tests can price a paño the way the UI does. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { makeDocument } = require("./dom-stub");

const ROOT = path.join(__dirname, "..");

function boot(opts = {}) {
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

  // the draft feature reaches for window-level APIs; each boot gets its own
  // empty storage so one test's quote cannot leak into the next
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  // a test can open the tool on a saved draft, as reopening the tab would
  if (opts.draft) store.set("edecoration.cotizador.draft.v1", JSON.stringify(opts.draft));
  const sandbox = { document, console, setTimeout, clearTimeout, Date, Math, JSON,
                    localStorage, addEventListener() {}, confirm: () => true };
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
      warnText: get("motorWarn").textContent,
      motorFieldHidden: get("motorField").hidden,
      motorLabel: get("motorDrop").querySelector(".cs-value").textContent,
    };
  }

  /* Flip the 1 vía / 2 vías control the way a click would. */
  function setWays(n) {
    const btn = new (require("./dom-stub").El)();
    btn.dataset.ways = String(n);
    btn.closest = () => btn;
    get("waysSeg").fireWith("click", btn);
  }

  /* Price a Panel Track paño through the UI: family, fabric, rail, yards. */
  function panelTrack({ telaIndex = 0, railIndex = 0, w, h, yards = "", panels = "",
                        qty = 1 }) {
    pickOption("familyDrop", "Panel Track");
    pickOption("fabricDrop", `pt:${telaIndex}`);
    pickOption("ptSystemDrop", railIndex);
    get("ptPanels").value = String(panels);
    get("ptYards").value = String(yards);
    get("qtyInp").value = String(qty);
    get("heightInp").value = String(h);
    get("widthInp").value = String(w);
    get("widthInp").fire("input");
    return {
      display: get("lpValue").textContent,
      meta: get("lpMeta").textContent,
      info: get("ptInfo").textContent,
      notes: get("fabricNotes").innerHTML,
      badges: get("reqBadges").innerHTML,
      disabled: get("addBtn").disabled,
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

  /* Pick an option in one of the custom dropdowns the way a click would. */
  function pickOption(dropId, value) {
    const menu = get(dropId).querySelector(".cs-menu");
    const opt = menu.children.find(c => c.dataset.value === String(value));
    if (!opt) throw new Error(`no option "${value}" in ${dropId}`);
    opt.fire("click");
    return opt.textContent;
  }

  /* Add a complemento through the real picker: choose kind, choose item, add. */
  function addAddon(prefix, { kind, itemIndex = 0, qty = 1,
                              customName = null, customDesc = "",
                              customPrice = 0 }) {
    pickOption(prefix + "KindDrop", kind);
    if (customName !== null) {
      get(prefix + "CustomTitle").value = customName;
      get(prefix + "CustomDesc").value = customDesc;
      get(prefix + "CustomPrice").value = String(customPrice);
    } else {
      pickOption(prefix + "ItemDrop", itemIndex);
    }
    get(prefix + "AddonQty").value = String(qty);
    get(prefix + "AddonAdd").fire("click");
    return get(prefix + "AddonList").innerHTML;
  }

  const parseMoney = s => parseFloat(String(s).replace(/[$,]/g, ""));

  return { CATALOG, get, price, addAndTotal, parseMoney, setUnit,
           pickOption, addAddon, setWays, panelTrack, store, sandbox };
}

module.exports = { boot };
