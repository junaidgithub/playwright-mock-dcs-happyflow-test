# QA Findings — SkyRoute Mock DCS

Run date: 2026-10-27 · Playwright 1.64.1 · Chromium · synthetic data only (DEMO123 / KHAN)

## Execution summary (actual runs)

| Run | Scope | Result |
|---|---|---|
| Before fix: full suite | 43 tests | 36 passed, 7 failed (all 7 are defect tests) |
| Before fix: stability check | 36 non-defect tests × 3 | 108 / 108 passed, 0 flaky |
| **After fix: full suite** | 45 tests | **45 passed, 0 failed** |
| **After fix: stability check** | 45 tests × 3 (`--repeat-each=3`) | **135 / 135 passed, 0 flaky** |

## Fix status: all 7 defects fixed in `public/app.js` (original kept in `backup/app.js.orig`)

| ID | Fix |
|---|---|
| DCS-001, 002, 003 | Once BOARDED, check-in, seat, baggage and boarding-pass actions are rejected with "Passenger is already boarded…" |
| DCS-004 | A failed lookup resets the whole journey (seat, baggage, pass); boarding now requires the full chain. A boarded passenger stays boarded. |
| DCS-005 | Any baggage re-validation first withdraws validation and the pass, then validates |
| DCS-006 | A blank weight is rejected |
| DCS-007 | Occupied seats get `disabled` + `aria-disabled="true"` |

Test changes caused by the fixes: the two occupied-seat tests now assert `toBeDisabled()` and use a forced click (a disabled button cannot be clicked normally). `dcs-known-defects.spec.js` was renamed to `dcs-regression.spec.js` (tag `@regression`), with 2 new guard tests added.

Report: `npx playwright show-report` (folder `playwright-report/`). Each failure has a screenshot, video, trace and error-context under `test-results/`.

## Application defects (found 2026-10-27, now fixed; see Fix status)

| ID | Severity | Defect | Repro | Expected | Actual |
|---|---|---|---|---|---|
| DCS-001 | Critical | Duplicate boarding possible | Board → Generate boarding pass → Board | "Duplicate boarding rejected" | "Boarding successful" (the generate-pass handler sets `boarded = false`) |
| DCS-002 | High | Re-check-in un-boards a passenger | Board → click "Complete check-in" | Status stays BOARDED | Status resets to PENDING; the passenger can board again |
| DCS-003 | High | Seat can be changed after boarding | Board → click seat 12C | Rejected, seat stays 12A | Seat becomes 12C and boarded is reset |
| DCS-004 | Critical | Boarding allowed after check-in is revoked | Generate pass → look up a wrong PNR → Board | Pass withdrawn, boarding blocked | Journey shows NOT STARTED, but the pass stays visible and boarding succeeds |
| DCS-005 | High | Invalid baggage re-validation keeps the pass | Generate pass → enter −5 kg → Validate → Board | Status PENDING, pass withdrawn | Status stays VALIDATED, the pass stays, boarding succeeds |
| DCS-006 | Medium | Empty baggage weight accepted as 0 kg | Leave weight blank → Validate | Validation error | "Baggage validated: 0 kg" (`Number("") === 0`) |
| DCS-007 | Low (a11y) | Occupied seat not disabled | Inspect seat 12B | `disabled` / `aria-disabled` | Enabled button; it is only rejected on click |

Root cause pattern (DCS-001 to DCS-005): each step handler resets downstream state but never guards against a terminal state (BOARDED). Boarding checks only `state.boardingPass`, not the whole chain (checked-in, seat, baggage).

## Automation defects (in the original suite, now fixed)

| Issue | Impact | Fix |
|---|---|---|
| `getByTestId('seat-message' / 'baggage-message' / 'pass-message' / 'boarding-message')`: these test IDs do not exist in the app | 5 of 7 original tests failed with "element(s) not found" (previous run) | Page object uses the stable element ids `#seat-message` and the like |
| `getByText('Ayesha Khan')`: ambiguous, because the name appears in both the booking result and the pass | Possible strict-mode violation | Asserts are scoped to `#pass-name` inside the boarding pass |
| `toContainText` on partial strings | Wrong or changed messages could still pass | Exact `toHaveText` against a central message catalogue |
| Setup duplicated in every test, no intermediate assertions | Failures surfaced in the wrong step | Chained fixtures (`checkedIn → seated → baggageValidated → withBoardingPass → boarded`), each verifying its state |
| Report artifacts only partly configured | — | Trace and screenshot kept on failure, plus a JSON reporter, `retries: 0` |
| Teardown timeout: `Tearing down "context" exceeded the test timeout` (empty-surname test, 2026-10-27, 100s run under load) | Test body passed in ~1s, then "Close context" hung ~29s flushing the per-test video | Video is opt-in (`PW_VIDEO=1`) and workers are capped at 2. After the change: 45/45, plus 135/135 on `--repeat-each=3` |

## Testability recommendations
- Add `data-testid` to the inline messages and status chips (`seat-message`, `seat-status`, etc.).
- Give each `section.panel` an accessible name (`aria-labelledby`) so tests can use `getByRole('region', …)`.
- Add `role="status"` to the inline messages, as `#message` already has.

## Files
- `tests/fixtures/dcs-fixtures.js`: `DcsPage` page object and chained fixtures
- `tests/data/test-data.js`: synthetic data and message catalogue
- `tests/dcs-journey.spec.js`: happy path (`@smoke`)
- `tests/dcs-edge-cases.spec.js`: invalid passenger details, seats, baggage limits, incomplete check-in, duplicate boarding (`@negative`)
- `tests/dcs-regression.spec.js`: regression tests for the fixed defects DCS-001 to DCS-007 (`@regression`)
- `backup/`: original spec, config and app.js
