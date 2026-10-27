import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  REAL_BARCODES,
  checkOk,
  clearSession,
  describeEntry,
  expandUpcE,
  getCounts,
  getItems,
  getPackSize,
  lookupBarcode,
  normalizeCode,
  parsePack,
  pieces,
  reloadLocalData,
  removeCount,
  resetLocalData,
  saveBarcode,
  saveCount,
  savePackSize,
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
    assert.equal(getItems("WPR").length, 25);
    assert.equal(getItems("CPR").length, 25);
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
