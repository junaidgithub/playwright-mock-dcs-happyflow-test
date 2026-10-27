# DCS QA Automation Demo

A local, fictional airline Departure Control System (DCS) training app and Playwright end-to-end test suite. It is a portfolio demo, not a real airline system.

## Requirements
- Node.js 20+ (CI uses Node.js 24)
- npm
- Internet access for the first dependency/browser installation

## Install and run
Open a terminal in this folder:

```bash
npm install
npx playwright install chromium
```

Terminal 1 — run the mock website:

```bash
npm start
```

Open `http://127.0.0.1:3000` in your browser. Use the demo PNR `DEMO123` and surname `KHAN`.

Run the automated suite (Playwright starts the mock website itself if it is not already running):

```bash
npx playwright test
```

Run one group only: `npx playwright test --grep @smoke` (or `@negative`, `@regression`).

Run with a visible browser:

```bash
npm run test:headed
```

Open the HTML report:

```bash
npm run report
```

Build the client-facing report (`reports/DCS_QA_Report_<date>.html`) from the latest run:

```bash
npm run report:client
```

## Run on GitHub (GitHub Actions)
`.github/workflows/playwright.yml` runs the suite on GitHub's own Ubuntu machine. The mock website is part of this repo, so the runner starts it on its own `127.0.0.1:3000`; no local computer is needed.

- Trigger: manual only. Go to **Actions → DCS Playwright Tests → Run workflow**. Pushes and pull requests do not start a run.
- Steps: install Node 24 → `npm ci` → install Chromium → `npx playwright test` → `npm run report:client`.
- Results: a green tick or red cross on the run, with downloadable **Artifacts**: `playwright-report`, `client-report`, and `test-results` (traces and screenshots, failures only). Artifacts are kept for 14 days.
- Email: GitHub's own notifications email a link to the run when it **fails** (no report attachment); passing runs send no email. Setting: GitHub profile → **Settings → Notifications → System → Actions**, tick **Email** and keep **Only notify for failed workflows** ticked.

## Automated scenarios (45 tests)
| Spec | Tag | Covers |
|---|---|---|
| `tests/dcs-journey.spec.js` | `@smoke` | Full journey: lookup → check-in → seat → baggage → boarding pass → boarding |
| `tests/dcs-edge-cases.spec.js` | `@negative` | Invalid passenger details, occupied and unavailable seats, baggage limits (23 kg boundary), incomplete check-in, duplicate boarding |
| `tests/dcs-regression.spec.js` | `@regression` | Fixed defects DCS-001 to DCS-007 (see `QA-FINDINGS.md`) |

Shared setup lives in `tests/fixtures/dcs-fixtures.js` (page object and chained fixtures); synthetic data and expected messages live in `tests/data/test-data.js`.

## Test data and limitations
- Demo PNR: `DEMO123`
- Demo surname: `KHAN`
- Occupied seat: `12B`
- Included baggage allowance: 23 kg
- All data is held in browser-side JavaScript and resets on page reload.
- No real passenger data, airline integration, check-in transaction, baggage tag, or valid travel document is created.

## Suggested demo presentation
1. Show the app and explain that it is a mock DCS.
2. Run `npx playwright test` and show all passing cases.
3. Show a negative case such as an occupied seat or excess baggage.
4. Open the HTML report and explain screenshots/traces on failures.
5. Explain that Claude MCP can assist with drafting and maintaining tests, while Playwright executes the tests and assertions.

## Claude MCP note
Claude MCP is not required to run this project. If you have Claude Code or another Claude client configured with a browser/Playwright MCP server, you can ask it to inspect the local app and help add tests. Only connect to localhost and use synthetic data. MCP server setup varies by client and is intentionally not hard-coded into this project.
