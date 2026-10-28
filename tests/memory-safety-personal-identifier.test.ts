import { describe, expect, it } from 'vitest';
import { scanMemorySafety } from '../src/memory/safety.js';

/** A Luhn-valid number that is not a published provider test number, built here so no real card is in the source. */
function luhnNumber(prefix: string): string {
  for (let check = 0; check < 10; check += 1) {
    const digits = prefix + check;
    let sum = 0;
    for (let index = 0; index < digits.length; index += 1) {
      let digit = Number(digits[digits.length - 1 - index]);
      if (index % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit;
    }
    if (sum % 10 === 0) return digits;
  }
  throw new Error('unreachable');
}
const codes = (text: string) => scanMemorySafety(text).map(finding => finding.code);
const card = luhnNumber('453914880343646');

describe('personal identifiers in durable memory', () => {
  it('refuses a Luhn-valid card number next to a card keyword, with or without separators', () => {
    expect(codes(`The customer card number is ${card}, expires 12/30`)).toContain('personal-identifier');
    const grouped = card.replace(/(\d{4})(?=\d)/g, '$1 ');
    expect(codes(`credit card: ${grouped}`)).toContain('personal-identifier');
  });

  it('leaves a bare long number alone, and a number that fails the Luhn check', () => {
    expect(codes(`build artifact id ${card} finished`)).not.toContain('personal-identifier');
    const broken = card.slice(0, -1) + String((Number(card.at(-1)) + 1) % 10);
    expect(codes(`card ${broken}`)).not.toContain('personal-identifier');
  });

  it('accepts the published provider test numbers', () => {
    expect(codes('test card 4242 4242 4242 4242 works in the sandbox')).not.toContain('personal-identifier');
    expect(codes('visa test number 4111111111111111')).not.toContain('personal-identifier');
  });

  it('refuses national id and passport numbers only beside their own keyword', () => {
    expect(codes('NIK: 3174011203900001')).toContain('personal-identifier');
    expect(codes('ktp 3174011203900001')).toContain('personal-identifier');
    expect(codes('record 3174011203900001 imported')).not.toContain('personal-identifier');
    expect(codes('SSN 123-45-6789')).toContain('personal-identifier');
    expect(codes('passport no. X1234567')).toContain('personal-identifier');
    expect(codes('passport photo requirements')).not.toContain('personal-identifier');
  });

  it('terminates on hostile digit runs', () => {
    for (const text of ['1 '.repeat(100_000), '1-'.repeat(100_000), 'card ' + '9'.repeat(300_000)]) {
      expect(Array.isArray(scanMemorySafety(text))).toBe(true);
    }
  });
});
