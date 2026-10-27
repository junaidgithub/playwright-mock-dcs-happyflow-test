const base = require('@playwright/test');
const data = require('../data/test-data');

const { expect } = base;

// Page object for the single-page mock DCS. Prefers the app's data-testid contract;
// inline step messages/status chips have no test id, so they are located by their stable element id.
class DcsPage {
  constructor(page) {
    this.page = page;
    this.pnr = page.getByTestId('pnr');
    this.surname = page.getByTestId('surname');
    this.findBookingButton = page.getByTestId('lookup-button');
    this.passengerResult = page.getByTestId('passenger-result');
    this.completeCheckinButton = this.passengerResult.getByTestId('complete-checkin');
    this.lookupMessage = page.getByTestId('message');
    this.journeyStatus = page.locator('#journey-status');

    this.seatMessage = page.locator('#seat-message');
    this.seatStatus = page.locator('#seat-status');

    this.baggageWeight = page.getByTestId('baggage-weight');
    this.validateBaggageButton = page.getByTestId('validate-baggage');
    this.baggageMessage = page.locator('#baggage-message');
    this.baggageStatus = page.locator('#baggage-status');

    this.generatePassButton = page.getByTestId('generate-boarding-pass');
    this.boardingPass = page.getByTestId('boarding-pass');
    this.passMessage = page.locator('#pass-message');
    this.passStatus = page.locator('#pass-status');

    this.boardButton = page.getByTestId('board-passenger');
    this.boardingMessage = page.locator('#boarding-message');
    this.boardingStatus = page.locator('#boarding-status');
  }

  seat(seatNo) {
    return this.page.getByTestId(`seat-${seatNo.toLowerCase()}`);
  }

  async open() {
    await this.page.goto('/');
    await expect(this.page.getByRole('heading', { name: 'Passenger journey' })).toBeVisible();
  }

  async findBooking(pnr = data.passenger.pnr, surname = data.passenger.surname) {
    await this.pnr.fill(pnr);
    await this.surname.fill(surname);
    await this.findBookingButton.click();
  }

  async checkIn(pnr, surname) {
    await this.findBooking(pnr, surname);
    await expect(this.passengerResult).toBeVisible();
    await this.completeCheckinButton.click();
    await expect(this.lookupMessage).toHaveText(data.messages.checkinDone);
    await expect(this.journeyStatus).toHaveText('CHECKED IN');
  }

  async selectSeat(seatNo) {
    await this.seat(seatNo).click();
  }

  async validateBaggage(kg) {
    await this.baggageWeight.fill(String(kg));
    await this.validateBaggageButton.click();
  }

  async generateBoardingPass() {
    await this.generatePassButton.click();
  }

  async board() {
    await this.boardButton.click();
  }

  async expectBoardingPass({ name, seat, baggageKg, pnr = data.passenger.pnr }) {
    await expect(this.boardingPass).toBeVisible();
    await expect(this.passStatus).toHaveText('GENERATED');
    await expect(this.boardingPass.locator('#pass-pnr')).toHaveText(pnr);
    await expect(this.boardingPass.locator('#pass-name')).toHaveText(name);
    await expect(this.boardingPass.locator('#pass-seat')).toHaveText(seat);
    await expect(this.boardingPass.locator('#pass-baggage')).toHaveText(`${baggageKg} kg`);
  }
}

// Each fixture builds on the previous one and leaves the passenger in a verified state,
// so tests start from a known journey step instead of repeating setup steps.
const test = base.test.extend({
  dcs: async ({ page }, use) => {
    const dcs = new DcsPage(page);
    await dcs.open();
    await use(dcs);
  },

  checkedIn: async ({ dcs }, use) => {
    await dcs.checkIn();
    await use(dcs);
  },

  seated: async ({ checkedIn: dcs }, use) => {
    await dcs.selectSeat('12A');
    await expect(dcs.seatStatus).toHaveText('SEAT 12A');
    await use(dcs);
  },

  baggageValidated: async ({ seated: dcs }, use) => {
    await dcs.validateBaggage(data.baggage.withinAllowance);
    await expect(dcs.baggageStatus).toHaveText('VALIDATED');
    await use(dcs);
  },

  withBoardingPass: async ({ baggageValidated: dcs }, use) => {
    await dcs.generateBoardingPass();
    await expect(dcs.passStatus).toHaveText('GENERATED');
    await use(dcs);
  },

  boarded: async ({ withBoardingPass: dcs }, use) => {
    await dcs.board();
    await expect(dcs.boardingStatus).toHaveText('BOARDED');
    await use(dcs);
  },
});

module.exports = { test, expect, data, DcsPage };
