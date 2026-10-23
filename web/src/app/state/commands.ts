import {Injectable} from '@angular/core';
import {Subject} from 'rxjs';

/**
 * Tiny command bus between the global hotkeys / palette and the panels that own
 * the target (ticket, filter box). Panels subscribe; nobody holds references to
 * anybody else.
 */
@Injectable({providedIn: 'root'})
export class Commands {
  /** Focus the note ticket's first field. */
  readonly focusTicket$ = new Subject<void>();

  /** Submit the note ticket (Ctrl/Cmd+Enter). */
  readonly submitTicket$ = new Subject<void>();

  /** Cancel a pending ticket confirmation (Esc). */
  readonly cancelTicket$ = new Subject<void>();

  /** Focus the quote board's filter input. */
  readonly focusFilter$ = new Subject<void>();
}
