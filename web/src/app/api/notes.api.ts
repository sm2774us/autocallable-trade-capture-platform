import {
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import {Injectable, inject} from '@angular/core';
import {Observable} from 'rxjs';

import {Terms} from '../core/ticket.checks';

/** A booked note as listed by `GET /api/notes`. */
export interface NoteRow {
  readonly id: string;
  readonly bookedAt: string;
  readonly terms: Terms;
}

/** Status document of `GET /api/system/status`. */
export interface SystemStatus {
  readonly service: string;
  readonly serverTime: string;
  readonly quoteSeq: number;
  readonly tradeSeq: number;
  readonly quoteClients: number;
  readonly tradeClients: number;
  readonly inserted: number;
  readonly duplicates: number;
  readonly demo: boolean;
}

/** HTTP client for notes and system status. */
@Injectable({providedIn: 'root'})
export class TermsApi {
  private readonly http = inject(HttpClient);

  /**
   * Loads the terms of a note.
   *
   * @param noteId The note id; URL-encoded before use.
   * @return The terms.
   */
  getTerms(noteId: string): Observable<Terms> {
    return this.http.get<Terms>(
      `/api/notes/${encodeURIComponent(noteId)}/terms`
    );
  }

  /**
   * Books a new note.
   *
   * @param terms The terms to book.
   * @return The id of the created note.
   */
  book(terms: Terms): Observable<{id: string}> {
    return this.http.post<{id: string}>('/api/notes', terms);
  }

  /**
   * Lists the most recently booked notes.
   *
   * @param limit Maximum rows.
   * @return Notes, newest first.
   */
  list(limit = 50): Observable<NoteRow[]> {
    return this.http.get<NoteRow[]>('/api/notes', {params: {limit}});
  }

  /**
   * Reads the status document.
   *
   * @return The status.
   */
  status(): Observable<SystemStatus> {
    return this.http.get<SystemStatus>('/api/system/status');
  }
}

/**
 * Functional interceptor: correlation id on every call (propagate into logs and
 * traces).
 */
export const correlationInterceptor: HttpInterceptorFn = (req, next) => {
  const id =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return next(req.clone({setHeaders: {'X-Correlation-Id': 'ui-' + id}}));
};

/** What the ticket needs from a failed booking. */
export interface BookingFailure {
  readonly message: string;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

/**
 * Turns an HTTP failure into a message and per-field errors. The server answers
 * 422 with an RFC 9457 problem whose `errors` array lists `{field, message}`.
 *
 * @param error Whatever the HTTP client threw.
 * @return A friendly failure description.
 */
export function toBookingFailure(error: unknown): BookingFailure {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 422 && Array.isArray(error.error?.errors)) {
      const fieldErrors: Record<string, string> = {};
      for (const entry of error.error.errors as Array<{
        field: string;
        message: string;
      }>) {
        fieldErrors[entry.field] = entry.message;
      }
      return {message: 'The server rejected the terms', fieldErrors};
    }
    if (error.status === 0) {
      return {message: 'Cannot reach the server', fieldErrors: {}};
    }
    return {message: `Server error ${error.status}`, fieldErrors: {}};
  }
  return {message: 'Unexpected error', fieldErrors: {}};
}
