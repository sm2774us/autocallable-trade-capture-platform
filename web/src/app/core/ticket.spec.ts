import {
  LARGE_NOTIONAL,
  MAX_NOTIONAL,
  Terms,
  canBook,
  decimals,
  needsConfirm,
  preTradeChecks,
  stepNotional,
} from './ticket.checks';
import {
  TICKET_START,
  TicketEvent,
  TicketState,
  ticketReducer,
} from './ticket.machine';

const good: Terms = {
  underlying: 'AAPL',
  notional: 1_000_000,
  couponRate: 0.02,
  couponBarrier: 70,
  autocallBarrier: 100,
  kiBarrier: 60,
};
const errors = (t: Partial<Terms>) =>
  preTradeChecks(t)
    .filter(c => c.level === 'error')
    .map(c => c.id);
const warns = (t: Partial<Terms>) =>
  preTradeChecks(t)
    .filter(c => c.level === 'warn')
    .map(c => c.id);

describe('pre-trade checks', () => {
  it('passes clean terms with no errors or warnings', () => {
    const checks = preTradeChecks(good);
    expect(canBook(checks)).toBe(true);
    expect(needsConfirm(checks)).toBe(false);
    expect(checks.every(c => c.level === 'ok')).toBe(true);
  });

  it('counts decimals without float noise', () => {
    expect(decimals(1.25)).toBe(2);
    expect(decimals(100)).toBe(0);
    expect(decimals(0.0001)).toBe(4);
    expect(decimals(1e-7)).toBe(7);
  });

  it('blocks a bad underlying', () => {
    expect(errors({...good, underlying: 'a b'})).toEqual(['underlying']);
    expect(errors({...good, underlying: ''})).toEqual(['underlying']);
    expect(errors({...good, underlying: 'BRK.B'})).toEqual([]);
  });

  it('blocks non-positive, oversize and over-precise notionals', () => {
    expect(errors({...good, notional: 0})).toEqual(['notional']);
    expect(errors({...good, notional: MAX_NOTIONAL + 1})).toEqual(['notional']);
    expect(errors({...good, notional: 100.001})).toEqual(['notional']);
    expect(errors({...good, notional: NaN})).toEqual(['notional']);
    expect(errors({...good, notional: MAX_NOTIONAL})).toEqual([]);
  });

  it('asks for confirmation on a large ticket', () => {
    expect(warns({...good, notional: LARGE_NOTIONAL})).toEqual(['notional']);
    expect(warns({...good, notional: LARGE_NOTIONAL - 1})).toEqual([]);
    expect(
      needsConfirm(preTradeChecks({...good, notional: LARGE_NOTIONAL}))
    ).toBe(true);
  });

  it('checks the coupon rate range, precision and a >5% warning', () => {
    expect(errors({...good, couponRate: 1.5})).toEqual(['couponRate']);
    expect(errors({...good, couponRate: -0.1})).toEqual(['couponRate']);
    expect(errors({...good, couponRate: 0.00001})).toEqual(['couponRate']);
    expect(warns({...good, couponRate: 0.06})).toEqual(['couponRate']);
  });

  it('enforces KI < coupon <= autocall exactly like the server', () => {
    expect(errors({...good, kiBarrier: 70})).toEqual(['order-ki']);
    expect(errors({...good, kiBarrier: 80})).toEqual(['order-ki']);
    expect(errors({...good, couponBarrier: 110})).toEqual(['order-coupon']);
    expect(errors({...good, couponBarrier: 100})).toEqual([]);
  });

  it('flags every barrier outside (0, 200] and skips the order check', () => {
    const ids = errors({
      ...good,
      couponBarrier: 0,
      autocallBarrier: 250,
      kiBarrier: -1,
    });
    expect(ids).toEqual(['couponBarrier', 'autocallBarrier', 'kiBarrier']);
  });

  it('warns on a deep knock-in', () => {
    expect(warns({...good, kiBarrier: 40})).toEqual(['deep-ki']);
  });

  it('lists errors first, then warnings, then ok', () => {
    const levels = preTradeChecks({
      ...good,
      underlying: '',
      notional: LARGE_NOTIONAL,
    }).map(c => c.level);
    expect(levels[0]).toBe('error');
    expect(levels.indexOf('warn')).toBeLessThan(levels.indexOf('ok'));
  });
});

describe('stepNotional (hotkeys)', () => {
  it('steps 100K, Shift 1M, Alt 10M and snaps to the grid', () => {
    expect(stepNotional(1_000_000, 1)).toBe(1_100_000);
    expect(stepNotional(1_000_000, -1)).toBe(900_000);
    expect(stepNotional(1_000_000, 1, {shift: true})).toBe(2_000_000);
    expect(stepNotional(1_250_000, 1, {shift: true})).toBe(2_000_000);
    expect(stepNotional(1_250_000, -1, {shift: true})).toBe(1_000_000);
    expect(stepNotional(5_000_000, 1, {alt: true})).toBe(10_000_000);
  });

  it('clamps at zero and at the hard limit, and survives NaN', () => {
    expect(stepNotional(50_000, -1)).toBe(0);
    expect(stepNotional(0, -1)).toBe(0);
    expect(stepNotional(MAX_NOTIONAL, 1)).toBe(MAX_NOTIONAL);
    expect(stepNotional(NaN, 1)).toBe(100_000);
  });
});

describe('ticket state machine', () => {
  const submit = (canBook: boolean, needsConfirm = false): TicketEvent => ({
    type: 'submit',
    canBook,
    needsConfirm,
  });
  const run = (
    events: TicketEvent[],
    from: TicketState = TICKET_START
  ): TicketState => events.reduce(ticketReducer, from);

  it('editing + submit(ok) goes straight to submitting', () => {
    expect(run([submit(true)]).kind).toBe('submitting');
  });

  it('a blocked submit changes nothing', () => {
    expect(ticketReducer(TICKET_START, submit(false))).toBe(TICKET_START);
  });

  it('warnings need a second submit', () => {
    expect(run([submit(true, true)]).kind).toBe('confirming');
    expect(run([submit(true, true), submit(true, true)]).kind).toBe(
      'submitting'
    );
  });

  it('editing or cancelling a confirmation returns to editing', () => {
    expect(run([submit(true, true), {type: 'edit'}]).kind).toBe('editing');
    expect(run([submit(true, true), {type: 'cancel'}]).kind).toBe('editing');
  });

  it('ignores edits and re-submits while in flight (no double booking)', () => {
    const flying = run([submit(true)]);
    expect(ticketReducer(flying, {type: 'edit'})).toBe(flying);
    expect(ticketReducer(flying, submit(true))).toBe(flying);
    expect(ticketReducer(flying, {type: 'cancel'})).toBe(flying);
  });

  it('booked and rejected arrive only from submitting', () => {
    expect(run([submit(true), {type: 'booked', id: 'N-1'}])).toEqual({
      kind: 'booked',
      id: 'N-1',
    });
    const rejected = run([
      submit(true),
      {type: 'rejected', message: 'no', fieldErrors: {kiBarrier: 'bad'}},
    ]);
    expect(rejected).toEqual({
      kind: 'rejected',
      message: 'no',
      fieldErrors: {kiBarrier: 'bad'},
    });
    expect(ticketReducer(TICKET_START, {type: 'booked', id: 'N-9'})).toBe(
      TICKET_START
    );
  });

  it('an edit leaves booked and rejected', () => {
    expect(run([{type: 'edit'}], {kind: 'booked', id: 'N-1'}).kind).toBe(
      'editing'
    );
    expect(
      run([{type: 'edit'}], {kind: 'rejected', message: '', fieldErrors: {}})
        .kind
    ).toBe('editing');
  });

  it('a new ticket can be submitted straight after booking', () => {
    expect(run([submit(true)], {kind: 'booked', id: 'N-1'}).kind).toBe(
      'submitting'
    );
  });
});
