import {
  BIN_WORDS,
  SECTIONS,
  STORES,
  addItem,
  clearSession,
  describeEntry,
  formatNumber,
  formatPieces,
  formatTickets,
  getCounts,
  getConnection,
  getItems,
  getPackSize,
  getPrefs,
  getSheetStatus,
  getTesting,
  lookupBarcode,
  parsePack,
  pieces,
  plural,
  removeCount,
  saveBarcode,
  saveConnection,
  saveCount,
  savePackSize,
  savePiecesPer10,
  savePrefs,
  setTesting,
  testConnection,
  testingOn,
  totalOz,
  refreshStore,
  whenSheetIdle,
} from "./data.js";
import { cameraIsOn, setOnCode, startCamera, stopCamera } from "./scanner.js";

const app = document.getElementById("app");

const state = {
  screen: "store",
  store: null,
  section: null,
  menuOpen: false,
  typed: "",
  pendingCode: "",
  search: "",
  newName: "",
  nameError: "",
  ticketInput: "",
  per10: "",
  item: null,
  justMatched: false,
  boxes: "",
  loose: "",
  per: "",
  showBoxes: false,
  countField: "loose",
  lb: "",
  oz: "",
  weightField: "lb",
  q1: 0,
  entries: [],
  editingId: null,
  returnScreen: "scan",
  lastSaved: null,
  banner: null,
  dupDraft: null,
  confirmClear: false,
  sheetNote: "",
  scriptUrl: "",
  scriptPin: "",
  connMessage: "",
  connBusy: false,
  screenBeforeSettings: "store",
};

const BARS = [3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1, 3];

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[ch]));
}

function storeName(id) {
  const found = STORES.find((store) => store.id === id);
  return found ? found.name : id;
}

function resetEntry() {
  state.boxes = "";
  state.loose = "";
  state.per = "";
  state.showBoxes = false;
  state.countField = "loose";
  state.lb = "";
  state.oz = "";
  state.weightField = "lb";
  state.q1 = 0;
}

function namedPack() {
  return state.item ? parsePack(state.item.name) : null;
}

function usingBoxes() {
  return namedPack() != null || state.showBoxes;
}

function packSize() {
  const named = namedPack();
  if (named) return named.size;
  if (state.showBoxes) return Number(state.per || 0);
  return 0;
}

function packWord() {
  const named = namedPack();
  return named ? named.word : "box";
}

function filteredItems() {
  const items = state.store ? getItems(state.store) : [];
  const query = state.search.trim().toLowerCase();
  const list = query ? items.filter((item) => item.name.toLowerCase().includes(query)) : items;
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

function earlierHere() {
  if (!state.store || !state.section || !state.item) return [];
  return state.entries.filter((entry) => (
    entry.store === state.store
    && entry.section === state.section
    && entry.item === state.item.name
  ));
}

function render() {
  if (cameraIsOn()) stopCamera();
  app.innerHTML = shell();
  document.body.classList.toggle("modal-open", !!(state.dupDraft || state.confirmClear));
}

function statusNote() {
  const flags = getTesting();
  const held = [];
  if (flags.skipCounts) held.push("counts");
  if (flags.skipBarcodes) held.push("barcodes");
  if (flags.skipItems) held.push("new items");
  if (held.length) {
    return {
      testing: true,
      text: "Testing mode is on. Not saving " + held.join(", ") + " to the Google Sheet.",
    };
  }
  const conn = getConnection();
  const status = getSheetStatus();
  if (!conn.configured) {
    return { testing: false, text: "Google Sheet isn't connected yet. Open the menu and choose Sheet connection." };
  }
  if (status.error) {
    return { testing: false, text: status.message || "Couldn't reach the Google Sheet. Showing the copy saved on this phone." };
  }
  if (status.tab) return { testing: false, text: "Connected to " + status.tab + ". Counts are saved to the Google Sheet." };
  return { testing: false, text: "The Google Sheet is connected. Pick a store and counts will be saved there." };
}

function shell() {
  const note = statusNote();
  return `
    <p class="note${note.testing ? " testing" : ""}">${esc(note.text)}</p>
    ${header()}
    ${body()}
    ${dialog()}
  `;
}

function testingSwitch(flag, label, on) {
  return `
    <button class="switch" role="switch" aria-checked="${on ? "true" : "false"}" data-action="testing" data-flag="${flag}">
      <span>${label}</span>
      <span class="switch-ui" aria-hidden="true"></span>
    </button>`;
}

function header() {
  const place = state.store
    ? `<div class="badge">${esc(state.store)}${state.section ? " · " + esc(state.section) : ""}</div>`
    : "";
  const testingBadge = testingOn() ? `<div class="badge testing">Testing</div>` : "";
  const flags = getTesting();
  const menu = state.menuOpen ? `
    <div class="menu" role="menu">
      ${state.section ? `<button class="btn quiet" data-action="change-section">Change section</button>` : ""}
      ${state.store ? `<button class="btn quiet" data-action="change-store">Change store</button>` : ""}
      ${state.entries.length ? `<button class="btn quiet danger" data-action="clear-session">Start a new session</button>` : ""}
      <div class="menu-label">Testing mode</div>
      ${testingSwitch("skipCounts", "Don't save counts", flags.skipCounts)}
      ${testingSwitch("skipBarcodes", "Don't save barcodes", flags.skipBarcodes)}
      ${testingSwitch("skipItems", "Don't save new items", flags.skipItems)}
      <button class="btn quiet" data-action="sheet-settings">Sheet connection</button>
    </div>` : "";
  return `
    <header class="header">
      <div class="header-top">
        <div class="brand">Fun Zone Inventory</div>
        <div class="header-side">
          ${testingBadge}
          <button class="menu-btn" data-action="menu" aria-label="Menu" aria-expanded="${state.menuOpen ? "true" : "false"}">☰</button>
          ${menu}
        </div>
      </div>
      ${place}
    </header>`;
}

function backButton(label) {
  return `<button class="btn link" data-action="back">← ${esc(label)}</button>`;
}

function body() {
  switch (state.screen) {
    case "store": return storeScreen();
    case "section": return sectionScreen();
    case "scan": return scanScreen();
    case "pick": return pickScreen();
    case "new-name": return newNameScreen();
    case "new-confirm": return newConfirmScreen();
    case "new-tickets": return newTicketsScreen();
    case "kind": return kindScreen();
    case "per10": return per10Screen();
    case "count": return countScreen();
    case "weight": return weightScreen();
    case "bin":
    case "bin2": return binScreen();
    case "bin2ask": return binAskScreen();
    case "saved": return savedScreen();
    case "settings": return settingsScreen();
    default: return storeScreen();
  }
}

function settingsScreen() {
  return `
    ${backButton("Back")}
    <h1>Sheet connection</h1>
    <p class="sub">Paste the web app link and the PIN from the setup steps. They stay on this phone. Nothing here is put in the public website.</p>
    <label class="field-label" for="scriptUrl">Web app link</label>
    <input id="scriptUrl" type="url" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(state.scriptUrl)}">
    <label class="field-label" for="scriptPin">PIN</label>
    <input id="scriptPin" type="password" autocomplete="off" placeholder="The PIN Cassidy chose" value="${esc(state.scriptPin)}">
    <div class="stack" style="margin-top:16px">
      <button class="btn primary" data-action="save-connection">Save on this phone</button>
      <button class="btn" data-action="test-connection" ${state.connBusy ? "disabled" : ""}>Test connection</button>
    </div>
    ${state.connMessage ? `<p class="small" style="margin-top:12px">${esc(state.connMessage)}</p>` : ""}
    <p class="small" style="margin-top:16px">Testing the connection does not change the spreadsheet. The month tab is created the first time someone picks a store.</p>`;
}

function storeScreen() {
  const buttons = STORES.map((store) => `
    <button class="btn ${state.store === store.id ? "selected" : ""}" data-action="store" data-store="${store.id}">
      <span>${esc(store.name)}</span>
      <span class="store-code">${esc(store.id)}</span>
    </button>`).join("");
  return `
    <h1>Which store?</h1>
    <p class="sub">Pick where you are counting today.</p>
    <div class="stack">${buttons}</div>`;
}

function sectionScreen() {
  const buttons = SECTIONS.map((section) => `
    <button class="btn ${state.section === section ? "selected" : ""}" data-action="section" data-section="${esc(section)}">
      <span>${esc(section)}</span>
      ${state.section === section ? `<span class="side" style="color:var(--accent)">Current</span>` : ""}
    </button>`).join("");
  const back = state.section ? backButton("Back to scanning") : backButton("Stores");
  return `
    ${back}
    <h1>Where are you counting?</h1>
    <p class="sub">This stays selected until you change it in the menu.</p>
    <div class="stack">${buttons}</div>`;
}

function scanScreen() {
  const secure = window.isSecureContext
    ? ""
    : `<p class="block-warn">The camera only works on a secure page (https). Type the barcode instead.</p>`;
  const stripes = BARS.map((width) => `<i style="width:${width * 2}px"></i>`).join("");
  return `
    <div class="finder" id="finder">
      <div class="stripes" aria-hidden="true">${stripes}</div>
      <p class="muted">Point the camera at the barcode on the box.</p>
      <button class="btn primary" data-action="start-camera">Scan with camera</button>
    </div>
    <div id="camWrap" class="cam" hidden>
      <video id="video" playsinline muted autoplay></video>
      <div class="guide"></div>
      <div id="flash"></div>
      <div id="camMsg">Point at the barcode</div>
    </div>
    <button id="stopBtn" class="btn" data-action="stop-camera" hidden>Stop camera</button>
    <p id="engine" class="engine"></p>
    ${secure}
    <div style="margin-top:18px">
      <div class="small" style="margin-bottom:6px">Or type the barcode</div>
      <div class="row">
        <input id="typed" type="text" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="e.g. 097138500717" value="${esc(state.typed)}">
        <button class="btn quiet" data-action="lookup">Look up</button>
      </div>
    </div>
    ${sessionList()}`;
}

function pickEmpty(items) {
  if (items.length > 0 || !state.search.trim()) return "";
  return `
    <div class="muted" style="padding:8px 4px 4px">No match. Try fewer letters, or add it as a new product.</div>
    <button class="btn primary" data-action="add-new">Add as a new product</button>`;
}

function pickScreen() {
  const items = filteredItems();
  return `
    ${backButton("Cancel")}
    <h1>Which item is this?</h1>
    <p class="sub">New barcode ${esc(state.pendingCode)}. Pick it once and we'll remember it.</p>
    <input id="search" type="search" placeholder="Search items" value="${esc(state.search)}" autocomplete="off">
    <div class="pick-list" id="pickList">${pickButtons(items)}${pickEmpty(items)}</div>`;
}

function newNameScreen() {
  const ready = state.newName.trim().length > 0;
  const duplicate = state.nameError
    ? `
      <div id="nameWarn">
        <div class="block-warn">This store already has “${esc(state.nameError)}”. Pick it from the list, or use a different name.</div>
        <button class="btn" data-action="choose" data-name="${esc(state.nameError)}" style="margin-top:12px"><span>Use ${esc(state.nameError)}</span></button>
      </div>`
    : "";
  return `
    ${backButton("Back")}
    <h1>What's the product called?</h1>
    <p class="sub">Barcode ${esc(state.pendingCode)} isn't on the ${esc(storeName(state.store))} list yet.</p>
    <input id="newName" type="text" autocomplete="off" autocapitalize="words" placeholder="Product name" value="${esc(state.newName)}">
    <div class="stack" style="margin-top:12px">
      ${duplicate}
      <button class="btn primary" data-action="new-name-continue" ${ready ? "" : "disabled"}>Continue</button>
    </div>`;
}

function newConfirmScreen() {
  return `
    ${backButton("Go back")}
    <h1>Add this product?</h1>
    <p class="sub">Check the name and the barcode before it is saved on this phone.</p>
    <div class="card banner">
      <div class="item-name">${esc(state.newName.trim())}</div>
      <div class="muted" style="margin-top:8px">Barcode ${esc(state.pendingCode)}</div>
      <div class="small" style="margin-top:6px">${esc(storeName(state.store))} · ${esc(state.store)}</div>
    </div>
    <div class="stack">
      <button class="btn primary" data-action="new-confirm">Confirm</button>
      <button class="btn" data-action="back"><span>Go back</span></button>
    </div>`;
}

function newTicketsScreen() {
  const ready = state.ticketInput !== "";
  return `
    ${backButton("Back")}
    <h1>Ticket price</h1>
    <p class="sub">How many tickets is ${esc(state.newName.trim())}? Enter a whole number.</p>
    <div class="figure">${esc(state.ticketInput || "0")}</div>
    ${numPad(false)}
    <button class="btn primary save" data-action="save-new-item" ${ready ? "" : "disabled"}>Continue</button>`;
}

function per10Screen() {
  const ready = Number(state.per10) > 0;
  const held = getTesting().skipItems
    ? `<p class="small">Testing mode: this is used for the count, and it is not written to the sheet.</p>`
    : `<p class="small">This is saved on the item so it is not asked again.</p>`;
  return `
    ${backButton("Cancel")}
    ${itemBanner()}
    <h1>How many pieces equal 10 oz?</h1>
    <p class="sub">Count 10 ounces of ${esc(state.item ? state.item.name : "this item")}, then enter how many pieces that is.</p>
    <div class="figure">${esc(state.per10 || "0")}</div>
    ${numPad(false)}
    ${held}
    <button class="btn primary save" data-action="save-per10" ${ready ? "" : "disabled"}>Continue</button>`;
}

function pickButtons(items) {
  return items.map((item) => `
    <button class="btn" data-action="choose" data-name="${esc(item.name)}">
      <span>${esc(item.name)}</span>
      <span class="ticket-num">${item.tickets == null ? "" : esc(formatNumber(item.tickets))}</span>
    </button>`).join("");
}

function itemBanner() {
  if (!state.item) return "";
  const remembered = state.justMatched
    ? `<div class="ok">Barcode ${esc(state.pendingCode)} ${state.item.pending ? "saved for this product" : "matched"}. It will be recognized next time.</div>`
    : "";
  const offList = state.item.offList
    ? `<div class="small warn" style="margin-top:8px">This name isn't on the Sept 2026 list, so tickets and bin size aren't set yet.</div>`
    : "";
  const pending = state.item.pending
    ? `<div class="small" style="margin-top:8px">New product, saved on this phone. ${getTesting().skipItems ? "Not sent to the sheet (testing)." : "It will be added to the sheet."}</div>`
    : "";
  return `
    <div class="card banner">
      <div class="item-name">${esc(state.item.name)}</div>
      <div class="muted" style="margin-top:4px">${esc(formatTickets(state.item.tickets))}</div>
      ${remembered}
      ${pending}
      ${offList}
    </div>`;
}

function kindScreen() {
  const named = namedPack();
  const countSide = named ? plural(named.word) + " + loose" : "pieces";
  const bin = state.section === "Front"
    ? `<button class="btn" data-action="kind-bin"><span>Bin percentage</span><span class="side">how full</span></button>`
    : "";
  return `
    ${backButton("Scan again")}
    ${itemBanner()}
    <h1 class="tight">How are you counting it?</h1>
    <div class="stack" style="margin-top:12px">
      <button class="btn" data-action="kind-count"><span>Item count</span><span class="side">${esc(countSide)}</span></button>
      <button class="btn" data-action="kind-weight"><span>Weight</span><span class="side">lb + oz</span></button>
      ${bin}
    </div>`;
}

function fieldButton(active, value, label, field) {
  return `
    <button class="field ${active ? "on" : ""}" data-action="field" data-field="${field}">
      <div class="num">${esc(value || "0")}</div>
      <div class="lbl">${esc(label)}</div>
    </button>`;
}

function numPad(allowDot) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", allowDot ? "." : "", "0", "del"];
  return `<div class="pad">${keys.map((key) => (
    key === ""
      ? "<div></div>"
      : `<button type="button" data-action="pad" data-key="${key === "del" ? "del" : esc(key)}">${key === "del" ? "⌫" : esc(key)}</button>`
  )).join("")}</div>`;
}

function countScreen() {
  const named = namedPack();
  const using = usingBoxes();
  const size = packSize();
  const word = packWord();
  const nBoxes = Number(state.boxes || 0);
  const nLoose = Number(state.loose || 0);
  const total = (using ? nBoxes * size : 0) + nLoose;
  const canSave = using
    ? (nBoxes > 0 && size > 0) || nLoose > 0 || state.loose === "0"
    : state.loose !== "";
  const perField = !named && using
    ? `<div style="margin-bottom:10px">${fieldButton(state.countField === "per", state.per, "How many in a box", "per")}</div>`
    : "";
  const editor = using
    ? `
      ${perField}
      <div class="fields">
        ${fieldButton(state.countField === "boxes", state.boxes, "Full " + plural(word) + (size ? " (" + formatNumber(size) + " each)" : ""), "boxes")}
        ${fieldButton(state.countField === "loose", state.loose, "Loose", "loose")}
      </div>
      <div class="math">${esc(formatNumber(nBoxes))} × ${esc(formatNumber(size))} + ${esc(formatNumber(nLoose))} = <strong>${esc(formatNumber(total))} pcs</strong></div>`
    : `
      <div class="muted">How many pieces?</div>
      <div class="figure">${esc(state.loose || "0")}</div>
      <div class="center"><button class="btn link" data-action="use-boxes">Counting boxes?</button></div>`;
  return `
    ${backButton("Back")}
    ${itemBanner()}
    ${editor}
    ${numPad(false)}
    <button class="btn primary save" data-action="save-count" ${canSave ? "" : "disabled"}>${state.editingId != null ? "Update" : "Save"}</button>`;
}

function weightScreen() {
  const ounces = totalOz(state.lb || 0, state.oz || 0);
  const perOz = state.item ? state.item.perOz : null;
  const count = pieces({ kind: "weight", lb: Number(state.lb || 0), oz: Number(state.oz || 0), perOz });
  const rate = perOz ? " × " + (Math.round(perOz * 100) / 100) + " per oz = " : "";
  const result = perOz
    ? `<strong>${esc(formatNumber(count))} pcs</strong>`
    : `<span> · no per-oz value for this item yet</span>`;
  const canSave = !!(state.lb || state.oz);
  return `
    ${backButton("Back")}
    ${itemBanner()}
    <div class="muted" style="margin-bottom:8px">Enter the weight. Tap lb or oz to switch.</div>
    <div class="fields">
      ${fieldButton(state.weightField === "lb", state.lb, "lb", "lb")}
      ${fieldButton(state.weightField === "oz", state.oz, "oz", "oz")}
    </div>
    <div class="math">${esc(formatNumber(ounces))} oz${esc(rate)}${result}</div>
    ${numPad(state.weightField === "oz")}
    <button class="btn primary save" data-action="save-weight" ${canSave ? "" : "disabled"}>${state.editingId != null ? "Update" : "Save"}</button>`;
}

function binScreen() {
  const second = state.screen === "bin2";
  const buttons = BIN_WORDS.map((bin) => `
    <button class="btn bin" data-action="bin" data-q="${bin.q}">
      <div class="jar" aria-hidden="true"><span style="height:${bin.q * 25}%"></span></div>
      <span>${esc(bin.word)}</span>
    </button>`).join("");
  return `
    ${backButton("Back")}
    ${itemBanner()}
    <h1 class="tight">${second ? "How full is the second bin?" : "How full is the bin?"}</h1>
    ${second ? `<p class="sub">First bin: ${esc(formatBin(state.q1))}</p>` : ""}
    <div class="bins">${buttons}</div>`;
}

function formatBin(q) {
  const found = BIN_WORDS.find((bin) => bin.q === q);
  return found ? found.word : String(q);
}

function binAskScreen() {
  return `
    ${backButton("Back")}
    ${itemBanner()}
    <h1 class="tight">Is there a second bin?</h1>
    <p class="sub">First bin: ${esc(formatBin(state.q1))}</p>
    <div class="stack">
      <button class="btn" data-action="bin-yes"><span>Yes</span></button>
      <button class="btn" data-action="bin-no"><span>No</span></button>
    </div>`;
}

function savedScreen() {
  const last = state.entries.find((entry) => entry.id === state.lastSaved);
  const removed = state.banner === "removed" && !last;
  const headline = removed ? "Removed" : "Saved";
  const detail = last
    ? `<div class="muted">${esc(last.item)} · ${esc(last.section)} · ${esc(formatPieces(pieces(last)))}</div>`
    : "";
  const undo = last ? `<button class="btn quiet" data-action="undo">Undo</button>` : "";
  return `
    <div class="center" style="padding:18px 0 8px">
      <div class="check" aria-hidden="true">✓</div>
      <h1 class="center">${headline}</h1>
      ${detail}
      ${state.sheetNote ? `<p class="small" style="margin-top:8px">${esc(state.sheetNote)}</p>` : ""}
    </div>
    <div class="actions">
      <button class="btn primary" data-action="scan-next">Scan next</button>
      ${undo}
    </div>
    ${sessionList()}`;
}

function sessionList() {
  if (!state.entries.length) return "";
  const order = [];
  const groups = {};
  state.entries.forEach((entry) => {
    const key = entry.store + "|" + entry.item;
    if (!groups[key]) {
      groups[key] = [];
      order.push(key);
    }
    groups[key].push(entry);
  });
  const cards = order.map((key) => {
    const list = groups[key];
    const first = list[0];
    const secTotals = [];
    SECTIONS.forEach((section) => {
      const inSection = list.filter((entry) => entry.section === section);
      if (!inSection.length) return;
      let total = 0;
      let unknown = false;
      inSection.forEach((entry) => {
        const count = pieces(entry);
        if (count == null) unknown = true;
        else total += count;
      });
      secTotals.push({ section, total, unknown, count: inSection.length });
    });
    const grand = secTotals.reduce((sum, row) => sum + row.total, 0);
    const anyUnknown = secTotals.some((row) => row.unknown);
    const dupSection = secTotals.some((row) => row.count > 1);
    const formula = secTotals.length > 1
      ? secTotals.map((row) => row.section + " " + formatNumber(row.total)).join(" + ") + " = " + formatNumber(grand)
      : "";
    const fresh = list.some((entry) => entry.id === state.lastSaved);
    const sections = secTotals.map((row) => {
      const rows = list.filter((entry) => entry.section === row.section).map((entry) => `
        <div class="entry ${entry.id === state.lastSaved ? "fresh" : ""}">
          <p>${esc(describeEntry(entry))} → <b>${esc(formatPieces(pieces(entry)))}</b></p>
          <div class="btns">
            <button class="btn small" data-action="edit" data-id="${entry.id}">Edit</button>
            <button class="btn small danger" data-action="remove" data-id="${entry.id}">Remove</button>
          </div>
        </div>`).join("");
      return `
        <div class="sec">
          <div class="sec-top"><span>${esc(row.section)}</span><span>${esc(formatNumber(row.total))} pcs</span></div>
          ${rows}
        </div>`;
    }).join("");
    return `
      <article class="card group ${fresh ? "fresh" : ""}">
        <div class="group-top">
          <div class="group-name">${esc(first.item)}</div>
          <div class="group-total">${esc(formatNumber(grand))} pcs</div>
        </div>
        <div class="small" style="margin-top:2px">${esc(first.store)} · ${esc(formatTickets(first.tickets))}${formula ? " · " + esc(formula) : ""}${anyUnknown ? " · some pieces unknown" : ""}</div>
        ${dupSection ? `<div class="small warn" style="margin-top:4px">Counted more than once in the same section</div>` : ""}
        <div class="rules">${sections}</div>
      </article>`;
  }).join("");
  const noun = order.length === 1 ? "item" : "items";
  return `
    <section class="session">
      <h2>Counted this session (${order.length} ${noun})</h2>
      <div class="stack">${cards}</div>
    </section>`;
}

function dialog() {
  if (state.dupDraft && state.section) return dupDialog();
  if (state.confirmClear) return clearDialog();
  return "";
}

function dupDialog() {
  const earlier = earlierHere();
  const already = earlier.reduce((sum, entry) => sum + (pieces(entry) ?? 0), 0);
  const draft = {
    ...state.dupDraft,
    perOz: state.item ? state.item.perOz : null,
    fullBin: state.item ? state.item.fullBin : null,
  };
  return `
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="dupTitle">
      <div class="backdrop"></div>
      <div class="dialog">
        <h2 id="dupTitle">Already counted in ${esc(state.section)}: ${esc(formatNumber(already))} pcs</h2>
        <p class="muted" style="margin-top:6px">${esc(state.item ? state.item.name : "")}. This count: ${esc(formatPieces(pieces(draft)))}. Add this count too?</p>
        <div class="stack">
          <button class="btn primary" data-action="dup-add">Yes, add it</button>
          <button class="btn quiet" data-action="dup-replace">Replace the earlier one</button>
          <button class="btn quiet" data-action="dup-cancel" style="color:var(--muted)">No, cancel</button>
        </div>
      </div>
    </div>`;
}

function clearDialog() {
  return `
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="clearTitle">
      <div class="backdrop"></div>
      <div class="dialog">
        <h2 id="clearTitle">Start a new session?</h2>
        <p class="muted" style="margin-top:6px">This clears the counts saved on this phone. Barcodes this phone has learned stay. Nothing is removed from the Google Sheet.</p>
        <div class="stack">
          <button class="btn primary" data-action="confirm-clear">Clear counts</button>
          <button class="btn quiet" data-action="cancel-clear">Cancel</button>
        </div>
      </div>
    </div>`;
}

function sheetNoteFor(entry) {
  if (!entry) return "";
  if (entry.sheetSync === "skipped") return "Saved here. Not sent to the sheet (testing).";
  if (entry.sheetSync === "local") return "Saved on this phone. The Google Sheet isn't connected yet.";
  if (entry.sheetSync === "pending") return "Saving to the sheet…";
  if (entry.sheetSync === "saved") return "Saved to the sheet.";
  if (entry.sheetSync === "partial") return entry.sheetError || "Part of this count could not be written.";
  if (entry.sheetSync === "queued") return "Saved on this phone. The sheet didn't take it yet. I'll try again.";
  if (entry.sheetSync === "error") return entry.sheetError || "The sheet didn't take that count.";
  return "";
}

function rememberPlace() {
  savePrefs(state.store, state.section);
}

function chooseStore(id) {
  state.store = id;
  state.section = null;
  state.menuOpen = false;
  state.screen = "section";
  rememberPlace();
  render();
  refreshStore(id).then(() => {
    if (state.store !== id || state.screen === "settings" || cameraIsOn()) return;
    render();
  });
}

function chooseSection(section) {
  state.section = section;
  state.menuOpen = false;
  state.screen = "scan";
  rememberPlace();
  render();
}

function handleCode(raw, format) {
  const typed = String(raw ?? "").replace(/\s/g, "");
  if (!typed || !state.store) return;
  const found = lookupBarcode(typed, state.store, format);
  state.typed = "";
  resetEntry();
  state.editingId = null;
  state.dupDraft = null;
  state.justMatched = false;
  if (found.item) {
    state.item = found.item;
    state.pendingCode = found.raw || typed;
    state.screen = "kind";
  } else {
    state.item = null;
    state.pendingCode = typed;
    state.search = "";
    state.screen = "pick";
  }
  render();
}

function chooseItem(name) {
  const item = getItems(state.store).find((candidate) => candidate.name === name);
  if (!item) return;
  saveBarcode(state.pendingCode, state.store, item.name, { pending: !!item.pending });
  state.item = item;
  state.justMatched = true;
  state.nameError = "";
  state.screen = "kind";
  render();
}

function startNewProduct() {
  state.newName = state.search.trim();
  state.nameError = "";
  state.ticketInput = "";
  state.screen = "new-name";
  render();
}

function continueNewName() {
  const name = state.newName.trim();
  if (!name) return;
  const existing = getItems(state.store).find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    state.nameError = existing.name;
    render();
    return;
  }
  state.newName = name;
  state.nameError = "";
  state.screen = "new-confirm";
  render();
}

function saveNewProduct() {
  if (state.ticketInput === "") return;
  const tickets = Number(state.ticketInput);
  const item = addItem(state.store, { name: state.newName.trim(), ticketValue: tickets });
  if (!item) {
    state.nameError = state.newName.trim();
    state.screen = "new-name";
    render();
    return;
  }
  saveBarcode(state.pendingCode, state.store, item.name, { pending: true });
  state.item = item;
  state.justMatched = true;
  state.screen = "kind";
  render();
}

function savePer10() {
  const pieces = Number(state.per10);
  if (!Number.isSafeInteger(pieces) || pieces <= 0 || !state.item || !state.store) return;
  const perOz = savePiecesPer10(state.store, state.item.name, pieces);
  if (perOz == null) return;
  state.item = { ...state.item, perOz };
  state.lb = "";
  state.oz = "";
  state.weightField = "lb";
  state.screen = "weight";
  render();
}

function startCount() {
  resetEntry();
  const named = namedPack();
  const custom = state.store && state.item ? getPackSize(state.store, state.item.name) : null;
  if (named) state.countField = "boxes";
  else if (custom) {
    state.per = String(custom);
    state.showBoxes = true;
    state.countField = "boxes";
  }
  state.screen = "count";
  render();
}

function saveDraft(partial) {
  if (state.editingId == null && earlierHere().length > 0) {
    state.dupDraft = partial;
    render();
    return;
  }
  commit(partial, []);
}

function commit(partial, replaceIds) {
  const saved = saveCount({
    id: state.editingId ?? undefined,
    store: state.store,
    section: state.section,
    item: state.item.name,
    tickets: state.item.tickets,
    fullBin: state.item.fullBin,
    perOz: state.item.perOz,
    ...partial,
  }, replaceIds);
  state.entries = getCounts();
  state.lastSaved = saved ? saved.id : null;
  state.editingId = null;
  state.dupDraft = null;
  state.banner = "saved";
  state.sheetNote = sheetNoteFor(saved);
  resetEntry();
  state.screen = "saved";
  render();
  const savedId = state.lastSaved;
  whenSheetIdle().then(() => {
    state.entries = getCounts();
    const fresh = state.entries.find((entry) => entry.id === savedId);
    if (fresh) state.sheetNote = sheetNoteFor(fresh);
    else if (getSheetStatus().error) state.sheetNote = getSheetStatus().message;
    if (state.screen === "saved" && state.lastSaved === savedId) render();
  });
}

function saveCountScreen() {
  const size = packSize();
  const nBoxes = Number(state.boxes || 0);
  const nLoose = Number(state.loose || 0);
  if (usingBoxes() && nBoxes > 0 && size > 0) {
    if (!namedPack() && state.store && state.item) savePackSize(state.store, state.item.name, size);
    saveDraft({
      kind: "count",
      count: nBoxes * size + nLoose,
      boxes: nBoxes,
      perBox: size,
      loose: nLoose,
      packWord: packWord(),
    });
    return;
  }
  saveDraft({ kind: "count", count: nLoose, loose: nLoose });
}

function padPress(key) {
  const allowDot = state.screen === "weight" && state.weightField === "oz";
  let value = "";
  let set = () => {};
  if (state.screen === "new-tickets") {
    value = state.ticketInput;
    set = (next) => { state.ticketInput = next; };
  } else if (state.screen === "per10") {
    value = state.per10;
    set = (next) => { state.per10 = next; };
  } else if (state.screen === "weight") {
    if (state.weightField === "lb") {
      value = state.lb;
      set = (next) => { state.lb = next; };
    } else {
      value = state.oz;
      set = (next) => { state.oz = next; };
    }
  } else if (state.countField === "boxes") {
    value = state.boxes;
    set = (next) => { state.boxes = next; };
  } else if (state.countField === "per") {
    value = state.per;
    set = (next) => { state.per = next; };
  } else {
    value = state.loose;
    set = (next) => { state.loose = next; };
  }
  if (key === "del") set(value.slice(0, -1));
  else if (key === ".") {
    if (!allowDot || value.includes(".")) return;
    set((value || "0") + ".");
  } else {
    if (value.length >= 6) return;
    set(value === "0" ? key : value + key);
  }
  render();
}

function backTarget() {
  if (state.screen === "new-name") return "pick";
  if (state.screen === "new-confirm") return "new-name";
  if (state.screen === "new-tickets") return "new-confirm";
  if (state.screen === "per10") return "kind";
  if (state.screen === "pick" || state.screen === "kind") return "scan";
  if (state.screen === "bin2") return "bin2ask";
  if (state.screen === "bin2ask") return "bin";
  if (state.screen === "count" || state.screen === "weight" || state.screen === "bin") {
    return state.editingId != null ? state.returnScreen || "saved" : "kind";
  }
  if (state.screen === "section") return state.section ? "scan" : "store";
  if (state.screen === "settings") return state.screenBeforeSettings || "store";
  return "scan";
}

function goBack() {
  const to = backTarget();
  if (to === "scan") state.editingId = null;
  if ((state.screen === "count" || state.screen === "weight" || state.screen === "bin") && state.editingId != null) {
    state.editingId = null;
  }
  state.screen = to;
  state.dupDraft = null;
  render();
}

function startEdit(id) {
  const entry = state.entries.find((candidate) => candidate.id === id);
  if (!entry) return;
  const catalog = getItems(entry.store);
  state.item = catalog.find((item) => item.name === entry.item) || {
    name: entry.item,
    tickets: entry.tickets,
    fullBin: entry.fullBin,
    perOz: entry.perOz,
    barcode: null,
    offList: true,
  };
  state.editingId = entry.id;
  state.returnScreen = state.screen === "saved" ? "saved" : "scan";
  state.justMatched = false;
  state.dupDraft = null;
  resetEntry();
  if (entry.kind === "count") {
    const named = parsePack(state.item.name);
    state.loose = entry.loose !== undefined && entry.loose !== null ? String(entry.loose) : String(entry.count ?? "");
    if (entry.boxes) state.boxes = String(entry.boxes);
    if (!named && entry.perBox) {
      state.per = String(entry.perBox);
      state.showBoxes = true;
    }
    state.countField = named || entry.perBox ? "boxes" : "loose";
    state.screen = "count";
  } else if (entry.kind === "weight") {
    if (entry.perOz && !state.item.perOz) state.item = { ...state.item, perOz: entry.perOz };
    state.lb = String(entry.lb ?? "");
    state.oz = String(entry.oz ?? "");
    state.screen = "weight";
  } else {
    state.screen = "bin";
  }
  render();
}

function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (state.menuOpen && !event.target.closest(".menu") && !(button && button.dataset.action === "menu")) {
    state.menuOpen = false;
    if (!button) {
      render();
      return;
    }
  }
  if (!button) return;
  const action = button.dataset.action;
  if (button.disabled) return;
  switch (action) {
    case "menu":
      state.menuOpen = !state.menuOpen;
      render();
      break;
    case "store":
      chooseStore(button.dataset.store);
      break;
    case "section":
      chooseSection(button.dataset.section);
      break;
    case "change-section":
      state.menuOpen = false;
      state.screen = "section";
      render();
      break;
    case "change-store":
      state.menuOpen = false;
      state.section = null;
      state.screen = "store";
      rememberPlace();
      render();
      break;
    case "testing": {
      const flag = button.dataset.flag;
      const current = getTesting();
      setTesting({ [flag]: !current[flag] });
      state.menuOpen = true;
      render();
      break;
    }
    case "sheet-settings": {
      const conn = getConnection();
      state.scriptUrl = conn.url;
      state.scriptPin = conn.pin;
      state.connMessage = "";
      state.connBusy = false;
      state.screenBeforeSettings = state.screen === "settings" ? state.screenBeforeSettings : state.screen;
      state.menuOpen = false;
      state.screen = "settings";
      render();
      break;
    }
    case "save-connection":
      saveConnection({ url: state.scriptUrl, pin: state.scriptPin });
      state.connMessage = state.scriptUrl.trim()
        ? "Saved on this phone."
        : "Cleared. This phone is not connected.";
      render();
      break;
    case "test-connection":
      saveAndTest();
      break;
    case "clear-session":
      state.menuOpen = false;
      state.confirmClear = true;
      render();
      break;
    case "confirm-clear":
      clearSession();
      state.entries = [];
      state.lastSaved = null;
      state.banner = null;
      state.confirmClear = false;
      state.screen = "scan";
      render();
      break;
    case "cancel-clear":
      state.confirmClear = false;
      render();
      break;
    case "start-camera":
      startCamera();
      break;
    case "stop-camera":
      stopCamera();
      break;
    case "lookup":
      handleCode(state.typed, null);
      break;
    case "back":
      goBack();
      break;
    case "choose":
      chooseItem(button.dataset.name);
      break;
    case "add-new":
      startNewProduct();
      break;
    case "new-name-continue":
      continueNewName();
      break;
    case "new-confirm":
      state.ticketInput = "";
      state.screen = "new-tickets";
      render();
      break;
    case "save-new-item":
      saveNewProduct();
      break;
    case "kind-count":
      startCount();
      break;
    case "kind-weight":
      if (!state.item || !state.item.perOz) {
        state.per10 = "";
        state.screen = "per10";
      } else {
        state.lb = "";
        state.oz = "";
        state.weightField = "lb";
        state.screen = "weight";
      }
      render();
      break;
    case "save-per10":
      savePer10();
      break;
    case "kind-bin":
      state.screen = "bin";
      render();
      break;
    case "field":
      if (state.screen === "weight") state.weightField = button.dataset.field;
      else state.countField = button.dataset.field;
      render();
      break;
    case "pad":
      padPress(button.dataset.key);
      break;
    case "use-boxes":
      state.showBoxes = true;
      state.countField = "per";
      render();
      break;
    case "save-count":
      saveCountScreen();
      break;
    case "save-weight":
      saveDraft({ kind: "weight", lb: Number(state.lb || 0), oz: Number(state.oz || 0) });
      break;
    case "bin": {
      const quarters = Number(button.dataset.q);
      if (state.screen === "bin2") saveDraft({ kind: "bin", q1: state.q1, q2: quarters });
      else if (state.store === "CPR") {
        state.q1 = quarters;
        state.screen = "bin2ask";
        render();
      } else saveDraft({ kind: "bin", q1: quarters });
      break;
    }
    case "bin-yes":
      state.screen = "bin2";
      render();
      break;
    case "bin-no":
      saveDraft({ kind: "bin", q1: state.q1 });
      break;
    case "scan-next":
      state.item = null;
      state.editingId = null;
      state.screen = "scan";
      render();
      break;
    case "undo":
      if (state.lastSaved == null) break;
      removeCount(state.lastSaved);
      state.entries = getCounts();
      state.lastSaved = null;
      state.banner = "removed";
      render();
      break;
    case "edit":
      startEdit(Number(button.dataset.id));
      break;
    case "remove": {
      const id = Number(button.dataset.id);
      removeCount(id);
      state.entries = getCounts();
      if (state.lastSaved === id) state.lastSaved = null;
      render();
      break;
    }
    case "dup-add":
      commit(state.dupDraft, []);
      break;
    case "dup-replace":
      commit(state.dupDraft, earlierHere().map((entry) => entry.id));
      break;
    case "dup-cancel":
      state.dupDraft = null;
      resetEntry();
      state.item = null;
      state.editingId = null;
      state.screen = "scan";
      render();
      break;
    default:
      break;
  }
}

function onInput(event) {
  if (event.target.id === "typed") state.typed = event.target.value;
  if (event.target.id === "newName") {
    state.newName = event.target.value;
    if (state.nameError) {
      state.nameError = "";
      document.getElementById("nameWarn")?.remove();
    }
    const next = document.querySelector('[data-action="new-name-continue"]');
    if (next) next.disabled = !state.newName.trim();
    return;
  }
  if (event.target.id === "scriptUrl") {
    state.scriptUrl = event.target.value;
    return;
  }
  if (event.target.id === "scriptPin") {
    state.scriptPin = event.target.value;
    return;
  }
  if (event.target.id === "search") {
    state.search = event.target.value;
    const list = document.getElementById("pickList");
    if (!list) return;
    const items = filteredItems();
    list.innerHTML = pickButtons(items) + pickEmpty(items);
  }
}

function onKey(event) {
  if (event.key === "Enter" && event.target.id === "typed") {
    event.preventDefault();
    handleCode(state.typed, null);
    return;
  }
  if (event.key === "Enter" && event.target.id === "newName") {
    event.preventDefault();
    continueNewName();
    return;
  }
  if (event.target.matches("input, textarea")) return;
  if (state.screen !== "count" && state.screen !== "weight" && state.screen !== "new-tickets" && state.screen !== "per10") return;
  if (/^\d$/.test(event.key) || event.key === "Backspace" || event.key === ".") {
    event.preventDefault();
    padPress(event.key === "Backspace" ? "del" : event.key);
  }
}

async function saveAndTest() {
  saveConnection({ url: state.scriptUrl, pin: state.scriptPin });
  state.connBusy = true;
  state.connMessage = "Checking…";
  render();
  const result = await testConnection();
  state.connBusy = false;
  state.connMessage = result.message;
  if (state.screen === "settings") render();
}

function boot() {
  const prefs = getPrefs();
  state.entries = getCounts();
  if (prefs.store) {
    state.store = prefs.store;
    state.section = prefs.section;
    state.screen = prefs.section ? "scan" : "section";
  }
  setOnCode((text, format) => handleCode(text, format));
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", onKey);
  render();
  if (state.store) {
    refreshStore(state.store).then(() => {
      if (state.screen === "settings" || cameraIsOn()) return;
      render();
    });
  }
}

boot();
