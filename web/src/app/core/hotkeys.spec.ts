import {HOTKEY_HELP, KeyLike, resolveHotkey} from './hotkeys';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});
const idle = {typing: false, modalOpen: false};
const typing = {typing: true, modalOpen: false};
const modal = {typing: false, modalOpen: true};

describe('hotkeys', () => {
  it('Ctrl/Cmd+K opens the palette even while typing or in a modal', () => {
    expect(resolveHotkey(key('k', {ctrlKey: true}), typing)).toBe('palette');
    expect(resolveHotkey(key('K', {metaKey: true}), idle)).toBe('palette');
    expect(resolveHotkey(key('k', {ctrlKey: true}), modal)).toBe('palette');
  });

  it('Ctrl/Cmd+Enter submits the ticket, also while typing', () => {
    expect(resolveHotkey(key('Enter', {ctrlKey: true}), typing)).toBe(
      'submitTicket'
    );
    expect(resolveHotkey(key('Enter', {metaKey: true}), idle)).toBe(
      'submitTicket'
    );
    expect(resolveHotkey(key('Enter'), idle)).toBeNull();
  });

  it('Alt+T focuses the ticket', () => {
    expect(resolveHotkey(key('t', {altKey: true}), typing)).toBe('focusTicket');
  });

  it('Escape always resolves', () => {
    expect(resolveHotkey(key('Escape'), modal)).toBe('escape');
    expect(resolveHotkey(key('Escape'), typing)).toBe('escape');
  });

  it('bare keys work only when idle', () => {
    const table: Array<[string, string]> = [
      ['?', 'help'],
      ['/', 'focusFilter'],
      ['j', 'nextSym'],
      ['k', 'prevSym'],
      ['t', 'toggleTheme'],
      ['d', 'toggleDensity'],
      ['m', 'maximize'],
    ];
    for (const [k, action] of table) {
      expect(resolveHotkey(key(k), idle)).toBe(action);
      expect(resolveHotkey(key(k), typing)).toBeNull();
      expect(resolveHotkey(key(k), modal)).toBeNull();
    }
  });

  it('an unknown key or a stray modifier is not a shortcut', () => {
    expect(resolveHotkey(key('x'), idle)).toBeNull();
    expect(resolveHotkey(key('j', {ctrlKey: true}), idle)).toBeNull();
    expect(resolveHotkey(key('j', {altKey: true}), idle)).toBeNull();
  });

  it('documents every shortcut for the help dialog', () => {
    expect(HOTKEY_HELP.length).toBeGreaterThanOrEqual(10);
    expect(
      HOTKEY_HELP.every(([keys, text]) => keys.length > 0 && text.length > 0)
    ).toBe(true);
  });
});
