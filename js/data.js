/**
 * Data layer for Fun Zone Inventory.
 *
 * The screens only talk to this file. Google Sheets can replace the bodies
 * of getItems, lookupBarcode, saveBarcode, and saveCount later. Nothing
 * else should know whether a number came from the bundled Sept 2026 lists,
 * localStorage, or (later) a sheet.
 *
 * v1 keeps:
 * - the two store catalogs and the six real barcodes in this file
 * - barcodes a phone has learned, in localStorage
 * - products added on the phone, in localStorage, marked pending
 * - the current counting session, in localStorage
 *
 * A pending item still needs a row on that store's month tab (column A item
 * name, column B ticket value) and each pending barcode needs a row on the
 * FunZone Barcodes sheet. getPendingSheetRows() is the list to write.
 *
 * Barcode strings keep their leading zeros. They are never turned into numbers.
 */

export const STORES = [
  { id: "WPR", name: "Wentzville" },
  { id: "CPR", name: "Cottleville" },
];

export const SECTIONS = ["Front", "Back", "Break Room"];

export const BIN_WORDS = [
  { q: 1, word: "Quarter" },
  { q: 2, word: "Half" },
  { q: 3, word: "3-Quarters" },
  { q: 4, word: "Full" },
];

// Ticket values, full-bin counts, and pieces-per-ounce from the Sept 2026 tabs.
// barcode on an item is a sample code from the approved prototype so typing
// still works for products that do not have a real code yet. Real box codes
// live in REAL_BARCODES and are checked first.
const ITEMS = {
  WPR: [
    { name: "Bouncy Ball 27mm Asmt (144/bag)", tickets: 20, fullBin: 440, perOz: 3.0, barcode: "070330123451" },
    { name: "Bouncy Ball 45mm Asmt (50/bag)", tickets: 100, fullBin: 91, perOz: 0.6, barcode: null },
    { name: "Dum Dum Pops", tickets: 20, fullBin: 500, perOz: 20 / 4.2, barcode: "041116023459" },
    { name: "Flashlight Keychain", tickets: 60, fullBin: 296, perOz: 4.24, barcode: null },
    { name: "Giant Smarties (36/box)", tickets: 100, fullBin: 144, perOz: 0.941, barcode: "011206003210" },
    { name: "LAFFY TAFFY Bulk Asmt", tickets: 25, fullBin: 303, perOz: 3.0, barcode: "079200556143" },
    { name: "Laser Spin Top (144/bag)", tickets: 10, fullBin: 737, perOz: 100 / 4.9, barcode: null },
    { name: "Mini Skateboard (144/box)", tickets: 20, fullBin: 808, perOz: 100 / 10.5, barcode: "070330556782" },
    { name: "Princess Tiara 5in Asmt (12 in bag)", tickets: 125, fullBin: 21, perOz: null, barcode: "070330334412" },
    { name: "Rubber Pizza (50/bag)", tickets: 125, fullBin: 111, perOz: 100 / 45.2, barcode: null },
    { name: "Smarties 3 Tablet Pouch Bulk Asmt", tickets: 10, fullBin: 470, perOz: 100 / 11.1, barcode: "011206001018" },
    { name: "Smarties Candy Necklace (24/box)", tickets: 125, fullBin: 59, perOz: 1.3, barcode: "011206002404" },
    { name: "Smarties XTreme Sour", tickets: 15, fullBin: 388, perOz: 100 / 26, barcode: null },
    { name: "Tootsie Roll Midgees (360/bag)", tickets: 10, fullBin: 890, perOz: 9, barcode: "071720006304" },
    { name: "Autograph Mystery Helmets", tickets: 17000, fullBin: null, perOz: null, barcode: null },
    { name: "Beats Pro", tickets: 70000, fullBin: null, perOz: null, barcode: "190199720543" },
    { name: "Disney Fun Size Ears Keychain", tickets: 350, fullBin: null, perOz: null, barcode: "786936885019" },
    { name: "Giant Sticky Hand", tickets: 175, fullBin: null, perOz: null, barcode: null },
    { name: "Karaoke w Mic Bluetooth Speaker (wireless karaoke)", tickets: 3500, fullBin: null, perOz: null, barcode: null },
    { name: "Jumbo Playing Cards", tickets: 200, fullBin: null, perOz: null, barcode: null },
    { name: "Light Up Wireless Gaming Headphones", tickets: 3500, fullBin: null, perOz: null, barcode: null },
    { name: "Oh So Jelle Taba Pets (Jellee)", tickets: null, fullBin: null, perOz: null, barcode: null },
    { name: "Disco Lamp Lounge Monkey", tickets: 3500, fullBin: null, perOz: null, barcode: null },
    { name: "Nintendo Switch", tickets: 68000, fullBin: null, perOz: null, barcode: "045496882174" },
    { name: "Samurai Sword", tickets: 300, fullBin: null, perOz: null, barcode: null },
  ],
  CPR: [
    { name: "Airheads Bites", tickets: 550, fullBin: null, perOz: null, barcode: "073390014308" },
    { name: "Ball Popper (ozone blast) (ping pong popper)", tickets: 300, fullBin: null, perOz: null, barcode: null },
    { name: "Bouncy Balls 45mm", tickets: 100, fullBin: 100, perOz: 0.6, barcode: null },
    { name: "cheer squad streamer baton (32/bag)", tickets: 200, fullBin: null, perOz: null, barcode: "070330320015" },
    { name: "Dum Dum Pops", tickets: 20, fullBin: 490, perOz: 20 / 4.2, barcode: "041116023459" },
    { name: "eFrutti Gummi Pizza (48/box)", tickets: 125, fullBin: 140, perOz: 1.3636, barcode: "639277401226" },
    { name: "flarp Noise Putty", tickets: 400, fullBin: null, perOz: null, barcode: null },
    { name: "FUN DIP Candy Asmt (48/box)", tickets: 75, fullBin: 175, perOz: 10 / 5.1, barcode: "079200033101" },
    { name: "Giant Smarties (36/box)", tickets: 125, fullBin: 170, perOz: 49 / 53.2, barcode: "011206003210" },
    { name: "Giant Sticky hand (12/bag)", tickets: 200, fullBin: null, perOz: null, barcode: null },
    { name: "Hi Bounce Ball 27mm (144/bag)", tickets: 20, fullBin: 510, perOz: 100 / 46.6, barcode: "070330123451" },
    { name: "Laser Spin Top", tickets: 10, fullBin: 1115, perOz: 100 / 4.9, barcode: null },
    { name: "Lucky Strike Bowling (36/box)", tickets: 250, fullBin: 72, perOz: null, barcode: "070330360028" },
    { name: "Metal Handcuffs with 2 Keys 11in (12/box)", tickets: 300, fullBin: 55, perOz: null, barcode: null },
    { name: "Mini Skateboard", tickets: 20, fullBin: 1050, perOz: 100 / 10.5, barcode: "070330556782" },
    { name: "Pizza Ranch 2in Dice Asmt (Foam Dice)", tickets: 30, fullBin: 160, perOz: null, barcode: null },
    { name: "Police Badge (72/bag)", tickets: 25, fullBin: 380, perOz: 100 / 9.7, barcode: "070330987650" },
    { name: "Silly Face Coil Spring", tickets: 30, fullBin: 170, perOz: 100 / 21, barcode: null },
    { name: "Smarties 3 Tablet Pouch Bulk Asmt", tickets: 10, fullBin: 830, perOz: 100 / 11.1, barcode: "011206001018" },
    { name: "Sour Punch Twists", tickets: 25, fullBin: 390, perOz: 4.5, barcode: "041364087210" },
    { name: "Tootsie Roll Midgees (360/bag)", tickets: 10, fullBin: 1310, perOz: 9, barcode: "071720006304" },
    { name: "Karaoke w Mic Bluetooth Speaker (wireless karaoke)", tickets: 3500, fullBin: null, perOz: null, barcode: null },
    { name: "Jumbo Playing Cards", tickets: null, fullBin: null, perOz: null, barcode: null },
    { name: "Disco Lamp (Lounge monkey)", tickets: 3500, fullBin: null, perOz: null, barcode: null },
    { name: "Nintendo Switch 2", tickets: 95000, fullBin: null, perOz: null, barcode: "045496884505" },
  ],
};

// Six real barcodes. Names are trimmed so they match the catalog.
// CPR does not carry the headphones. Squeeze Pyramid is not on either list,
// so both names stay blank and the app asks which item it is.
// CPR name for 075656049338 is the confirmed "Oh So Jelle Pets". That name
// is not on the Sept 2026 CPR tab, so lookup still returns it and flags it.
export const REAL_BARCODES = [
  { code: "097138500717", WPR: "Jumbo Playing Cards", CPR: "Jumbo Playing Cards", addedBy: "Cassidy", date: "2026-10-27", notes: "Cassidy called it Jumbo Cards; CPR has no ticket value in Sept 2026" },
  { code: "810071499326", WPR: "Karaoke w Mic Bluetooth Speaker (wireless karaoke)", CPR: "Karaoke w Mic Bluetooth Speaker (wireless karaoke)", addedBy: "Cassidy", date: "2026-10-27", notes: "" },
  { code: "097138501967", WPR: "Light Up Wireless Gaming Headphones", CPR: "", addedBy: "Cassidy", date: "2026-10-27", notes: "Not carried at CPR" },
  { code: "075656049338", WPR: "Oh So Jelle Taba Pets (Jellee)", CPR: "Oh So Jelle Pets", addedBy: "Cassidy", date: "2026-10-27", notes: "CPR name confirmed as Oh So Jelle Pets; not on the Sept 2026 CPR tab" },
  { code: "097138502094", WPR: "", CPR: "", addedBy: "Cassidy", date: "2026-10-27", notes: "Squeeze Pyramid is not on either store list yet" },
  { code: "910371810538", WPR: "Disco Lamp Lounge Monkey", CPR: "Disco Lamp (Lounge monkey)", addedBy: "Cassidy", date: "2026-10-27", notes: "Sheet had a trailing space on the WPR name; stored trimmed so it matches the item" },
];

const KEYS = {
  learned: "fz-learned-barcodes",
  session: "fz-session",
  packs: "fz-pack-sizes",
  prefs: "fz-prefs",
  added: "fz-added-items",
};

const mem = { learned: null, session: null, packs: null, added: null };

function readJSON(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full disk. The in-memory copy still works until reload.
  }
}

function readLearned() {
  if (mem.learned == null) mem.learned = readJSON(KEYS.learned, {});
  return mem.learned;
}

function readSession() {
  if (mem.session == null) {
    const saved = readJSON(KEYS.session, null);
    mem.session = saved && Array.isArray(saved.entries)
      ? { nextId: Number(saved.nextId) || 1, entries: saved.entries }
      : { nextId: 1, entries: [] };
  }
  return mem.session;
}

function readPacks() {
  if (mem.packs == null) mem.packs = readJSON(KEYS.packs, {});
  return mem.packs;
}

function readAdded() {
  if (mem.added == null) {
    const saved = readJSON(KEYS.added, {});
    mem.added = {
      WPR: Array.isArray(saved.WPR) ? saved.WPR : [],
      CPR: Array.isArray(saved.CPR) ? saved.CPR : [],
    };
  }
  return mem.added;
}

function storeItems(store) {
  const catalog = ITEMS[store] || [];
  const added = readAdded()[store] || [];
  return [...catalog, ...added];
}

export function expandUpcE(c) {
  const ns = c[0];
  const d = c.slice(1, 7);
  const chk = c[7];
  const last = d[5];
  let body;
  if (last <= "2") body = d.slice(0, 2) + last + "0000" + d.slice(2, 5);
  else if (last === "3") body = d.slice(0, 3) + "00000" + d.slice(3, 5);
  else if (last === "4") body = d.slice(0, 4) + "00000" + d[4];
  else body = d.slice(0, 5) + "0000" + last;
  return ns + body + chk;
}

export function checkOk(c) {
  if (!/^\d+$/.test(c) || c.length < 2) return false;
  let sum = 0;
  for (let i = 0; i < c.length - 1; i++) {
    const n = Number(c[c.length - 2 - i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10 === Number(c[c.length - 1]);
}

// UPC-E expands to UPC-A. UPC-A / EAN-13 / GTIN-14 pad to 14 digits so
// 097138500717 and 0097138500717 are the same code. Code 128 text is kept.
export function normalizeCode(raw, format) {
  const c = String(raw ?? "").replace(/[\s-]/g, "");
  if (!c) return "";
  if (!/^\d+$/.test(c)) return c.toUpperCase();
  const isUpcE = format
    ? /upc_?e/i.test(format)
    : c.length === 8 && (c[0] === "0" || c[0] === "1") && checkOk(expandUpcE(c));
  if (c.length === 8 && isUpcE) return expandUpcE(c).padStart(14, "0");
  if (c.length >= 11 && c.length <= 14) return c.padStart(14, "0");
  return c;
}

export function parsePack(name) {
  const m = String(name || "").match(/\((\d+)\s*(?:\/|in\s+(?:a\s+)?)\s*(box|bag|pack|case|tub|bucket)[a-z]*\)/i);
  if (!m) return null;
  return { size: Number(m[1]), word: m[2].toLowerCase() };
}

export function plural(word) {
  return word === "box" ? "boxes" : word + "s";
}

export function binWord(q) {
  const found = BIN_WORDS.find((b) => b.q === q);
  return found ? found.word : String(q) + "/4";
}

export function formatNumber(n) {
  return Number(n || 0).toLocaleString("en-US");
}

export function formatTickets(t) {
  return t == null ? "Ticket value not set" : formatNumber(t) + " tickets";
}

export function formatPieces(n) {
  return n == null ? "pcs unknown" : formatNumber(n) + " pcs";
}

export function totalOz(lb, oz) {
  return Math.round((Number(lb || 0) * 16 + Number(oz || 0)) * 10) / 10;
}

// Final piece count for one entry. Weight uses round((lb*16+oz)*piecesPerOz).
export function pieces(e) {
  if (!e) return null;
  if (e.kind === "count") return e.count ?? 0;
  if (e.kind === "weight") {
    if (!e.perOz) return null;
    return Math.round((Number(e.lb || 0) * 16 + Number(e.oz || 0)) * e.perOz);
  }
  if (!e.fullBin) return null;
  return Math.round((e.fullBin * ((e.q1 || 0) + (e.q2 || 0))) / 4);
}

export function describeEntry(e) {
  if (e.kind === "count") {
    if (e.boxes && e.perBox) {
      const w = e.packWord || "box";
      return formatNumber(e.boxes) + " " + (e.boxes === 1 ? w : plural(w)) + " × " + formatNumber(e.perBox) + " + " + formatNumber(e.loose || 0) + " loose";
    }
    return "Counted";
  }
  if (e.kind === "weight") {
    const t = totalOz(e.lb || 0, e.oz || 0);
    return String(e.lb || 0) + " lb " + String(e.oz || 0) + " oz = " + formatNumber(t) + " oz" + (e.perOz ? "" : " (no per-oz value yet)");
  }
  const parts = [binWord(e.q1 || 0)];
  if (e.q2) parts.push(binWord(e.q2));
  return "Bin: " + parts.join(" + ") + (e.fullBin ? " (est.)" : " (no full-bin count yet)");
}

function resolveName(items, name, code) {
  const found = items.find((i) => i.name === name);
  if (found) return { ...found };
  return { name, tickets: null, fullBin: null, perOz: null, barcode: code || null, offList: true };
}

export function getItems(store) {
  if (store !== "WPR" && store !== "CPR") return [];
  return storeItems(store).map((item) => ({ ...item }));
}

export function lookupBarcode(code, store, format) {
  const raw = String(code ?? "").replace(/[\s-]/g, "");
  const normalized = raw ? normalizeCode(raw, format) : "";
  const result = { raw, normalized, item: null, source: null };
  if (!raw || (store !== "WPR" && store !== "CPR")) return result;
  const items = storeItems(store);
  const learned = readLearned()[store + ":" + normalized];
  if (learned && learned.name) {
    result.item = resolveName(items, learned.name, learned.code || raw);
    result.source = "learned";
    return result;
  }
  const real = REAL_BARCODES.find((row) => normalizeCode(row.code) === normalized);
  if (real) {
    const name = String(real[store] || "").trim();
    if (!name) return result;
    result.item = resolveName(items, name, real.code);
    result.source = "barcode";
    return result;
  }
  const sample = items.find((item) => item.barcode && normalizeCode(item.barcode) === normalized);
  if (sample) {
    result.item = { ...sample };
    result.source = "sample";
  }
  return result;
}

export function saveBarcode(code, store, itemName, options = {}) {
  const name = String(itemName || "").trim();
  const raw = String(code ?? "").replace(/[\s-]/g, "");
  if (!raw || !name || (store !== "WPR" && store !== "CPR")) return null;
  const normalized = normalizeCode(raw);
  const learned = readLearned();
  const row = { code: raw, name };
  if (options.pending) row.pending = true;
  learned[store + ":" + normalized] = row;
  writeJSON(KEYS.learned, learned);
  return { code: raw, normalized, store, name, pending: !!options.pending };
}

// Add a product that is not on the September list yet. It stays on this phone
// and is marked pending so the Sheets step can append it to that store's
// month tab (column A item, column B ticket value). Link the barcode with
// saveBarcode(..., { pending: true }) so the FunZone Barcodes sheet gets a row too.
export function addItem(store, { name, ticketValue } = {}) {
  const trimmed = String(name || "").trim();
  const tickets = typeof ticketValue === "number" ? ticketValue : Number(ticketValue);
  if (!trimmed || (store !== "WPR" && store !== "CPR")) return null;
  if (!Number.isSafeInteger(tickets) || tickets < 0) return null;
  const existing = storeItems(store).find((item) => item.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return null;
  const item = {
    name: trimmed,
    tickets,
    fullBin: null,
    perOz: null,
    barcode: null,
    pending: true,
  };
  const added = readAdded();
  added[store].push(item);
  writeJSON(KEYS.added, added);
  return { ...item };
}

// Rows still waiting for Google Sheets. Items go on the store's month tab.
// Barcodes go on the FunZone Barcodes sheet.
export function getPendingSheetRows() {
  const items = [];
  const added = readAdded();
  for (const store of ["WPR", "CPR"]) {
    for (const item of added[store]) {
      if (!item.pending) continue;
      items.push({
        store,
        name: item.name,
        ticketValue: item.tickets,
        columnA: item.name,
        columnB: item.tickets,
      });
    }
  }
  const barcodes = [];
  for (const [key, row] of Object.entries(readLearned())) {
    if (!row || !row.pending) continue;
    const store = key.slice(0, key.indexOf(":"));
    barcodes.push({ store, code: row.code, name: row.name });
  }
  return { items, barcodes };
}

function cleanEntry(e) {
  const out = {
    id: e.id,
    store: e.store,
    section: e.section,
    item: e.item,
    tickets: e.tickets ?? null,
    fullBin: e.fullBin ?? null,
    perOz: e.perOz ?? null,
    kind: e.kind,
  };
  for (const key of ["count", "boxes", "loose", "perBox", "packWord", "lb", "oz", "q1", "q2"]) {
    if (e[key] !== undefined && e[key] !== null) out[key] = e[key];
  }
  return out;
}

export function getCounts() {
  return readSession().entries.map((entry) => ({ ...entry }));
}

// Save one count. Pass replaceIds to drop earlier counts of the same item
// in this section (the "Replace earlier" choice). An entry that already has
// an id is updated in place.
export function saveCount(entry, replaceIds = []) {
  const session = readSession();
  let savedId;
  if (entry.id != null) {
    savedId = entry.id;
    session.entries = session.entries.map((existing) => {
      if (existing.id !== entry.id) return existing;
      return cleanEntry({
        ...entry,
        id: existing.id,
        store: existing.store,
        section: existing.section,
        item: existing.item,
        tickets: existing.tickets,
        fullBin: existing.fullBin,
        perOz: existing.perOz,
      });
    });
  } else {
    const drop = new Set(replaceIds || []);
    const stored = cleanEntry({ ...entry, id: session.nextId++ });
    savedId = stored.id;
    session.entries = session.entries.filter((existing) => !drop.has(existing.id));
    session.entries.unshift(stored);
  }
  writeJSON(KEYS.session, session);
  return session.entries.find((existing) => existing.id === savedId) || null;
}

export function removeCount(id) {
  const session = readSession();
  session.entries = session.entries.filter((entry) => entry.id !== id);
  writeJSON(KEYS.session, session);
  return getCounts();
}

export function clearSession() {
  const session = readSession();
  session.entries = [];
  writeJSON(KEYS.session, session);
}

export function getPackSize(store, itemName) {
  const size = readPacks()[store + ":" + itemName];
  return Number.isFinite(size) && size > 0 ? size : null;
}

export function savePackSize(store, itemName, size) {
  const packs = readPacks();
  packs[store + ":" + itemName] = size;
  writeJSON(KEYS.packs, packs);
}

export function getPrefs() {
  const saved = readJSON(KEYS.prefs, {});
  const store = saved.store === "WPR" || saved.store === "CPR" ? saved.store : null;
  const section = SECTIONS.includes(saved.section) ? saved.section : null;
  return { store, section: store ? section : null };
}

export function savePrefs(store, section) {
  writeJSON(KEYS.prefs, {
    store: store || null,
    section: section || null,
  });
}

export function resetLocalData() {
  mem.learned = {};
  mem.session = { nextId: 1, entries: [] };
  mem.packs = {};
  mem.added = { WPR: [], CPR: [] };
  writeJSON(KEYS.learned, mem.learned);
  writeJSON(KEYS.session, mem.session);
  writeJSON(KEYS.packs, mem.packs);
  writeJSON(KEYS.added, mem.added);
  writeJSON(KEYS.prefs, {});
}

// Drop the in-memory cache so the next read comes from localStorage.
export function reloadLocalData() {
  mem.learned = null;
  mem.session = null;
  mem.packs = null;
  mem.added = null;
}
