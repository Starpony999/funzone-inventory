import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("vendored zxing exposes the readers the camera uses", () => {
  const code = fs.readFileSync(new URL("../vendor/zxing.min.js", import.meta.url), "utf8");
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox);
  assert.equal(typeof sandbox.ZXing.MultiFormatReader, "function");
  assert.ok(sandbox.ZXing.BarcodeFormat.UPC_A);
  assert.ok(sandbox.ZXing.BarcodeFormat.EAN_13);
  assert.ok(sandbox.ZXing.BarcodeFormat.UPC_E);
  assert.ok(sandbox.ZXing.BarcodeFormat.EAN_8);
  assert.ok(sandbox.ZXing.BarcodeFormat.CODE_128);
  assert.equal(typeof sandbox.ZXing.HTMLCanvasElementLuminanceSource, "function");
});
