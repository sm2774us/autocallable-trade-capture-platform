import {
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';

import {TermsApi, correlationInterceptor, toBookingFailure} from './notes.api';

describe('TermsApi', () => {
  let api: TermsApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([correlationInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(TermsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('adds a ui- correlation id to every call', () => {
    api.status().subscribe();
    const r = http.expectOne('/api/system/status');
    expect(r.request.headers.get('X-Correlation-Id')).toMatch(/^ui-.+/);
    r.flush({});
  });

  it('url-encodes the note id', () => {
    api.getTerms('a/b c').subscribe();
    http.expectOne('/api/notes/a%2Fb%20c/terms').flush({});
  });

  it('posts terms and sends the limit when listing', () => {
    api.book({} as never).subscribe();
    const p = http.expectOne('/api/notes');
    expect(p.request.method).toBe('POST');
    p.flush({id: 'N1'});
    api.list(5).subscribe();
    const g = http.expectOne(
      r => r.url === '/api/notes' && r.params.get('limit') === '5'
    );
    expect(g.request.method).toBe('GET');
    g.flush([]);
  });
});

describe('toBookingFailure', () => {
  const err = (status: number, body?: unknown) =>
    new HttpErrorResponse({status, error: body});
  it('maps 422 problems to per-field errors', () => {
    const f = toBookingFailure(
      err(422, {errors: [{field: 'barrier', message: 'must be > 0'}]})
    );
    expect(f.fieldErrors).toEqual({barrier: 'must be > 0'});
  });
  it('maps network and server errors', () => {
    expect(toBookingFailure(err(0)).message).toMatch(/reach/);
    expect(toBookingFailure(err(500)).message).toMatch(/500/);
    expect(toBookingFailure(new Error('x')).message).toMatch(/Unexpected/);
  });
});
