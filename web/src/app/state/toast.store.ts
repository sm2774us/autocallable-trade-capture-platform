import {signalStore, withMethods, withState, patchState} from '@ngrx/signals';

/** Toast flavour. */
export type ToastKind = 'success' | 'error' | 'info';

/** One notification. */
export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly title: string;
  readonly detail?: string;
}

let nextId = 1;

/** Transient notifications: success after booking, errors from the server. */
export const ToastStore = signalStore(
  {providedIn: 'root'},
  withState<{toasts: readonly Toast[]}>({toasts: []}),
  withMethods(store => {
    const dismiss = (id: number): void => {
      patchState(store, {toasts: store.toasts().filter(t => t.id !== id)});
    };
    return {
      dismiss,
      /**
       * Shows a toast and removes it automatically (errors linger longer).
       *
       * @param kind Flavour.
       * @param title Headline.
       * @param detail Optional second line.
       * @return The toast id.
       */
      push(kind: ToastKind, title: string, detail?: string): number {
        const id = nextId++;
        patchState(store, {
          toasts: [...store.toasts().slice(-3), {id, kind, title, detail}],
        });
        setTimeout(
          () => {
            dismiss(id);
          },
          kind === 'error' ? 8000 : 4000
        );
        return id;
      },
    };
  })
);
