const {
  isValidEmail,
  isPositiveInteger,
  cleanString
} = require('../src/utils/validate');

describe('Validation Utilities', () => {
  describe('isValidEmail', () => {
    test('accepts a valid email address', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });

    test('accepts an email with surrounding whitespace', () => {
      expect(isValidEmail('  user@example.com  ')).toBe(true);
    });

    test('rejects an invalid email address', () => {
      expect(isValidEmail('user@example')).toBe(false);
    });

    test('rejects non-string values', () => {
      expect(isValidEmail(12345)).toBe(false);
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
    });
  });

  describe('isPositiveInteger', () => {
    test('accepts a positive integer', () => {
      expect(isPositiveInteger(5)).toBe(true);
    });

    test('accepts a numeric string representing a positive integer', () => {
      expect(isPositiveInteger('10')).toBe(true);
    });

    test('rejects zero', () => {
      expect(isPositiveInteger(0)).toBe(false);
    });

    test('rejects negative integers', () => {
      expect(isPositiveInteger(-5)).toBe(false);
    });

    test('rejects decimal values', () => {
      expect(isPositiveInteger(2.5)).toBe(false);
    });
  });

  describe('cleanString', () => {
    test('trims surrounding whitespace', () => {
      expect(cleanString('  Task title  ')).toBe('Task title');
    });

    test('limits strings to the specified maximum length', () => {
      expect(cleanString('abcdefgh', 5)).toBe('abcde');
    });

    test('returns an empty string for non-string values', () => {
      expect(cleanString(123, 10)).toBe('');
      expect(cleanString(null, 10)).toBe('');
    });

    test('returns the complete trimmed string when no maximum length is provided', () => {
      expect(cleanString('  TaskFlow  ')).toBe('TaskFlow');
    });
  });
});
