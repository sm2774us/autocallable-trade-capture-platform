import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {takeUntilDestroyed, toSignal} from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {startWith} from 'rxjs';

import {toBookingFailure} from '../api/notes.api';
import {NotesService} from '../api/notes.queries';
import {fmtMicros, fmtQty} from '../core/money';
import {
  Check,
  Terms,
  canBook,
  needsConfirm,
  preTradeChecks,
  stepNotional,
} from '../core/ticket.checks';
import {
  TICKET_START,
  TicketState,
  TicketEvent,
  ticketReducer,
} from '../core/ticket.machine';
import {Commands} from '../state/commands';
import {QuotesStore} from '../state/quotes.store';
import {ToastStore} from '../state/toast.store';
import {WorkspaceStore} from '../state/workspace.store';
import {HlmBtn} from '../ui/btn.directive';
import {IconComponent} from '../ui/icon.component';
import {KbdComponent} from '../ui/kbd.component';
import {PanelFrameComponent} from '../ui/panel-frame.component';

/**
 * Cross-field rule from the term sheet: KI < coupon barrier <= autocall barrier
 * (all in % of initial). Kept as a form validator so `form.invalid` mirrors the
 * pre-trade checklist even for code that only looks at the form.
 *
 * @param group The form group holding the three barrier controls.
 * @return Error flags, or null when the barriers are correctly ordered.
 */
export const barrierOrder: ValidatorFn = (
  group: AbstractControl
): ValidationErrors | null => {
  const {
    couponBarrier: coupon,
    autocallBarrier: autocall,
    kiBarrier: knockIn,
  } = group.value as Partial<Terms>;
  if (coupon == null || autocall == null || knockIn == null) {
    return null;
  }
  const errors: Record<string, true> = {};
  if (!(knockIn < coupon)) {
    errors['kiNotBelowCoupon'] = true;
  }
  if (!(coupon <= autocall)) {
    errors['couponAboveAutocall'] = true;
  }
  return Object.keys(errors).length ? errors : null;
};

/** One horizontal line of the payoff ladder. */
interface Rung {
  readonly y: number;
  /** Label baseline, nudged so labels never overlap. */
  ly: number;
  readonly label: string;
  readonly colour: string;
  readonly dash: string;
}

/**
 * The execution ticket for an autocallable note: a Reactive Form, an instant
 * pre-trade risk checklist, a payoff ladder, size hotkeys, and a small state
 * machine (editing, confirming, submitting, booked, rejected) that makes a
 * double submit impossible.
 */
@Component({
  selector: 'app-ticket',
  imports: [
    ReactiveFormsModule,
    PanelFrameComponent,
    HlmBtn,
    IconComponent,
    KbdComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-panel-frame panel="ticket" icon="send">
      <div panel-actions class="flex items-center gap-1.5">
        <span
          class="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider"
          [class]="chipClass()"
          data-testid="ticket-state"
          [attr.data-state]="state().kind"
          >{{ chipText() }}</span
        >
      </div>
      <form
        class="flex h-full min-h-0 flex-col gap-2 overflow-auto p-2.5"
        [formGroup]="form"
        (ngSubmit)="submit()"
        data-testid="ticket-form"
        novalidate
      >
        <div class="grid grid-cols-2 gap-x-2 gap-y-2">
          <label class="col-span-2 block">
            <span
              class="mb-0.5 block text-[10px] uppercase tracking-wider text-muted"
              >Underlying</span
            >
            <input
              #underlyingInput
              class="field uppercase"
              formControlName="underlying"
              list="ticket-underlyings"
              autocomplete="off"
              aria-label="Underlying"
              [attr.aria-invalid]="invalid('underlying')"
            />
            <datalist id="ticket-underlyings">
              @for (s of quotes.symbols(); track s) {
                <option [value]="s"></option>
              }
            </datalist>
            @if (fieldMessage('underlying'); as m) {
              <small class="text-[10px] text-down">{{ m }}</small>
            }
          </label>

          <label class="col-span-2 block">
            <span
              class="mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted"
            >
              Notional
              <span class="num normal-case tracking-normal text-faint">{{
                notionalText()
              }}</span>
            </span>
            <span class="flex gap-1">
              <button
                hlmBtn
                size="icon"
                type="button"
                aria-label="Decrease notional"
                (click)="nudge(-1, $event)"
              >
                <app-icon name="minus" [size]="11" />
              </button>
              <input
                #notionalInput
                class="field text-right"
                formControlName="notional"
                type="number"
                aria-label="Notional"
                [attr.aria-invalid]="invalid('notional')"
                (keydown)="onNotionalKey($event)"
              />
              <button
                hlmBtn
                size="icon"
                type="button"
                aria-label="Increase notional"
                (click)="nudge(1, $event)"
              >
                <app-icon name="plus" [size]="11" />
              </button>
            </span>
            @if (fieldMessage('notional'); as m) {
              <small class="text-[10px] text-down">{{ m }}</small>
            }
          </label>

          <label class="block">
            <span
              class="mb-0.5 flex justify-between text-[10px] uppercase tracking-wider text-muted"
            >
              Coupon / period
              <span class="num normal-case text-faint">{{ couponPct() }}</span>
            </span>
            <input
              class="field text-right"
              formControlName="couponRate"
              type="number"
              step="0.0025"
              aria-label="Coupon rate"
              [attr.aria-invalid]="invalid('couponRate')"
            />
            @if (fieldMessage('couponRate'); as m) {
              <small class="text-[10px] text-down">{{ m }}</small>
            }
          </label>
          <label class="block">
            <span
              class="mb-0.5 block text-[10px] uppercase tracking-wider text-muted"
              >Coupon barrier %</span
            >
            <input
              class="field text-right"
              formControlName="couponBarrier"
              type="number"
              step="1"
              aria-label="Coupon barrier"
              [attr.aria-invalid]="invalid('couponBarrier')"
            />
            @if (fieldMessage('couponBarrier'); as m) {
              <small class="text-[10px] text-down">{{ m }}</small>
            }
          </label>
          <label class="block">
            <span
              class="mb-0.5 block text-[10px] uppercase tracking-wider text-muted"
              >Autocall barrier %</span
            >
            <input
              class="field text-right"
              formControlName="autocallBarrier"
              type="number"
              step="1"
              aria-label="Autocall barrier"
              [attr.aria-invalid]="invalid('autocallBarrier')"
            />
            @if (fieldMessage('autocallBarrier'); as m) {
              <small class="text-[10px] text-down">{{ m }}</small>
            }
          </label>
          <label class="block">
            <span
              class="mb-0.5 block text-[10px] uppercase tracking-wider text-muted"
              >KI barrier %</span
            >
            <input
              class="field text-right"
              formControlName="kiBarrier"
              type="number"
              step="1"
              aria-label="KI barrier"
              [attr.aria-invalid]="invalid('kiBarrier')"
            />
            @if (fieldMessage('kiBarrier'); as m) {
              <small class="text-[10px] text-down">{{ m }}</small>
            }
          </label>
        </div>

        <div class="flex gap-3">
          <svg
            viewBox="0 0 150 112"
            class="h-[112px] w-[150px] shrink-0 rounded-md border border-line bg-bg"
            role="img"
            aria-label="Barrier ladder"
            data-testid="ladder"
          >
            @for (rung of ladder(); track rung.label) {
              <line
                x1="4"
                x2="104"
                [attr.y1]="rung.y"
                [attr.y2]="rung.y"
                [attr.stroke]="rung.colour"
                stroke-width="1.5"
                [attr.stroke-dasharray]="rung.dash"
              />
              <text
                x="108"
                [attr.y]="rung.ly + 3"
                font-size="9"
                [attr.fill]="rung.colour"
                font-family="ui-monospace, monospace"
              >
                {{ rung.label }}
              </text>
            }
          </svg>
          <ul
            class="min-w-0 flex-1 space-y-0.5"
            aria-label="Pre-trade checks"
            data-testid="checks"
          >
            @for (check of checks(); track check.id) {
              <li
                class="flex items-start gap-1.5 text-[11px]"
                [attr.data-level]="check.level"
              >
                <app-icon
                  [name]="check.level === 'ok' ? 'check' : 'alert'"
                  [size]="11"
                  class="mt-px"
                  [class]="
                    check.level === 'ok'
                      ? 'text-up'
                      : check.level === 'warn'
                        ? 'text-warn'
                        : 'text-down'
                  "
                />
                <span class="break-words" [title]="check.detail"
                  ><span class="text-muted">{{ check.label }}:</span>
                  {{ check.detail }}</span
                >
              </li>
            }
          </ul>
        </div>

        <dl class="grid grid-cols-3 gap-1.5 text-[10px]" data-testid="kpis">
          <div class="rounded-md border border-line bg-bg px-2 py-1.5">
            <dt class="uppercase tracking-wider text-muted">Coupon / period</dt>
            <dd class="num mt-0.5 text-[12px] text-fg" data-testid="kpi-coupon">
              {{ couponCash() }}
            </dd>
          </div>
          <div class="rounded-md border border-line bg-bg px-2 py-1.5">
            <dt class="uppercase tracking-wider text-muted">Autocall at</dt>
            <dd class="num mt-0.5 text-[12px] text-up">
              ≥ {{ value().autocallBarrier ?? '—' }} %
            </dd>
          </div>
          <div class="rounded-md border border-line bg-bg px-2 py-1.5">
            <dt class="uppercase tracking-wider text-muted">Capital at risk</dt>
            <dd class="num mt-0.5 text-[12px] text-down">
              &lt; {{ value().kiBarrier ?? '—' }} %
            </dd>
          </div>
        </dl>

        @if (state().kind === 'rejected') {
          <p
            class="rounded-md border border-down/40 bg-down/10 px-2 py-1 text-[11px] text-down"
            data-testid="ticket-rejected"
          >
            {{ rejectedMessage() }}
          </p>
        }
        @if (state().kind === 'booked') {
          <p
            class="rounded-md border border-up/40 bg-up/10 px-2 py-1 text-[11px] text-up"
            data-testid="ticket-booked"
          >
            Booked {{ bookedId() }}
          </p>
        }

        <div class="mt-auto flex items-center gap-2">
          <button
            hlmBtn
            [variant]="state().kind === 'confirming' ? 'warn' : 'primary'"
            class="flex-1"
            type="submit"
            [disabled]="!ok() || state().kind === 'submitting'"
            data-testid="book-button"
          >
            @switch (state().kind) {
              @case ('submitting') {
                Booking…
              }
              @case ('confirming') {
                Confirm &amp; book
              }
              @default {
                Book note
              }
            }
            <app-kbd>Ctrl ↵</app-kbd>
          </button>
          @if (state().kind === 'confirming') {
            <button hlmBtn type="button" (click)="cancel()">
              Cancel <app-kbd>Esc</app-kbd>
            </button>
          }
        </div>
      </form>
    </app-panel-frame>
  `,
})
export class TicketPanel {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notes = inject(NotesService);
  private readonly toasts = inject(ToastStore);
  private readonly ws = inject(WorkspaceStore);
  protected readonly quotes = inject(QuotesStore);
  private readonly underlyingInput =
    viewChild<ElementRef<HTMLInputElement>>('underlyingInput');
  private readonly notionalInput =
    viewChild<ElementRef<HTMLInputElement>>('notionalInput');

  /** The form, validated across fields by {@link barrierOrder}. */
  readonly form = this.fb.group(
    {
      underlying: ['', [Validators.required]],
      notional: [1_000_000, [Validators.required, Validators.min(1)]],
      couponRate: [
        0.02,
        [Validators.required, Validators.min(0), Validators.max(1)],
      ],
      couponBarrier: [70, Validators.required],
      autocallBarrier: [100, Validators.required],
      kiBarrier: [60, Validators.required],
    },
    {validators: barrierOrder}
  );

  protected readonly value = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    {initialValue: this.form.getRawValue()}
  );

  /** The state machine's current state. */
  protected readonly state = signal<TicketState>(TICKET_START);

  /** Server-side field errors from a rejected booking. */
  private readonly serverErrors = signal<Readonly<Record<string, string>>>({});

  /** Live pre-trade checklist. */
  protected readonly checks = computed<Check[]>(() => {
    const raw = this.value();
    return preTradeChecks({
      ...raw,
      underlying: (raw.underlying ?? '').trim().toUpperCase(),
    } as Partial<Terms>);
  });

  /** True when nothing blocks booking. */
  protected readonly ok = computed(() => canBook(this.checks()));

  /** Message of a rejected booking. */
  protected readonly rejectedMessage = computed(() => {
    const s = this.state();
    return s.kind === 'rejected' ? s.message : '';
  });

  /** Id of the booked note. */
  protected readonly bookedId = computed(() => {
    const s = this.state();
    return s.kind === 'booked' ? s.id : '';
  });

  /** Coupon as a percentage string. */
  protected readonly couponPct = computed(
    () => ((this.value().couponRate ?? 0) * 100).toFixed(2) + ' %'
  );

  /** Cash coupon per period, exact: notional cents times coupon basis points. */
  protected readonly couponCash = computed(() => {
    const {notional, couponRate} = this.value();
    if (!Number.isFinite(notional) || !Number.isFinite(couponRate)) {
      return '—';
    }
    const cents = BigInt(Math.round((notional ?? 0) * 100));
    const bps = BigInt(Math.round((couponRate ?? 0) * 10_000));
    // cents x bps = micros of the coupon: 1 cent = 10,000 micros, 1 bp = 1/10,000
    return '$' + fmtMicros(cents * bps, 2);
  });

  /** Notional with thousands separators. */
  protected readonly notionalText = computed(
    () => '$' + fmtQty(this.value().notional ?? 0)
  );

  /** Barrier ladder for the SVG. */
  protected readonly ladder = computed<Rung[]>(() => {
    const v = this.value();
    const top = Math.max(130, (v.autocallBarrier ?? 100) + 15);
    const y = (pct: number): number => 106 - (Math.min(pct, top) / top) * 100;
    const rungs: Rung[] = [
      {
        y: y(v.autocallBarrier ?? 0),
        ly: 0,
        label: 'AC ' + (v.autocallBarrier ?? '—'),
        colour: 'var(--up)',
        dash: '',
      },
      {
        y: y(v.couponBarrier ?? 0),
        ly: 0,
        label: 'CPN ' + (v.couponBarrier ?? '—'),
        colour: 'var(--warn)',
        dash: '4 3',
      },
      {
        y: y(100),
        ly: 0,
        label: 'INIT 100',
        colour: 'var(--faint)',
        dash: '1 3',
      },
      {
        y: y(v.kiBarrier ?? 0),
        ly: 0,
        label: 'KI ' + (v.kiBarrier ?? '—'),
        colour: 'var(--down)',
        dash: '4 3',
      },
    ].sort((a, b) => a.y - b.y);
    // Keep labels 10px apart so equal barriers do not print on top of each other.
    let previous = -Infinity;
    for (const rung of rungs) {
      rung.ly = Math.max(rung.y, previous + 10);
      previous = rung.ly;
    }
    return rungs;
  });

  constructor() {
    // Selecting a row elsewhere pre-fills the underlying, until the trader types.
    const defaultSym = computed(
      () => this.ws.sym() ?? this.quotes.symbols()[0] ?? null
    );
    effect(() => {
      const selected = defaultSym();
      const control = this.form.controls.underlying;
      untracked(() => {
        if (selected && !control.dirty && control.value !== selected) {
          control.setValue(selected);
        }
      });
    });
    const commands = inject(Commands);
    commands.focusTicket$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.underlyingInput()?.nativeElement.focus();
    });
    commands.submitTicket$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.submit();
    });
    commands.cancelTicket$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.cancel();
    });
    // Any edit leaves booked / rejected / confirming and clears server errors.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.dispatch({type: 'edit'});
      if (Object.keys(this.serverErrors()).length) {
        this.serverErrors.set({});
      }
    });
  }

  /** Whether a field is marked invalid by a check or by the server. */
  protected invalid(field: keyof Terms): boolean {
    return !!this.fieldMessage(field);
  }

  /** First error text for a field, from the checklist or the server. */
  protected fieldMessage(field: keyof Terms): string | null {
    const server = this.serverErrors()[field];
    if (server) {
      return server;
    }
    const check = this.checks().find(
      c => c.field === field && c.level === 'error'
    );
    return check ? check.detail : null;
  }

  protected chipText(): string {
    const kind = this.state().kind;
    return kind === 'editing' ? (this.ok() ? 'Ready' : 'Blocked') : kind;
  }

  protected chipClass(): string {
    switch (this.state().kind) {
      case 'booked':
        return 'bg-up/15 text-up';
      case 'rejected':
        return 'bg-down/15 text-down';
      case 'confirming':
        return 'bg-warn/15 text-warn';
      case 'submitting':
        return 'bg-accent/15 text-accent';
      default:
        return this.ok() ? 'bg-up/10 text-up' : 'bg-down/10 text-down';
    }
  }

  /** Moves the notional by a step; Shift and Alt scale the step. */
  protected nudge(
    direction: 1 | -1,
    event: {shiftKey: boolean; altKey: boolean}
  ): void {
    const control = this.form.controls.notional;
    control.setValue(
      stepNotional(control.value, direction, {
        shift: event.shiftKey,
        alt: event.altKey,
      })
    );
    control.markAsDirty();
  }

  /** Arrow keys step the notional; everything else is untouched. */
  protected onNotionalKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.nudge(event.key === 'ArrowUp' ? 1 : -1, event);
    }
  }

  /** Escape on a pending confirmation. */
  protected cancel(): void {
    this.dispatch({type: 'cancel'});
  }

  /** Runs the state machine for a submit and, if it says so, books the note. */
  submit(): void {
    const checks = this.checks();
    const before = this.state();
    const next = ticketReducer(before, {
      type: 'submit',
      canBook: canBook(checks),
      needsConfirm: needsConfirm(checks),
    });
    this.state.set(next);
    if (next.kind !== 'submitting' || before.kind === 'submitting') {
      return;
    }
    const raw = this.form.getRawValue();
    const terms: Terms = {
      ...raw,
      underlying: raw.underlying.trim().toUpperCase(),
    };
    this.notes.book.mutate(terms, {
      onSuccess: result => {
        this.dispatch({type: 'booked', id: result.id});
        this.toasts.push(
          'success',
          `Booked ${result.id}`,
          `${terms.underlying} · $${fmtQty(terms.notional)}`
        );
      },
      onError: error => {
        const failure = toBookingFailure(error);
        this.serverErrors.set(failure.fieldErrors);
        this.dispatch({
          type: 'rejected',
          message: failure.message,
          fieldErrors: failure.fieldErrors,
        });
        this.toasts.push(
          'error',
          failure.message,
          Object.values(failure.fieldErrors).join(' · ') || undefined
        );
      },
    });
  }

  private dispatch(event: TicketEvent): void {
    const before = this.state();
    const after = ticketReducer(before, event);
    if (after !== before) {
      this.state.set(after);
    }
  }
}
