import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, describe, test } from "node:test";
import { keepsCountFormula, mapCountOntoRow } from "../js/sheetmap.js";
import {
  addItem,
  CATALOG_STALE_MS,
  catalogInfo,
  catalogNeedsRefresh,
  getCounts,
  getItems,
  getPendingSheetRows,
  getTesting,
  lookupBarcode,
  onSheetRecovered,
  refreshStore,
  removeCount,
  resetLocalData,
  saveBarcode,
  saveCount,
  savePiecesPer10,
  searchCatalog,
  setSheetClient,
  setTesting,
  testConnection,
  whenSheetIdle,
} from "../js/data.js";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

const sheetItems = [
  { name: "Only On The Sheet", tickets: 15, perOz: 2, fullBin: 80 },
  { name: "Dum Dum Pops", tickets: 20, perOz: 20 / 4.2, fullBin: 500 },
];

const sheetBarcodes = [
  { code: "097138500717", WPR: "Only On The Sheet", CPR: "" },
];

beforeEach(async () => {
  onSheetRecovered(null);
  setSheetClient(null);
  await whenSheetIdle();
  resetLocalData();
});

function recordingClient(extra = {}) {
  const calls = [];
  setSheetClient(async (payload) => {
    calls.push(payload);
    if (extra.fail && payload.action === "getCatalog") throw new Error("down");
    if (payload.action === "getCatalog") {
      return { ok: true, tab: "WPR - Oct 2026", items: sheetItems, barcodes: sheetBarcodes };
    }
    if (extra.notOnSheet && payload.item === "Missing") {
      return { ok: false, error: "not-on-sheet", message: "Missing is not on WPR - Oct 2026." };
    }
    if (extra.formula && payload.action === "applyCount") {
      return { ok: true, updates: {}, skipped: [{ column: "J", reason: "formula" }] };
    }
    return { ok: true, updates: { J: 1 }, skipped: [] };
  });
  return calls;
}

describe("sheet cache", { concurrency: false }, () => {
  test("a loaded month tab replaces the bundled list and survives a failed refresh", async () => {
    const calls = recordingClient();
    const loaded = await refreshStore("WPR");
    assert.equal(loaded.ok, true);
    assert.equal(loaded.tab, "WPR - Oct 2026");
    assert.equal(getItems("WPR").some((item) => item.name === "Only On The Sheet"), true);
    assert.equal(getItems("WPR").some((item) => item.name === "Samurai Sword"), false);
    assert.equal(calls[0].action, "getCatalog");

    setSheetClient(async () => {
      throw new Error("down");
    });
    const again = await refreshStore("WPR");
    assert.equal(again.ok, false);
    assert.equal(getItems("WPR").some((item) => item.name === "Only On The Sheet"), true);
    const found = lookupBarcode("0097138500717", "WPR");
    assert.equal(found.item.name, "Only On The Sheet");
    assert.equal(found.source, "barcode");
    assert.equal(lookupBarcode("070330123451", "WPR").item, null);
  });

  test("a failed catalog load stays on the sample list until a later request succeeds", async () => {
    let fail = true;
    setSheetClient(async (payload) => {
      if (payload.action === "getCatalog" && fail) {
        const err = new Error("Specified permissions are not sufficient to call SpreadsheetApp.openById");
        err.code = "script-error";
        throw err;
      }
      if (payload.action === "getCatalog") {
        return {
          ok: true,
          tab: "CPR - Oct 2026",
          items: [
            { name: "Soldier Figurines 2in Asmt (Army Men) (144/bag)", tickets: 10 },
            { name: "Smarties XTreme Sour", tickets: 15 },
          ],
          barcodes: [],
        };
      }
      return { ok: true };
    });
    let reload = Promise.resolve();
    onSheetRecovered(() => {
      reload = refreshStore("CPR");
    });
    const failed = await refreshStore("CPR");
    assert.equal(failed.ok, false);
    assert.equal(catalogInfo("CPR").source, "sample");
    assert.equal(catalogNeedsRefresh("CPR"), true);
    assert.equal(getItems("CPR").some((item) => /soldier/i.test(item.name)), false);
    assert.equal(searchCatalog("CPR", "army men 2in").length, 0);
    fail = false;
    await testConnection();
    await reload;
    assert.equal(catalogInfo("CPR").source, "sheet");
    assert.equal(catalogInfo("CPR").tab, "CPR - Oct 2026");
    assert.equal(
      searchCatalog("CPR", "army men 2in")[0].name,
      "Soldier Figurines 2in Asmt (Army Men) (144/bag)",
    );
    assert.equal(searchCatalog("CPR", "xtreme sour")[0].name, "Smarties XTreme Sour");
    assert.equal(catalogNeedsRefresh("CPR"), false);
    assert.equal(catalogNeedsRefresh("CPR", Date.now() + CATALOG_STALE_MS + 1000), true);
  });
});

describe("sheet writes", { concurrency: false }, () => {
  test("counts add, replace subtracts what this phone already sent, and undo reverses it", async () => {
    const calls = recordingClient();
    const first = saveCount({
      store: "WPR",
      section: "Front",
      item: "Dum Dum Pops",
      tickets: 20,
      kind: "count",
      count: 10,
      loose: 10,
    });
    await whenSheetIdle();
    const replaced = saveCount({
      store: "WPR",
      section: "Front",
      item: "Dum Dum Pops",
      tickets: 20,
      kind: "count",
      count: 4,
      loose: 4,
    }, [first.id]);
    await whenSheetIdle();
    removeCount(replaced.id);
    await whenSheetIdle();

    const counts = calls.filter((call) => call.action === "applyCount");
    assert.equal(counts[0].delta.pieces, 10);
    assert.equal(counts[1].delta.pieces, -6);
    assert.equal(counts[2].delta.pieces, -4);
    assert.equal(getCounts().length, 0);
  });

  test("weight in two sections is two ounce additions, not two piece columns", async () => {
    const calls = recordingClient();
    saveCount({
      store: "WPR", section: "Front", item: "Dum Dum Pops", kind: "weight", lb: 1, oz: 0,
    });
    await whenSheetIdle();
    saveCount({
      store: "CPR", section: "Back", item: "Dum Dum Pops", kind: "weight", lb: 0, oz: 4,
    });
    await whenSheetIdle();
    const counts = calls.filter((call) => call.action === "applyCount");
    assert.equal(counts[0].delta.ounces, 16);
    assert.equal(counts[0].delta.pieces, 0);
    assert.equal(counts[0].section, "Front");
    assert.equal(counts[1].delta.ounces, 4);
    assert.equal(counts[1].section, "Back");
  });

  test("a Cottleville second bin is the sum of the quarters", async () => {
    const calls = recordingClient();
    saveCount({
      store: "CPR", section: "Front", item: "Dum Dum Pops", kind: "bin", q1: 4, q2: 3,
    });
    await whenSheetIdle();
    assert.equal(calls[0].delta.quarters, 7);
    assert.equal(calls[0].delta.pieces, 0);
  });

  test("a formula cell is not treated as saved on the sheet", async () => {
    recordingClient({ formula: true });
    const saved = saveCount({
      store: "WPR", section: "Front", item: "Dum Dum Pops", kind: "count", count: 10, loose: 10,
    });
    await whenSheetIdle();
    const fresh = getCounts().find((entry) => entry.id === saved.id);
    assert.equal(fresh.sheetSync, "partial");
    assert.equal(fresh.sheetApplied.pieces, 0);
    assert.match(fresh.sheetError, /formula/i);
  });

  test("an item that is not on the tab is not retried forever", async () => {
    const calls = recordingClient({ notOnSheet: true });
    saveCount({
      store: "WPR", section: "Front", item: "Missing", kind: "count", count: 2, loose: 2,
    });
    await whenSheetIdle();
    assert.equal(calls.length, 1);
    assert.equal(getCounts()[0].sheetSync, "error");
  });

  test("a new product and its barcode are sent, and the barcode keeps its leading zeros", async () => {
    const calls = recordingClient();
    const created = addItem("CPR", { name: "Squeeze Pyramid", ticketValue: 40 });
    assert.equal(created.pending, true);
    saveBarcode("097138502094", "CPR", "Squeeze Pyramid", { pending: true });
    await whenSheetIdle();
    assert.deepEqual(calls[0], {
      action: "addItem",
      store: "CPR",
      name: "Squeeze Pyramid",
      ticketValue: 40,
    });
    assert.equal(calls[1].action, "saveBarcode");
    assert.equal(calls[1].code, "097138502094");
    assert.equal(calls[1].store, "CPR");
    assert.equal(getPendingSheetRows().items.length, 0);
    assert.equal(getPendingSheetRows().barcodes.length, 0);
  });
});

describe("pieces per 10 ounces", { concurrency: false }, () => {
  test("the rate is remembered and sent as the piece count for 10 ounces", async () => {
    const calls = recordingClient();
    const perOz = savePiecesPer10("WPR", "Princess Tiara 5in Asmt (12 in bag)", 30);
    assert.equal(perOz, 3);
    await whenSheetIdle();
    assert.equal(calls[0].action, "savePerOz");
    assert.equal(calls[0].piecesPer10, 30);
    assert.equal(calls[0].store, "WPR");
    const item = getItems("WPR").find((row) => row.name.startsWith("Princess Tiara"));
    assert.equal(item.perOz, 3);
    savePiecesPer10("WPR", "Princess Tiara 5in Asmt (12 in bag)", 20);
    await whenSheetIdle();
    assert.equal(calls.filter((call) => call.action === "savePerOz").at(-1).piecesPer10, 20);
    assert.equal(getItems("WPR").find((row) => row.name.startsWith("Princess Tiara")).perOz, 2);
  });

  test("Don't save new items keeps the rate on the phone and skips the sheet", async () => {
    const calls = recordingClient();
    setTesting({ skipItems: true });
    const perOz = savePiecesPer10("CPR", "flarp Noise Putty", 40);
    await whenSheetIdle();
    assert.equal(perOz, 4);
    assert.equal(calls.length, 0);
    assert.equal(getItems("CPR").find((row) => row.name === "flarp Noise Putty").perOz, 4);
  });
});

describe("testing mode", { concurrency: false }, () => {
  test("each switch blocks only that kind of sheet write", async () => {
    const calls = recordingClient();
    setTesting({ skipCounts: true, skipBarcodes: false, skipItems: false });
    saveCount({
      store: "WPR", section: "Front", item: "Dum Dum Pops", kind: "count", count: 8, loose: 8,
    });
    await whenSheetIdle();
    assert.equal(calls.length, 0);
    assert.equal(getCounts()[0].count, 8);
    assert.equal(getCounts()[0].sheetSync, "skipped");

    setTesting({ skipCounts: true, skipBarcodes: true, skipItems: true });
    saveBarcode("097138502094", "WPR", "Squeeze Pyramid", { pending: true });
    addItem("WPR", { name: "Squeeze Pyramid", ticketValue: 40 });
    await whenSheetIdle();
    assert.equal(calls.length, 0);
    assert.equal(lookupBarcode("097138502094", "WPR").item.name, "Squeeze Pyramid");
    assert.equal(getItems("WPR").some((item) => item.name === "Squeeze Pyramid"), true);
    assert.deepEqual(getTesting(), { skipCounts: true, skipBarcodes: true, skipItems: true });
  });

  test("turning testing off does not send the counts that were held back", async () => {
    const calls = recordingClient();
    setTesting({ skipCounts: true });
    saveCount({
      store: "WPR", section: "Back", item: "Dum Dum Pops", kind: "count", count: 3, loose: 3,
    });
    await whenSheetIdle();
    setTesting({ skipCounts: false });
    await whenSheetIdle();
    assert.equal(calls.length, 0);
    assert.equal(getCounts()[0].count, 3);
  });
});

describe("hand-typed count formulas", () => {
  const hand = ["=72*2-12", "=6*12-1", "=(7*4+7+36)*12", "=100+1200", "= 72 * 2 - 12", "=1.5*2"];
  const kept = ["=J2", "=K2+1", "=SUM(J2:L2)", "=ROUND(T2*(U2/4),0)", "=$K$2", "=(F2*16)+G2"];

  test("arithmetic-only formulas are counts, and a letter means keep the formula", () => {
    for (const formula of hand) {
      const body = formula.trim().slice(1);
      assert.match(body, /^[\d\s.+\-*/()]+$/);
      assert.equal(keepsCountFormula(formula), false, formula);
    }
    for (const formula of kept) {
      assert.equal(/[A-Za-z]/.test(formula.slice(1)), true);
      assert.equal(keepsCountFormula(formula), true, formula);
    }
    assert.equal(keepsCountFormula(""), false);
    assert.equal(keepsCountFormula("132"), false);
  });

  test("a new count overwrites =72*2-12 and leaves a cell reference alone", () => {
    const handMath = mapCountOntoRow(
      { kind: "count", section: "Back", count: 5 },
      { K: { value: 132, formula: "=72*2-12" } },
    );
    assert.deepEqual(handMath.updates, { K: 137 });
    assert.deepEqual(handMath.skipped, []);

    const reference = mapCountOntoRow(
      { kind: "count", section: "Back", count: 5 },
      { K: { value: 132, formula: "=J2+K2" } },
    );
    assert.deepEqual(reference.updates, {});
    assert.deepEqual(reference.skipped, [{ column: "K", reason: "formula" }]);

    const bins = mapCountOntoRow(
      { kind: "bin", q1: 4 },
      { U: { value: 4, formula: "=100+1200" } },
      { pieces: 0, ounces: 0, quarters: 4 },
    );
    assert.equal(bins.updates.U, 8);
    const protectedBin = mapCountOntoRow(
      { kind: "bin", q1: 4 },
      { U: { value: 4, formula: "=ROUND(T2*(U2/4),0)" } },
      { pieces: 0, ounces: 0, quarters: 4 },
    );
    assert.equal(protectedBin.updates.U, undefined);
    assert.equal(protectedBin.skipped[0].column, "U");
  });

  test("the Apps Script copy keeps the same cells on a new month and on a saved count", () => {
    const src = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
    const rule = src.slice(src.indexOf("function keepsCountFormula_"), src.indexOf("function countInputFormulaMask_"));
    assert.match(rule, /\[A-Za-z\]/);
    const mask = src.slice(src.indexOf("function countInputFormulaMask_"), src.indexOf("function clearPlainCountInputs_"));
    assert.match(mask, /keepsCountFormula_/);
    const save = src.slice(src.indexOf("function mapCountOntoRow_"), src.indexOf("function numberOrZero_"));
    assert.match(save, /keepsCountFormula_\(fFormula\)/);
    assert.match(save, /keepsCountFormula_\(range\.getFormula\(\)\)/);
    assert.equal(save.includes("if (range.getFormula())"), false);
    assert.equal(save.includes("if (fFormula || gFormula)"), false);
  });
});
