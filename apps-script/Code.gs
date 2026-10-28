/**
 * Fun Zone Inventory — Google Apps Script web app.
 *
 * Cassidy deploys this once. The phone site calls it. The script runs as
 * Cassidy, so staff do not sign in with Google. A PIN in Script properties
 * (FUNZONE_PIN) is the only password.
 *
 * Setup steps are in SETUP.md at the root of the funzone-inventory repo.
 *
 * The count math in mapCountOntoRow_ must stay in step with
 * js/sheetmap.js mapCountOntoRow. That function is the one place that
 * decides which cells a count changes.
 *
 * Count columns (F, G, J, K, L, U) can replace a plain number or hand math
 * such as =72*2-12. A formula that names a cell or a function is left alone.
 * Column D is never replaced when it already has a formula.
 *
 * Do not add @OnlyCurrentDoc. This script opens the inventory file and the
 * barcodes file by id. If the project is limited to the current spreadsheet,
 * saves fail with "Specified permissions are not sufficient to call
 * SpreadsheetApp.openById". The scopes to put in appsscript.json are in SETUP.md.
 */

var FOLDER_ID = "11ba7qa03V3YR4frWvtsp6R0wtxvH-j0T";
var INVENTORY_2026_ID = "1Y2YfTxk5BmEvXTbjAyW5V61rKVwlxpTRx5mz9q5bme4";
var BARCODES_ID = "1GmgIaz8z2V-zBXUak8iGjzDGNsWRVIITrLJ98GXiIdc";
var TIMEZONE = "America/Chicago";

// Same names as js/sheetmap.js MONTH_ABBR.
var MONTH_ABBR = {
  1: "Jan",
  2: "Feb",
  3: "Mar",
  4: "Apr",
  5: "May",
  6: "June",
  7: "July",
  8: "Aug",
  9: "Sept",
  10: "Oct",
  11: "Nov",
  12: "Dec"
};

var MONTH_INDEX = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

// Plain count inputs blanked on a brand-new month tab, and nowhere else.
// Same columns as MONTH_RESET_COLUMNS in js/sheetmap.js: F G J K L U.
// Formulas in these columns are left alone. Every other column stays as copied.
var CLEAR_COLS = [6, 7, 10, 11, 12, 21]; // F G J K L U

var SECTION_COL = { Front: 10, Back: 11, "Break Room": 12 }; // J K L

function doGet(e) {
  var params = (e && e.parameter) || {};
  return respond_(handle_({
    pin: params.pin || "",
    action: params.action || "ping",
    store: params.store || ""
  }));
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    return respond_(handle_(body));
  } catch (err) {
    return respond_({ ok: false, error: "bad-json", message: "The app sent something this script could not read." });
  }
}

function respond_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function handle_(body) {
  body = body || {};
  var expected = PropertiesService.getScriptProperties().getProperty("FUNZONE_PIN") || "";
  if (!expected) {
    return {
      ok: false,
      error: "pin-not-set",
      message: "The script does not have a PIN yet. Add Script property FUNZONE_PIN."
    };
  }
  if (!pinsMatch_(body.pin, expected)) {
    return { ok: false, error: "bad-pin", message: "That PIN doesn't match." };
  }
  var action = String(body.action || "");
  if (action === "ping") return { ok: true, message: "Connected." };
  try {
    if (action === "getCatalog") return withLock_(function () { return getCatalog_(body); });
    if (action === "applyCount") return withLock_(function () { return applyCount_(body); });
    if (action === "saveBarcode") return withLock_(function () { return saveBarcode_(body); });
    if (action === "addItem") return withLock_(function () { return addItem_(body); });
    if (action === "savePerOz") return withLock_(function () { return savePerOz_(body); });
    if (action === "saveFullBin") return withLock_(function () { return saveMeasure_(body, 20); });
    if (action === "saveFrontCount") return withLock_(function () { return saveMeasure_(body, 9); });
  } catch (err) {
    return { ok: false, error: err.code || "script-error", message: err.message || String(err) };
  }
  return { ok: false, error: "unknown-action", message: "Unknown action." };
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function pinsMatch_(given, expected) {
  given = String(given || "");
  expected = String(expected || "");
  if (!expected || given.length !== expected.length) return false;
  var mismatch = 0;
  for (var i = 0; i < expected.length; i++) {
    mismatch |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

function storeNow_() {
  var stamp = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-M");
  var parts = stamp.split("-");
  return { year: Number(parts[0]), month: Number(parts[1]) };
}

function parseTab_(name) {
  var match = String(name || "").trim().match(/^(WPR|CPR)\s*-?\s*([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  var month = MONTH_INDEX[match[2].toLowerCase()];
  if (!month) return null;
  return { store: match[1], month: month, year: Number(match[3]), name: String(name).trim() };
}

function openInventory_(year) {
  var name = "FunZone Inventory " + year;
  try {
    var folder = DriveApp.getFolderById(FOLDER_ID);
    var files = folder.getFilesByName(name);
    if (files.hasNext()) return SpreadsheetApp.open(files.next());
  } catch (err) {
    // Fall through to the known 2026 file if Drive lookup fails.
  }
  if (String(year) === "2026") return SpreadsheetApp.openById(INVENTORY_2026_ID);
  var error = new Error("There's no spreadsheet named " + name + " in the Fun Zone Information folder.");
  error.code = "no-spreadsheet";
  throw error;
}

function ensureMonth_(ss, store) {
  if (store !== "WPR" && store !== "CPR") {
    var bad = new Error("Unknown store.");
    bad.code = "bad-store";
    throw bad;
  }
  var now = storeNow_();
  var desired = store + " - " + MONTH_ABBR[now.month] + " " + now.year;
  var sheets = ss.getSheets();
  var parsed = [];
  for (var i = 0; i < sheets.length; i++) {
    var info = parseTab_(sheets[i].getName());
    if (info && info.store === store) parsed.push(info);
  }
  for (var j = 0; j < parsed.length; j++) {
    if (parsed[j].year === now.year && parsed[j].month === now.month) {
      return ss.getSheetByName(parsed[j].name);
    }
  }
  var cursor = now.year * 12 + now.month;
  var best = null;
  for (var k = 0; k < parsed.length; k++) {
    var score = parsed[k].year * 12 + parsed[k].month;
    if (score < cursor && (!best || score > best.score)) best = { score: score, name: parsed[k].name };
  }
  if (!best) {
    var missing = new Error("No earlier month tab to copy for " + store + ".");
    missing.code = "no-previous-tab";
    throw missing;
  }
  var source = ss.getSheetByName(best.name);
  // Measure the previous tab first. getLastRow() on a sheet that copyTo()
  // just returned is often 0 until the copy finishes, and the old clear
  // then skipped every column. September's Front / Back / Break Room
  // numbers stayed on October. The previous tab is only read.
  var lastRow = source.getLastRow();
  var masks = countInputFormulaMask_(source, lastRow);
  var copy = source.copyTo(ss);
  copy.setName(desired);
  ss.setActiveSheet(copy);
  ss.moveActiveSheet(ss.getNumSheets());
  clearPlainCountInputs_(copy, masks);
  SpreadsheetApp.flush();
  return copy;
}

// True when a count formula names a cell or a function and must be kept.
// Same test as keepsCountFormula in js/sheetmap.js. Hand math has no letters
// after "=" (=72*2-12, =6*12-1, =(7*4+7+36)*12, =100+1200) and is not kept.
function keepsCountFormula_(formula) {
  var text = String(formula || "").replace(/^\s+|\s+$/g, "");
  if (!text || text.charAt(0) !== "=") return false;
  return /[A-Za-z]/.test(text.substring(1));
}

// True where a count-input cell on the source tab must be kept.
// Index i of the result matches CLEAR_COLS[i]. Row 0 of each mask is sheet row 2.
function countInputFormulaMask_(sheet, lastRow) {
  var masks = [];
  var height = lastRow - 1;
  for (var i = 0; i < CLEAR_COLS.length; i++) {
    var mask = [];
    if (height >= 1 && CLEAR_COLS[i] <= sheet.getMaxColumns()) {
      var formulas = sheet.getRange(2, CLEAR_COLS[i], height, 1).getFormulas();
      for (var r = 0; r < formulas.length; r++) mask.push(keepsCountFormula_(formulas[r][0]));
    }
    masks.push(mask);
  }
  return masks;
}

// Blank plain values and hand-math formulas in F, G, J, K, L, and U on the
// copied tab only. masks come from the previous tab. A true entry names a
// cell or a function and is not cleared.
// Same run rules as plainCountRuns in js/sheetmap.js.
function clearPlainCountInputs_(sheet, masks) {
  for (var i = 0; i < CLEAR_COLS.length; i++) {
    var runs = plainCountRuns_(masks[i] || []);
    for (var j = 0; j < runs.length; j++) {
      sheet.getRange(runs[j].startRow, CLEAR_COLS[i], runs[j].numRows, 1).clearContent();
    }
  }
}

function plainCountRuns_(formulaMask) {
  var runs = [];
  var start = -1;
  var mask = formulaMask || [];
  for (var r = 0; r <= mask.length; r++) {
    var keep = r < mask.length && mask[r];
    if (r < mask.length && !keep) {
      if (start < 0) start = r;
    } else if (start >= 0) {
      runs.push({ startRow: start + 2, numRows: r - start });
      start = -1;
    }
  }
  return runs;
}

function getCatalog_(body) {
  var store = body.store === "CPR" ? "CPR" : "WPR";
  var now = storeNow_();
  var ss = openInventory_(now.year);
  var sheet = ensureMonth_(ss, store);
  return {
    ok: true,
    tab: sheet.getName(),
    spreadsheet: ss.getName(),
    items: readItems_(sheet),
    barcodes: readBarcodes_(),
    binItems: readBinItems_()
  };
}

function readItems_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, 21).getValues();
  var items = [];
  for (var i = 0; i < values.length; i++) {
    var name = String(values[i][0] || "").replace(/\s+$/g, "").replace(/^\s+/g, "");
    if (!name) continue;
    var perOz = numOrNull_(values[i][3]); // D
    var fullBin = numOrNull_(values[i][19]); // T
    var frontCount = numOrNull_(values[i][8]); // I, how many in front
    items.push({
      row: i + 2,
      name: name,
      tickets: numOrNull_(values[i][1]),
      perOz: perOz != null && perOz > 0 ? perOz : null,
      fullBin: fullBin != null && fullBin > 0 ? fullBin : null,
      frontCount: frontCount
    });
  }
  return items;
}

function numOrNull_(value) {
  if (value === "" || value == null || typeof value === "boolean") return null;
  var n = Number(value);
  return isFinite(n) ? n : null;
}

// Bin Items tab on the barcodes spreadsheet. Missing tab means no bins.
function readBinItems_() {
  var ss;
  try {
    ss = SpreadsheetApp.openById(BARCODES_ID);
  } catch (err) {
    return [];
  }
  var sheet = ss.getSheetByName("Bin Items");
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var wpr = String(values[i][1] || "").replace(/^\s+|\s+$/g, "");
    var cpr = String(values[i][2] || "").replace(/^\s+|\s+$/g, "");
    if (!wpr && !cpr) continue;
    rows.push({
      short: String(values[i][0] || "").replace(/^\s+|\s+$/g, ""),
      WPR: wpr,
      CPR: cpr,
      doubleBin: isDoubleBin_(values[i][3]),
      notes: String(values[i][4] || "").replace(/^\s+|\s+$/g, "")
    });
  }
  return rows;
}

function isDoubleBin_(value) {
  if (value === true) return true;
  var text = String(value == null ? "" : value).replace(/^\s+|\s+$/g, "").toLowerCase();
  return text === "yes" || text === "true" || text === "y";
}

// Write a whole number into T (full bin) or I (front of the bin).
// A blank cell or a plain number can be set. Any formula is left alone.
function saveMeasure_(body, col) {
  var store = body.store === "CPR" ? "CPR" : "WPR";
  var pieces = Number(body.pieces);
  if (!isFinite(pieces) || pieces <= 0 || Math.round(pieces) !== pieces) {
    return { ok: false, error: "bad-measure", message: "Enter a whole number of pieces." };
  }
  var now = storeNow_();
  var ss = openInventory_(now.year);
  var sheet = ensureMonth_(ss, store);
  var row = findItemRow_(sheet, body.item);
  if (!row) {
    return {
      ok: false,
      error: "not-on-sheet",
      message: String(body.item || "That item") + " is not on " + sheet.getName() + "."
    };
  }
  var cell = sheet.getRange(row, col);
  if (cell.getFormula()) {
    return { ok: true, skipped: "formula", tab: sheet.getName() };
  }
  cell.setValue(pieces);
  return { ok: true, pieces: pieces, tab: sheet.getName() };
}

function readBarcodes_() {
  var ss = SpreadsheetApp.openById(BARCODES_ID);
  var sheet = ss.getSheetByName("Barcodes");
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getDisplayValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var code = String(values[i][0] || "").replace(/^\s+|\s+$/g, "");
    if (!code) continue;
    rows.push({
      code: code,
      WPR: String(values[i][1] || "").replace(/^\s+|\s+$/g, ""),
      CPR: String(values[i][2] || "").replace(/^\s+|\s+$/g, ""),
      addedBy: String(values[i][3] || "").replace(/^\s+|\s+$/g, ""),
      date: String(values[i][4] || "").replace(/^\s+|\s+$/g, ""),
      notes: String(values[i][5] || "").replace(/^\s+|\s+$/g, "")
    });
  }
  return rows;
}

function findItemRow_(sheet, name) {
  var wanted = String(name || "").replace(/^\s+|\s+$/g, "");
  if (!wanted) return 0;
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var names = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  var fuzzy = 0;
  for (var i = 0; i < names.length; i++) {
    var value = String(names[i][0] || "").replace(/^\s+|\s+$/g, "");
    if (!value) continue;
    if (value === wanted) return i + 2;
    if (!fuzzy && value.toLowerCase() === wanted.toLowerCase()) fuzzy = i + 2;
  }
  return fuzzy;
}

function applyCount_(body) {
  var store = body.store === "CPR" ? "CPR" : "WPR";
  var now = storeNow_();
  var ss = openInventory_(now.year);
  var sheet = ensureMonth_(ss, store);
  var row = findItemRow_(sheet, body.item);
  if (!row) {
    return {
      ok: false,
      error: "not-on-sheet",
      message: String(body.item || "That item") + " is not on " + sheet.getName() + "."
    };
  }
  var mapped = mapCountOntoRow_(sheet, row, body.section, body.delta || {});
  return {
    ok: true,
    tab: sheet.getName(),
    row: row,
    updates: mapped.updates,
    skipped: mapped.skipped
  };
}

/**
 * Same rules as mapCountOntoRow in js/sheetmap.js.
 * delta: { pieces, ounces, quarters }. pieces go to the section column.
 * ounces are added onto F/G no matter which section. quarters are added onto U.
 */
function mapCountOntoRow_(sheet, row, section, delta) {
  var pieces = Number(delta.pieces) || 0;
  var ounces = Number(delta.ounces) || 0;
  var quarters = Number(delta.quarters) || 0;
  var updates = {};
  var skipped = [];

  if (pieces) {
    var col = SECTION_COL[section];
    if (!col) skipped.push({ column: null, reason: "unknown section" });
    else writeAddedNumber_(sheet, row, col, pieces, updates, skipped, !!delta.allowNegative);
  }

  if (ounces) {
    var fFormula = sheet.getRange(row, 6).getFormula();
    var gFormula = sheet.getRange(row, 7).getFormula();
    var fRaw = sheet.getRange(row, 6).getValue();
    var gRaw = sheet.getRange(row, 7).getValue();
    if (keepsCountFormula_(fFormula) || keepsCountFormula_(gFormula)) {
      if (keepsCountFormula_(fFormula)) skipped.push({ column: "F", reason: "formula" });
      if (keepsCountFormula_(gFormula)) skipped.push({ column: "G", reason: "formula" });
    } else if (typeof fRaw === "boolean" || typeof gRaw === "boolean") {
      if (typeof fRaw === "boolean") skipped.push({ column: "F", reason: "not a number" });
      if (typeof gRaw === "boolean") skipped.push({ column: "G", reason: "not a number" });
    } else {
      var total = numberOrZero_(fRaw) * 16 + numberOrZero_(gRaw) + ounces;
      var split = splitOunces_(total);
      sheet.getRange(row, 6).setValue(split.lb);
      sheet.getRange(row, 7).setValue(split.oz);
      updates.F = split.lb;
      updates.G = split.oz;
    }
  }

  if (quarters) writeAddedNumber_(sheet, row, 21, quarters, updates, skipped, false);
  return { updates: updates, skipped: skipped };
}

function writeAddedNumber_(sheet, row, col, delta, updates, skipped, allowNegative) {
  var letter = columnLetter_(col);
  var range = sheet.getRange(row, col);
  if (keepsCountFormula_(range.getFormula())) {
    skipped.push({ column: letter, reason: "formula" });
    return;
  }
  var currentRaw = range.getValue();
  if (typeof currentRaw === "boolean") {
    skipped.push({ column: letter, reason: "not a number" });
    return;
  }
  var raw = numberOrZero_(currentRaw) + delta;
  var next = raw < 0 && !allowNegative ? 0 : Math.round(raw * 1000) / 1000;
  range.setValue(next);
  updates[letter] = next;
}

function numberOrZero_(value) {
  if (value === "" || value == null) return 0;
  var n = Number(value);
  return isFinite(n) ? n : 0;
}

function splitOunces_(totalOz) {
  var safe = Math.max(0, Math.round(totalOz * 10) / 10);
  var lb = Math.floor((safe + 1e-9) / 16);
  var oz = Math.round((safe - lb * 16) * 10) / 10;
  if (oz >= 16) {
    lb += 1;
    oz = 0;
  }
  return { lb: lb, oz: oz };
}

function columnLetter_(col) {
  var letters = { 6: "F", 7: "G", 10: "J", 11: "K", 12: "L", 21: "U" };
  return letters[col] || String(col);
}

function saveBarcode_(body) {
  var store = body.store === "CPR" ? "CPR" : "WPR";
  var code = String(body.code || "").replace(/[\s-]/g, "");
  var name = String(body.name || "").replace(/^\s+|\s+$/g, "");
  if (!code || !name) return { ok: false, error: "bad-barcode", message: "Missing barcode or item name." };
  var ss = SpreadsheetApp.openById(BARCODES_ID);
  var sheet = ss.getSheetByName("Barcodes");
  if (!sheet) {
    var missing = new Error("The Barcodes tab is missing.");
    missing.code = "no-barcodes-tab";
    throw missing;
  }
  var target = normalizeCode_(code);
  var last = sheet.getLastRow();
  var found = 0;
  if (last >= 2) {
    var codes = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
    for (var i = 0; i < codes.length; i++) {
      var existing = String(codes[i][0] || "").replace(/[\s-]/g, "");
      if (existing && normalizeCode_(existing) === target) {
        found = i + 2;
        break;
      }
    }
  }
  var nameCol = store === "CPR" ? 3 : 2;
  if (found) {
    sheet.getRange(found, nameCol).setValue(name);
    return { ok: true, mode: "updated", row: found };
  }
  var dest = Math.max(last, 1) + 1;
  var codeCell = sheet.getRange(dest, 1);
  codeCell.setNumberFormat("@");
  codeCell.setValue(code);
  sheet.getRange(dest, nameCol).setValue(name);
  sheet.getRange(dest, 4).setValue("Fun Zone app");
  sheet.getRange(dest, 5).setValue(Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd"));
  sheet.getRange(dest, 6).setValue(body.notes || "Matched in the app");
  return { ok: true, mode: "appended", row: dest };
}

function addItem_(body) {
  var store = body.store === "CPR" ? "CPR" : "WPR";
  var name = String(body.name || "").replace(/^\s+|\s+$/g, "");
  var tickets = Number(body.ticketValue);
  if (!name) return { ok: false, error: "bad-item", message: "Missing product name." };
  if (!isFinite(tickets) || tickets < 0 || Math.round(tickets) !== tickets) {
    return { ok: false, error: "bad-item", message: "Ticket value has to be a whole number." };
  }
  var now = storeNow_();
  var ss = openInventory_(now.year);
  var sheet = ensureMonth_(ss, store);
  var existing = findItemRow_(sheet, name);
  if (existing) return { ok: true, duplicate: true, row: existing, tab: sheet.getName() };
  var dest = lastItemRow_(sheet) + 1;
  var template = templateRow_(sheet);
  sheet.getRange(dest, 1).setValue(name);
  sheet.getRange(dest, 2).setValue(tickets);
  copyTotalFormulas_(sheet, template, dest);
  return { ok: true, mode: "appended", row: dest, tab: sheet.getName() };
}

// Fill a blank column D. piecesPer10 is "how many pieces equal 10 oz?"
// If at least half of the filled D cells on this tab are formulas, write =N/10.
// Otherwise write the number N/10. Never replace a D cell that already has a formula.
function savePerOz_(body) {
  var store = body.store === "CPR" ? "CPR" : "WPR";
  var pieces = Number(body.piecesPer10);
  if (!isFinite(pieces) || pieces <= 0 || Math.round(pieces) !== pieces) {
    return { ok: false, error: "bad-per-oz", message: "Enter a whole number of pieces." };
  }
  var now = storeNow_();
  var ss = openInventory_(now.year);
  var sheet = ensureMonth_(ss, store);
  var row = findItemRow_(sheet, body.item);
  if (!row) {
    return {
      ok: false,
      error: "not-on-sheet",
      message: String(body.item || "That item") + " is not on " + sheet.getName() + "."
    };
  }
  var cell = sheet.getRange(row, 4);
  if (cell.getFormula()) {
    return { ok: true, skipped: "formula", perOz: numOrNull_(cell.getValue()), tab: sheet.getName() };
  }
  var style = perOzWrite_(pieces, sampleColumnD_(sheet));
  var format = samplePerOzFormat_(sheet);
  if (format) cell.setNumberFormat(format);
  if (style.formula) cell.setFormula(style.formula);
  else cell.setValue(style.value);
  return { ok: true, perOz: style.value, formula: style.formula || "", tab: sheet.getName() };
}

function sampleColumnD_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var height = last - 1;
  var names = sheet.getRange(2, 1, height, 1).getValues();
  var formulas = sheet.getRange(2, 4, height, 1).getFormulas();
  var values = sheet.getRange(2, 4, height, 1).getValues();
  var out = [];
  for (var i = 0; i < names.length; i++) {
    if (!String(names[i][0] || "").replace(/^\s+|\s+$/g, "")) continue;
    if (formulas[i][0]) out.push(formulas[i][0]);
    else if (values[i][0] !== "" && values[i][0] != null) out.push(values[i][0]);
  }
  return out;
}

function samplePerOzFormat_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return "General";
  var height = Math.min(last - 1, 80);
  var formulas = sheet.getRange(2, 4, height, 1).getFormulas();
  var values = sheet.getRange(2, 4, height, 1).getValues();
  var formats = sheet.getRange(2, 4, height, 1).getNumberFormats();
  for (var i = 0; i < formulas.length; i++) {
    if (formulas[i][0] || (values[i][0] !== "" && values[i][0] != null)) return formats[i][0] || "General";
  }
  return "General";
}

function perOzWrite_(pieces, samples) {
  var filled = 0;
  var formulas = 0;
  for (var i = 0; i < samples.length; i++) {
    if (samples[i] == null || samples[i] === "") continue;
    filled++;
    if (String(samples[i]).charAt(0) === "=") formulas++;
  }
  if (filled > 0 && formulas * 2 >= filled) return { formula: "=" + pieces + "/10", value: pieces / 10 };
  return { formula: "", value: pieces / 10 };
}

function lastItemRow_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return 1;
  var names = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  var found = 1;
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0] || "").replace(/^\s+|\s+$/g, "")) found = i + 2;
  }
  return found;
}

function templateRow_(sheet) {
  var last = Math.min(sheet.getLastRow(), 40);
  if (last < 2) return 2;
  var formulas = sheet.getRange(2, 5, last - 1, 1).getFormulas(); // column E
  for (var i = 0; i < formulas.length; i++) {
    if (formulas[i][0]) return i + 2;
  }
  return 2;
}

// Copy E, H, M, N (the total formulas) onto the new row, pointed at that row.
function copyTotalFormulas_(sheet, template, dest) {
  var cols = [5, 8, 13, 14];
  for (var i = 0; i < cols.length; i++) {
    var formula = sheet.getRange(template, cols[i]).getFormula();
    if (!formula) continue;
    sheet.getRange(dest, cols[i]).setFormula(rewriteFormula_(formula, template, dest));
  }
}

function rewriteFormula_(formula, fromRow, toRow) {
  return String(formula || "").replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, function (match, absCol, col, absRow, row) {
    if (absRow === "$") return match;
    if (Number(row) !== Number(fromRow)) return match;
    return absCol + col + String(toRow);
  });
}

function normalizeCode_(raw) {
  var c = String(raw || "").replace(/[\s-]/g, "");
  if (!c) return "";
  if (!/^\d+$/.test(c)) return c.toUpperCase();
  var upcE = c.length === 8 && (c.charAt(0) === "0" || c.charAt(0) === "1") && checkOk_(expandUpcE_(c));
  if (upcE) return pad14_(expandUpcE_(c));
  if (c.length >= 11 && c.length <= 14) return pad14_(c);
  return c;
}

function pad14_(c) {
  while (c.length < 14) c = "0" + c;
  return c;
}

function expandUpcE_(c) {
  var ns = c.charAt(0);
  var d = c.substring(1, 7);
  var chk = c.charAt(7);
  var last = d.charAt(5);
  var body;
  if (last <= "2") body = d.substring(0, 2) + last + "0000" + d.substring(2, 5);
  else if (last === "3") body = d.substring(0, 3) + "00000" + d.substring(3, 5);
  else if (last === "4") body = d.substring(0, 4) + "00000" + d.charAt(4);
  else body = d.substring(0, 5) + "0000" + last;
  return ns + body + chk;
}

function checkOk_(c) {
  if (!/^\d+$/.test(c) || c.length < 2) return false;
  var sum = 0;
  for (var i = 0; i < c.length - 1; i++) {
    var n = Number(c.charAt(c.length - 2 - i));
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10 === Number(c.charAt(c.length - 1));
}
