/** States of the execution ticket. */
export type TicketState =
  | {readonly kind: 'editing'}
  | {readonly kind: 'confirming'}
  | {readonly kind: 'submitting'}
  | {readonly kind: 'booked'; readonly id: string}
  | {
      readonly kind: 'rejected';
      readonly message: string;
      readonly fieldErrors: Readonly<Record<string, string>>;
    };

/** Events that move the ticket between states. */
export type TicketEvent =
  | {readonly type: 'edit'}
  | {
      readonly type: 'submit';
      readonly canBook: boolean;
      readonly needsConfirm: boolean;
    }
  | {readonly type: 'booked'; readonly id: string}
  | {
      readonly type: 'rejected';
      readonly message: string;
      readonly fieldErrors: Readonly<Record<string, string>>;
    }
  | {readonly type: 'cancel'};

/** Initial state. */
export const TICKET_START: TicketState = {kind: 'editing'};

/**
 * Pure transition function of the ticket state machine:
 *
 * editing --submit(ok)--> submitting
 * editing --submit(ok, warnings)--> confirming --submit--> submitting
 * confirming --edit | cancel--> editing
 * submitting --booked--> booked, --rejected--> rejected (edits and submits are
 * ignored while in flight, so a double Ctrl+Enter cannot book twice)
 * booked | rejected --edit--> editing
 *
 * @param state The current state.
 * @param event The event.
 * @return The next state; the same reference when the event changes nothing.
 */
export function ticketReducer(
  state: TicketState,
  event: TicketEvent
): TicketState {
  if (state.kind === 'submitting') {
    switch (event.type) {
      case 'booked':
        return {kind: 'booked', id: event.id};
      case 'rejected':
        return {
          kind: 'rejected',
          message: event.message,
          fieldErrors: event.fieldErrors,
        };
      default:
        return state;
    }
  }
  switch (event.type) {
    case 'edit':
      return state.kind === 'editing' ? state : {kind: 'editing'};
    case 'cancel':
      return state.kind === 'confirming' ? {kind: 'editing'} : state;
    case 'submit':
      if (!event.canBook) {
        return state.kind === 'editing' ? state : {kind: 'editing'};
      }
      if (state.kind === 'confirming' || !event.needsConfirm) {
        return {kind: 'submitting'};
      }
      return {kind: 'confirming'};
    case 'booked':
    case 'rejected':
      return state;
  }
}
