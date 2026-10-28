import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  NATIVE_FORMATS,
  ZXING_FORMATS,
  cameraConstraintAttempts,
  guideCrop,
} from "../js/scanner.js";

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
  assert.ok(sandbox.ZXing.BarcodeFormat.CODE_39);
  assert.ok(sandbox.ZXing.BarcodeFormat.ITF);
  assert.equal(typeof sandbox.ZXing.HTMLCanvasElementLuminanceSource, "function");
  assert.equal(typeof sandbox.ZXing.GlobalHistogramBinarizer, "function");
  assert.equal(typeof sandbox.ZXing.HybridBinarizer, "function");
});

test("the camera asks for a sharp rear picture and the retail formats", () => {
  assert.deepEqual(NATIVE_FORMATS, ["upc_a", "ean_13", "upc_e", "ean_8", "code_128", "code_39", "itf"]);
  assert.deepEqual(ZXING_FORMATS, ["UPC_A", "EAN_13", "UPC_E", "EAN_8", "CODE_128", "CODE_39", "ITF"]);
  const attempts = cameraConstraintAttempts();
  assert.equal(attempts[0].video.width.ideal, 1920);
  assert.equal(attempts[0].video.height.ideal, 1080);
  assert.equal(attempts[0].video.facingMode.ideal, "environment");
  const wide = guideCrop(1920, 1080, 1);
  const tight = guideCrop(1920, 1080, 2);
  assert.ok(wide.sw < 1920 && wide.sh < 1080);
  assert.ok(tight.sw < wide.sw && tight.sh < wide.sh);
  assert.equal(wide.sx, Math.round((1920 - wide.sw) / 2));
  assert.equal(guideCrop(0, 0, 1), null);
});
