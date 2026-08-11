import { describe, expect, it } from 'vitest';

import {
  currency,
  integer,
  oneOf,
  positiveNumber,
  providerId,
} from '../src/runtime.js';

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

  it('parses bounded integers and normalizes currency codes', () => {
    expect(integer(1, 90)('30')).toBe(30);
    expect(currency(' usd ')).toBe('USD');
    expect(oneOf(['ACTIVE', 'PAUSED'] as const)('PAUSED')).toBe('PAUSED');
  });

  it('rejects out-of-range integers, invalid currencies, and unknown enum values', () => {
    expect(() => integer(1, 90)('0')).toThrow();
    expect(() => integer(1, 90)('1.5')).toThrow();
    expect(() => currency('US')).toThrow();
    expect(() => oneOf(['ACTIVE', 'PAUSED'] as const)('DISABLED')).toThrow();
  });
});
