import { describe, expect, it } from 'vitest';

import { positiveNumber, providerId } from '../src/runtime.js';

describe('CLI action value parsing', () => {
  it('accepts exact money values and numeric provider IDs', () => {
    expect(positiveNumber(1_000)('125.50')).toBe(125.5);
    expect(providerId(' 7123456789012345678 ')).toBe('7123456789012345678');
  });

  it('rejects surprising money syntax, excess precision, and non-numeric IDs', () => {
    expect(() => positiveNumber(1_000)('1e2')).toThrow();
    expect(() => positiveNumber(1_000)('12.345')).toThrow();
    expect(() => providerId('../campaign')).toThrow();
  });
});
