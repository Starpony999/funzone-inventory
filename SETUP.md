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

## Let the script open both spreadsheets

The script edits **FunZone Inventory 2026** and **FunZone Barcodes**. Those are two different files. If the Apps Script project is limited to the one spreadsheet you opened, saving a count fails with:

`Specified permissions are not sufficient to call SpreadsheetApp.openById`

That limit shows up when the project has `@OnlyCurrentDoc`, or when `appsscript.json` does not list the spreadsheet scope. Do not add `@OnlyCurrentDoc` to `Code.gs`.

1. In the Apps Script left sidebar, click the gear icon (**Project Settings**).
2. Turn on **Show "appsscript.json" manifest file in editor**.
3. Go back to the editor and open `appsscript.json`.
4. Add an `oauthScopes` list. Keep the lines Google already put in the file (`timeZone`, `exceptionLogging`, `runtimeVersion`). If `oauthScopes` is already there, replace that list with this one.

```json
"oauthScopes": [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.external_request",
  "https://www.googleapis.com/auth/drive.readonly"
]
```

The first scope is the one that fixes the `openById` error. The second is the external-request scope the web app needs. The third lets the script find next year's inventory file in the Fun Zone Information folder. Once this list is set, Apps Script will not add scopes on its own, so leave all three in place.

5. Save `appsscript.json`.

A full file, if yours is almost empty, looks like this:

```json
{
  "timeZone": "America/Chicago",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/drive.readonly"
  ]
}
```

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

Testing the connection does not change the spreadsheet. The first time someone picks Wentzville or Cottleville, the script looks for this month's tab (right now that is `WPR - Oct 2026` or `CPR - Oct 2026`). If that tab is missing, it copies the latest older tab for that store and renames the copy. On the copy only, it clears pounds (F), ounces (G), Front (J), Back (K), Break Room (L), and bins (U), from row 2 down through the last row. That includes plain numbers and hand math such as `=72*2-12`. It does not change September. It leaves a formula that names another cell or uses a function, such as `=J2` or `=SUM(J2:L2)`. Names, ticket values, pieces per ounce, position codes, full-bin counts, and the other columns stay as they were.

Do this on each store phone. The link and PIN are saved on that phone only.

You can instead paste the web app URL into `js/config.js` and publish the site again. Do not do that unless you mean to: the site is public, so the URL would be public, and the PIN would be the only lock. Leave `js/config.js` blank and use the phone screen.

## 5. Try Testing mode before a real count

1. Open the **☰** menu.
2. Under **Testing mode**, turn on **Don't save counts**, **Don't save barcodes**, and **Don't save new items**.
3. A **Testing** badge appears at the top. Leave it on while you practice.
4. Count something. It shows in the list on the phone and is not written to the sheet.
5. Turn the three switches off when you want real counts to save.

Each switch is separate. You can block new products and still save counts.

## Update the script so a new month starts blank

Copying September into October was keeping September's counts. On Cottleville, Back still had hand math such as `=72*2-12`, `=6*12-1`, and `=100+1200`. Those are formulas, so the first clear left them. The script now clears that hand math on the new tab, and a new count can replace the same kind of cell on the current tab. A formula that names another cell, such as `=J2` or `=SUM(J2:L2)`, is still left alone. The script on Google is a separate paste. Paste this version even if you already pasted an earlier one.

1. Open **FunZone Inventory 2026**.
2. Click **Extensions**, then **Apps Script**.
3. Click into `Code.gs`, select all, and delete it.
4. On GitHub, open `apps-script/Code.gs` on `main`, click **Raw**, and copy the whole file.
5. Paste it into the script editor and click the save icon.
6. Open `appsscript.json` and confirm the `oauthScopes` list from **Let the script open both spreadsheets** is still there. Add it if it is missing. Save.
7. Click **Deploy**, then **Manage deployments**.
8. Click the pencil on the web app.
9. Set Version to **New version**.
10. Click **Deploy**.
11. If Google asks you to authorize again, allow it.

The web app link and the PIN stay the same. Phones do not need a new link.

This does not edit a tab that is already there, and it does not edit September. `CPR - Oct 2026` was already created with September's counts still in it. Wentzville's October tab needs the same check if it was created the same way.

If that October tab does not have real October counts yet:

1. Open **FunZone Inventory 2026**.
2. Right-click the October tab (`CPR - Oct 2026` or `WPR - Oct 2026`) and click **Delete**. Do not delete September.
3. On a phone, open the app and pick that store. The script copies September again and leaves F, G, J, K, L, and U blank.

Do that only after this new script is deployed. If you delete the tab first, the old script copies the hand math again.

If staff have already entered real October counts on that tab, do not delete it. Clear the leftover September numbers yourself in columns F, G, J, K, L, and U, including cells that show a formula made only of numbers and + − × ÷. Leave a formula that mentions another cell, and leave every other column alone.

## Update the script before staff weigh a new item

The app now asks "How many pieces equal 10 oz?" when an item has no pieces-per-ounce, then writes that into column D. The script on Google has to be the new one or column D stays blank.

1. Open **FunZone Inventory 2026**.
2. Click **Extensions**, then **Apps Script**.
3. Click into `Code.gs`, select all, and delete it.
4. On GitHub, open `apps-script/Code.gs`, click **Raw**, and copy the whole file.
5. Paste it into the script editor and click the save icon.
6. Click **Deploy**, then **Manage deployments**.
7. Click the pencil on the web app.
8. Set Version to **New version**.
9. Click **Deploy**.

The web app link and the PIN stay the same. Phones do not need a new link. Do this before anyone weighs an item that is missing pieces per ounce. Until you do, the phone can still count, but column D will not update.

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

This is the behavior to confirm. The app does not type over a formula that names another cell or uses a function (the gray cells that calculate totals). Hand math in a count cell, such as `=72*2-12`, is treated as the count that is already there.

- **Pieces** are added to the section column. Front is column J, Back is column K, Break Room is column L. A second count of the same item adds to the number already there. Column I ("How many in front") is not used. On the 2026 sheets, front counts are already in J, and the total formula still includes whatever is in I.
- **Weight** always goes in columns F and G (pounds and ounces), even if you weighed some in Front and some in Back. The sheet only has one weight pair per product. The app adds the ounces together, then splits them back into pounds and ounces. It does not also put those pieces in J, K, or L, because column H already turns the weight into pieces and that would count them twice.
- **Pieces per ounce** (column D): if it is blank, the phone asks how many pieces equal 10 ounces, divides by 10, and uses that for the count. On the sheet, if at least half of the filled D cells on that tab are formulas, it writes `=that number/10`. If most of them are plain numbers, it writes the result of the division. It does not replace a D cell that already has a formula. With **Don't save new items** turned on, the phone still uses the number for this count and does not write column D.
- **Bins** go in column U as quarters. Quarter is 1, Half is 2, 3-Quarters is 3, Full is 4. At Cottleville the second bin is added on, which matches the sheet: two full bins is 8, and a full bin plus a 3-quarter bin is 7. Column M recalculates the piece estimate. Wentzville only asks about one bin.
- **Yes, add it** adds that count on the sheet. **Replace the earlier one** only fixes counts from this same session on this phone: the sheet changes by the difference. Counts from an earlier day, or from another phone, stay on the sheet.
- **Undo** takes back the amount this phone just sent for that line, unless Testing mode is blocking count saves.
- **Start a new session** only clears the list on the phone. It does not remove anything from the sheet.
- **New products** get a new row: column A is the name, column B is the ticket value, and the total formulas are copied so the row still adds up. Pieces per ounce (column D) and the full-bin count (column T) are left blank, because the app does not know them yet. Fill those in on the sheet when you know them.
- **A new month tab** keeps names, ticket values, pieces per ounce, position codes, full-bin counts, total formulas, and every column except the count inputs. On the new tab only, F, G, J, K, L, and U are cleared from row 2 through the last row. Plain numbers are cleared. So is hand math whose formula, after the `=`, is only digits, spaces, decimal points, and `+ - * / ( )`, such as `=72*2-12` or `=(7*4+7+36)*12`. A formula that contains a letter, because it names a cell or a function, is left as it is. Column I, the checkbox, and "Count is off by" are not cleared. The previous month's tab is not changed. A tab that already exists (including an October tab created before this fix) is not cleared again.
- **Column D** is used the same way the sheet's own weight formula uses it: pieces per ounce. The column header says it can also mean per box. Weight counts follow the formula.
- **Barcodes** stay as text so a leading zero is not dropped. Teaching the app a barcode fills in that store's name on the existing row, or adds a row if the barcode is new. The other store's name is left as it is.
- Counts made while **Don't save counts** is on are not sent later, even if you turn the switch off. They stay in the on-screen list only. Editing that line after the switch is off will send the edited amount.

If a count cell's formula names another cell or uses a function, the app leaves it alone and says so on the phone. Hand math in that cell is replaced by the new count.
