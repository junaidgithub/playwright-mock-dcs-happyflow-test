const { test, expect, data } = require('./fixtures/dcs-fixtures');

const { messages: msg } = data;

// Regression tests for application defects DCS-001 to DCS-007 (fixed 2026-10-27 in public/app.js).
// Each test asserts the correct business rule; the annotation names the defect it guards against.
// Run only these with: npx playwright test --grep @regression
const defect = (id, description) => ({ tag: '@regression', annotation: { type: 'fixed-defect', description: `${id}: ${description}` } });

test.describe('Regression: fixed application defects', () => {
  test('regenerating a boarding pass after boarding must not allow boarding again',
    defect('DCS-001', 'generate-pass handler resets state.boarded = false'),
    async ({ boarded: dcs }) => {
      await dcs.generateBoardingPass();
      await dcs.board();
      await expect(dcs.boardingMessage).toHaveText(msg.duplicateBoarding);
    });

  test('re-completing check-in after boarding must not reset the boarded status',
    defect('DCS-002', 'complete-checkin handler resets boarded/seat/pass state unconditionally'),
    async ({ boarded: dcs }) => {
      await dcs.completeCheckinButton.click();
      await expect(dcs.boardingStatus).toHaveText('BOARDED');
    });

  test('changing seat after boarding must be rejected',
    defect('DCS-003', 'seat handler accepts changes after boarding and resets state.boarded'),
    async ({ boarded: dcs }) => {
      await dcs.selectSeat('12C');
      await expect(dcs.seatStatus).toHaveText('SEAT 12A');
      await expect(dcs.boardingStatus).toHaveText('BOARDED');
    });

  test('a failed lookup that clears check-in must also block boarding',
    defect('DCS-004', 'failed lookup sets checkedIn=false but keeps boardingPass=true; boarding only checks boardingPass'),
    async ({ withBoardingPass: dcs }) => {
      await dcs.findBooking('BAD999', data.passenger.surname);
      await expect(dcs.journeyStatus).toHaveText('NOT STARTED');
      await expect(dcs.boardingPass).toBeHidden();
      await dcs.board();
      await expect(dcs.boardingMessage).not.toHaveText(msg.boarded);
      await expect(dcs.boardingStatus).toHaveText('PENDING');
    });

  test('invalid baggage re-validation must withdraw validation and the boarding pass',
    defect('DCS-005', 'negative/NaN branch does not reset boardingPass or call refreshSteps'),
    async ({ withBoardingPass: dcs }) => {
      await dcs.validateBaggage('-5');
      await expect(dcs.baggageMessage).toHaveText(msg.baggageInvalid);
      await expect(dcs.baggageStatus).toHaveText('PENDING');
      await expect(dcs.boardingPass).toBeHidden();
      await dcs.board();
      await expect(dcs.boardingMessage).toHaveText(msg.passFirstBoarding);
    });

  test('empty baggage weight must be rejected, not treated as 0 kg',
    defect('DCS-006', 'Number("") === 0, so a blank field validates as 0 kg'),
    async ({ seated: dcs }) => {
      await dcs.validateBaggage('');
      await expect(dcs.baggageMessage).toHaveText(msg.baggageInvalid);
      await expect(dcs.baggageStatus).toHaveText('PENDING');
    });

  test('occupied seat must be exposed as disabled to assistive technology',
    defect('DCS-007', 'occupied seat is a clickable button without disabled/aria-disabled'),
    async ({ dcs }) => {
      await expect(dcs.seat(data.seats.occupied)).toBeDisabled();
    });

  test('baggage cannot be re-validated after boarding',
    defect('DCS-001', 'related guard: baggage re-validation used to reset boarded'),
    async ({ boarded: dcs }) => {
      await dcs.validateBaggage(data.baggage.atAllowance);
      await expect(dcs.baggageMessage).toContainText('already boarded');
      await expect(dcs.boardingStatus).toHaveText('BOARDED');
      await expect(dcs.boardingPass).toBeVisible();
    });

  test('a failed lookup after boarding does not un-board the passenger',
    defect('DCS-004', 'related guard: failed lookup must not reverse a completed boarding'),
    async ({ boarded: dcs }) => {
      await dcs.findBooking('BAD999', data.passenger.surname);
      await expect(dcs.lookupMessage).toHaveText(msg.bookingNotFound);
      await expect(dcs.boardingStatus).toHaveText('BOARDED');
      await expect(dcs.journeyStatus).toHaveText('BOARDED');
    });
});
