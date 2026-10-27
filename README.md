# Fun Zone Inventory

Phone-friendly counting for Fun Zone prize inventory at the two Pizza Ranch arcades: Wentzville (WPR) and Cottleville (CPR).

Live site: https://starpony999.github.io/funzone-inventory/

Staff pick a store and a section (Front, Back, or Break Room), scan a barcode with the phone camera, and enter a count. The section stays put until they change it from the menu. The first time a barcode is unknown, they pick the item once and that phone remembers it. If the search matches nothing, they can add it as a new product: confirm the name and barcode, then enter the ticket value.

Counts can be pieces (full boxes plus loose, using the pack size in the item name), weight in pounds and ounces, or — in Front only — how full the bin is. Cottleville asks about a second bin. The session list shows the piece total for each entry and a combined total when the same item was counted in more than one section. Counting the same item twice in one section asks whether to add the new count or replace the earlier one.

## Google Sheet

Once the web app link and PIN are saved on the phone (menu → Sheet connection), counts, barcodes, and new products are written to the live spreadsheets. The phone keeps a copy so counting still works if the connection drops. Until that link is saved, the app uses the bundled September 2026 sample lists and does not change the spreadsheets.

Cassidy's setup steps are in [SETUP.md](SETUP.md). The script she pastes is `apps-script/Code.gs`. Which cells a count changes is decided in `mapCountOntoRow` in `js/sheetmap.js`.

The menu has a Testing mode. "Don't save counts", "Don't save barcodes", and "Don't save new items" each block only that write. The session list on the phone still updates. A Testing badge stays in the header while any switch is on.

## Data layer

`js/data.js` is the only module the screens talk to:

- `getItems(store)`
- `lookupBarcode(code, store, format)`
- `saveBarcode(code, store, itemName)`
- `saveCount(entry, replaceIds)`
- `addItem(store, { name, ticketValue })` for a product that is not on the list yet

Barcodes stay strings so leading zeros are kept. The six real starter barcodes are still in this file for phones that are not connected yet. `075656049338` is Oh So Jelle Taba Pets at Wentzville and Oh So Jelle Pets at Cottleville. Cottleville does not carry the headphones (`097138501967`). Squeeze Pyramid (`097138502094`) is not on either September list, so an unconnected phone asks which item it is.

## Run it locally

No build step. From this folder:

```bash
python3 -m http.server 4173
```

Open http://localhost:4173 . The camera works on localhost. Anywhere else it needs HTTPS, which GitHub Pages provides. If the camera is unavailable, type the barcode.

```bash
node --test
```

## GitHub Pages

`.github/workflows/pages.yml` publishes this folder with `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`.

The workflow cannot turn Pages on by itself. `enablement: true` on `actions/configure-pages` needs a personal access token or a GitHub App with administration permission, not the default `GITHUB_TOKEN`, and this repo does not store a token.

An admin turns it on once:

1. Open https://github.com/Starpony999/funzone-inventory/settings/pages
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Re-run **Deploy to GitHub Pages** from the Actions tab, or push a commit to `main`.

The site is then https://starpony999.github.io/funzone-inventory/
