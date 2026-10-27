/**
 * Data layer for Fun Zone Inventory.
 *
 * The screens only talk to this file. Google Sheets is the source of truth
 * once a web app link is saved (see js/config.js and the Sheet connection
 * screen). localStorage is the offline copy: the last item list, the last
 * barcode list, the session on this phone, and anything that could not be
 * sent yet.
 *
 * Until that link is saved, the bundled September 2026 lists and the six
 * real barcodes in this file are the fallback. A pending item still needs a
 * row on that store's month tab (column A name, column B ticket value) and
 * a row on the FunZone Barcodes sheet.
 *
 * Which cells a count changes is decided only in js/sheetmap.js
 * (mapCountOntoRow). The Apps Script copy of that function writes the cells.
 *
 * Barcode strings keep their leading zeros. They are never turned into numbers.
 */

import { SCRIPT_URL } from "./config.js";
import { countSheetDelta, entryAmount } from "./sheetmap.js";

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
  testing: "fz-testing",
  connection: "fz-sheet-connection",
  catalog: "fz-sheet-catalog",
  barcodes: "fz-sheet-barcodes",
  outbox: "fz-sheet-outbox",
  status: "fz-sheet-status",
};

const mem = {
  learned: null,
  session: null,
  packs: null,
  added: null,
  catalog: null,
  barcodes: undefined,
  outbox: null,
};

const ZERO_AMOUNT = { pieces: 0, ounces: 0, quarters: 0 };
let sheetClient = null;
let chain = Promise.resolve();
let pumping = false;

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

function readCatalog() {
  if (mem.catalog == null) mem.catalog = readJSON(KEYS.catalog, {});
  return mem.catalog;
}

function readBarcodeCache() {
  if (mem.barcodes === undefined) {
    const raw = globalThis.localStorage?.getItem(KEYS.barcodes);
    const saved = raw ? readJSON(KEYS.barcodes, null) : null;
    mem.barcodes = saved && Array.isArray(saved.rows) ? saved : null;
  }
  return mem.barcodes;
}

function readOutbox() {
  if (mem.outbox == null) {
    const saved = readJSON(KEYS.outbox, []);
    mem.outbox = Array.isArray(saved) ? saved : [];
  }
  return mem.outbox;
}

function writeOutbox(jobs) {
  mem.outbox = jobs;
  writeJSON(KEYS.outbox, jobs);
}

function sheetItems(store) {
  const block = readCatalog()[store];
  if (!block || !Array.isArray(block.items)) return null;
  return block.items.map((item) => ({
    name: String(item.name || "").trim(),
    tickets: item.tickets == null || item.tickets === "" ? null : Number(item.tickets),
    fullBin: item.fullBin > 0 ? Number(item.fullBin) : null,
    perOz: item.perOz > 0 ? Number(item.perOz) : null,
    barcode: item.barcode || null,
  })).filter((item) => item.name);
}

function storeItems(store) {
  const fromSheet = sheetItems(store);
  const catalog = fromSheet || (ITEMS[store] || []).map((item) => ({ ...item }));
  const names = new Set(catalog.map((item) => item.name.toLowerCase()));
  const extras = (readAdded()[store] || []).filter((item) => item?.name && !names.has(item.name.toLowerCase()));
  return [...catalog, ...extras];
}

function cachedBarcodeRows() {
  const saved = readBarcodeCache();
  return saved && Array.isArray(saved.rows) ? saved.rows : null;
}

export function getTesting() {
  const saved = readJSON(KEYS.testing, {});
  return {
    skipCounts: !!saved.skipCounts,
    skipBarcodes: !!saved.skipBarcodes,
    skipItems: !!saved.skipItems,
  };
}

export function setTesting(partial = {}) {
  const next = { ...getTesting(), ...partial };
  writeJSON(KEYS.testing, {
    skipCounts: !!next.skipCounts,
    skipBarcodes: !!next.skipBarcodes,
    skipItems: !!next.skipItems,
  });
  return getTesting();
}

export function testingOn() {
  const flags = getTesting();
  return flags.skipCounts || flags.skipBarcodes || flags.skipItems;
}

export function getConnection() {
  const saved = readJSON(KEYS.connection, {});
  const savedUrl = String(saved.url || "").trim();
  const url = savedUrl || String(SCRIPT_URL || "").trim();
  const pin = String(saved.pin || "");
  return { url, pin, configured: url.length > 0, fromPhone: savedUrl.length > 0 };
}

export function saveConnection({ url, pin } = {}) {
  writeJSON(KEYS.connection, {
    url: String(url || "").trim(),
    pin: String(pin ?? ""),
  });
  queueUnsynced();
  return getConnection();
}

export function getSheetStatus() {
  const saved = readJSON(KEYS.status, {});
  return {
    error: saved.error || "",
    message: saved.message || "",
    tab: saved.tab || "",
    okAt: saved.okAt || null,
  };
}

function setSheetStatus(partial) {
  writeJSON(KEYS.status, { ...getSheetStatus(), ...partial });
}

export function setSheetClient(client) {
  sheetClient = client;
}

export function sheetEnabled() {
  return !!sheetClient || getConnection().configured;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function jobKey(job) {
  if (job.action === "addItem") return "add:" + job.store + ":" + job.name;
  if (job.action === "saveBarcode") return "bar:" + job.store + ":" + job.code + ":" + job.name;
  return "job:" + job.id;
}

function publicPayload(action, body) {
  const payload = { action };
  for (const [key, value] of Object.entries(body || {})) {
    if (key === "action" || key === "id" || key === "entryId" || key === "undo") continue;
    payload[key] = value;
  }
  return payload;
}

async function sheetRequest(action, body) {
  const payload = publicPayload(action, body);
  let data;
  if (sheetClient) {
    data = await sheetClient(payload);
  } else {
    const conn = getConnection();
    if (!conn.configured) {
      const err = new Error("Google Sheet is not connected yet.");
      err.code = "not-configured";
      throw err;
    }
    let text = "";
    try {
      const response = await fetch(conn.url, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, pin: conn.pin }),
      });
      text = await response.text();
    } catch {
      const err = new Error("Couldn't reach the sheet. Check the link, and that the script is deployed as Anyone.");
      err.code = "offline";
      throw err;
    }
    try {
      data = JSON.parse(text);
    } catch {
      const err = new Error("That link didn't answer with sheet data. Check the web app URL.");
      err.code = "bad-response";
      throw err;
    }
  }
  if (!data || data.ok === false) {
    const err = new Error(data?.message || data?.error || "The sheet didn't accept that.");
    err.code = data?.error || "sheet-error";
    throw err;
  }
  return data;
}

function isPermanent(err) {
  return err?.code === "not-on-sheet" || err?.code === "unknown-action";
}

function schedulePump() {
  chain = chain.then(() => pumpAll()).catch(() => {});
  return chain;
}

export function whenSheetIdle() {
  return chain;
}

async function pumpAll() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const box = readOutbox();
      if (!box.length) break;
      const job = box[0];
      try {
        const result = await sheetRequest(job.action, job);
        const current = readOutbox();
        if (current[0] && current[0].id === job.id) current.shift();
        else {
          const index = current.findIndex((item) => item.id === job.id);
          if (index >= 0) current.splice(index, 1);
        }
        writeOutbox(current);
        markJobDone(job, result);
      } catch (err) {
        markJobFailed(job, err);
        if (!isPermanent(err)) break;
        const current = readOutbox();
        const index = current.findIndex((item) => item.id === job.id);
        if (index >= 0) current.splice(index, 1);
        writeOutbox(current);
      }
    }
  } finally {
    pumping = false;
  }
}

function markEntry(entryId, sync, extra) {
  if (entryId == null) return;
  const session = readSession();
  const entry = session.entries.find((item) => item.id === entryId);
  if (!entry) return;
  entry.sheetSync = sync;
  if (extra) Object.assign(entry, extra);
  writeJSON(KEYS.session, session);
}

function markJobDone(job, result) {
  if (job.action === "applyCount") reconcileCount(job, result || {});
  if (job.action === "addItem") clearItemPending(job.store, job.name);
  if (job.action === "saveBarcode") clearBarcodePending(job.store, job.code);
  const status = getSheetStatus();
  setSheetStatus({ error: "", message: status.tab ? status.message : "", okAt: Date.now() });
}

function reconcileCount(job, result) {
  const session = readSession();
  const entry = session.entries.find((item) => item.id === job.entryId);
  const skipped = Array.isArray(result.skipped) ? result.skipped : [];
  if (entry && entry.sheetApplied && job.delta) {
    const skipPiece = skipped.some((item) => item.column === "J" || item.column === "K" || item.column === "L" || item.reason === "unknown section");
    const skipWeight = skipped.some((item) => item.column === "F" || item.column === "G");
    const skipBin = skipped.some((item) => item.column === "U");
    if (skipPiece) entry.sheetApplied.pieces -= Number(job.delta.pieces) || 0;
    if (skipWeight) entry.sheetApplied.ounces -= Number(job.delta.ounces) || 0;
    if (skipBin) entry.sheetApplied.quarters -= Number(job.delta.quarters) || 0;
    entry.sheetSync = skipped.length ? "partial" : "saved";
    entry.sheetError = skipped.length
      ? "A formula is in that cell, so the sheet was left alone."
      : "";
  } else if (entry) {
    entry.sheetSync = "saved";
  }
  writeJSON(KEYS.session, session);
}

function markJobFailed(job, err) {
  if (job.action === "applyCount" && isPermanent(err)) {
    const session = readSession();
    const entry = session.entries.find((item) => item.id === job.entryId);
    if (entry && entry.sheetApplied && job.delta) {
      entry.sheetApplied = {
        pieces: (Number(entry.sheetApplied.pieces) || 0) - (Number(job.delta.pieces) || 0),
        ounces: (Number(entry.sheetApplied.ounces) || 0) - (Number(job.delta.ounces) || 0),
        quarters: (Number(entry.sheetApplied.quarters) || 0) - (Number(job.delta.quarters) || 0),
      };
      entry.sheetSync = "error";
      entry.sheetError = err.message;
      writeJSON(KEYS.session, session);
    }
  } else if (job.entryId != null) {
    markEntry(job.entryId, "queued", { sheetError: err.message || "" });
  }
  setSheetStatus({ error: err.code || "offline", message: err.message || "Couldn't reach the sheet." });
}

function enqueue(job) {
  const box = readOutbox();
  const record = { id: makeId(), ...job };
  const key = jobKey(record);
  if (job.action !== "applyCount" && box.some((item) => jobKey(item) === key)) {
    schedulePump();
    return;
  }
  box.push(record);
  writeOutbox(box);
  schedulePump();
}

function clearItemPending(store, name) {
  const added = readAdded();
  const list = added[store] || [];
  for (const item of list) {
    if (item.name === name) delete item.pending;
  }
  writeJSON(KEYS.added, added);
}

function clearBarcodePending(store, code) {
  const learned = readLearned();
  const normalized = normalizeCode(code);
  const row = learned[store + ":" + normalized];
  if (row) {
    delete row.pending;
    writeJSON(KEYS.learned, learned);
  }
}

function queueUnsynced() {
  if (!sheetEnabled()) return;
  const testing = getTesting();
  const box = readOutbox();
  const keys = new Set(box.map(jobKey));
  if (!testing.skipItems) {
    for (const item of getPendingSheetRows().items) {
      const job = { action: "addItem", store: item.store, name: item.name, ticketValue: item.ticketValue };
      const key = jobKey(job);
      if (keys.has(key)) continue;
      box.push({ id: makeId(), ...job });
      keys.add(key);
    }
  }
  if (!testing.skipBarcodes) {
    for (const row of getPendingSheetRows().barcodes) {
      const job = {
        action: "saveBarcode",
        code: row.code,
        store: row.store,
        name: row.name,
        notes: "New product",
      };
      const key = jobKey(job);
      if (keys.has(key)) continue;
      box.push({ id: makeId(), ...job });
      keys.add(key);
    }
  }
  writeOutbox(box);
  if (box.length) schedulePump();
}

function applyCatalog(store, payload) {
  const catalog = readCatalog();
  catalog[store] = {
    tab: payload.tab || "",
    items: Array.isArray(payload.items) ? payload.items : [],
    fetchedAt: Date.now(),
  };
  mem.catalog = catalog;
  writeJSON(KEYS.catalog, catalog);
}

function applyBarcodes(rows) {
  mem.barcodes = { rows, fetchedAt: Date.now() };
  writeJSON(KEYS.barcodes, mem.barcodes);
}

export async function refreshStore(store) {
  if (store !== "WPR" && store !== "CPR") return { ok: false, reason: "bad-store" };
  if (!sheetEnabled()) return { ok: false, reason: "not-configured" };
  try {
    const data = await sheetRequest("getCatalog", { store });
    applyCatalog(store, data);
    if (Array.isArray(data.barcodes)) applyBarcodes(data.barcodes);
    setSheetStatus({ error: "", message: "", tab: data.tab || "", okAt: Date.now() });
    queueUnsynced();
    await whenSheetIdle();
    return { ok: true, tab: data.tab || "" };
  } catch (err) {
    setSheetStatus({ error: err.code || "offline", message: err.message || "Couldn't reach the sheet." });
    return { ok: false, reason: err.code || "offline", message: err.message || "" };
  }
}

export async function testConnection() {
  const conn = getConnection();
  if (!sheetEnabled()) return { ok: false, message: "Paste the web app link first." };
  if (!conn.pin && !sheetClient) return { ok: false, message: "Enter the PIN." };
  try {
    await sheetRequest("ping", {});
    setSheetStatus({ error: "", message: "Connected.", okAt: Date.now() });
    return { ok: true, message: "Connected. Pick a store and this month's tab opens." };
  } catch (err) {
    setSheetStatus({ error: err.code || "offline", message: err.message || "Couldn't reach the sheet." });
    return { ok: false, message: err.message || "Couldn't reach the sheet." };
  }
}

function amountOf(applied) {
  return {
    pieces: Number(applied?.pieces) || 0,
    ounces: Number(applied?.ounces) || 0,
    quarters: Number(applied?.quarters) || 0,
  };
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
  const sheetRows = cachedBarcodeRows();
  const table = sheetRows || REAL_BARCODES;
  const real = table.find((row) => normalizeCode(row.code) === normalized);
  if (real) {
    const name = String(real[store] || "").trim();
    if (!name) return result;
    result.item = resolveName(items, name, String(real.code));
    result.source = "barcode";
    return result;
  }
  if (sheetRows) return result;
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
  const send = sheetEnabled() && !getTesting().skipBarcodes;
  if (options.pending || !send) row.pending = true;
  learned[store + ":" + normalized] = row;
  writeJSON(KEYS.learned, learned);
  if (send) {
    enqueue({
      action: "saveBarcode",
      code: raw,
      store,
      name,
      notes: options.notes || (options.pending ? "New product" : "Matched in the app"),
    });
  }
  return { code: raw, normalized, store, name, pending: !!row.pending };
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
  if (sheetEnabled() && !getTesting().skipItems) {
    enqueue({
      action: "addItem",
      store,
      name: item.name,
      ticketValue: item.tickets,
    });
  }
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
  if (e.sheetApplied) out.sheetApplied = { ...e.sheetApplied };
  if (e.sheetSync) out.sheetSync = e.sheetSync;
  if (e.sheetError) out.sheetError = e.sheetError;
  return out;
}

function baselineFor(entry, replaceIds) {
  const session = readSession();
  if (entry.id != null) {
    const existing = session.entries.find((item) => item.id === entry.id);
    return amountOf(existing?.sheetApplied);
  }
  const drop = new Set(replaceIds || []);
  return (session.entries || []).reduce((sum, item) => {
    if (!drop.has(item.id)) return sum;
    const applied = amountOf(item.sheetApplied);
    return {
      pieces: sum.pieces + applied.pieces,
      ounces: sum.ounces + applied.ounces,
      quarters: sum.quarters + applied.quarters,
    };
  }, { ...ZERO_AMOUNT });
}

function queueCount(stored, delta) {
  const meaningful = delta.pieces || delta.ounces || delta.quarters;
  if (!meaningful) {
    stored.sheetSync = "saved";
    return;
  }
  stored.sheetSync = "pending";
  enqueue({
    action: "applyCount",
    store: stored.store,
    item: stored.item,
    section: stored.section,
    kind: stored.kind,
    entryId: stored.id,
    delta,
  });
}

export function getCounts() {
  return readSession().entries.map((entry) => ({ ...entry }));
}

// Save one count. Pass replaceIds to drop earlier counts of the same item
// in this section (the "Replace earlier" choice). An entry that already has
// an id is updated in place.
export function saveCount(entry, replaceIds = []) {
  const session = readSession();
  const baseline = baselineFor(entry, replaceIds);
  let savedId;
  let stored;
  if (entry.id != null) {
    savedId = entry.id;
    session.entries = session.entries.map((existing) => {
      if (existing.id !== entry.id) return existing;
      stored = cleanEntry({
        ...entry,
        id: existing.id,
        store: existing.store,
        section: existing.section,
        item: existing.item,
        tickets: existing.tickets,
        fullBin: existing.fullBin,
        perOz: existing.perOz,
      });
      return stored;
    });
  } else {
    const drop = new Set(replaceIds || []);
    stored = cleanEntry({ ...entry, id: session.nextId++ });
    savedId = stored.id;
    session.entries = session.entries.filter((existing) => !drop.has(existing.id));
    session.entries.unshift(stored);
  }
  if (!stored) {
    writeJSON(KEYS.session, session);
    return null;
  }
  const delta = countSheetDelta(stored, baseline);
  const skip = !sheetEnabled() || getTesting().skipCounts;
  if (skip) {
    // Leave the sheet as it was. Counts made while testing stay on the phone
    // until someone edits them after testing is turned off.
    stored.sheetApplied = baseline;
    stored.sheetSync = sheetEnabled() ? "skipped" : "local";
  } else {
    stored.sheetApplied = entryAmount(stored);
    queueCount(stored, delta);
  }
  writeJSON(KEYS.session, session);
  return session.entries.find((existing) => existing.id === savedId) || null;
}

export function removeCount(id) {
  const session = readSession();
  const existing = session.entries.find((entry) => entry.id === id);
  session.entries = session.entries.filter((entry) => entry.id !== id);
  writeJSON(KEYS.session, session);
  if (existing && sheetEnabled() && !getTesting().skipCounts) {
    const applied = amountOf(existing.sheetApplied);
    if (applied.pieces || applied.ounces || applied.quarters) {
      enqueue({
        action: "applyCount",
        store: existing.store,
        item: existing.item,
        section: existing.section,
        kind: existing.kind,
        entryId: existing.id,
        undo: true,
        delta: {
          pieces: -applied.pieces,
          ounces: -applied.ounces,
          quarters: -applied.quarters,
        },
      });
    }
  }
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
  mem.catalog = {};
  mem.barcodes = undefined;
  mem.outbox = [];
  writeJSON(KEYS.learned, mem.learned);
  writeJSON(KEYS.session, mem.session);
  writeJSON(KEYS.packs, mem.packs);
  writeJSON(KEYS.added, mem.added);
  writeJSON(KEYS.prefs, {});
  writeJSON(KEYS.catalog, {});
  writeJSON(KEYS.outbox, []);
  writeJSON(KEYS.testing, {});
  writeJSON(KEYS.connection, {});
  writeJSON(KEYS.status, {});
  try {
    globalThis.localStorage?.removeItem(KEYS.barcodes);
  } catch {
    // ignore
  }
}

// Drop the in-memory cache so the next read comes from localStorage.
export function reloadLocalData() {
  mem.learned = null;
  mem.session = null;
  mem.packs = null;
  mem.added = null;
  mem.catalog = null;
  mem.barcodes = undefined;
  mem.outbox = null;
}
