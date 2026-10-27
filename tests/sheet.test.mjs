import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  addItem,
  getCounts,
  getItems,
  getPendingSheetRows,
  getTesting,
  lookupBarcode,
  refreshStore,
  removeCount,
  resetLocalData,
  saveBarcode,
  saveCount,
  setSheetClient,
  setTesting,
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
