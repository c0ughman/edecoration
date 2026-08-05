/* Minimal DOM stub so calculator.js can be driven headlessly under node.
   Only the handful of APIs the calculator actually touches are implemented;
   the point is to exercise the real pricing code, not to emulate a browser. */

class El {
  constructor(id = "", cls = "") {
    this.id = id;
    this.className = cls;
    this.value = "";
    this.textContent = "";
    this._html = "";
    this.hidden = false;
    this.dataset = {};
    this.children = [];
    this.options = [];          // <select>: live in a browser, inert here
    this._listeners = {};
    this.classList = {
      _s: new Set(),
      add: (c) => this.classList._s.add(c),
      remove: (c) => this.classList._s.delete(c),
      toggle: (c, on) => on ? this.classList._s.add(c) : this.classList._s.delete(c),
      contains: (c) => this.classList._s.has(c),
    };
  }
  get innerHTML() { return this._html; }
  /* Parse out `<button ... data-value=...>` so the custom dropdowns can be
     driven the way a real click drives them, instead of tests reaching past
     the component and setting the hidden <select> directly. */
  set innerHTML(v) {
    this._html = String(v);
    const re = /<button[^>]*class="([^"]*)"[^>]*data-value="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g;
    const found = [];
    let m;
    while ((m = re.exec(this._html))) {
      const el = new El("", m[1]);
      el.dataset.value = m[2];
      el.textContent = m[3].replace(/<[^>]*>/g, "").trim();
      el.closest = (sel) => el.className.split(/\s+/).includes(sel.replace(/^\./, "")) ? el : null;
      found.push(el);
    }
    if (found.length) this.children = found;
  }
  addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); }
  removeEventListener() {}
  insertAdjacentHTML(_pos, html) { this._html += html; }
  querySelector(sel) { return this._find(sel)[0] || new El(); }
  querySelectorAll(sel) { return this._find(sel); }
  _find(sel) {
    const want = sel.replace(/^\./, "");
    return this.children.filter(c => c.className.split(/\s+/).includes(want));
  }
  contains() { return false; }
  closest() { return null; }
  /* fire an event the way a real input would */
  fire(ev) { (this._listeners[ev] || []).forEach(fn => fn({ target: this })); }
  /* fire with an explicit target, for the segmented controls that read
     e.target.closest("button").dataset */
  fireWith(ev, target) {
    (this._listeners[ev] || []).forEach(fn => fn({ target }));
  }
}

function makeDocument() {
  const byId = new Map();
  const get = (id) => {
    if (!byId.has(id)) byId.set(id, new El(id));
    return byId.get(id);
  };

  // the two data-driven dropdowns need cs-trigger / cs-value / cs-menu children
  for (const id of ["familyDrop", "fabricDrop", "mountDrop", "motorDrop",
                    "panoKindDrop", "panoItemDrop"]) {
    const drop = get(id);
    const trigger = new El("", "cs-trigger");
    const value = new El("", "cs-value");
    const menu = new El("", "cs-menu");
    drop.children.push(trigger, value, menu);
  }

  const document = {
    getElementById: get,
    querySelector: () => new El(),
    createElement: () => new El(),
    addEventListener() {},
    removeEventListener() {},
  };
  return { document, byId, get };
}

module.exports = { El, makeDocument };
