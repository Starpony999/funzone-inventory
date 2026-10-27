# Connect the inventory app to Google Sheets

The website is public, so it cannot hold a password. Instead, a small Google script runs as you and edits the spreadsheets. The store phones only need the link to that script and a PIN you choose. Staff do not sign in with Google.

You only do this once. After that, each phone gets the link and the PIN from the menu.

## What you need

- The Google account that can edit **FunZone Inventory 2026** and **FunZone Barcodes**.
- About 15 minutes at a computer.
- The file `apps-script/Code.gs` from this project. On GitHub, open that file and use the Raw button so you can copy the whole script.

## 1. Open the script editor

1. Open the spreadsheet **FunZone Inventory 2026**.
2. In the menu bar, click **Extensions**.
3. Click **Apps Script**.
4. A new tab opens. At the top left, click the project name (it usually says "Untitled project") and rename it to **Fun Zone Inventory**.
5. If you see a file called `Code.gs` with a few lines of sample code, click into it and select all (`Ctrl+A` or `Cmd+A`), then delete it.
6. Paste the entire contents of `apps-script/Code.gs`.
7. Click the save icon (or `Ctrl+S` / `Cmd+S`).

## 2. Choose a PIN

1. In the Apps Script left sidebar, click the gear icon (**Project Settings**).
2. Scroll to **Script properties**.
3. Click **Add script property**.
4. Property: `FUNZONE_PIN`
5. Value: a PIN you will tell the staff. Use at least 8 characters. It can be a word. Example shape: `funzone-park-42`. Do not use `1234`.
6. Click **Save script properties**.

The PIN is not stored in the website. Do not put it in GitHub, in a text message thread that lots of people can scroll back through, or in `js/config.js`.

## 3. Deploy it

1. Click the blue **Deploy** button at the top right.
2. Click **New deployment**.
3. Next to "Select type", click the gear icon.
4. Choose **Web app**.
5. Description: `Fun Zone inventory`
6. Execute as: **Me** (your Google account).
7. Who has access: **Anyone**.
   This does not make the spreadsheet public. It lets the store phones call the script without a Google sign-in. The PIN is what stops other people.
8. Click **Deploy**.
9. Google will ask you to authorize the script. Click **Authorize access**, pick your Google account, and continue.
10. If you see "Google hasn't verified this app", that is expected. It is your own script.
    - Click **Advanced**.
    - Click **Go to Fun Zone Inventory (unsafe)**.
    - Click **Allow**.
11. Copy the **Web app URL**. It ends in `/exec`. Keep this somewhere private, the same way you keep the PIN.

Leave the deployment as **Anyone**. "Anyone with a Google account" will pop a sign-in on the store phones and the app will not be able to connect.

## 4. Put the link on a phone

1. On the phone, open https://starpony999.github.io/funzone-inventory/
2. Tap the **☰** menu.
3. Tap **Sheet connection**.
4. Paste the web app URL.
5. Type the PIN.
6. Tap **Save on this phone**.
7. Tap **Test connection**. It should say it is connected.

Testing the connection does not change the spreadsheet. The first time someone picks Wentzville or Cottleville, the script looks for this month's tab (right now that is `WPR - Oct 2026` or `CPR - Oct 2026`). If that tab is missing, it copies the latest older tab for that store, renames it, and clears the count cells. Names, ticket values, pieces per ounce, position codes, full-bin counts, and formulas stay.

Do this on each store phone. The link and PIN are saved on that phone only.

You can instead paste the web app URL into `js/config.js` and publish the site again. Do not do that unless you mean to: the site is public, so the URL would be public, and the PIN would be the only lock. Leave `js/config.js` blank and use the phone screen.

## 5. Try Testing mode before a real count

1. Open the **☰** menu.
2. Under **Testing mode**, turn on **Don't save counts**, **Don't save barcodes**, and **Don't save new items**.
3. A **Testing** badge appears at the top. Leave it on while you practice.
4. Count something. It shows in the list on the phone and is not written to the sheet.
5. Turn the three switches off when you want real counts to save.

Each switch is separate. You can block new products and still save counts.

## When you change the script later

1. Apps Script → **Deploy** → **Manage deployments**.
2. Click the pencil on the web app.
3. Version: **New version**.
4. Click **Deploy**.

The web app URL stays the same. Phones do not need a new link.

## A new year

The app looks in the shared Drive folder **Fun Zone Information** for a spreadsheet named exactly `FunZone Inventory 2027` (or whatever the year is).

1. In that folder, right-click **FunZone Inventory 2026**.
2. Click **Make a copy**.
3. Rename the copy to `FunZone Inventory 2027`. The words and the space have to match.
4. Leave it in that same folder.

You do not edit the app. In January it will find the new file and, the first time someone counts, create `WPR - Jan 2027` from the latest 2026 tab.

## How a count lands on the sheet

This is the behavior to confirm. The app never types over a cell that already contains a formula (the gray cells that calculate totals).

- **Pieces** are added to the section column. Front is column J, Back is column K, Break Room is column L. A second count of the same item adds to the number already there. Column I ("How many in front") is not used. On the 2026 sheets, front counts are already in J, and the total formula still includes whatever is in I.
- **Weight** always goes in columns F and G (pounds and ounces), even if you weighed some in Front and some in Back. The sheet only has one weight pair per product. The app adds the ounces together, then splits them back into pounds and ounces. It does not also put those pieces in J, K, or L, because column H already turns the weight into pieces and that would count them twice.
- **Bins** go in column U as quarters. Quarter is 1, Half is 2, 3-Quarters is 3, Full is 4. At Cottleville the second bin is added on, which matches the sheet: two full bins is 8, and a full bin plus a 3-quarter bin is 7. Column M recalculates the piece estimate. Wentzville only asks about one bin.
- **Yes, add it** adds that count on the sheet. **Replace the earlier one** only fixes counts from this same session on this phone: the sheet changes by the difference. Counts from an earlier day, or from another phone, stay on the sheet.
- **Undo** takes back the amount this phone just sent for that line, unless Testing mode is blocking count saves.
- **Start a new session** only clears the list on the phone. It does not remove anything from the sheet.
- **New products** get a new row: column A is the name, column B is the ticket value, and the total formulas are copied so the row still adds up. Pieces per ounce (column D) and the full-bin count (column T) are left blank, because the app does not know them yet. Fill those in on the sheet when you know them.
- **A new month tab** keeps names, ticket values, pieces per ounce, position codes, full-bin counts, and formulas. It clears the count inputs: pounds, ounces, column I, Front, Back, Break Room, the bin quarters, the checkbox, and "Count is off by" when that cell is not a formula.
- **Column D** is used the same way the sheet's own weight formula uses it: pieces per ounce. The column header says it can also mean per box. Weight counts follow the formula.
- **Barcodes** stay as text so a leading zero is not dropped. Teaching the app a barcode fills in that store's name on the existing row, or adds a row if the barcode is new. The other store's name is left as it is.
- Counts made while **Don't save counts** is on are not sent later, even if you turn the switch off. They stay in the on-screen list only. Editing that line after the switch is off will send the edited amount.

If a count cell is a formula, the app leaves it alone and says so on the phone.
