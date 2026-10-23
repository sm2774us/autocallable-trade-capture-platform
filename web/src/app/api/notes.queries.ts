import {Injectable, inject} from '@angular/core';
import {
  QueryClient,
  injectMutation,
  injectQuery,
} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {Terms} from '../core/ticket.checks';
import {SystemStatus, TermsApi} from './notes.api';

/** Round-trip measurement taken around the status request. */
export interface SystemSample {
  readonly status: SystemStatus;
  /** Round-trip time in milliseconds. */
  readonly rttMs: number;
  /** Server clock minus local clock at the request midpoint, milliseconds. */
  readonly skewMs: number;
}

/**
 * Server state, cached and refreshed by TanStack Query: the booked-notes list
 * (invalidated after every booking) and the system status (polled).
 */
@Injectable({providedIn: 'root'})
export class NotesService {
  private readonly api = inject(TermsApi);
  private readonly client = inject(QueryClient);

  /** Booked notes, polled every 15 s and refreshed after a booking. */
  readonly notes = injectQuery(() => ({
    queryKey: ['notes'],
    queryFn: () => lastValueFrom(this.api.list(50)),
    refetchInterval: 15_000,
  }));

  /** Status plus latency, polled every 5 s. */
  readonly system = injectQuery(() => ({
    queryKey: ['system'],
    refetchInterval: 5_000,
    queryFn: async (): Promise<SystemSample> => {
      const sent = Date.now();
      const status = await lastValueFrom(this.api.status());
      const received = Date.now();
      return {
        status,
        rttMs: received - sent,
        skewMs: Date.parse(status.serverTime) - (sent + received) / 2,
      };
    },
  }));

  /** Books a note, then refreshes the notes list. */
  readonly book = injectMutation(() => ({
    mutationFn: (terms: Terms) => lastValueFrom(this.api.book(terms)),
    // Fire and forget: the ticket must show "Booked" at once, not after the list refetch.
    onSuccess: () => {
      void this.client.invalidateQueries({queryKey: ['notes']});
    },
  }));
}
