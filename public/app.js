(() => {
  const $ = (id) => document.getElementById(id);
  const state = { passenger: null, checkedIn: false, seat: null, baggageValidated: false, baggageKg: null, boardingPass: false, boarded: false };
  const demoPassenger = { pnr: 'DEMO123', surname: 'KHAN', firstName: 'Ayesha', lastName: 'Khan', flight: 'SR 204', from: 'KHI', to: 'DXB' };
  const occupiedSeats = ['12B'];
  const ALREADY_BOARDED = 'Passenger is already boarded. The journey can no longer be changed.';
  function message(id, text, kind = 'success-text') { const el = $(id); el.textContent = text; el.className = `inline-message ${kind}`; }
  function clearMessage(id) { const el = $(id); el.textContent = ''; el.className = 'inline-message'; }
  function mainMessage(text, kind = 'success-text') { const el = $('message'); el.textContent = text; el.className = `message ${kind}`; }
  function setStatus(id, text, success = false) { const el = $(id); el.textContent = text; el.classList.toggle('success', success); }
  // Withdraws the boarding pass; any change upstream of boarding must call this.
  function withdrawPass() { state.boardingPass = false; $('boarding-pass').classList.add('hidden'); clearMessage('pass-message'); clearMessage('boarding-message'); }
  function resetJourney() {
    state.checkedIn = false; state.seat = null; state.baggageValidated = false; state.baggageKg = null; withdrawPass();
    document.querySelectorAll('[data-seat]').forEach((b) => b.classList.remove('selected'));
    clearMessage('seat-message'); clearMessage('baggage-message');
  }
  function refreshSteps() {
    const complete = [state.checkedIn, !!state.seat, state.baggageValidated, state.boardingPass, state.boarded];
    document.querySelectorAll('.step').forEach((el, i) => { el.classList.toggle('done', complete[i]); el.classList.toggle('active', !complete[i] && (i === 0 || complete.slice(0, i).every(Boolean))); });
    $('journey-status').textContent = state.boarded ? 'BOARDED' : state.checkedIn ? 'CHECKED IN' : 'NOT STARTED';
    $('journey-status').classList.toggle('success', state.checkedIn);
    setStatus('seat-status', state.seat ? `SEAT ${state.seat}` : 'PENDING', !!state.seat);
    setStatus('baggage-status', state.baggageValidated ? 'VALIDATED' : 'PENDING', state.baggageValidated);
    setStatus('pass-status', state.boardingPass ? 'GENERATED' : 'PENDING', state.boardingPass);
    setStatus('boarding-status', state.boarded ? 'BOARDED' : 'PENDING', state.boarded);
  }
  $('lookup-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const pnr = $('pnr').value.trim().toUpperCase();
    const surname = $('surname').value.trim().toUpperCase();
    if (pnr !== demoPassenger.pnr || surname !== demoPassenger.surname) {
      $('passenger-result').classList.add('hidden'); mainMessage('Booking not found. Check the PNR and surname.', 'error');
      // A boarded passenger stays boarded; otherwise the failed lookup voids the whole journey.
      if (!state.boarded) { state.passenger = null; resetJourney(); }
      refreshSteps(); return;
    }
    state.passenger = demoPassenger;
    $('passenger-result').innerHTML = `<strong>Booking found:</strong> ${demoPassenger.firstName} ${demoPassenger.lastName} · ${demoPassenger.flight} · ${demoPassenger.from} → ${demoPassenger.to}<br><button class="primary" type="button" id="complete-checkin" data-testid="complete-checkin" style="margin-top:10px">Complete check-in</button>`;
    $('passenger-result').classList.remove('hidden');
    $('message').className = 'message hidden';
    $('complete-checkin').addEventListener('click', () => {
      if (state.boarded) return mainMessage(ALREADY_BOARDED, 'error');
      resetJourney(); state.checkedIn = true; message('seat-message', 'Select an available seat to continue.'); mainMessage('Check-in completed successfully.'); refreshSteps();
    });
  });
  document.querySelectorAll('[data-seat]').forEach((button) => {
    if (occupiedSeats.includes(button.dataset.seat)) { button.disabled = true; button.setAttribute('aria-disabled', 'true'); }
    button.addEventListener('click', () => {
      const seat = button.dataset.seat;
      if (!state.checkedIn) return message('seat-message', 'Complete passenger check-in before selecting a seat.', 'error');
      if (state.boarded) return message('seat-message', ALREADY_BOARDED, 'error');
      if (occupiedSeats.includes(seat)) return message('seat-message', `Seat ${seat} is already occupied. Choose another seat.`, 'error');
      state.seat = seat; state.baggageValidated = false; withdrawPass();
      document.querySelectorAll('[data-seat]').forEach((b) => b.classList.toggle('selected', b.dataset.seat === seat));
      message('seat-message', `Seat ${seat} selected successfully.`); refreshSteps();
    });
  });
  $('validate-baggage').addEventListener('click', () => {
    if (!state.checkedIn) return message('baggage-message', 'Complete passenger check-in first.', 'error');
    if (!state.seat) return message('baggage-message', 'Select a seat before validating baggage.', 'error');
    if (state.boarded) return message('baggage-message', ALREADY_BOARDED, 'error');
    const raw = $('baggage').value.trim();
    const weight = Number(raw);
    state.baggageValidated = false; withdrawPass(); refreshSteps();
    if (raw === '' || !Number.isFinite(weight) || weight < 0) return message('baggage-message', 'Enter a valid non-negative baggage weight.', 'error');
    if (weight > 23) return message('baggage-message', 'Baggage exceeds the 23 kg allowance. Excess baggage handling is required.', 'error');
    state.baggageKg = weight; state.baggageValidated = true; message('baggage-message', `Baggage validated: ${weight} kg, within the 23 kg allowance.`); refreshSteps();
  });
  $('generate-pass').addEventListener('click', () => {
    if (!state.checkedIn) return message('pass-message', 'Complete passenger check-in first.', 'error');
    if (!state.seat) return message('pass-message', 'Select a seat before generating the boarding pass.', 'error');
    if (!state.baggageValidated) return message('pass-message', 'Validate baggage before generating the boarding pass.', 'error');
    if (state.boarded) return message('pass-message', ALREADY_BOARDED, 'error');
    $('pass-pnr').textContent = state.passenger.pnr; $('pass-name').textContent = `${state.passenger.firstName} ${state.passenger.lastName}`; $('pass-seat').textContent = state.seat; $('pass-baggage').textContent = `${state.baggageKg} kg`;
    $('boarding-pass').classList.remove('hidden'); state.boardingPass = true; message('pass-message', 'Boarding pass generated successfully.'); message('boarding-message', 'Passenger is ready for boarding.'); refreshSteps();
  });
  $('board-passenger').addEventListener('click', () => {
    if (state.boarded) return message('boarding-message', 'Duplicate boarding rejected: passenger is already boarded.', 'error');
    // Boarding requires the full chain, not just a pass that may have been issued before a later change.
    if (!(state.checkedIn && state.seat && state.baggageValidated && state.boardingPass)) return message('boarding-message', 'Generate a boarding pass before boarding.', 'error');
    state.boarded = true; message('boarding-message', 'Boarding successful. Passenger status: BOARDED.'); refreshSteps();
  });
  refreshSteps();
})();
