/* eslint-disable no-control-regex */
/* eslint-disable security/detect-unsafe-regex */
import * as path from 'path';
import { SanitizationError, PathTraversalError, ValidationError } from './errors';

/**
 * Sanitizes a string input by stripping control characters, null bytes,
 * ANSI escape sequences, and trimming trailing/leading whitespace.
 * Throws SanitizationError if the string length exceeds maxLength.
 */
export function sanitizeString(input: string, maxLength: number): string {
  if (typeof input !== 'string') {
    throw new SanitizationError('Input must be a string');
  }

  // Remove ANSI escape sequences
  let sanitized = input.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    '',
  );

  // Remove control characters (ASCII 0-31, 127) and null bytes
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

  sanitized = sanitized.trim();

  if (sanitized.length > maxLength) {
    throw new SanitizationError(
      `Input length (${sanitized.length}) exceeds maximum limit of ${maxLength} characters`,
    );
  }

  return sanitized;
}

/**
 * Validates and resolves a path relative to the project root.
 * Ensures the resolved path does not escape the project root (path traversal).
 * Throws PathTraversalError on violations.
 */
export function sanitizePath(input: string, projectRoot: string): string {
  if (typeof input !== 'string' || typeof projectRoot !== 'string') {
    throw new ValidationError('Path and project root must be strings');
  }

  const resolvedRoot = path.resolve(projectRoot);
  const resolvedPath = path.resolve(resolvedRoot, input);

  // path.relative returns a path starting with '..' or an absolute path (on Windows different drives)
  // if resolvedPath escapes resolvedRoot.
  const relative = path.relative(resolvedRoot, resolvedPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new PathTraversalError(
      `Path traversal attempt detected: "${input}" resolves to "${resolvedPath}" which escapes project root "${resolvedRoot}"`,
    );
  }

  return resolvedPath;
}

/**
 * Validates that an input string belongs to a pre-defined array of allowed enum values.
 * Throws ValidationError if not allowed.
 */
export function validateEnum<T>(input: string, allowed: T[]): T {
  if (!allowed.includes(input as unknown as T)) {
    throw new ValidationError(`Invalid value: "${input}". Expected one of: ${allowed.join(', ')}`);
  }
  return input as unknown as T;
}
