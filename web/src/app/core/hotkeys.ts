/** The subset of a keyboard event the resolver needs (testable without DOM). */
export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** Where focus is, which decides whether bare keys are shortcuts. */
export interface HotkeyContext {
  /** True when an input, textarea, select or contenteditable has focus. */
  readonly typing: boolean;
  /** True while a modal (palette or help) is open. */
  readonly modalOpen: boolean;
}

/** Everything a global hotkey can do. */
export type HotkeyAction =
  | 'palette'
  | 'help'
  | 'escape'
  | 'focusTicket'
  | 'submitTicket'
  | 'focusFilter'
  | 'nextSym'
  | 'prevSym'
  | 'toggleTheme'
  | 'toggleDensity'
  | 'maximize';

/** Rows of the help dialog: [keys, description]. */
export const HOTKEY_HELP: ReadonlyArray<readonly [string, string]> = [
  ['Ctrl/⌘ K', 'Open the command palette'],
  ['?', 'Show this help'],
  ['/', 'Focus the quote filter'],
  ['J / K', 'Next / previous symbol'],
  ['Alt T', 'Focus the note ticket'],
  ['Ctrl/⌘ Enter', 'Book the note (twice if a warning is shown)'],
  ['Shift ↑ ↓', 'Nudge notional by 1M (Alt: 10M, plain: 100K)'],
  ['T', 'Toggle dark / light theme'],
  ['D', 'Toggle compact / cozy density'],
  ['M', 'Maximise / restore the panel under the pointer'],
  ['Esc', 'Close dialogs, cancel a confirmation, restore a panel'],
];

/**
 * Maps a key press to an action. Pure, so every rule is unit-tested.
 *
 * - Ctrl/Cmd+K and Ctrl/Cmd+Enter work even while typing.
 * - Bare letters only fire when the user is not typing and no modal is open.
 *
 * @param event The key press.
 * @param context Focus context.
 * @return The action, or null when the key is not a shortcut.
 */
export function resolveHotkey(
  event: KeyLike,
  context: HotkeyContext
): HotkeyAction | null {
  const command = event.ctrlKey || event.metaKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (command && key === 'k') {
    return 'palette';
  }
  if (key === 'Escape') {
    return 'escape';
  }
  if (context.modalOpen) {
    return null;
  }
  if (command && key === 'Enter') {
    return 'submitTicket';
  }
  if (event.altKey && key === 't') {
    return 'focusTicket';
  }
  if (context.typing || command || event.altKey) {
    return null;
  }
  switch (key) {
    case '?':
      return 'help';
    case '/':
      return 'focusFilter';
    case 'j':
      return 'nextSym';
    case 'k':
      return 'prevSym';
    case 't':
      return 'toggleTheme';
    case 'd':
      return 'toggleDensity';
    case 'm':
      return 'maximize';
    default:
      return null;
  }
}
