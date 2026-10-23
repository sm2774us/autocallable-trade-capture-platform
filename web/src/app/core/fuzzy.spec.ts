import {fuzzyMatch, fuzzyScore} from './fuzzy';

describe('fuzzy', () => {
  it('matches subsequences case-insensitively', () => {
    expect(fuzzyScore('tgt', 'Toggle theme')).toBeGreaterThan(0);
    expect(fuzzyScore('xyz', 'Toggle theme')).toBe(-1);
    expect(fuzzyMatch('Toggle theme', 'THEME')).toBe(true);
  });

  it('an empty query matches everything', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
    expect(fuzzyScore('   ', 'anything')).toBe(0);
  });

  it('prefers consecutive runs and word starts', () => {
    expect(fuzzyScore('abc', 'xabc')).toBeGreaterThan(
      fuzzyScore('abc', 'xaxbxc')
    );
    expect(fuzzyScore('b', 'a b')).toBeGreaterThan(fuzzyScore('b', 'ab'));
    expect(fuzzyScore('nv', 'Go to NVDA')).toBeGreaterThan(0);
  });

  it('order matters', () => {
    expect(fuzzyScore('ba', 'abc')).toBe(-1);
  });
});
