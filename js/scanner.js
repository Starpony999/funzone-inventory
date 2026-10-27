/**
 * Camera barcode scanning.
 *
 * Same approach as the tested scanner page: BarcodeDetector on Android,
 * bundled ZXing when the browser does not have it (iPhone Safari).
 * Reads UPC-A, EAN-13, UPC-E, EAN-8, and Code 128.
 * Retail codes must pass the check digit. Code 128 must be read twice.
 */

import { expandUpcE, checkOk } from "./data.js";

const FORMATS_NATIVE = ["upc_a", "ean_13", "upc_e", "ean_8", "code_128"];

let onCode = () => {};
let stream = null;
let loopTimer = null;
let lastText = "";
let lastCount = 0;
let busy = false;
let audioCtx = null;
let runId = 0;

export function setOnCode(fn) {
  onCode = typeof fn === "function" ? fn : () => {};
}

export function cameraIsOn() {
  return !!stream;
}

function isRetailFormat(fmt) {
  return /upc|ean/i.test(fmt || "");
}

function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    // A missing audio context should not block the scan.
  }
}

function beep() {
  try {
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 1800;
    gain.gain.value = 0.12;
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.12);
  } catch {
    // Ignore. The flash and the next screen are enough.
  }
}

function flash() {
  const el = document.getElementById("flash");
  if (!el) return;
  el.style.opacity = "0.55";
  setTimeout(() => {
    el.style.opacity = "0";
  }, 220);
}

function setEngine(text) {
  const el = document.getElementById("engine");
  if (el) el.textContent = text || "";
}

function setCamMessage(text) {
  const el = document.getElementById("camMsg");
  if (el) el.textContent = text;
}

function showCamera(on) {
  const wrap = document.getElementById("camWrap");
  const stopBtn = document.getElementById("stopBtn");
  const finder = document.getElementById("finder");
  if (wrap) wrap.hidden = !on;
  if (stopBtn) stopBtn.hidden = !on;
  if (finder) finder.hidden = on;
}

// Retail codes with a good check digit are accepted on the first read.
// Code 128 needs two matching reads so a partial decode is not saved.
function accept(text, format) {
  const digits = String(text).replace(/\D/g, "");
  if (isRetailFormat(format)) {
    const full = /upc_?e/i.test(format) && digits.length === 8 ? expandUpcE(digits) : digits;
    return checkOk(full);
  }
  if (text === lastText) lastCount += 1;
  else {
    lastText = text;
    lastCount = 1;
  }
  return lastCount >= 2;
}

function gotCode(text, format) {
  if (busy) return;
  if (!accept(text, format)) return;
  busy = true;
  beep();
  if (navigator.vibrate) navigator.vibrate(120);
  flash();
  stopCamera();
  onCode(text, format);
}

async function nativeSupported() {
  if (!("BarcodeDetector" in window)) return false;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    return ["upc_a", "ean_13"].every((fmt) => formats.includes(fmt));
  } catch {
    return false;
  }
}

function releaseStream() {
  clearTimeout(loopTimer);
  loopTimer = null;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  const video = document.getElementById("video");
  if (video && video.srcObject) {
    try {
      video.srcObject.getTracks().forEach((track) => track.stop());
    } catch {
      // The track may already be stopped.
    }
    video.srcObject = null;
  }
}

export function stopCamera() {
  runId += 1;
  releaseStream();
  showCamera(false);
}

export async function startCamera() {
  releaseStream();
  const myRun = ++runId;
  unlockAudio();
  busy = false;
  lastText = "";
  lastCount = 0;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setEngine("This browser can't open the camera here. Type the barcode instead.");
    return;
  }
  showCamera(true);
  setCamMessage("Starting camera…");
  const constraints = {
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
  };
  try {
    let detectOnce;
    if (myRun !== runId) return;
    if (await nativeSupported()) {
      if (myRun !== runId) return;
      setEngine("Using the phone's built-in barcode reader.");
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const detector = new window.BarcodeDetector({
        formats: FORMATS_NATIVE.filter((fmt) => supported.includes(fmt)),
      });
      detectOnce = async (video) => {
        const found = await detector.detect(video);
        return found && found.length ? { text: found[0].rawValue, format: found[0].format } : null;
      };
    } else if (window.ZXing) {
      setEngine("Using the built-in barcode reader.");
      const formats = window.ZXing.BarcodeFormat;
      const hints = new Map();
      hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        formats.UPC_A,
        formats.EAN_13,
        formats.UPC_E,
        formats.EAN_8,
        formats.CODE_128,
      ]);
      hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
      const reader = new window.ZXing.MultiFormatReader();
      reader.setHints(hints);
      const names = {
        [formats.UPC_A]: "upc_a",
        [formats.EAN_13]: "ean_13",
        [formats.UPC_E]: "upc_e",
        [formats.EAN_8]: "ean_8",
        [formats.CODE_128]: "code_128",
      };
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      detectOnce = async (video) => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) return null;
        // Middle band of the frame, where the on-screen guide sits.
        const sourceY = Math.round(height * 0.25);
        const sourceH = Math.round(height * 0.5);
        const scale = Math.min(1, 1000 / width);
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(sourceH * scale);
        ctx.drawImage(video, 0, sourceY, width, sourceH, 0, 0, canvas.width, canvas.height);
        try {
          const bitmap = new window.ZXing.BinaryBitmap(
            new window.ZXing.HybridBinarizer(new window.ZXing.HTMLCanvasElementLuminanceSource(canvas)),
          );
          const result = reader.decodeWithState(bitmap);
          return { text: result.getText(), format: names[result.getBarcodeFormat()] || "unknown" };
        } catch {
          return null;
        }
      };
    } else {
      showCamera(false);
      setEngine("The barcode reader didn't load. Type the barcode instead.");
      return;
    }
    const media = await navigator.mediaDevices.getUserMedia(constraints);
    if (myRun !== runId) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = media;
    const video = document.getElementById("video");
    if (!video) {
      stopCamera();
      return;
    }
    video.srcObject = stream;
    await video.play();
    if (myRun !== runId) return;
    setCamMessage("Point at the barcode");
    const tick = async () => {
      if (!stream || myRun !== runId) return;
      try {
        const hit = await detectOnce(video);
        if (hit && myRun === runId) gotCode(hit.text, hit.format);
      } catch {
        // One bad frame should not stop the camera.
      }
      if (stream && myRun === runId) loopTimer = setTimeout(tick, 150);
    };
    tick();
  } catch (err) {
    if (myRun !== runId) return;
    stopCamera();
    const name = err && err.name;
    setEngine(
      name === "NotAllowedError"
        ? "Camera permission was denied. Allow the camera for this site in the browser settings, then try again."
        : name === "NotFoundError"
          ? "No camera found on this device. Type the barcode instead."
          : "Couldn't start the camera. Type the barcode instead.",
    );
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopCamera();
});
