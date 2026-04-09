import { describe, it, expect } from 'vitest';
import { uid } from '@shared/utils/id';
import { isNonEmpty, isIsoDate, isEmail, inRange } from '@shared/validation/validators';

describe('uid', () => {
  it('produces unique values with the supplied prefix', () => {
    const a = uid('foo');
    const b = uid('foo');
    expect(a).not.toBe(b);
    expect(a.startsWith('foo_')).toBe(true);
  });
  it('defaults the prefix to "id"', () => {
    expect(uid().startsWith('id_')).toBe(true);
  });
});

describe('validators', () => {
  it('isNonEmpty', () => {
    expect(isNonEmpty('x')).toBe(true);
    expect(isNonEmpty(' ')).toBe(false);
    expect(isNonEmpty(123 as unknown)).toBe(false);
  });
  it('isIsoDate', () => {
    expect(isIsoDate('2020-01-02')).toBe(true);
    expect(isIsoDate('2020-1-2')).toBe(false);
    expect(isIsoDate(20200102 as unknown)).toBe(false);
  });
  it('isEmail', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('nope')).toBe(false);
    expect(isEmail(123 as unknown)).toBe(false);
  });
  it('inRange', () => {
    expect(inRange(5, 0, 10)).toBe(true);
    expect(inRange(11, 0, 10)).toBe(false);
    expect(inRange(NaN, 0, 10)).toBe(false);
  });
});
