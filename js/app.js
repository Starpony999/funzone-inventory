import {
  BIN_WORDS,
  SECTIONS,
  STORES,
  addItem,
  clearSession,
  containerPieces,
  backOptions,
  describeEntry,
  evalCountExpr,
  formatLbOz,
  formatNumber,
  formatPieces,
  frontNet,
  formatTickets,
  getCounts,
  catalogInfo,
  catalogNeedsRefresh,
  getBarcodeLinks,
  getConnection,
  getItems,
  getPack,
  getPrefs,
  getSheetStatus,
  getTesting,
  itemMatchesQuery,
  lastContainer,
  listContainers,
  lookupBarcode,
  parsePack,
  searchCatalog,
  pieces,
  plural,
  rememberContainer,
  removeCount,
  saveBarcode,
  saveBackFull,
  saveConnection,
  saveContainer,
  saveCount,
  saveMeasure,
  savePackSize,
  onSheetRecovered,
  savePiecesPer10,
  savePrefs,
  setTesting,
  sheetEnabled,
  tareNet,
  testConnection,
  testingOn,
  totalOz,
  refreshStore,
  undoBarcodeLink,
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
  perOzOz: "10",
  perOzField: "pieces",
  containerPick: "",
  containerPicks: [],
  backName: "",
  newContainerName: "",
  newContainerLb: "",
  newContainerOz: "",
  linkToast: null,
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
  packUnit: "box",
  countInstead: false,
  measure: "",
  measureInput: "",
  pendingQ: 0,
  binStep: "",
  gross: 0,
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
  reloadNote: "",
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
  state.containerPicks = [];
  state.backName = "";
}

function namedPack() {
  return state.item ? parsePack(state.item.name) : null;
}

function packsAllowed() {
  return state.section !== "Front";
}

function usingBoxes() {
  return packsAllowed() && (namedPack() != null || state.showBoxes);
}

function packSize() {
  const named = namedPack();
  if (named) return named.size;
  if (state.showBoxes) return Number(state.per || 0);
  return 0;
}

function packWord() {
  const named = namedPack();
  if (named) return named.word;
  return state.packUnit === "bag" ? "bag" : "box";
}

function filteredItems() {
  const items = state.store ? getItems(state.store) : [];
  const query = state.search.trim();
  const list = query
    ? items.filter((item) => itemMatchesQuery(item.name, [item.barcode], query))
    : items;
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
  window.scrollTo(0, 0);
  document.body.classList.toggle("modal-open", !!(state.dupDraft || state.confirmClear));
  if (state.screen === "scan") paintSuggestions();
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

function sampleBanner() {
  if (!state.store) return "";
  if (catalogInfo(state.store).source === "sheet") return "";
  const status = getSheetStatus();
  if (!getConnection().configured && !status.error) return "";
  const detail = status.message
    ? `<div class="small" style="margin-top:6px">${esc(status.message)}</div>`
    : "";
  return `
    <div class="note sample">
      Showing sample items — couldn't load the sheet. Tap to retry.
      <button class="btn" data-action="retry-catalog">Retry</button>
      ${detail}
    </div>`;
}

function notesHtml() {
  const note = statusNote();
  const sample = sampleBanner();
  const showNote = note.testing || !sample;
  return `
    ${showNote ? `<p class="note${note.testing ? " testing" : ""}">${esc(note.text)}</p>` : ""}
    ${state.reloadNote ? `<p class="note">${esc(state.reloadNote)}</p>` : ""}
    ${sample}`;
}

function linkToastHtml() {
  const toast = state.linkToast;
  if (!toast || toast.until < Date.now()) return "";
  return `<div class="toast" role="status">Linked to ${esc(toast.name)}. <button type="button" class="btn link" data-action="undo-link" data-id="${esc(toast.id)}">Undo</button></div>`;
}

function shell() {
  return `
    <div id="statusNotes">${notesHtml()}</div>
    ${header()}
    ${linkToastHtml()}
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
      ${state.store ? `<button class="btn quiet" data-action="recent-links">Recent barcode links</button>` : ""}
      ${state.store ? `<button class="btn quiet" data-action="reload-sheet">Reload from sheet</button>` : ""}
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
    case "container": return containerScreen();
    case "new-container": return newContainerScreen();
    case "back-type": return backTypeScreen();
    case "back-fill": return backFillScreen();
    case "back-full": return backFullScreen();
    case "back-more": return backMoreScreen();
    case "links": return linksScreen();
    case "bin":
    case "bin2": return binScreen();
    case "bin2ask": return binAskScreen();
    case "front-full": return frontFullScreen();
    case "measure": return measureScreen();
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
    : `<p class="block-warn">The camera only works on a secure page (https). Search by name or barcode instead.</p>`;
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
      <div class="cam-tools">
        <button type="button" id="torchBtn" class="cam-tool" hidden aria-pressed="false">Light</button>
        <label class="cam-zoom">Zoom
          <input id="zoomRange" type="range" min="1" max="4" step="0.1" value="1" aria-label="Zoom">
        </label>
      </div>
      <div id="flash"></div>
      <div id="camMsg">Fill the box with the barcode</div>
    </div>
    <button id="stopBtn" class="btn" data-action="stop-camera" hidden>Stop camera</button>
    <p id="engine" class="engine"></p>
    ${secure}
    <div style="margin-top:18px">
      <div class="small" style="margin-bottom:6px">Or search by name or barcode</div>
      <div class="row">
        <input id="typed" type="text" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Name or barcode" value="${esc(state.typed)}">
        <button class="btn quiet" data-action="lookup">Look up</button>
      </div>
      <div id="suggest" class="suggest"></div>
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
    <p class="sub">${state.pendingCode
      ? `Barcode ${esc(state.pendingCode)} isn't on the ${esc(storeName(state.store))} list yet.`
      : `This name isn't on the ${esc(storeName(state.store))} list yet.`}</p>
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
    <p class="sub">${state.pendingCode
      ? "Check the name and the barcode before it is saved on this phone."
      : "Check the name before it is saved on this phone."}</p>
    <div class="card banner">
      <div class="item-name">${esc(state.newName.trim())}</div>
      ${state.pendingCode ? `<div class="muted" style="margin-top:8px">Barcode ${esc(state.pendingCode)}</div>` : ""}
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
  const ounces = Number(state.perOzOz);
  const ready = Number(state.per10) > 0 && ounces > 0;
  const held = getTesting().skipItems
    ? `<p class="small">Testing mode: this is used for the count, and it is not written to the sheet.</p>`
    : `<p class="small">This is saved on the item so it is not asked again.</p>`;
  return `
    ${backButton("Cancel")}
    ${itemBanner()}
    <h1>Pieces by weight</h1>
    <p class="sub">How many pieces are in a weighed amount of ${esc(state.item ? state.item.name : "this item")}?</p>
    <div class="fields">
      ${fieldButton(state.perOzField === "oz", state.perOzOz, "Ounces", "peroz")}
      ${fieldButton(state.perOzField === "pieces", state.per10, "Pieces", "per10")}
    </div>
    ${numPad(state.perOzField === "oz")}
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
  const countSide = state.section === "Front" || !named ? "pieces" : plural(named.word) + " + loose";
  const backs = state.item ? backOptions(state.store, state.item.name) : [];
  const container = state.section === "Back" && backs.length
    ? `<button class="btn" data-action="kind-container"><span>Container</span><span class="side">how full</span></button>`
    : "";
  return `
    ${backButton("Scan again")}
    ${itemBanner()}
    <h1 class="tight">How are you counting it?</h1>
    <div class="stack" style="margin-top:12px">
      <button class="btn" data-action="kind-count"><span>Item count</span><span class="side">${esc(countSide)}</span></button>
      <button class="btn" data-action="kind-weight"><span>Weight</span><span class="side">lb + oz</span></button>
      ${container}
    </div>`;
}

function isFrontBin() {
  return state.section === "Front" && !!(state.item && state.item.bin);
}

function landOnItem() {
  state.countInstead = false;
  state.measure = "";
  state.binStep = "";
  state.screen = isFrontBin() ? "bin" : "kind";
  render();
}

function fieldButton(active, value, label, field) {
  return `
    <button class="field ${active ? "on" : ""}" data-action="field" data-field="${field}">
      <div class="num">${esc(value || "0")}</div>
      <div class="lbl">${esc(label)}</div>
    </button>`;
}

function numPad(allowDot, math) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", allowDot || math ? "." : "", "0", "del"];
  const ops = math ? ["+", "-", "x", "/", "(", ")"] : [];
  const button = (key) => (
    key === ""
      ? "<div></div>"
      : `<button type="button" data-action="pad" data-key="${key === "del" ? "del" : esc(key)}">${key === "del" ? "⌫" : key === "x" ? "×" : esc(key)}</button>`
  );
  return `<div class="pad">${keys.map(button).join("")}</div>${ops.length ? `<div class="pad ops">${ops.map(button).join("")}</div>` : ""}`;
}

function exprLive(text) {
  const parsed = evalCountExpr(text);
  if (!parsed.ok || parsed.empty) return "";
  return "= " + formatNumber(parsed.value);
}

function exprNumber(text) {
  if (!String(text ?? "").trim()) return 0;
  const parsed = evalCountExpr(text);
  return parsed.ok ? parsed.value : null;
}

function countScreen() {
  const named = namedPack();
  const using = usingBoxes();
  const nBoxes = exprNumber(state.boxes);
  const nLoose = exprNumber(state.loose);
  const nPer = exprNumber(state.per);
  const size = named ? packSize() : (using ? nPer : 0);
  const word = packWord();
  const ready = nBoxes != null && nLoose != null && (!using || named || nPer != null);
  const total = ready ? (using ? nBoxes * size : 0) + nLoose : null;
  const canSave = ready && (using
    ? (nBoxes > 0 && size > 0) || nLoose > 0 || state.loose === "0"
    : state.loose !== "");
  const looseLive = exprLive(state.loose);
  const boxLive = exprLive(state.boxes);
  const perLive = exprLive(state.per);
  const activeLive = state.countField === "boxes" ? boxLive : state.countField === "per" ? perLive : looseLive;
  const perField = !named && using
    ? `
      <div class="unit-row" role="group" aria-label="Box or bag">
        <button type="button" class="btn ${state.packUnit === "bag" ? "" : "selected"}" data-action="pack-unit" data-unit="box" aria-pressed="${state.packUnit === "bag" ? "false" : "true"}">Box</button>
        <button type="button" class="btn ${state.packUnit === "bag" ? "selected" : ""}" data-action="pack-unit" data-unit="bag" aria-pressed="${state.packUnit === "bag" ? "true" : "false"}">Bag</button>
      </div>
      ${fieldButton(state.countField === "per", state.per, "How many in a pack", "per")}
      ${state.countField === "per" && perLive ? `<p class="math">${esc(perLive)}</p>` : ""}`
    : "";
  const editor = using
    ? `
      ${perField}
      <div class="fields">
        ${fieldButton(state.countField === "boxes", state.boxes, "Full " + plural(word) + (size ? " (" + formatNumber(size) + " each)" : ""), "boxes")}
        ${fieldButton(state.countField === "loose", state.loose, "Loose", "loose")}
      </div>
      ${activeLive && state.countField !== "per" ? `<p class="math">${esc(activeLive)}</p>` : ""}
      <div class="math">${total == null ? "Finish the math" : esc(formatNumber(nBoxes)) + " × " + esc(formatNumber(size)) + " + " + esc(formatNumber(nLoose)) + " = <strong>" + esc(formatNumber(total)) + " pcs</strong>"}</div>`
    : `
      <div class="muted">How many pieces?</div>
      <div class="figure" id="exprFigure">${esc(state.loose || "0")}</div>
      <p class="math" id="exprLive">${looseLive ? esc(looseLive) : ""}</p>
      <input id="countExpr" class="expr" type="text" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Or type 3 x 6" value="${esc(state.loose)}">
      ${total == null ? "" : `<div class="math" id="exprTotal"><strong>${esc(formatNumber(total))} pcs</strong></div>`}
      ${packsAllowed() ? `<div class="center"><button class="btn link" data-action="use-boxes">Counting packs?</button></div>` : ""}`;
  return `
    ${backButton("Back")}
    ${itemBanner()}
    ${editor}
    ${numPad(false, true)}
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
    <button class="btn primary save" data-action="save-weight" ${canSave ? "" : "disabled"}>Continue</button>`;
}

function containerScreen() {
  const list = listContainers();
  const picked = state.containerPick;
  const chosen = list.find((row) => row.name === picked);
  const grossLb = Number(state.lb || 0);
  const grossOz = Number(state.oz || 0);
  let math = "No container. The weight is saved as entered.";
  let warn = "";
  let canSave = true;
  if (chosen) {
    const net = tareNet(grossLb, grossOz, chosen.lb, chosen.oz);
    if (!net.ok) {
      math = "";
      warn = "That container weighs more than the scale. Pick another container, or go back and check the weight.";
      canSave = false;
    } else {
      math = formatLbOz(grossLb, grossOz) + " minus " + chosen.name + " " + formatLbOz(chosen.lb, chosen.oz) + " = " + formatLbOz(net.lb, net.oz);
    }
  }
  const rows = [
    `<button class="btn ${picked === "" ? "selected" : ""}" data-action="pick-container" data-name=""><span>No container</span></button>`,
    ...list.map((row) => `<button class="btn ${picked === row.name ? "selected" : ""}" data-action="pick-container" data-name="${esc(row.name)}"><span>${esc(row.name)}</span><span class="side">${esc(formatLbOz(row.lb, row.oz))}</span></button>`),
    `<button class="btn" data-action="new-container"><span>+ New container</span></button>`,
  ];
  return `
    ${backButton("Back")}
    ${itemBanner()}
    <h1 class="tight">Which container?</h1>
    <p class="sub">The empty weight is taken off before the count is saved.</p>
    <div class="stack">${rows.join("")}</div>
    ${math ? `<div class="math">${esc(math)}</div>` : ""}
    ${warn ? `<p class="warn">${esc(warn)}</p>` : ""}
    <button class="btn primary save" data-action="save-container-choice" ${canSave ? "" : "disabled"}>Save weight</button>`;
}

function newContainerScreen() {
  const name = state.newContainerName.trim();
  const ready = name && (state.newContainerLb !== "" || state.newContainerOz !== "");
  return `
    ${backButton("Back")}
    <h1>New container</h1>
    <p class="sub">Name it and enter how much it weighs empty.</p>
    <label class="field-label" for="containerName">Name</label>
    <input id="containerName" type="text" autocomplete="off" placeholder="Bucket" value="${esc(state.newContainerName)}">
    <div class="fields">
      ${fieldButton(state.weightField === "lb", state.newContainerLb, "Empty lb", "clb")}
      ${fieldButton(state.weightField === "oz", state.newContainerOz, "Empty oz", "coz")}
    </div>
    ${numPad(state.weightField === "oz")}
    <button class="btn primary save" data-action="save-new-container" ${ready ? "" : "disabled"}>Save container</button>`;
}

function currentBackOptions() {
  return state.item ? backOptions(state.store, state.item.name) : [];
}

function backTypeScreen() {
  const rows = currentBackOptions().map((row) => `
    <button class="btn" data-action="back-type" data-name="${esc(row.container)}">
      <span>${esc(row.container)}</span>
      <span class="side">${row.fullCount ? esc(formatNumber(row.fullCount)) + " full" : "full count needed"}</span>
    </button>`).join("");
  return `
    ${backButton("Back")}
    ${itemBanner()}
    <h1 class="tight">Which container?</h1>
    <div class="stack">${rows}</div>`;
}

function backFillScreen() {
  const buttons = BIN_WORDS.map((bin) => `
    <button class="btn bin" data-action="back-q" data-q="${bin.q}">
      <div class="jar" aria-hidden="true"><span style="height:${bin.q * 25}%"></span></div>
      <span>${esc(bin.word)}</span>
    </button>`).join("");
  return `
    ${backButton("Back")}
    ${itemBanner()}
    <h1 class="tight">How full is the ${esc(state.backName)}?</h1>
    <div class="bins">${buttons}</div>`;
}

function backFullScreen() {
  const ready = Number(state.measureInput) > 0;
  const held = getTesting().skipItems
    ? `<p class="small">Testing mode: this is used for the count, and it is not written to the sheet.</p>`
    : `<p class="small">This is saved on the Back Containers tab so it is not asked again.</p>`;
  return `
    ${backButton("Cancel")}
    ${itemBanner()}
    <h1>How many pieces fill one ${esc(state.backName)}?</h1>
    <div class="figure">${esc(state.measureInput || "0")}</div>
    ${numPad(false)}
    ${held}
    <button class="btn primary save" data-action="save-back-full" ${ready ? "" : "disabled"}>Continue</button>`;
}

function backMoreScreen() {
  const lines = state.containerPicks.map((row) => formatBin(row.q) + " " + row.name + " = " + formatNumber(row.pieces) + " pcs");
  const total = state.containerPicks.reduce((sum, row) => sum + row.pieces, 0);
  return `
    ${backButton("Back")}
    ${itemBanner()}
    <h1 class="tight">Another container?</h1>
    <div class="math">${esc(lines.join(" + "))}<br><strong>${esc(formatNumber(total))} pcs</strong></div>
    <div class="stack">
      <button class="btn" data-action="back-another">Another container</button>
      <button class="btn primary" data-action="back-done">Done</button>
    </div>`;
}

function linksScreen() {
  const links = getBarcodeLinks();
  const rows = links.length
    ? links.map((link) => `
      <div class="link-row">
        <div><strong>${esc(link.name)}</strong><div class="small">${esc(link.code)}${link.undone ? " · undone" : ""}</div></div>
        ${link.undone ? "" : `<button class="btn quiet" data-action="undo-link" data-id="${esc(link.id)}">Undo</button>`}
      </div>`).join("")
    : `<p class="sub">No barcode links from this phone yet.</p>`;
  return `
    ${backButton("Back")}
    <h1>Recent barcode links</h1>
    <p class="sub">The last links saved on this phone. Undo removes the link here and on the barcode sheet.</p>
    ${rows}`;
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
    <div class="bins">${buttons}</div>
    ${second ? "" : `<button class="btn count-instead" data-action="count-instead">Count instead</button>`}`;
}

function formatBin(q) {
  const found = BIN_WORDS.find((bin) => bin.q === q);
  return found ? found.word : String(q);
}

function frontFullScreen() {
  return `
    ${backButton("Back")}
    ${itemBanner()}
    <h1 class="tight">Is the front of the bin full?</h1>
    <p class="sub">You counted ${esc(formatNumber(state.gross))} pieces.</p>
    <div class="stack">
      <button class="btn" data-action="front-yes"><span>Yes</span></button>
      <button class="btn" data-action="front-no"><span>No</span></button>
    </div>`;
}

function measureScreen() {
  const front = state.measure === "front";
  const ready = Number(state.measureInput) > 0;
  const held = getTesting().skipItems
    ? `<p class="small">Testing mode: this is used for the count, and it is not written to the sheet.</p>`
    : `<p class="small">This is saved on the item so it is not asked again.</p>`;
  return `
    ${backButton("Cancel")}
    ${itemBanner()}
    <h1>${front ? "How many pieces fit in the front of the bin?" : "How many pieces fill one full bin?"}</h1>
    <p class="sub">${front ? "This is the amount in the front of a full bin." : "This is one full bin of this item."}</p>
    <div class="figure">${esc(state.measureInput || "0")}</div>
    ${numPad(false)}
    ${held}
    <button class="btn primary save" data-action="save-measure" ${ready ? "" : "disabled"}>Continue</button>`;
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

let suggestions = [];

function looksLikeBarcode(text) {
  const raw = String(text || "").replace(/[\s-]/g, "");
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 6 && digits.length >= raw.length * 0.8;
}

function paintSuggestions() {
  const box = document.getElementById("suggest");
  if (!box) return;
  const query = state.typed.trim();
  suggestions = query && state.store ? searchCatalog(state.store, query) : [];
  if (!query) {
    box.innerHTML = "";
    return;
  }
  const rows = suggestions.map((item, index) => `
    <button type="button" class="btn" data-action="suggest" data-index="${index}">
      <span>${esc(item.name)}</span>
      <span class="ticket-num">${item.tickets == null ? "" : esc(formatNumber(item.tickets))}</span>
    </button>`).join("");
  const empty = suggestions.length
    ? ""
    : `<div class="muted" style="padding:8px 4px 4px">No match.</div>
       <button type="button" class="btn primary" data-action="add-from-search">Add as a new product</button>`;
  box.innerHTML = rows + empty;
}

function selectKnownItem(item) {
  if (!item) return;
  state.typed = "";
  suggestions = [];
  resetEntry();
  state.editingId = null;
  state.dupDraft = null;
  state.justMatched = false;
  state.pendingCode = "";
  state.item = item;
  landOnItem();
}

function submitSearch() {
  const typed = state.typed.trim();
  if (!typed || !state.store) return;
  const found = lookupBarcode(typed, state.store, null);
  if (found.item || looksLikeBarcode(typed)) {
    handleCode(typed, null);
    return;
  }
  const matches = searchCatalog(state.store, typed);
  if (matches.length === 1) {
    selectKnownItem(matches[0]);
    return;
  }
  if (matches.length > 1) {
    paintSuggestions();
    return;
  }
  startNewFromSearch();
}

function startNewFromSearch() {
  const typed = state.typed.trim();
  if (looksLikeBarcode(typed)) {
    handleCode(typed, null);
    return;
  }
  state.pendingCode = "";
  state.search = "";
  state.newName = typed;
  state.nameError = "";
  state.ticketInput = "";
  state.screen = "new-name";
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
    landOnItem();
    return;
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
  showLinkToast(saveBarcode(state.pendingCode, state.store, item.name, { pending: !!item.pending }));
  state.item = item;
  state.justMatched = true;
  state.nameError = "";
  landOnItem();
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
  showLinkToast(saveBarcode(state.pendingCode, state.store, item.name, { pending: true }));
  state.item = getItems(state.store).find((row) => row.name === item.name) || item;
  state.justMatched = true;
  landOnItem();
}

function savePer10() {
  const pieces = Number(state.per10);
  const ounces = Number(state.perOzOz);
  if (!Number.isSafeInteger(pieces) || pieces <= 0 || !(ounces > 0) || !state.item || !state.store) return;
  const perOz = savePiecesPer10(state.store, state.item.name, pieces, ounces);
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
  const named = packsAllowed() ? namedPack() : null;
  const custom = packsAllowed() && state.store && state.item ? getPack(state.store, state.item.name) : null;
  if (named) {
    state.packUnit = named.word === "bag" ? "bag" : "box";
    state.countField = "boxes";
  } else if (custom) {
    state.per = String(custom.size);
    state.packUnit = custom.unit;
    state.showBoxes = true;
    state.countField = "boxes";
  } else {
    state.packUnit = "box";
  }
  state.screen = "count";
  render();
}

let linkTimer = 0;

function showLinkToast(saved) {
  if (!saved || !saved.linkId) return;
  state.linkToast = { id: saved.linkId, name: saved.name, until: Date.now() + 10000 };
  clearTimeout(linkTimer);
  linkTimer = setTimeout(() => {
    if (state.linkToast && state.linkToast.id === saved.linkId) {
      state.linkToast = null;
      render();
    }
  }, 10000);
}

function undoLink(id) {
  undoBarcodeLink(id);
  if (state.linkToast && state.linkToast.id === id) state.linkToast = null;
  render();
}

function openContainers() {
  const remembered = state.item ? lastContainer(state.store, state.item.name) : "";
  state.containerPick = listContainers().some((row) => row.name === remembered) ? remembered : "";
  state.screen = "container";
  render();
}

function saveContainerChoice() {
  const chosen = listContainers().find((row) => row.name === state.containerPick);
  const grossLb = Number(state.lb || 0);
  const grossOz = Number(state.oz || 0);
  let lb = grossLb;
  let oz = grossOz;
  const extra = {};
  if (chosen) {
    const net = tareNet(grossLb, grossOz, chosen.lb, chosen.oz);
    if (!net.ok) return;
    lb = net.lb;
    oz = net.oz;
    extra.container = chosen.name;
    extra.tareLb = chosen.lb;
    extra.tareOz = chosen.oz;
    extra.grossLb = grossLb;
    extra.grossOz = grossOz;
  }
  if (state.item) rememberContainer(state.store, state.item.name, chosen ? chosen.name : "");
  saveDraft({ kind: "weight", lb, oz, ...extra });
}

function saveNewContainer() {
  const saved = saveContainer(state.newContainerName, Number(state.newContainerLb || 0), Number(state.newContainerOz || 0));
  if (!saved) return;
  state.containerPick = saved.name;
  state.newContainerName = "";
  state.newContainerLb = "";
  state.newContainerOz = "";
  state.screen = "container";
  render();
}

function startBackContainers() {
  state.containerPicks = [];
  const options = currentBackOptions();
  if (!options.length) return;
  if (options.length === 1) {
    state.backName = options[0].container;
    state.screen = "back-fill";
  } else {
    state.backName = "";
    state.screen = "back-type";
  }
  render();
}

function addBackPiece(name, full, quarters) {
  const count = containerPieces(full, quarters);
  if (count == null) return;
  state.containerPicks = [...state.containerPicks, { name, q: quarters, pieces: count }];
  state.screen = "back-more";
  render();
}

function chooseBackQuarter(quarters) {
  const opt = currentBackOptions().find((row) => row.container === state.backName);
  if (!opt) return;
  if (!opt.fullCount) {
    state.pendingQ = quarters;
    state.measureInput = "";
    state.screen = "back-full";
    render();
    return;
  }
  addBackPiece(opt.container, opt.fullCount, quarters);
}

function saveBackFullCount() {
  const pieces = Number(state.measureInput);
  if (!Number.isSafeInteger(pieces) || pieces <= 0 || !state.item) return;
  saveBackFull(state.store, state.item.name, state.backName, pieces);
  addBackPiece(state.backName, pieces, state.pendingQ);
}

function doneBack() {
  const total = state.containerPicks.reduce((sum, row) => sum + row.pieces, 0);
  const note = state.containerPicks.map((row) => formatBin(row.q) + " " + row.name).join(" + ") + " = " + formatNumber(total) + " pcs";
  saveDraft({ kind: "count", count: total, loose: total, containerNote: note });
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

function chooseQuarter(quarters) {
  if (state.screen === "bin2") state.binStep = "second";
  else state.binStep = "";
  if (!state.item || !state.item.fullBin) {
    state.pendingQ = quarters;
    state.measure = "fullBin";
    state.measureInput = "";
    state.screen = "measure";
    render();
    return;
  }
  finishQuarter(quarters);
}

function finishQuarter(quarters) {
  if (state.binStep === "second") {
    saveDraft({ kind: "bin", q1: state.q1, q2: quarters });
    return;
  }
  if (state.store === "CPR" && state.item && state.item.doubleBin) {
    state.q1 = quarters;
    state.screen = "bin2ask";
    render();
    return;
  }
  saveDraft({ kind: "bin", q1: quarters });
}

function saveMeasureScreen() {
  const pieces = Number(state.measureInput);
  if (!Number.isSafeInteger(pieces) || pieces <= 0 || !state.item || !state.store) return;
  const field = state.measure === "front" ? "frontCount" : "fullBin";
  const saved = saveMeasure(state.store, state.item.name, field, pieces);
  if (saved == null) return;
  state.item = { ...state.item, [field]: saved };
  const quarters = state.pendingQ;
  state.measure = "";
  state.measureInput = "";
  if (field === "frontCount") {
    saveFrontAdjusted(frontNet(state.gross, saved), saved);
    return;
  }
  finishQuarter(quarters);
}

function countTotal() {
  const size = usingBoxes() ? (namedPack() ? packSize() : exprNumber(state.per)) : 0;
  const nBoxes = exprNumber(state.boxes);
  const nLoose = exprNumber(state.loose);
  if (nLoose == null || nBoxes == null || (usingBoxes() && !namedPack() && size == null)) return null;
  if (usingBoxes() && nBoxes > 0 && size > 0) return nBoxes * size + nLoose;
  return nLoose;
}

function countPayload(count, extra) {
  const named = namedPack();
  const size = usingBoxes() ? (named ? packSize() : exprNumber(state.per)) : 0;
  const nBoxes = exprNumber(state.boxes) || 0;
  const nLoose = exprNumber(state.loose) || 0;
  const packed = usingBoxes() && nBoxes > 0 && size > 0;
  if (packed && !named && state.store && state.item) {
    savePackSize(state.store, state.item.name, size, packWord());
  }
  return {
    kind: "count",
    count,
    loose: nLoose,
    ...(packed ? { boxes: nBoxes, perBox: size, packWord: packWord() } : {}),
    ...extra,
  };
}

function saveCountScreen() {
  const total = countTotal();
  if (total == null) return;
  if (state.countInstead && isFrontBin()) {
    state.gross = total;
    state.screen = "front-full";
    render();
    return;
  }
  saveDraft(countPayload(total));
}

function saveFrontAdjusted(net, frontCount) {
  saveDraft(countPayload(net, {
    gross: state.gross,
    frontCount,
    frontFull: false,
  }));
}

function padPress(key) {
  const countMath = state.screen === "count";
  let allowDot = (state.screen === "weight" && state.weightField === "oz")
    || (state.screen === "per10" && state.perOzField === "oz")
    || (state.screen === "new-container" && state.weightField === "oz")
    || countMath;
  let value = "";
  let set = () => {};
  if (state.screen === "new-tickets") {
    value = state.ticketInput;
    set = (next) => { state.ticketInput = next; };
  } else if (state.screen === "per10") {
    if (state.perOzField === "oz") {
      value = state.perOzOz;
      set = (next) => { state.perOzOz = next; };
    } else {
      value = state.per10;
      set = (next) => { state.per10 = next; };
    }
  } else if (state.screen === "measure" || state.screen === "back-full") {
    value = state.measureInput;
    set = (next) => { state.measureInput = next; };
  } else if (state.screen === "new-container") {
    if (state.weightField === "lb") {
      value = state.newContainerLb;
      set = (next) => { state.newContainerLb = next; };
    } else {
      value = state.newContainerOz;
      set = (next) => { state.newContainerOz = next; };
    }
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
  const mathKey = "+-x/()".includes(key);
  if (key === "del") set(value.slice(0, -1));
  else if (key === ".") {
    if (!allowDot || (!countMath && value.includes("."))) return;
    set((value || "0") + ".");
  } else if (mathKey) {
    if (!countMath || value.length >= 24) return;
    set(value + key);
  } else {
    const limit = countMath ? 24 : 6;
    if (value.length >= limit) return;
    set(!countMath && value === "0" ? key : value + key);
  }
  render();
}

function backTarget() {
  if (state.screen === "new-name") return "pick";
  if (state.screen === "new-confirm") return "new-name";
  if (state.screen === "new-tickets") return "new-confirm";
  if (state.screen === "per10") return "kind";
  if (state.screen === "container") return "weight";
  if (state.screen === "new-container") return "container";
  if (state.screen === "back-full") return "back-fill";
  if (state.screen === "back-fill") return state.containerPicks.length ? "back-more" : (currentBackOptions().length > 1 ? "back-type" : "kind");
  if (state.screen === "back-type" || state.screen === "back-more") return "kind";
  if (state.screen === "links") return state.screenBeforeSettings || "scan";
  if (state.screen === "measure") return state.measure === "front" ? "front-full" : "bin";
  if (state.screen === "front-full") return "count";
  if (state.screen === "pick" || state.screen === "kind") return "scan";
  if (state.screen === "bin2") return "bin2ask";
  if (state.screen === "bin2ask") return "bin";
  if (state.screen === "count" && state.countInstead && state.editingId == null) return "bin";
  if (state.screen === "bin" && isFrontBin() && state.editingId == null) return "scan";
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
    state.countInstead = entry.frontFull === true || entry.frontFull === false;
    if (entry.packWord === "bag" || entry.packWord === "box") state.packUnit = entry.packWord;
    const named = packsAllowed() ? parsePack(state.item.name) : null;
    state.loose = entry.loose !== undefined && entry.loose !== null ? String(entry.loose) : String(entry.count ?? "");
    if (named && entry.boxes) state.boxes = String(entry.boxes);
    if (!named && packsAllowed() && entry.perBox) {
      state.per = String(entry.perBox);
      state.showBoxes = true;
      if (entry.boxes) state.boxes = String(entry.boxes);
    }
    state.countField = named || (packsAllowed() && entry.perBox) ? "boxes" : "loose";
    state.screen = "count";
  } else if (entry.kind === "weight") {
    if (entry.perOz && !state.item.perOz) state.item = { ...state.item, perOz: entry.perOz };
    state.lb = String(entry.grossLb != null ? entry.grossLb : (entry.lb ?? ""));
    state.oz = String(entry.grossOz != null ? entry.grossOz : (entry.oz ?? ""));
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
    case "reload-sheet":
      reloadFromSheet();
      break;
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
    case "retry-catalog":
      retryCatalog();
      break;
    case "lookup":
      submitSearch();
      break;
    case "suggest":
      selectKnownItem(suggestions[Number(button.dataset.index)]);
      break;
    case "add-from-search":
      startNewFromSearch();
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
        state.perOzOz = "10";
        state.perOzField = "pieces";
        state.screen = "per10";
      } else {
        state.lb = "";
        state.oz = "";
        state.weightField = "lb";
        state.screen = "weight";
      }
      render();
      break;
    case "kind-container":
      startBackContainers();
      break;
    case "save-per10":
      savePer10();
      break;
    case "kind-bin":
      state.screen = "bin";
      render();
      break;
    case "field":
      if (button.dataset.field === "lb" || button.dataset.field === "oz" || button.dataset.field === "clb" || button.dataset.field === "coz") {
        state.weightField = button.dataset.field === "oz" || button.dataset.field === "coz" ? "oz" : "lb";
      } else if (button.dataset.field === "peroz") state.perOzField = "oz";
      else if (button.dataset.field === "per10") state.perOzField = "pieces";
      else state.countField = button.dataset.field;
      render();
      break;
    case "pad":
      padPress(button.dataset.key);
      break;
    case "use-boxes":
      state.showBoxes = true;
      state.countField = "per";
      if (state.packUnit !== "bag") state.packUnit = "box";
      render();
      break;
    case "pack-unit":
      state.packUnit = button.dataset.unit === "bag" ? "bag" : "box";
      render();
      break;
    case "save-count":
      saveCountScreen();
      break;
    case "count-instead":
      state.countInstead = true;
      state.binStep = "";
      startCount();
      break;
    case "front-yes":
      saveDraft(countPayload(state.gross, { frontFull: true, gross: state.gross }));
      break;
    case "front-no":
      if (!state.item || !state.item.frontCount) {
        state.measure = "front";
        state.measureInput = "";
        state.screen = "measure";
        render();
      } else {
        saveFrontAdjusted(frontNet(state.gross, state.item.frontCount), state.item.frontCount);
      }
      break;
    case "save-measure":
      saveMeasureScreen();
      break;
    case "save-weight":
      openContainers();
      break;
    case "pick-container":
      state.containerPick = button.dataset.name || "";
      render();
      break;
    case "new-container":
      state.newContainerName = "";
      state.newContainerLb = "";
      state.newContainerOz = "";
      state.weightField = "lb";
      state.screen = "new-container";
      render();
      break;
    case "save-new-container":
      saveNewContainer();
      break;
    case "save-container-choice":
      saveContainerChoice();
      break;
    case "back-type":
      state.backName = button.dataset.name || "";
      state.screen = "back-fill";
      render();
      break;
    case "back-q":
      chooseBackQuarter(Number(button.dataset.q));
      break;
    case "save-back-full":
      saveBackFullCount();
      break;
    case "back-another":
      state.screen = currentBackOptions().length > 1 ? "back-type" : "back-fill";
      render();
      break;
    case "back-done":
      doneBack();
      break;
    case "recent-links":
      state.menuOpen = false;
      state.screen = "links";
      render();
      break;
    case "undo-link":
      undoLink(button.dataset.id);
      break;
    case "bin":
      chooseQuarter(Number(button.dataset.q));
      break;
    case "bin-yes":
      state.binStep = "second";
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
  if (event.target.id === "countExpr") {
    state.loose = event.target.value;
    const fig = document.getElementById("exprFigure");
    const live = document.getElementById("exprLive");
    const shown = exprLive(state.loose);
    if (fig) fig.textContent = state.loose || "0";
    if (live) live.textContent = shown;
    const totalEl = document.getElementById("exprTotal");
    const save = document.querySelector('[data-action="save-count"]');
    const total = countTotal();
    if (totalEl) totalEl.textContent = total == null ? "" : formatNumber(total) + " pcs";
    if (save) save.disabled = state.loose === "" || total == null;
    return;
  }
  if (event.target.id === "containerName") {
    state.newContainerName = event.target.value;
    const save = document.querySelector('[data-action="save-new-container"]');
    if (save) save.disabled = !state.newContainerName.trim() || (state.newContainerLb === "" && state.newContainerOz === "");
    return;
  }
  if (event.target.id === "typed") {
    state.typed = event.target.value;
    paintSuggestions();
    return;
  }
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
    submitSearch();
    return;
  }
  if (event.key === "Enter" && event.target.id === "newName") {
    event.preventDefault();
    continueNewName();
    return;
  }
  if (event.target.matches("input, textarea")) return;
  if (state.screen !== "count" && state.screen !== "weight" && state.screen !== "new-tickets" && state.screen !== "per10" && state.screen !== "measure") return;
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

function syncLiveLists() {
  const slot = document.getElementById("statusNotes");
  if (slot) slot.innerHTML = notesHtml();
  paintSuggestions();
  const list = document.getElementById("pickList");
  if (list) {
    const items = filteredItems();
    list.innerHTML = pickButtons(items) + pickEmpty(items);
  }
}

function showCatalog(result, before) {
  if (!result || !result.ok || !state.store) return;
  const after = catalogInfo(state.store);
  const sameSheet = before.source === "sheet" && after.source === "sheet" && before.tab === after.tab
    && getItems(state.store).length === before.count;
  if (sameSheet || cameraIsOn()) syncLiveLists();
  else render();
}

function reloadFromSheet() {
  state.menuOpen = false;
  if (!state.store) return;
  if (!sheetEnabled()) {
    state.reloadNote = "Google Sheet isn't connected yet.";
    render();
    return;
  }
  state.reloadNote = "Loading the sheet…";
  render();
  refreshStore(state.store).then((result) => {
    state.reloadNote = result && result.ok
      ? "Updated from the sheet."
      : (result && result.message) || "Couldn't reach the sheet.";
    if (cameraIsOn()) syncLiveLists();
    else render();
  });
}

function retryCatalog() {
  if (!state.store || !sheetEnabled()) return;
  if (!catalogNeedsRefresh(state.store) && !getSheetStatus().error) return;
  const before = { ...catalogInfo(state.store), count: getItems(state.store).length };
  refreshStore(state.store).then((result) => showCatalog(result, before));
}

function watchCatalog() {
  onSheetRecovered(() => retryCatalog());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) retryCatalog();
  });
  window.addEventListener("focus", () => retryCatalog());
  setInterval(retryCatalog, 3 * 60 * 1000);
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
  watchCatalog();
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", onKey);
  render();
  // Opening the app always loads the sheet. The 5-minute check is only for
  // the background retry below.
  if (state.store) {
    refreshStore(state.store).then(() => {
      if (state.screen === "settings" || cameraIsOn()) return;
      render();
    });
  }
}

boot();
