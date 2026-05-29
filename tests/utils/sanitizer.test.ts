import { sanitizeString, sanitizePath, validateEnum } from '../../src/utils/sanitizer';
import { SanitizationError, PathTraversalError, ValidationError } from '../../src/utils/errors';

describe('sanitizer', () => {
  describe('sanitizeString', () => {
    it('throws SanitizationError if input is not a string', () => {
      expect(() => sanitizeString(123 as any, 10)).toThrow(SanitizationError);
    });

    it('strips ANSI escape sequences and control characters', () => {
      const input = '\u001b[31mhello\u0000world\u001b[0m';
      const result = sanitizeString(input, 50);
      expect(result).toBe('helloworld');
    });

    it('trims leading and trailing whitespace', () => {
      const input = '   hello   ';
      const result = sanitizeString(input, 50);
      expect(result).toBe('hello');
    });

    it('throws SanitizationError if output exceeds maxLength', () => {
      expect(() => sanitizeString('too long string', 5)).toThrow(SanitizationError);
    });

    it('returns sanitized string if within maxLength', () => {
      const result = sanitizeString('hello', 5);
      expect(result).toBe('hello');
    });
  });

  describe('sanitizePath', () => {
    it('throws ValidationError if arguments are not strings', () => {
      expect(() => sanitizePath(123 as any, 'root')).toThrow(ValidationError);
      expect(() => sanitizePath('path', 123 as any)).toThrow(ValidationError);
    });

    it('resolves a valid nested path within root', () => {
      const root = '/foo/bar';
      const result = sanitizePath('baz/qux.txt', root);
      // Using path.resolve for cross-platform matching
      expect(result).toBe(require('path').resolve(root, 'baz/qux.txt'));
    });

    it('throws PathTraversalError if path escapes root', () => {
      const root = '/foo/bar';
      expect(() => sanitizePath('../escape.txt', root)).toThrow(PathTraversalError);
      expect(() => sanitizePath('../../etc/passwd', root)).toThrow(PathTraversalError);
    });
  });

  describe('validateEnum', () => {
    it('returns the input if it matches an allowed value', () => {
      const result = validateEnum('a', ['a', 'b', 'c']);
      expect(result).toBe('a');
    });

    it('throws ValidationError if input is not in allowed list', () => {
      expect(() => validateEnum('d', ['a', 'b', 'c'])).toThrow(ValidationError);
    });
  });
});
