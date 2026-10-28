/**
 * Camera barcode scanning.
 *
 * Rear camera at 1920×1080 when the phone allows it, continuous focus when
 * the browser accepts it, then a zoom slider and a light button.
 * The phone's barcode reader runs when it exists. Every miss is also tried
 * with the bundled ZXing reader (that is the only reader on iPhone Safari).
 * UPC-A, UPC-E, EAN-13, EAN-8, Code 128, Code 39, and ITF.
 * Retail codes must pass the check digit. Other codes must be read twice.
 */

import { expandUpcE, checkOk } from "./data.js";

export const NATIVE_FORMATS = ["upc_a", "ean_13", "upc_e", "ean_8", "code_128", "code_39", "itf"];

export const ZXING_FORMATS = ["UPC_A", "EAN_13", "UPC_E", "EAN_8", "CODE_128", "CODE_39", "ITF"];

// ideal, not minimum: a laptop camera and the test camera can still open.
export function cameraConstraintAttempts() {
  const facing = { ideal: "environment" };
  return [
    { audio: false, video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } } },
    { audio: false, video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } },
    { audio: false, video: { facingMode: facing } },
  ];
}

// Center crop matching the on-screen box. zoom > 1 tightens it (digital zoom).
export function guideCrop(videoWidth, videoHeight, zoom) {
  const vw = Math.max(0, videoWidth | 0);
  const vh = Math.max(0, videoHeight | 0);
  if (vw < 16 || vh < 16) return null;
  const z = Math.max(1, Number(zoom) || 1);
  const sw = Math.min(vw, Math.max(48, Math.round(vw * (0.72 / z))));
  const sh = Math.min(vh, Math.max(48, Math.round(vh * (0.36 / z))));
  return {
    sx: Math.round((vw - sw) / 2),
    sy: Math.round((vh - sh) / 2),
    sw,
    sh,
  };
}

const PASSES = [
  { zoomMul: 1, scale: 1, stretch: false, binarizer: "hybrid" },
  { zoomMul: 1, scale: 1, stretch: true, binarizer: "hybrid" },
  { zoomMul: 1, scale: 1, stretch: true, binarizer: "global" },
  { zoomMul: 1.8, scale: 2, stretch: true, binarizer: "hybrid" },
];

let onCode = () => {};
let stream = null;
let loopTimer = null;
let lastText = "";
let lastCount = 0;
let busy = false;
let audioCtx = null;
let runId = 0;
let userZoom = 1;
let hardwareZoom = null;
let torchOn = false;
let torchSupported = false;
let passIndex = 0;

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

function accept(text, format) {
  const fmt = String(format || "");
  const digits = String(text).replace(/\D/g, "");
  if (isRetailFormat(fmt)) {
    const full = /upc_?e/i.test(fmt) && digits.length === 8 ? expandUpcE(digits) : digits;
    return checkOk(full);
  }
  if (/itf/i.test(fmt) && (digits.length < 6 || digits.length % 2 !== 0)) return false;
  if (/code_?39/i.test(fmt) && String(text).trim().length < 4) return false;
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
  if (!("BarcodeDetector" in window) || !window.BarcodeDetector) return false;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    return ["upc_a", "ean_13"].every((fmt) => formats.includes(fmt));
  } catch {
    return false;
  }
}

function safeCaps(track) {
  try {
    return track.getCapabilities ? track.getCapabilities() : {};
  } catch {
    return {};
  }
}

async function tuneTrack(track) {
  const caps = safeCaps(track);
  for (const key of ["focusMode", "exposureMode", "whiteBalanceMode"]) {
    const supported = caps[key];
    if (Array.isArray(supported) && !supported.includes("continuous")) continue;
    try {
      await track.applyConstraints({ advanced: [{ [key]: "continuous" }] });
    } catch {
      // This phone does not take that setting. The picture still runs.
    }
  }
  return safeCaps(track);
}

function releaseStream() {
  clearTimeout(loopTimer);
  loopTimer = null;
  const track = stream && stream.getVideoTracks()[0];
  if (track && torchOn) {
    track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
  }
  torchOn = false;
  userZoom = 1;
  hardwareZoom = null;
  torchSupported = false;
  if (stream) {
    stream.getTracks().forEach((item) => item.stop());
    stream = null;
  }
  const video = document.getElementById("video");
  if (video) {
    video.style.transform = "";
    if (video.srcObject) {
      try {
        video.srcObject.getTracks().forEach((item) => item.stop());
      } catch {
        // The track may already be stopped.
      }
      video.srcObject = null;
    }
  }
  const torch = document.getElementById("torchBtn");
  if (torch) {
    torch.hidden = true;
    torch.setAttribute("aria-pressed", "false");
  }
}

export function stopCamera() {
  runId += 1;
  releaseStream();
  showCamera(false);
}

function clamp(number, min, max) {
  return Math.min(max, Math.max(min, number));
}

async function applyZoom() {
  const video = document.getElementById("video");
  const track = stream && stream.getVideoTracks()[0];
  if (hardwareZoom && track) {
    const z = clamp(userZoom, hardwareZoom.min, hardwareZoom.max);
    try {
      await track.applyConstraints({ advanced: [{ zoom: z }] });
      if (video) video.style.transform = "";
      return;
    } catch {
      // Use a crop of the scan box instead.
    }
  }
  if (video) video.style.transform = userZoom > 1.01 ? "scale(" + userZoom + ")" : "";
}

function setupZoom(caps) {
  const input = document.getElementById("zoomRange");
  const hw = caps && caps.zoom;
  hardwareZoom = hw && typeof hw.max === "number" && hw.max > hw.min ? hw : null;
  userZoom = hardwareZoom ? hardwareZoom.min : 1;
  if (!input) return;
  if (hardwareZoom) {
    input.min = String(hardwareZoom.min);
    input.max = String(Math.min(hardwareZoom.max, 6));
    input.step = String(hardwareZoom.step || 0.1);
  } else {
    input.min = "1";
    input.max = "4";
    input.step = "0.1";
  }
  input.value = String(userZoom);
}

function setupTorch(caps) {
  torchSupported = !!(caps && caps.torch);
  torchOn = false;
  const button = document.getElementById("torchBtn");
  if (!button) return;
  button.hidden = !torchSupported;
  button.setAttribute("aria-pressed", "false");
}

async function toggleTorch() {
  if (!torchSupported || !stream) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  const next = !torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: next }] });
    torchOn = next;
  } catch {
    torchOn = false;
  }
  const button = document.getElementById("torchBtn");
  if (button) button.setAttribute("aria-pressed", torchOn ? "true" : "false");
}

function stretchContrast(ctx, width, height) {
  let image;
  try {
    image = ctx.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const data = image.data;
  let min = 255;
  let max = 0;
  const stride = Math.max(4, (data.length / 4 / 4000) | 0) * 4;
  for (let i = 0; i < data.length; i += stride) {
    const y = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  const span = max - min;
  if (span < 8 || span > 170) return;
  for (let i = 0; i < data.length; i += 4) {
    const y = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const v = Math.max(0, Math.min(255, ((y - min) * 255) / span));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
}

function makeZxing() {
  const formats = window.ZXing.BarcodeFormat;
  const hints = new Map();
  const wanted = ZXING_FORMATS.map((name) => formats[name]).filter((fmt) => fmt != null);
  hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, wanted);
  hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
  const reader = new window.ZXing.MultiFormatReader();
  reader.setHints(hints);
  const names = {};
  for (const name of ZXING_FORMATS) {
    if (formats[name] != null) names[formats[name]] = name.toLowerCase();
  }
  return { reader, names };
}

function decodeCanvas(reader, names, canvas, binarizerName) {
  const ZXing = window.ZXing;
  const source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
  const bin = binarizerName === "global"
    ? new ZXing.GlobalHistogramBinarizer(source)
    : new ZXing.HybridBinarizer(source);
  try {
    const result = reader.decodeWithState(new ZXing.BinaryBitmap(bin));
    try { reader.reset(); } catch { /* already clear */ }
    return { text: result.getText(), format: names[result.getBarcodeFormat()] || "unknown" };
  } catch {
    try { reader.reset(); } catch { /* already clear */ }
    return null;
  }
}

async function openCamera() {
  let lastError = null;
  for (const constraints of cameraConstraintAttempts()) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
      const name = err && err.name;
      if (name === "NotAllowedError" || name === "SecurityError") throw err;
    }
  }
  throw lastError || new Error("no-camera");
}

export async function startCamera() {
  releaseStream();
  const myRun = ++runId;
  passIndex = 0;
  unlockAudio();
  busy = false;
  lastText = "";
  lastCount = 0;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setEngine("This browser can't open the camera here. Search by name or barcode instead.");
    return;
  }
  showCamera(true);
  setCamMessage("Starting camera…");
  try {
    let detector = null;
    let zxing = null;
    const native = await nativeSupported();
    if (myRun !== runId) return;
    if (native) {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      detector = new window.BarcodeDetector({
        formats: NATIVE_FORMATS.filter((fmt) => supported.includes(fmt)),
      });
    }
    if (window.ZXing) zxing = makeZxing();
    if (!detector && !zxing) {
      showCamera(false);
      setEngine("The barcode reader didn't load. Search by name or barcode instead.");
      return;
    }
    setEngine(detector
      ? "Using the phone's built-in barcode reader."
      : "Using the built-in barcode reader.");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const prepare = (video, pass, zoomForCrop) => {
      const crop = guideCrop(video.videoWidth, video.videoHeight, zoomForCrop * pass.zoomMul);
      if (!crop) return false;
      const destW = Math.min(1600, Math.max(1, Math.round(crop.sw * pass.scale)));
      const destH = Math.max(1, Math.round(crop.sh * (destW / crop.sw)));
      canvas.width = destW;
      canvas.height = destH;
      ctx.imageSmoothingEnabled = pass.scale > 1;
      ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, destW, destH);
      if (pass.stretch) stretchContrast(ctx, destW, destH);
      return true;
    };
    const detectOnce = async (video) => {
      const pass = PASSES[passIndex % PASSES.length];
      passIndex += 1;
      const digitalZoom = !hardwareZoom && userZoom > 1.01;
      if (detector) {
        try {
          const found = await detector.detect(video);
          if (found && found.length) return { text: found[0].rawValue, format: found[0].format };
        } catch {
          // One bad frame should not stop the camera.
        }
      }
      const zoomForCrop = hardwareZoom ? 1 : userZoom;
      if (zxing && prepare(video, pass, zoomForCrop)) {
        const hit = decodeCanvas(zxing.reader, zxing.names, canvas, pass.binarizer);
        if (hit) return hit;
      }
      if (detector && digitalZoom && canvas.width) {
        try {
          const found = await detector.detect(canvas);
          if (found && found.length) return { text: found[0].rawValue, format: found[0].format };
        } catch {
          // Keep trying the next frame.
        }
      }
      return null;
    };
    const media = await openCamera();
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
    const track = stream.getVideoTracks()[0];
    const caps = track ? await tuneTrack(track) : {};
    if (myRun !== runId) return;
    setupZoom(caps);
    setupTorch(caps);
    video.srcObject = stream;
    await video.play();
    if (myRun !== runId) return;
    setCamMessage("Fill the box with the barcode");
    const tick = async () => {
      if (!stream || myRun !== runId) return;
      try {
        const hit = await detectOnce(video);
        if (hit && myRun === runId) gotCode(hit.text, hit.format);
      } catch {
        // One bad frame should not stop the camera.
      }
      if (stream && myRun === runId) loopTimer = setTimeout(tick, 120);
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
          ? "No camera found on this device. Search by name or barcode instead."
          : "Couldn't start the camera. Search by name or barcode instead.",
    );
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCamera();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest && event.target.closest("#torchBtn")) toggleTorch();
  });
  document.addEventListener("input", (event) => {
    if (!event.target || event.target.id !== "zoomRange") return;
    userZoom = Number(event.target.value) || 1;
    applyZoom();
  });
}
