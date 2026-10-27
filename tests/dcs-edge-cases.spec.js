const { test, expect, data } = require('./fixtures/dcs-fixtures');

const { messages: msg } = data;

test.describe('Invalid passenger details @negative', () => {
  for (const { title, pnr, surname } of data.invalidLookups) {
    test(`lookup rejected: ${title}`, async ({ dcs }) => {
      await dcs.findBooking(pnr, surname);
      await expect(dcs.lookupMessage).toHaveText(msg.bookingNotFound);
      await expect(dcs.passengerResult).toBeHidden();
      await expect(dcs.journeyStatus).toHaveText('NOT STARTED');
    });
  }

  for (const field of ['pnr', 'surname']) {
    test(`empty ${field} is blocked by required-field validation`, async ({ dcs }) => {
      await dcs.findBooking(field === 'pnr' ? '' : data.passenger.pnr, field === 'surname' ? '' : data.passenger.surname);
      const valueMissing = await dcs[field].evaluate((el) => el.validity.valueMissing);
      expect(valueMissing).toBe(true);
      await expect(dcs.passengerResult).toBeHidden();
    });
  }

  test('failed lookup after a successful one hides the booking', async ({ dcs }) => {
    await dcs.findBooking();
    await expect(dcs.passengerResult).toBeVisible();
    await dcs.findBooking('BAD999', data.passenger.surname);
    await expect(dcs.passengerResult).toBeHidden();
    await expect(dcs.lookupMessage).toHaveText(msg.bookingNotFound);
  });
});

test.describe('Seat selection @negative', () => {
  // The occupied seat is a disabled button, so these use a forced click to prove it cannot be selected.
  test('occupied seat is disabled and nothing is selected', async ({ checkedIn: dcs }) => {
    await expect(dcs.seat(data.seats.occupied)).toBeDisabled();
    await dcs.seat(data.seats.occupied).click({ force: true });
    await expect(dcs.seatStatus).toHaveText('PENDING');
    await expect(dcs.seat(data.seats.occupied)).not.toHaveClass(/\bselected\b/);
  });

  test('occupied seat click does not replace an existing selection', async ({ seated: dcs }) => {
    await dcs.seat(data.seats.occupied).click({ force: true });
    await expect(dcs.seatStatus).toHaveText('SEAT 12A');
    await expect(dcs.seat('12A')).toHaveClass(/\bselected\b/);
  });

  test('seat cannot be selected before check-in', async ({ dcs }) => {
    await dcs.selectSeat('12A');
    await expect(dcs.seatMessage).toHaveText(msg.checkinFirstSeat);
    await expect(dcs.seatStatus).toHaveText('PENDING');
  });

  test('seat cannot be selected after booking found but check-in not completed', async ({ dcs }) => {
    await dcs.findBooking();
    await dcs.selectSeat('12A');
    await expect(dcs.seatMessage).toHaveText(msg.checkinFirstSeat);
  });

  for (const seatNo of data.seats.available) {
    test(`available seat ${seatNo} can be selected`, async ({ checkedIn: dcs }) => {
      await dcs.selectSeat(seatNo);
      await expect(dcs.seatStatus).toHaveText(`SEAT ${seatNo}`);
      await expect(dcs.seat(seatNo)).toHaveClass(/\bselected\b/);
    });
  }
});

test.describe('Baggage limits @negative', () => {
  const accepted = [
    { kg: '0', why: 'zero (no checked bag)' },
    { kg: data.baggage.atAllowance, why: 'exactly at 23 kg allowance' },
    { kg: '22.99', why: 'just under the allowance' },
  ];
  for (const { kg, why } of accepted) {
    test(`accepted: ${why}`, async ({ seated: dcs }) => {
      await dcs.validateBaggage(kg);
      await expect(dcs.baggageMessage).toHaveText(`Baggage validated: ${Number(kg)} kg, within the 23 kg allowance.`);
      await expect(dcs.baggageStatus).toHaveText('VALIDATED');
    });
  }

  const rejected = [
    { kg: data.baggage.justOverAllowance, why: 'just over the allowance', text: msg.baggageExceeded },
    { kg: data.baggage.overAllowance, why: 'well over the allowance', text: msg.baggageExceeded },
    { kg: '-1', why: 'negative weight', text: msg.baggageInvalid },
  ];
  for (const { kg, why, text } of rejected) {
    test(`rejected: ${why}`, async ({ seated: dcs }) => {
      await dcs.validateBaggage(kg);
      await expect(dcs.baggageMessage).toHaveText(text);
      await expect(dcs.baggageStatus).toHaveText('PENDING');
      await dcs.generateBoardingPass();
      await expect(dcs.passMessage).toHaveText(msg.baggageFirstPass);
      await expect(dcs.boardingPass).toBeHidden();
    });
  }

  test('overweight re-validation withdraws an already generated boarding pass', async ({ withBoardingPass: dcs }) => {
    await dcs.validateBaggage(data.baggage.overAllowance);
    await expect(dcs.baggageMessage).toHaveText(msg.baggageExceeded);
    await expect(dcs.boardingPass).toBeHidden();
    await expect(dcs.passStatus).toHaveText('PENDING');
    await dcs.board();
    await expect(dcs.boardingMessage).toHaveText(msg.passFirstBoarding);
  });

  test('baggage cannot be validated before check-in', async ({ dcs }) => {
    await dcs.validateBaggage(data.baggage.withinAllowance);
    await expect(dcs.baggageMessage).toHaveText(msg.checkinFirst);
  });

  test('baggage cannot be validated before seat selection', async ({ checkedIn: dcs }) => {
    await dcs.validateBaggage(data.baggage.withinAllowance);
    await expect(dcs.baggageMessage).toHaveText(msg.seatFirstBaggage);
  });
});

test.describe('Incomplete check-in @negative', () => {
  test('boarding pass blocked before check-in', async ({ dcs }) => {
    await dcs.generateBoardingPass();
    await expect(dcs.passMessage).toHaveText(msg.checkinFirst);
    await expect(dcs.boardingPass).toBeHidden();
  });

  test('boarding pass blocked when booking found but check-in not completed', async ({ dcs }) => {
    await dcs.findBooking();
    await dcs.generateBoardingPass();
    await expect(dcs.passMessage).toHaveText(msg.checkinFirst);
  });

  test('boarding pass blocked without seat', async ({ checkedIn: dcs }) => {
    await dcs.generateBoardingPass();
    await expect(dcs.passMessage).toHaveText(msg.seatFirstPass);
    await expect(dcs.boardingPass).toBeHidden();
  });

  test('boarding pass blocked without baggage validation', async ({ seated: dcs }) => {
    await dcs.generateBoardingPass();
    await expect(dcs.passMessage).toHaveText(msg.baggageFirstPass);
    await expect(dcs.boardingPass).toBeHidden();
  });

  test('boarding blocked before boarding pass', async ({ baggageValidated: dcs }) => {
    await dcs.board();
    await expect(dcs.boardingMessage).toHaveText(msg.passFirstBoarding);
    await expect(dcs.boardingStatus).toHaveText('PENDING');
  });

  test('state is not persisted across reload', async ({ withBoardingPass: dcs, page }) => {
    await page.reload();
    await expect(dcs.journeyStatus).toHaveText('NOT STARTED');
    await expect(dcs.boardingPass).toBeHidden();
    await dcs.board();
    await expect(dcs.boardingMessage).toHaveText(msg.passFirstBoarding);
  });
});

test.describe('Duplicate boarding @negative', () => {
  test('second boarding attempt is rejected', async ({ boarded: dcs }) => {
    await dcs.board();
    await expect(dcs.boardingMessage).toHaveText(msg.duplicateBoarding);
    await expect(dcs.boardingStatus).toHaveText('BOARDED');
  });

  test('repeated boarding attempts all stay rejected', async ({ boarded: dcs }) => {
    for (let i = 0; i < 3; i++) {
      await dcs.board();
      await expect(dcs.boardingMessage).toHaveText(msg.duplicateBoarding);
    }
    await expect(dcs.boardingStatus).toHaveText('BOARDED');
  });
});
