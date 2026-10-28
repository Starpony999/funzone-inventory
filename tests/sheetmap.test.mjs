import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  mapCountOntoRow,
  monthTabName,
  parseMonthTab,
  MONTH_RESET_COLUMNS,
  perOzWrite,
  pickMonthTab,
  plainCountRuns,
  rewriteFormula,
} from "../js/sheetmap.js";
import { readFileSync } from "node:fs";

const ALLOWED = new Set(["F", "G", "J", "K", "L", "U"]);

function onlyCountColumns(updates) {
  for (const key of Object.keys(updates)) assert.ok(ALLOWED.has(key), key);
}

describe("month tabs", () => {
  test("October uses the name Cassidy asked for", () => {
    assert.equal(monthTabName("WPR", new Date(2026, 9, 27)), "WPR - Oct 2026");
    assert.equal(monthTabName("CPR", new Date(2026, 8, 1)), "CPR - Sept 2026");
    assert.equal(monthTabName("WPR", new Date(2026, 6, 4)), "WPR - July 2026");
  });

  test("existing tab spellings still match", () => {
    assert.deepEqual(parseMonthTab("WPR - Sept 2026"), { store: "WPR", month: 9, year: 2026, name: "WPR - Sept 2026" });
    assert.deepEqual(parseMonthTab("CPR - July 2026"), { store: "CPR", month: 7, year: 2026, name: "CPR - July 2026" });
    assert.equal(parseMonthTab("CPR- Jan 2026").month, 1);
    assert.equal(parseMonthTab("Wentzville Spares"), null);
  });

  test("a missing month copies the latest older tab for that store", () => {
    const names = [
      "Wentzville Spares",
      "WPR - Aug 2026",
      "WPR - Sept 2026",
      "CPR - Sept 2026",
      "CPR- Jan 2026",
    ];
    assert.deepEqual(pickMonthTab("WPR", names, new Date(2026, 9, 27)), {
      action: "duplicate",
      tab: "WPR - Oct 2026",
      source: "WPR - Sept 2026",
    });
    const september = pickMonthTab("CPR", names, new Date(2026, 8, 2));
    assert.equal(september.action, "use");
    assert.equal(september.tab, "CPR - Sept 2026");
    const october = pickMonthTab("WPR", names.concat("WPR - Oct 2026"), new Date(2026, 9, 27));
    assert.equal(october.action, "use");
    assert.equal(october.tab, "WPR - Oct 2026");
  });
});

describe("new month count reset", () => {
  test("WPR and CPR blank the same count columns", () => {
    assert.deepEqual(MONTH_RESET_COLUMNS, ["F", "G", "J", "K", "L", "U"]);
  });

  test("plain values from row 2 through the last row are cleared as one run", () => {
    assert.deepEqual(plainCountRuns([false, false, false, false]), [
      { startRow: 2, numRows: 4 },
    ]);
  });

  test("formula cells split the clear and are never included", () => {
    assert.deepEqual(plainCountRuns([false, true, false, false, true]), [
      { startRow: 2, numRows: 1 },
      { startRow: 4, numRows: 2 },
    ]);
    assert.deepEqual(plainCountRuns([true, true, true]), []);
  });

  test("a formula at the end is kept and a leading formula is kept", () => {
    assert.deepEqual(plainCountRuns([true, false, false]), [
      { startRow: 3, numRows: 2 },
    ]);
    assert.deepEqual(plainCountRuns([false, false, true]), [
      { startRow: 2, numRows: 2 },
    ]);
  });

  test("an unmeasured copy clears nothing", () => {
    assert.deepEqual(plainCountRuns([]), []);
    assert.deepEqual(plainCountRuns(null), []);
  });

  test("the script measures the previous tab before copying and clears only the copy", () => {
    const src = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
    const cols = src.match(/var CLEAR_COLS = \[([^\]]+)\]/);
    assert.ok(cols);
    assert.deepEqual(cols[1].split(",").map((n) => Number(n.trim())), [6, 7, 10, 11, 12, 21]);
    const ensure = src.slice(src.indexOf("function ensureMonth_"), src.indexOf("function countInputFormulaMask_"));
    const copyAt = ensure.indexOf(".copyTo(");
    const lastAt = ensure.indexOf("source.getLastRow()");
    assert.ok(lastAt !== -1 && lastAt < copyAt);
    assert.match(ensure, /countInputFormulaMask_\(source/);
    assert.match(ensure, /clearPlainCountInputs_\(copy/);
    assert.equal(ensure.includes("clearPlainCountInputs_(source"), false);
    assert.equal(ensure.includes("clearContent"), false);
  });
});

describe("formula copy", () => {
  test("total formulas follow the new row and absolute refs stay put", () => {
    assert.equal(rewriteFormula("=(F2*16)+G2", 2, 10), "=(F10*16)+G10");
    assert.equal(rewriteFormula("=round(E2*D2,0)", 2, 40), "=round(E40*D40,0)");
    assert.equal(rewriteFormula("=round(E3*$D3,0)", 3, 40), "=round(E40*$D40,0)");
    assert.equal(rewriteFormula("=SUM(H2:M2)", 2, 10), "=SUM(H10:M10)");
    assert.equal(rewriteFormula("=SUM(I2:M2)+H2", 2, 10), "=SUM(I10:M10)+H10");
    assert.equal(rewriteFormula("=ROUND(T2*(U2/4),0)", 2, 10), "=ROUND(T10*(U10/4),0)");
    assert.equal(rewriteFormula("=$A$2", 2, 10), "=$A$2");
  });
});

describe("pieces per ounce", () => {
  test("a formula-style tab stores =pieces/10", () => {
    const written = perOzWrite(25, ["=20/4.2", "=3/5", 1.3]);
    assert.deepEqual(written, { formula: "=25/10", value: 2.5 });
  });

  test("a number-style tab stores the divided value", () => {
    const written = perOzWrite(30, [3, 4.24, 1.3, "=20/4.2"]);
    assert.deepEqual(written, { formula: null, value: 3 });
  });

  test("a blank tab stores the divided value", () => {
    assert.deepEqual(perOzWrite(10, []), { formula: null, value: 1 });
    assert.deepEqual(perOzWrite(10, ["", null]), { formula: null, value: 1 });
  });
});

describe("mapCountOntoRow", () => {
  test("piece counts add into the section column and leave column I alone", () => {
    const front = mapCountOntoRow(
      { kind: "count", section: "Front", count: 48 },
      { J: 10, I: 250 },
    );
    assert.deepEqual(front.updates, { J: 58 });
    onlyCountColumns(front.updates);

    const back = mapCountOntoRow({ kind: "count", section: "Back", count: 3 }, { K: "" });
    assert.deepEqual(back.updates, { K: 3 });

    const room = mapCountOntoRow({ kind: "count", section: "Break Room", count: 2 }, {});
    assert.deepEqual(room.updates, { L: 2 });
  });

  test("a formula in the section cell is not overwritten", () => {
    const mapped = mapCountOntoRow(
      { kind: "count", section: "Back", count: 5 },
      { K: { value: 132, formula: true } },
    );
    assert.deepEqual(mapped.updates, {});
    assert.deepEqual(mapped.skipped, [{ column: "K", reason: "formula" }]);
  });

  test("weight from every section adds into the one lb/oz pair", () => {
    const first = mapCountOntoRow({ kind: "weight", section: "Front", lb: 1, oz: 0 }, { F: 13, G: 2.2 });
    assert.deepEqual(first.updates, { F: 14, G: 2.2 });
    const second = mapCountOntoRow(
      { kind: "weight", section: "Back", lb: 0, oz: 4 },
      { F: first.updates.F, G: first.updates.G },
    );
    assert.deepEqual(second.updates, { F: 14, G: 6.2 });
    onlyCountColumns(second.updates);
  });

  test("weight is skipped when pounds or ounces is a formula", () => {
    const mapped = mapCountOntoRow(
      { kind: "weight", section: "Front", lb: 1, oz: 0 },
      { F: { value: 1, formula: true }, G: 0 },
    );
    assert.deepEqual(mapped.updates, {});
    assert.equal(mapped.skipped[0].column, "F");
  });

  test("bins are total quarters, including Cottleville's second bin", () => {
    const twoFull = mapCountOntoRow({ kind: "bin", section: "Front", q1: 4, q2: 4 }, { U: "" });
    assert.deepEqual(twoFull.updates, { U: 8 });
    const more = mapCountOntoRow({ kind: "bin", section: "Front", q1: 4, q2: 3 }, { U: 8 });
    assert.deepEqual(more.updates, { U: 15 });
    const halfPlus = mapCountOntoRow(
      { kind: "bin", q1: 4, q2: 3 },
      {},
      { pieces: 0, ounces: 0, quarters: 7 },
    );
    assert.equal(halfPlus.updates.U, 7);
  });

  test("a checkbox in the quarters cell is left alone", () => {
    const mapped = mapCountOntoRow({ kind: "bin", q1: 4 }, { U: true });
    assert.deepEqual(mapped.updates, {});
    assert.equal(mapped.skipped[0].reason, "not a number");
  });

  test("replace and undo pass a difference, and the result does not go below zero", () => {
    const replaced = mapCountOntoRow(
      { kind: "count", section: "Front" },
      { J: 10 },
      { pieces: -6, ounces: 0, quarters: 0 },
    );
    assert.deepEqual(replaced.updates, { J: 4 });
    const undo = mapCountOntoRow(
      { kind: "count", section: "Front" },
      { J: 2 },
      { pieces: -5, ounces: 0, quarters: 0 },
    );
    assert.equal(undo.updates.J, 0);
    assert.equal(undo.clamped, true);
  });
});
