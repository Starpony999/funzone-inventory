// End-to-end check of the counting flow in headless Chrome.
// Run with a local server: python3 -m http.server 4173
// NODE_PATH must include puppeteer-core.

import assert from "node:assert/strict";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const base = process.env.FZ_URL || "http://127.0.0.1:4173/";
const outDir = process.env.FZ_SHOTS || "/tmp/fz-shots";
fs.mkdirSync(outDir, { recursive: true });

const errors = [];

function shot(page, name) {
  return page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
}

async function text(page) {
  return page.evaluate(() => document.body.innerText);
}

async function see(page, expected) {
  await page.waitForFunction((needle) => document.body.innerText.includes(needle), { timeout: 5000 }, expected);
}

async function click(page, selector) {
  await page.waitForSelector(selector, { timeout: 5000 });
  await page.click(selector);
}

async function pad(page, keys) {
  for (const key of keys) {
    await click(page, `[data-action="pad"][data-key="${key}"]`);
  }
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/local/bin/google-chrome",
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});

try {
  const page = await browser.newPage();
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("fz-bin-items", JSON.stringify([
        { short: "Dum Dum", WPR: "Dum Dum Pops", CPR: "Dum Dum Pops", doubleBin: true },
        { short: "Samurai", WPR: "Samurai Sword", CPR: "", doubleBin: false },
      ]));
    } catch {
      // about:blank has no storage. The real page still gets the list.
    }
  });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: "networkidle0" });
  await see(page, "Which store?");
  assert.equal((await text(page)).includes("Showing sample items"), false);
  await shot(page, "01-store");

  await click(page, '[data-action="store"][data-store="WPR"]');
  await see(page, "Where are you counting?");
  await click(page, '[data-action="section"][data-section="Front"]');
  await see(page, "Scan with camera");
  assert.match(await text(page), /WPR · Front/);
  await shot(page, "02-scan");

  await click(page, '[data-action="start-camera"]');
  await page.waitForFunction(() => {
    const wrap = document.getElementById("camWrap");
    const engine = document.getElementById("engine");
    return (wrap && !wrap.hidden) || (engine && engine.textContent.trim().length > 0);
  }, { timeout: 8000 });
  await shot(page, "03-camera");
  const cameraOn = await page.$eval("#camWrap", (el) => !el.hidden).catch(() => false);
  if (cameraOn) {
    const engine = await page.$eval("#engine", (el) => el.textContent);
    assert.match(engine, /barcode reader/i);
    await click(page, '[data-action="stop-camera"]');
    await page.waitForSelector("#finder:not([hidden])");
  }

  await page.type("#typed", "011206003210");
  await click(page, '[data-action="lookup"]');
  await see(page, "Giant Smarties (36/box)");
  await see(page, "How are you counting it?");
  assert.equal((await text(page)).includes("Count instead"), false);
  await click(page, '[data-action="kind-count"]');
  await see(page, "Full boxes (36 each)");
  await pad(page, ["2"]);
  await click(page, '[data-action="field"][data-field="loose"]');
  await pad(page, ["3"]);
  await see(page, "75 pcs");
  await shot(page, "04-count");
  await click(page, '[data-action="save-count"]');
  await see(page, "Saved");
  await see(page, "75 pcs");

  await click(page, '[data-action="edit"]');
  const before = await page.$$eval(".field .num", (els) => els.map((el) => el.textContent.trim()));
  assert.deepEqual(before, ["2", "3"]);
  await click(page, '[data-action="field"][data-field="loose"]');
  await pad(page, ["del", "4"]);
  await see(page, "76 pcs");
  await click(page, '[data-action="save-count"]');
  await see(page, "76 pcs");
  await shot(page, "05-saved");

  await click(page, '[data-action="scan-next"]');
  await page.type("#typed", "011206003210");
  await click(page, '[data-action="lookup"]');
  await click(page, '[data-action="kind-count"]');
  await pad(page, ["1"]);
  await click(page, '[data-action="save-count"]');
  await see(page, "Already counted in Front: 76 pcs");
  await see(page, "Yes, add it");
  await shot(page, "06-duplicate");
  await click(page, '[data-action="dup-add"]');
  await see(page, "112 pcs");
  assert.match(await text(page), /Counted more than once in the same section/);

  await click(page, '[data-action="menu"]');
  await click(page, '[data-action="change-section"]');
  await see(page, "Where are you counting?");
  await click(page, '[data-action="section"][data-section="Back"]');
  await page.type("#typed", "041116023459");
  await click(page, '[data-action="lookup"]');
  await see(page, "Dum Dum Pops");
  assert.equal((await text(page)).includes("Bin percentage"), false);
  await shot(page, "07-back-no-bin");
  await click(page, '[data-action="kind-weight"]');
  await pad(page, ["1"]);
  await see(page, "76 pcs");
  await shot(page, "08-weight");
  await click(page, '[data-action="save-weight"]');
  await see(page, "Saved");

  await click(page, '[data-action="menu"]');
  await click(page, '[data-action="change-section"]');
  await click(page, '[data-action="section"][data-section="Front"]');
  await page.type("#typed", "041116023459");
  await click(page, '[data-action="lookup"]');
  await see(page, "How full is the bin?");
  await see(page, "Count instead");
  assert.equal((await text(page)).includes("How are you counting it?"), false);
  await see(page, "Quarter");
  await click(page, '[data-action="bin"][data-q="1"]');
  await see(page, "Saved");
  assert.equal((await text(page)).includes("second bin"), false);
  await see(page, "125 pcs");
  assert.match(await text(page), /Front 125 \+ Back 76 = 201/);

  await click(page, '[data-action="menu"]');
  await click(page, '[data-action="change-store"]');
  await click(page, '[data-action="store"][data-store="CPR"]');
  await click(page, '[data-action="section"][data-section="Front"]');
  await page.type("#typed", "075656049338");
  await click(page, '[data-action="lookup"]');
  await see(page, "Oh So Jelle Pets");
  await see(page, "isn't on the Sept 2026 list");
  await shot(page, "09-off-list");

  await click(page, '[data-action="back"]');
  await page.type("#typed", "097138502094");
  await click(page, '[data-action="lookup"]');
  await see(page, "Which item is this?");
  await page.$eval("#search", (el) => {
    el.value = "Dum";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await see(page, "Dum Dum Pops");
  assert.equal(await page.$$eval('[data-action="add-new"]', (els) => els.length), 0);
  await page.$eval("#search", (el) => {
    el.value = "Squeeze Pyramid";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await see(page, "No match");
  await see(page, "Add as a new product");
  await shot(page, "14-add-product");
  await click(page, '[data-action="add-new"]');
  await see(page, "What's the product called?");
  assert.equal(await page.$eval("#newName", (el) => el.value), "Squeeze Pyramid");
  await click(page, '[data-action="new-name-continue"]');
  await see(page, "Add this product?");
  await see(page, "097138502094");
  await shot(page, "15-confirm-product");
  await click(page, '[data-action="back"]');
  await see(page, "What's the product called?");
  assert.equal(await page.$eval("#newName", (el) => el.value), "Squeeze Pyramid");
  await click(page, '[data-action="new-name-continue"]');
  await click(page, '[data-action="new-confirm"]');
  await see(page, "Ticket price");
  assert.equal(await page.$eval('[data-action="save-new-item"]', (el) => el.disabled), true);
  await shot(page, "16-ticket-price");
  await pad(page, ["2", "5", "0"]);
  await click(page, '[data-action="save-new-item"]');
  await see(page, "How are you counting it?");
  await see(page, "Squeeze Pyramid");
  await see(page, "250 tickets");
  await see(page, "New product, saved on this phone");
  await shot(page, "17-new-product");
  await click(page, '[data-action="kind-count"]');
  await pad(page, ["2"]);
  await click(page, '[data-action="save-count"]');
  await see(page, "Saved");
  await see(page, "Squeeze Pyramid");
  await see(page, "2 pcs");
  await click(page, '[data-action="scan-next"]');
  await page.type("#typed", "097138502094");
  await click(page, '[data-action="lookup"]');
  await see(page, "Squeeze Pyramid");
  assert.equal((await text(page)).includes("Which item is this?"), false);
  await click(page, '[data-action="back"]');

  await page.type("#typed", "097138501967");
  await click(page, '[data-action="lookup"]');
  await see(page, "Which item is this?");
  await page.type("#search", "Air");
  await see(page, "Airheads Bites");
  assert.equal((await text(page)).includes("Nintendo Switch 2"), false);
  await shot(page, "10-picker");
  await click(page, '[data-action="choose"][data-name="Airheads Bites"]');
  await see(page, "recognized next time");

  await click(page, '[data-action="back"]');
  await page.type("#typed", "097138501967");
  await click(page, '[data-action="lookup"]');
  await see(page, "Airheads Bites");
  assert.equal((await text(page)).includes("Which item is this?"), false);

  await click(page, '[data-action="back"]');
  await page.type("#typed", "041116023459");
  await click(page, '[data-action="lookup"]');
  await see(page, "How full is the bin?");
  await click(page, '[data-action="bin"][data-q="1"]');
  await see(page, "Is there a second bin?");
  await shot(page, "11-second-bin");
  await click(page, '[data-action="bin-no"]');
  await see(page, "123 pcs");

  await click(page, '[data-action="scan-next"]');
  await page.type("#typed", "041116023459");
  await click(page, '[data-action="lookup"]');
  await see(page, "How full is the bin?");
  await click(page, '[data-action="bin"][data-q="2"]');
  await see(page, "Is there a second bin?");
  await click(page, '[data-action="bin-yes"]');
  await see(page, "How full is the second bin?");
  await click(page, '[data-action="bin"][data-q="4"]');
  await see(page, "Already counted in Front");
  await click(page, '[data-action="dup-replace"]');
  await see(page, "735 pcs");
  assert.equal((await text(page)).includes("123 pcs"), false);
  assert.match(await text(page), /Bin: Half \+ Full/);

  await click(page, '[data-action="scan-next"]');
  await page.type("#typed", "041116023459");
  await click(page, '[data-action="lookup"]');
  await see(page, "How full is the bin?");
  await click(page, '[data-action="bin"][data-q="4"]');
  await click(page, '[data-action="bin-no"]');
  await see(page, "Already counted in Front");
  await click(page, '[data-action="dup-cancel"]');
  await see(page, "Scan with camera");
  assert.match(await text(page), /735 pcs/);
  assert.equal((await text(page)).includes("1,225 pcs"), false);

  await page.reload({ waitUntil: "networkidle0" });
  await see(page, "Scan with camera");
  assert.match(await text(page), /CPR · Front/);
  assert.match(await text(page), /735 pcs/);
  await shot(page, "12-session-phone");

  const phoneOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  assert.equal(phoneOverflow, false);

  await page.setViewport({ width: 1280, height: 900 });
  await shot(page, "13-session-desktop");
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  assert.equal(desktopOverflow, false);

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await click(page, '[data-action="menu"]');
  await click(page, '[data-action="clear-session"]');
  await see(page, "Start a new session?");
  await click(page, '[data-action="confirm-clear"]');
  assert.equal((await text(page)).includes("Counted this session"), false);

  await page.type("#typed", "097138501967");
  await click(page, '[data-action="lookup"]');
  await see(page, "Airheads Bites");
  assert.equal((await text(page)).includes("Which item is this?"), false);

  await click(page, '[data-action="back"]');
  await page.type("#typed", "028400090896");
  await click(page, '[data-action="lookup"]');
  await see(page, "Which item is this?");
  await page.type("#search", "flarp");
  await click(page, '[data-action="choose"][data-name="flarp Noise Putty"]');
  await click(page, '[data-action="kind-count"]');
  await see(page, "How many pieces?");
  await click(page, '[data-action="use-boxes"]');
  await see(page, "How many in a pack");
  await click(page, '[data-action="pack-unit"][data-unit="bag"]');
  await see(page, "Full bags");
  await page.screenshot({ path: `${outDir}/26-pack-bag.png` });
  await pad(page, ["6"]);
  await click(page, '[data-action="field"][data-field="boxes"]');
  await pad(page, ["2"]);
  await click(page, '[data-action="field"][data-field="loose"]');
  await pad(page, ["1"]);
  await see(page, "13 pcs");
  await click(page, '[data-action="save-count"]');
  await see(page, "13 pcs");
  await see(page, "2 bags");
  await click(page, '[data-action="scan-next"]');
  await page.type("#typed", "028400090896");
  await click(page, '[data-action="lookup"]');
  await click(page, '[data-action="kind-count"]');
  await see(page, "How many in a pack");
  await see(page, "Full bags");
  const remembered = await page.$$eval(".field .num", (els) => els.map((el) => el.textContent.trim()));
  assert.equal(remembered[0], "6");

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await click(page, '[data-action="menu"]');
  await see(page, "TESTING MODE");
  await see(page, "Don't save counts");
  await see(page, "Don't save barcodes");
  await see(page, "Don't save new items");
  await see(page, "Reload from sheet");
  await click(page, '[data-action="testing"][data-flag="skipCounts"]');
  await see(page, "Not saving counts");
  assert.equal(await page.$eval(".badge.testing", (el) => el.textContent.trim()), "Testing");
  await page.screenshot({ path: `${outDir}/18-testing-menu.png` });
  await click(page, '[data-action="sheet-settings"]');
  await see(page, "Sheet connection");
  await see(page, "Web app link");
  await see(page, "PIN");
  await page.screenshot({ path: `${outDir}/19-sheet-settings.png` });
  await click(page, '[data-action="back"]');

  await click(page, '[data-action="menu"]');
  await click(page, '[data-action="change-store"]');
  await click(page, '[data-action="store"][data-store="WPR"]');
  await click(page, '[data-action="section"][data-section="Front"]');
  await page.type("#typed", "070330334412");
  await click(page, '[data-action="lookup"]');
  await see(page, "Princess Tiara");
  await click(page, '[data-action="kind-weight"]');
  await see(page, "How many pieces equal 10 oz?");
  await pad(page, ["3", "0"]);
  await see(page, "30");
  await page.screenshot({ path: `${outDir}/20-pieces-per-10-oz.png` });
  await click(page, '[data-action="save-per10"]');
  await see(page, "Enter the weight");
  await click(page, '[data-action="field"][data-field="oz"]');
  await pad(page, ["1", "0"]);
  await see(page, "30 pcs");

  await click(page, '[data-action="back"]');
  await click(page, '[data-action="back"]');
  await see(page, "Or search by name or barcode");
  await page.click("#typed", { clickCount: 3 });
  await page.type("#typed", "samurai");
  await click(page, '[data-action="suggest"]');
  await see(page, "How full is the bin?");
  await see(page, "Count instead");
  await page.screenshot({ path: `${outDir}/24-bin-items.png` });
  await click(page, '[data-action="count-instead"]');
  await see(page, "How many pieces?");
  await pad(page, ["1", "2", "0"]);
  await click(page, '[data-action="save-count"]');
  await see(page, "Is the front of the bin full?");
  await click(page, '[data-action="front-no"]');
  await see(page, "How many pieces fit in the front of the bin?");
  await pad(page, ["5", "0"]);
  await page.screenshot({ path: `${outDir}/25-front-of-bin.png` });
  await click(page, '[data-action="save-measure"]');
  await see(page, "Count 120");
  await see(page, "front 50");
  await see(page, "70 pcs");
  await click(page, '[data-action="scan-next"]');
  await page.type("#typed", "samurai");
  await click(page, '[data-action="suggest"]');
  await click(page, '[data-action="bin"][data-q="4"]');
  await see(page, "How many pieces fill one full bin?");
  await pad(page, ["4", "0"]);
  await click(page, '[data-action="save-measure"]');
  await see(page, "40 pcs");

  const zxingPage = await browser.newPage();
  zxingPage.on("pageerror", (err) => errors.push("zxing: " + String(err)));
  await zxingPage.evaluateOnNewDocument(() => {
    try { localStorage.clear(); } catch { /* about:blank has no storage */ }
    try { delete window.BarcodeDetector; } catch { /* already absent */ }
    try {
      Object.defineProperty(window, "BarcodeDetector", { value: undefined, configurable: true });
    } catch { /* ignore */ }
  });
  await zxingPage.setViewport({ width: 390, height: 844, isMobile: true });
  await zxingPage.goto(base, { waitUntil: "networkidle0" });
  await zxingPage.click('[data-action="store"][data-store="WPR"]');
  await zxingPage.click('[data-action="section"][data-section="Front"]');
  await see(zxingPage, "Or search by name or barcode");
  await zxingPage.type("#typed", "laser spin");
  await zxingPage.waitForSelector('[data-action="suggest"]');
  await see(zxingPage, "Laser Spin Top");
  await zxingPage.screenshot({ path: `${outDir}/21-name-search.png` });
  await zxingPage.click('[data-action="suggest"]');
  await see(zxingPage, "How are you counting it?");
  await see(zxingPage, "Laser Spin Top");
  await zxingPage.click('[data-action="back"]');
  await see(zxingPage, "Or search by name or barcode");
  await zxingPage.click("#typed", { clickCount: 3 });
  await zxingPage.type("#typed", "zzzz-not-a-product");
  await see(zxingPage, "No match.");
  await see(zxingPage, "Add as a new product");
  await zxingPage.click('[data-action="start-camera"]');
  await zxingPage.waitForFunction(() => {
    const engine = document.getElementById("engine");
    return engine && /barcode reader/i.test(engine.textContent);
  }, { timeout: 8000 });
  const zxingEngine = await zxingPage.$eval("#engine", (el) => el.textContent);
  assert.match(zxingEngine, /built-in barcode reader/i);
  assert.doesNotMatch(zxingEngine, /phone's built-in/);
  await see(zxingPage, "Fill the box with the barcode");
  const zoomOn = await zxingPage.$eval("#zoomRange", (el) => {
    const wrap = document.getElementById("camWrap");
    return !!wrap && !wrap.hidden && !el.disabled;
  });
  assert.equal(zoomOn, true);
  await zxingPage.$eval("#zoomRange", (el) => {
    el.value = "2";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await zxingPage.waitForFunction(() => {
    const video = document.getElementById("video");
    return video && video.style.transform.includes("scale(2)");
  });
  await zxingPage.screenshot({ path: `${outDir}/22-camera-zoom.png` });
  await zxingPage.click('[data-action="stop-camera"]');

  const noticePage = await browser.newPage();
  noticePage.on("pageerror", (err) => errors.push("notice: " + String(err)));
  await noticePage.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("fz-sheet-connection", JSON.stringify({
        url: "https://sheets.example/exec",
        pin: "1234",
      }));
    } catch {
      // about:blank has no storage. The real page still gets the override.
    }
    window.fetch = () => Promise.reject(new Error("down"));
  });
  await noticePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await noticePage.goto(base, { waitUntil: "domcontentloaded" });
  await see(noticePage, "Showing sample items");
  await see(noticePage, "couldn't load the sheet");
  await see(noticePage, "Tap to retry");
  await noticePage.waitForSelector('[data-action="retry-catalog"]');
  await noticePage.screenshot({ path: `${outDir}/23-sample-catalog.png` });

  assert.deepEqual(errors, []);
  console.log("browser flow ok");
  console.log("screenshots", outDir);
} finally {
  await browser.close();
}
