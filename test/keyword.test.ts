import { describe, it, expect } from 'vitest';
import { matchesConfirmation } from '../src/utils/keyword';

describe('matchesConfirmation', () => {
  const kw = 'DONE';

  it.each([
    'DONE',
    'done',
    ' Done ',
    'done!',
    'Done ✅',
    '✅',
    'followed',
    'following',
    'yep',
    'ok done',
  ])('accepts "%s"', (text) => {
    expect(matchesConfirmation(text, kw)).toBe(true);
  });

  it.each([
    '',
    'what does this mean',
    'not interested at all thanks',
    'can you explain more please',
  ])('rejects "%s"', (text) => {
    expect(matchesConfirmation(text, kw)).toBe(false);
  });

  it('respects a custom keyword', () => {
    expect(matchesConfirmation('YESSIR here', 'YESSIR')).toBe(true);
    expect(matchesConfirmation('nope', 'YESSIR')).toBe(false);
  });
});
