import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  REAL_BARCODES,
  checkOk,
  clearSession,
  binFlags,
  describeEntry,
  frontNet,
  isDoubleBin,
  saveMeasure,
  expandUpcE,
  addItem,
  getCounts,
  getItems,
  getPackSize,
  getPendingSheetRows,
  itemMatchesQuery,
  lookupBarcode,
  searchCatalog,
  normalizeCode,
  parsePack,
  pieces,
  reloadLocalData,
  removeCount,
  resetLocalData,
  saveBarcode,
  saveCount,
  savePackSize,
  setTesting,
} from "../js/data.js";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

describe("catalog and barcodes", { concurrency: false }, () => {
  test("each store has the 25 September items", () => {
    assert.equal(getItems("WPR").filter((item) => !item.pending).length, 25);
    assert.equal(getItems("CPR").filter((item) => !item.pending).length, 25);
    assert.equal(getItems("nope").length, 0);
  });

  test("the six real barcodes keep their leading zeros", () => {
    const codes = REAL_BARCODES.map((row) => row.code);
    assert.deepEqual(codes, [
      "097138500717",
      "810071499326",
      "097138501967",
      "075656049338",
      "097138502094",
      "910371810538",
    ]);
    for (const code of codes) {
      assert.equal(typeof code, "string");
      assert.equal(checkOk(code), true);
    }
  });

  test("the same product matches with or without a leading zero", () => {
    const twelve = lookupBarcode("097138500717", "WPR");
    const thirteen = lookupBarcode("0097138500717", "WPR");
    const fourteen = lookupBarcode("00097138500717", "CPR");
    assert.equal(twelve.item.name, "Jumbo Playing Cards");
    assert.equal(thirteen.item.name, "Jumbo Playing Cards");
    assert.equal(fourteen.item.name, "Jumbo Playing Cards");
    assert.equal(twelve.normalized, thirteen.normalized);
    assert.equal(twelve.normalized, fourteen.normalized);
    assert.equal(twelve.source, "barcode");
  });

  test("store-specific real barcodes", () => {
    assert.equal(lookupBarcode("097138501967", "WPR").item.name, "Light Up Wireless Gaming Headphones");
    assert.equal(lookupBarcode("097138501967", "CPR").item, null);
    assert.equal(lookupBarcode("810071499326", "CPR").item.name, "Karaoke w Mic Bluetooth Speaker (wireless karaoke)");
    assert.equal(lookupBarcode("910371810538", "WPR").item.name, "Disco Lamp Lounge Monkey");
    assert.equal(lookupBarcode("910371810538", "CPR").item.name, "Disco Lamp (Lounge monkey)");
    assert.equal(lookupBarcode("097138502094", "WPR").item, null);
    assert.equal(lookupBarcode("097138502094", "CPR").item, null);
  });

  test("name search matches partial words and barcodes, and ignores mid-word hits", () => {
    const laser = searchCatalog("WPR", "laser spin");
    assert.equal(laser.length, 1);
    assert.equal(laser[0].name, "Laser Spin Top (144/bag)");
    const pouch = searchCatalog("CPR", "smarties pouch");
    assert.ok(pouch.some((item) => item.name === "Smarties 3 Tablet Pouch Bulk Asmt"));
    assert.equal(searchCatalog("WPR", "art").some((item) => /smarties/i.test(item.name)), false);
    const byCode = searchCatalog("WPR", "011206");
    assert.ok(byCode.some((item) => item.name.startsWith("Smarties")));
    assert.ok(byCode.some((item) => item.name.startsWith("Giant Smarties")));
    const offList = searchCatalog("CPR", "jelle pets");
    assert.equal(offList[0].name, "Oh So Jelle Pets");
    assert.equal(itemMatchesQuery("Laser Spin Top 1.5in Asmt", [], "1.5"), true);
    assert.equal(itemMatchesQuery(
      "Soldier Figurines 2in Asmt (Army Men) (144/bag)",
      [],
      "army men 2in",
    ), true);
    assert.equal(itemMatchesQuery(
      "Soldier Figurines 2in Asmt (Army Men) (144/bag)",
      [],
      "ARMY, men (2in)",
    ), true);
    assert.equal(itemMatchesQuery("Smarties XTreme Sour", [], "xtreme sour"), true);
    assert.equal(searchCatalog("CPR", "army men 2in").some((item) => /soldier/i.test(item.name)), false);
    assert.equal(searchCatalog("WPR", "").length, 0);
  });

  test("bin items match the store name, and a second bin is Cottleville only", () => {
    const rows = [{
      short: "Army men",
      WPR: "Soldier Figurines 2in Asmt (Army Men) (144/bag)",
      CPR: "soldier figurines 2in asmt (army men) (144/bag)",
      doubleBin: "Yes",
    }];
    assert.equal(isDoubleBin("Yes"), true);
    assert.equal(isDoubleBin(true), true);
    assert.equal(isDoubleBin("No"), false);
    assert.deepEqual(binFlags("WPR", "Soldier Figurines 2in Asmt (Army Men) (144/bag)", rows), { bin: true, doubleBin: false });
    assert.deepEqual(binFlags("CPR", "Soldier Figurines 2in Asmt (Army Men) (144/bag)", rows), { bin: true, doubleBin: true });
    assert.deepEqual(binFlags("CPR", "Dum Dum Pops", rows), { bin: false, doubleBin: false });
    assert.equal(frontNet(120, 50), 70);
    assert.equal(frontNet(30, 50), -20);
    assert.match(describeEntry({
      kind: "count", count: 70, gross: 120, frontCount: 50, frontFull: false,
    }), /Count 120 − front 50 = 70/);
  });

  test("a saved bin size stays on the phone when new items are not written", () => {
    setTesting({ skipItems: true });
    assert.equal(saveMeasure("CPR", "Dum Dum Pops", "fullBin", 400), 400);
    assert.equal(saveMeasure("CPR", "Dum Dum Pops", "frontCount", 50), 50);
    const item = getItems("CPR").find((row) => row.name === "Dum Dum Pops");
    assert.equal(item.fullBin, 400);
    assert.equal(item.frontCount, 50);
    setTesting({ skipItems: false });
  });

  test("CPR Oh So Jelle Pets is confirmed even though it is off the September list", () => {
    const found = lookupBarcode("075656049338", "CPR");
    assert.equal(found.item.name, "Oh So Jelle Pets");
    assert.equal(found.item.offList, true);
    assert.equal(found.item.tickets, null);
    const wpr = lookupBarcode("075656049338", "WPR");
    assert.equal(wpr.item.name, "Oh So Jelle Taba Pets (Jellee)");
    assert.equal(wpr.item.offList, undefined);
  });

  test("sample codes on the item list still resolve per store", () => {
    assert.equal(lookupBarcode("070330123451", "WPR").item.name, "Bouncy Ball 27mm Asmt (144/bag)");
    assert.equal(lookupBarcode("070330123451", "CPR").item.name, "Hi Bounce Ball 27mm (144/bag)");
    assert.equal(lookupBarcode("070330123451", "WPR").source, "sample");
  });

  test("a code with spaces or dashes normalizes to the same item", () => {
    const found = lookupBarcode("097138-500717", "WPR");
    assert.equal(found.item.name, "Jumbo Playing Cards");
  });
});

describe("normalization", { concurrency: false }, () => {
  test("code 128 text is kept and upper-cased", () => {
    assert.equal(normalizeCode("ab-12 c"), "AB12C");
  });

  test("UPC-E expands and pads to 14 digits when the check digit is valid", () => {
    const expanded = expandUpcE("01234565");
    assert.equal(expanded.length, 12);
    if (checkOk(expanded)) {
      assert.equal(normalizeCode("01234565"), expanded.padStart(14, "0"));
    }
  });
});

describe("counting math", { concurrency: false }, () => {
  test("pack size comes from the item name", () => {
    assert.deepEqual(parsePack("Giant Smarties (36/box)"), { size: 36, word: "box" });
    assert.deepEqual(parsePack("Princess Tiara 5in Asmt (12 in bag)"), { size: 12, word: "bag" });
    assert.deepEqual(parsePack("Tootsie Roll Midgees (360/bag)"), { size: 360, word: "bag" });
    assert.equal(parsePack("Dum Dum Pops"), null);
    assert.equal(parsePack("Karaoke w Mic Bluetooth Speaker (wireless karaoke)"), null);
  });

  test("weight converts pounds and ounces to pieces", () => {
    const perOz = 20 / 4.2;
    const count = pieces({ kind: "weight", lb: 1, oz: 2, perOz });
    assert.equal(count, Math.round((1 * 16 + 2) * perOz));
    assert.equal(pieces({ kind: "weight", lb: 1, oz: 0, perOz: null }), null);
  });

  test("a bin is quarters of the full-bin count", () => {
    assert.equal(pieces({ kind: "bin", q1: 1, fullBin: 490 }), Math.round(490 / 4));
    assert.equal(pieces({ kind: "bin", q1: 1, q2: 2, fullBin: 490 }), Math.round((490 * 3) / 4));
    assert.equal(pieces({ kind: "bin", q1: 4, fullBin: null }), null);
  });

  test("entry text describes the way it was counted", () => {
    assert.equal(
      describeEntry({ kind: "count", boxes: 2, perBox: 36, loose: 3, packWord: "box" }),
      "2 boxes × 36 + 3 loose",
    );
    assert.match(describeEntry({ kind: "bin", q1: 2, q2: 4, fullBin: 100 }), /Half \+ Full/);
    assert.match(describeEntry({ kind: "weight", lb: 0, oz: 4, perOz: null }), /no per-oz/);
  });
});

describe("local session", { concurrency: false }, () => {
  test("learned barcodes override the sheet and survive a reload", () => {
    resetLocalData();
    const saved = saveBarcode("075656049338", "CPR", "Airheads Bites");
    assert.equal(saved.code, "075656049338");
    reloadLocalData();
    const found = lookupBarcode("075656049338", "CPR");
    assert.equal(found.source, "learned");
    assert.equal(found.item.name, "Airheads Bites");
    const stored = JSON.parse(localStorage.getItem("fz-learned-barcodes"));
    assert.equal(stored["CPR:" + saved.normalized].code, "075656049338");
  });

  test("counts add, replace, edit, and clear", () => {
    resetLocalData();
    const first = saveCount({
      store: "WPR",
      section: "Front",
      item: "Dum Dum Pops",
      tickets: 20,
      fullBin: 500,
      perOz: 20 / 4.2,
      kind: "count",
      count: 10,
      loose: 10,
    });
    const second = saveCount({
      store: "WPR",
      section: "Front",
      item: "Dum Dum Pops",
      tickets: 20,
      fullBin: 500,
      perOz: 20 / 4.2,
      kind: "count",
      count: 4,
      loose: 4,
    });
    assert.equal(getCounts().length, 2);
    const replaced = saveCount({
      store: "WPR",
      section: "Back",
      item: "Dum Dum Pops",
      tickets: 20,
      kind: "count",
      count: 7,
      loose: 7,
    }, [first.id, second.id]);
    assert.equal(replaced.section, "Back");
    assert.equal(getCounts().length, 1);
    assert.equal(getCounts()[0].count, 7);

    const edited = saveCount({
      id: replaced.id,
      kind: "weight",
      lb: 1,
      oz: 0,
    });
    assert.equal(edited.kind, "weight");
    assert.equal(edited.section, "Back");
    assert.equal(edited.count, undefined);
    assert.equal(getCounts()[0].lb, 1);

    removeCount(edited.id);
    assert.equal(getCounts().length, 0);
  });

  test("a new product is pending, linked to its barcode, and only on that store", () => {
    resetLocalData();
    assert.equal(addItem("CPR", { name: "  ", ticketValue: 10 }), null);
    assert.equal(addItem("CPR", { name: "Squeeze Pyramid", ticketValue: 1.5 }), null);
    assert.equal(addItem("CPR", { name: "Squeeze Pyramid", ticketValue: -1 }), null);
    assert.equal(addItem("nope", { name: "Squeeze Pyramid", ticketValue: 40 }), null);
    const created = addItem("CPR", { name: " Squeeze Pyramid ", ticketValue: "40" });
    assert.equal(created.name, "Squeeze Pyramid");
    assert.equal(created.tickets, 40);
    assert.equal(created.pending, true);
    assert.equal(created.fullBin, null);
    assert.equal(addItem("CPR", { name: "squeeze pyramid", ticketValue: 40 }), null);
    assert.equal(addItem("CPR", { name: "Dum Dum Pops", ticketValue: 20 }), null);
    assert.equal(getItems("CPR").some((item) => item.name === "Squeeze Pyramid"), true);
    assert.equal(getItems("WPR").some((item) => item.name === "Squeeze Pyramid"), false);

    const linked = saveBarcode("097138502094", "CPR", "Squeeze Pyramid", { pending: true });
    assert.equal(linked.code, "097138502094");
    assert.equal(linked.pending, true);
    reloadLocalData();
    const again = lookupBarcode("097138502094", "CPR");
    assert.equal(again.source, "learned");
    assert.equal(again.item.name, "Squeeze Pyramid");
    assert.equal(again.item.tickets, 40);
    assert.equal(again.item.pending, true);
    assert.equal(lookupBarcode("097138502094", "WPR").item, null);

    const pending = getPendingSheetRows();
    assert.deepEqual(pending.items, [{
      store: "CPR",
      name: "Squeeze Pyramid",
      ticketValue: 40,
      columnA: "Squeeze Pyramid",
      columnB: 40,
    }]);
    assert.deepEqual(pending.barcodes, [{
      store: "CPR",
      code: "097138502094",
      name: "Squeeze Pyramid",
    }]);

    saveCount({
      store: "CPR",
      section: "Front",
      item: "Squeeze Pyramid",
      tickets: 40,
      kind: "count",
      count: 2,
      loose: 2,
    });
    clearSession();
    reloadLocalData();
    assert.equal(getCounts().length, 0);
    assert.equal(lookupBarcode("097138502094", "CPR").item.tickets, 40);
    assert.equal(getPendingSheetRows().items.length, 1);
  });

  test("clearing the session keeps learned barcodes and custom box sizes", () => {
    resetLocalData();
    saveBarcode("12345670", "WPR", "Samurai Sword");
    savePackSize("WPR", "Samurai Sword", 6);
    saveCount({ store: "WPR", section: "Back", item: "Samurai Sword", tickets: 300, kind: "count", count: 2, loose: 2 });
    clearSession();
    reloadLocalData();
    assert.equal(getCounts().length, 0);
    assert.equal(lookupBarcode("12345670", "WPR").item.name, "Samurai Sword");
    assert.equal(getPackSize("WPR", "Samurai Sword"), 6);
  });
});
