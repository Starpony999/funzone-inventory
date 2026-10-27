/**
 * mapCountOntoRow is the only place that decides which Google Sheet cells a
 * count changes. apps-script/Code.gs has a copy of the same rules
 * (mapCountOntoRow_). If you change one, change the other.
 *
 * Assumptions are listed in SETUP.md under "How a count lands on the sheet".
 *
 * Columns we may write: F, G, J, K, L, U.
 * Columns we never write: A–E, H, I, M, N, and the position / full-count columns.
 * A cell that already contains a formula is left alone.
 */

export const SECTION_COLUMN = {
  Front: "J",
  Back: "K",
  "Break Room": "L",
};

// Matches the names already used in FunZone Inventory 2026, plus Oct as requested.
export const MONTH_ABBR = {
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
  12: "Dec",
};

const MONTH_INDEX = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function monthTabName(store, date) {
  const month = date.getMonth() + 1;
  return store + " - " + MONTH_ABBR[month] + " " + date.getFullYear();
}

// Accepts "WPR - Sept 2026", "CPR - July 2026", and "CPR- Jan 2026".
export function parseMonthTab(name) {
  const match = String(name || "").trim().match(/^(WPR|CPR)\s*-?\s*([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTH_INDEX[match[2].toLowerCase()];
  if (!month) return null;
  return {
    store: match[1],
    month,
    year: Number(match[3]),
    name: String(name).trim(),
  };
}

// Use this month's tab when it exists. Otherwise duplicate the latest older
// tab for that store. Spares tabs and other names are ignored.
export function pickMonthTab(store, tabNames, date) {
  const wanted = monthTabName(store, date);
  const parsed = (tabNames || [])
    .map(parseMonthTab)
    .filter((tab) => tab && tab.store === store);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const current = parsed.find((tab) => tab.year === year && tab.month === month);
  if (current) return { action: "use", tab: current.name, created: false };
  const cursor = year * 12 + month;
  const earlier = parsed
    .filter((tab) => tab.year * 12 + tab.month < cursor)
    .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
  if (!earlier.length) return { action: "missing", tab: wanted, source: null };
  return { action: "duplicate", tab: wanted, source: earlier[0].name };
}

// Rewrite A1-style refs that point at the template row. Absolute rows ($2) stay.
export function rewriteFormula(formula, fromRow, toRow) {
  return String(formula || "").replace(
    /(\$?)([A-Z]{1,3})(\$?)(\d+)/g,
    (match, absCol, col, absRow, row) => {
      if (absRow === "$") return match;
      if (Number(row) !== Number(fromRow)) return match;
      return absCol + col + String(toRow);
    },
  );
}

export function entryAmount(entry) {
  if (!entry) return { pieces: 0, ounces: 0, quarters: 0 };
  if (entry.kind === "count") {
    return { pieces: Number(entry.count || 0), ounces: 0, quarters: 0 };
  }
  if (entry.kind === "weight") {
    return {
      pieces: 0,
      ounces: Number(entry.lb || 0) * 16 + Number(entry.oz || 0),
      quarters: 0,
    };
  }
  if (entry.kind === "bin") {
    return {
      pieces: 0,
      ounces: 0,
      quarters: Number(entry.q1 || 0) + Number(entry.q2 || 0),
    };
  }
  return { pieces: 0, ounces: 0, quarters: 0 };
}

// Difference between a new entry and what this phone already sent to the sheet.
// Replace / edit pass that difference into mapCountOntoRow as the delta.
export function countSheetDelta(entry, baseline) {
  const next = entryAmount(entry);
  return {
    pieces: next.pieces - (Number(baseline?.pieces) || 0),
    ounces: next.ounces - (Number(baseline?.ounces) || 0),
    quarters: next.quarters - (Number(baseline?.quarters) || 0),
  };
}

function cellInfo(row, column) {
  const cell = row ? row[column] : null;
  if (cell == null || cell === "") return { value: null, formula: false };
  if (typeof cell === "object" && ("value" in cell || "formula" in cell)) {
    return { value: cell.value ?? null, formula: !!cell.formula };
  }
  return { value: cell, formula: false };
}

// null means "do not treat this as a number" (a checkbox, for example).
function asNumber(value) {
  if (typeof value === "boolean") return null;
  if (value == null || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round3(number) {
  return Math.round(number * 1000) / 1000;
}

/**
 * How to fill a blank column D after staff answer "how many pieces equal 10 oz?"
 *
 * samples are the filled D cells already on the tab: a string starting with "="
 * is a formula, anything else that isn't blank is a plain number.
 * If at least half of those cells are formulas, write "=N/10" (the same
 * pieces-over-ounces style, using the 10 ounces they just counted).
 * Otherwise write the number N/10. A tab with nothing in column D yet gets the number.
 */
export function perOzWrite(piecesPer10, samples) {
  const pieces = Number(piecesPer10);
  const perOz = pieces / 10;
  const filled = (samples || []).filter((cell) => cell != null && cell !== "");
  const formulas = filled.filter((cell) => typeof cell === "string" && cell.startsWith("="));
  const useFormula = filled.length > 0 && formulas.length * 2 >= filled.length;
  if (useFormula) return { formula: "=" + String(pieces) + "/10", value: perOz };
  return { formula: null, value: perOz };
}

export function splitOunces(totalOz) {
  const safe = Math.max(0, Math.round(totalOz * 10) / 10);
  let lb = Math.floor((safe + 1e-9) / 16);
  let oz = Math.round((safe - lb * 16) * 10) / 10;
  if (oz >= 16) {
    lb += 1;
    oz = 0;
  }
  return { lb, oz };
}

/**
 * @param {object} entry session entry. section is required when pieces change.
 * @param {object} row current F/G/J/K/L/U cells. A cell may be a number or { value, formula }.
 * @param {object} [delta] { pieces, ounces, quarters } to add instead of the entry's own amount.
 *        Used for replace, edit, and undo. Negative numbers subtract.
 * @returns {{ updates: object, skipped: Array<{column: string|null, reason: string}>, clamped: boolean }}
 */
export function mapCountOntoRow(entry, row = {}, delta = null) {
  const amount = delta
    ? {
      pieces: Number(delta.pieces) || 0,
      ounces: Number(delta.ounces) || 0,
      quarters: Number(delta.quarters) || 0,
    }
    : entryAmount(entry);
  const updates = {};
  const skipped = [];
  let clamped = false;

  if (amount.pieces) {
    const column = SECTION_COLUMN[entry && entry.section];
    if (!column) {
      skipped.push({ column: null, reason: "unknown section" });
    } else {
      const cell = cellInfo(row, column);
      const current = asNumber(cell.value);
      if (cell.formula) skipped.push({ column, reason: "formula" });
      else if (current == null) skipped.push({ column, reason: "not a number" });
      else {
        const raw = current + amount.pieces;
        const next = raw < 0 ? 0 : round3(raw);
        if (raw < 0) clamped = true;
        updates[column] = next;
      }
    }
  }

  if (amount.ounces) {
    const pounds = cellInfo(row, "F");
    const ounces = cellInfo(row, "G");
    const poundsNumber = asNumber(pounds.value);
    const ouncesNumber = asNumber(ounces.value);
    if (pounds.formula || ounces.formula) {
      if (pounds.formula) skipped.push({ column: "F", reason: "formula" });
      if (ounces.formula) skipped.push({ column: "G", reason: "formula" });
    } else if (poundsNumber == null || ouncesNumber == null) {
      if (poundsNumber == null) skipped.push({ column: "F", reason: "not a number" });
      if (ouncesNumber == null) skipped.push({ column: "G", reason: "not a number" });
    } else {
      const total = poundsNumber * 16 + ouncesNumber + amount.ounces;
      if (total < 0) clamped = true;
      const split = splitOunces(total);
      updates.F = split.lb;
      updates.G = split.oz;
    }
  }

  if (amount.quarters) {
    const cell = cellInfo(row, "U");
    const current = asNumber(cell.value);
    if (cell.formula) skipped.push({ column: "U", reason: "formula" });
    else if (current == null) skipped.push({ column: "U", reason: "not a number" });
    else {
      const raw = current + amount.quarters;
      const next = raw < 0 ? 0 : round3(raw);
      if (raw < 0) clamped = true;
      updates.U = next;
    }
  }

  return { updates, skipped, clamped };
}
