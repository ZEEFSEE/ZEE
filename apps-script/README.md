# ZHI External World Data Hub (pilot)

This folder is a **separate, read-only pilot** for testing GitHub Pages + Google Apps Script + Google Sheets. It does not replace or modify the existing Supabase-backed ZHI world.

## Pilot boundaries

- Google Sheets is the pilot's read-only source for a small allowlisted set of agent fields.
- Apps Script serves `health` and `agents` actions.
- JSONP is included for browser-side read testing from GitHub Pages, where cross-origin `fetch` may be blocked by Apps Script response behavior.
- No wallet, identity, marriage, finance, or agent-behavior writes are exposed.
- Do not put API keys, passwords, service-role keys, or other secrets in GitHub or in the public spreadsheet.

## 1. Create the test spreadsheet

Create a new Google Sheet, not a production data sheet. Add a tab named `agents` with these headers in row 1:

```
id | name | gender | personality | life_status | age_days | updated_at
```

Add only non-sensitive test records. The endpoint returns at most 500 rows and only the allowlisted fields above.

## 2. Configure Apps Script

1. Open [Google Apps Script](https://script.google.com/) and create a standalone project named `ZHI External World Data Hub`.
2. Copy `Code.gs` into the project.
3. In **Project Settings → Script Properties**, add `ZHI_SPREADSHEET_ID` with the ID of the test spreadsheet.
4. Save the project.

## 3. Deploy as a Web App

1. Choose **Deploy → New deployment → Web app**.
2. Execute as: **Me**.
3. Access: choose the narrowest setting that permits your intended test. A public anonymous endpoint should contain test data only.
4. Deploy and copy the Web App URL ending in `/exec`.

## 4. Verify

Open these URLs in a browser, replacing `WEB_APP_URL` with the deployment URL:

- `WEB_APP_URL?action=health`
- `WEB_APP_URL?action=agents`
- `WEB_APP_URL?action=agents&callback=zhiTestCallback` (JSONP response)

Expected health response contains `"ok":true`. The agents response should contain only test rows and the allowlisted fields.

## 5. Integration rule

Do not switch the live ZHI page to this pilot until a browser test proves the deployed endpoint, refresh behavior, field mapping, and error handling. This pilot deliberately does not implement write operations or autonomous agent actions. Those require a proper authentication and authorization design before they can be enabled.
