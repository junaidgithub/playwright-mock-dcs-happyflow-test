const { test, expect, data } = require('./fixtures/dcs-fixtures');

const { messages: msg } = data;

test.describe('DCS passenger journey @smoke', () => {
  test('happy path: lookup → check-in → seat → baggage → boarding pass → boarding', async ({ dcs }) => {
    await test.step('find booking', async () => {
      await dcs.findBooking();
      await expect(dcs.passengerResult).toBeVisible();
      await expect(dcs.passengerResult).toContainText(data.passenger.fullName);
      await expect(dcs.passengerResult).toContainText(data.passenger.flight);
      await expect(dcs.passengerResult).toContainText(data.passenger.route);
      await expect(dcs.journeyStatus).toHaveText('NOT STARTED');
    });

    await test.step('complete check-in', async () => {
      await dcs.completeCheckinButton.click();
      await expect(dcs.lookupMessage).toHaveText(msg.checkinDone);
      await expect(dcs.journeyStatus).toHaveText('CHECKED IN');
      await expect(dcs.seatMessage).toHaveText('Select an available seat to continue.');
    });

    await test.step('select seat', async () => {
      await dcs.selectSeat('12A');
      await expect(dcs.seatMessage).toHaveText('Seat 12A selected successfully.');
      await expect(dcs.seat('12A')).toHaveClass(/\bselected\b/);
      await expect(dcs.seatStatus).toHaveText('SEAT 12A');
    });

    await test.step('validate baggage', async () => {
      await dcs.validateBaggage(data.baggage.withinAllowance);
      await expect(dcs.baggageMessage).toHaveText('Baggage validated: 20 kg, within the 23 kg allowance.');
      await expect(dcs.baggageStatus).toHaveText('VALIDATED');
    });

    await test.step('generate boarding pass', async () => {
      await dcs.generateBoardingPass();
      await expect(dcs.passMessage).toHaveText(msg.passGenerated);
      await expect(dcs.boardingMessage).toHaveText(msg.readyForBoarding);
      await dcs.expectBoardingPass({ name: data.passenger.fullName, seat: '12A', baggageKg: 20 });
      await expect(dcs.boardingPass).toContainText('NOT VALID FOR TRAVEL');
    });

    await test.step('board passenger', async () => {
      await dcs.board();
      await expect(dcs.boardingMessage).toHaveText(msg.boarded);
      await expect(dcs.boardingStatus).toHaveText('BOARDED');
      await expect(dcs.journeyStatus).toHaveText('BOARDED');
    });
  });

  test('changing seat before boarding pass is reflected on the pass', async ({ baggageValidated: dcs }) => {
    await dcs.selectSeat('14A');
    await expect(dcs.seatStatus).toHaveText('SEAT 14A');
    await expect(dcs.seat('12A')).not.toHaveClass(/\bselected\b/);
    // A seat change invalidates baggage validation, so it must be redone.
    await expect(dcs.baggageStatus).toHaveText('PENDING');
    await dcs.validateBaggage(data.baggage.withinAllowance);
    await dcs.generateBoardingPass();
    await dcs.expectBoardingPass({ name: data.passenger.fullName, seat: '14A', baggageKg: 20 });
  });

  test('PNR and surname lookup is case- and whitespace-insensitive', async ({ dcs }) => {
    await dcs.findBooking('  demo123 ', ' khan ');
    await expect(dcs.passengerResult).toBeVisible();
    await expect(dcs.lookupMessage).toBeHidden();
  });
});
