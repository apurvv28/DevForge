/**
 * Template Renderer Tests
 *
 * Comprehensive test coverage for safe template variable substitution
 * with injection prevention.
 */

import {
  renderTemplate,
  renderTemplateFromArray,
  hasUnrenderedPlaceholders,
  getAllowedVariables,
  isAllowedVariable,
  TemplateVariable,
} from '../../src/engine/templateRenderer';
import { GeneratorError } from '../../src/utils/errors';

describe('Template Renderer', () => {
  describe('Basic Variable Substitution', () => {
    it('should substitute a single variable', () => {
      const template = 'Node version: {{nodeVersion}}';
      const variables = new Map([['nodeVersion', '18']]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('Node version: 18');
    });

    it('should substitute multiple variables', () => {
      const template =
        'Install with {{packageManager}}, node {{nodeVersion}}, run {{buildCommand}}';
      const variables = new Map([
        ['packageManager', 'npm'],
        ['nodeVersion', '20'],
        ['buildCommand', 'npm run build'],
      ]);
      const result = renderTemplate(template, variables);
      expect(result).toBe(
        'Install with npm, node 20, run npm run build',
      );
    });

    it('should handle variables appearing multiple times', () => {
      const template = '{{nodeVersion}} and {{nodeVersion}} again';
      const variables = new Map([['nodeVersion', '18']]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('18 and 18 again');
    });

    it('should handle empty template', () => {
      const variables = new Map([['nodeVersion', '18']]);
      const result = renderTemplate('', variables);
      expect(result).toBe('');
    });

    it('should handle template with no variables', () => {
      const template = 'No variables here';
      const variables = new Map();
      const result = renderTemplate(template, variables);
      expect(result).toBe('No variables here');
    });

    it('should handle whitespace around variable names', () => {
      const template = 'Version: {{ nodeVersion }}';
      const variables = new Map([['nodeVersion', '18']]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('Version: 18');
    });
  });

  describe('Complex Value Substitution', () => {
    it('should handle multiline values', () => {
      const template = 'Script:\n{{buildCommand}}';
      const variables = new Map([
        ['buildCommand', 'npm run build\nnpm run test'],
      ]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('Script:\nnpm run build\nnpm run test');
    });

    it('should handle values with special characters', () => {
      const template = 'Command: {{buildCommand}}';
      const variables = new Map([
        ['buildCommand', 'npm run build && npm run test'],
      ]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('Command: npm run build && npm run test');
    });

    it('should handle values with regex metacharacters', () => {
      const template = 'Pattern: {{buildCommand}}';
      const variables = new Map([
        ['buildCommand', 'grep "^test.*\\.js$" files'],
      ]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('Pattern: grep "^test.*\\.js$" files');
    });

    it('should handle values with quotes and escapes', () => {
      const template = 'Command: {{installCommand}}';
      const variables = new Map([
        ['installCommand', 'npm install "package@^1.0.0"'],
      ]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('Command: npm install "package@^1.0.0"');
    });

    it('should handle very long values', () => {
      const template = 'Output: {{buildCommand}}';
      const longValue = 'a'.repeat(10000);
      const variables = new Map([['buildCommand', longValue]]);
      const result = renderTemplate(template, variables);
      expect(result).toBe(`Output: ${longValue}`);
    });
  });

  describe('Allowlist Validation', () => {
    it('should allow nodeVersion variable', () => {
      const template = '{{nodeVersion}}';
      const variables = new Map([['nodeVersion', '18']]);
      expect(() => renderTemplate(template, variables)).not.toThrow();
    });

    it('should allow packageManager variable', () => {
      const template = '{{packageManager}}';
      const variables = new Map([['packageManager', 'npm']]);
      expect(() => renderTemplate(template, variables)).not.toThrow();
    });

    it('should allow installCommand variable', () => {
      const template = '{{installCommand}}';
      const variables = new Map([['installCommand', 'npm install']]);
      expect(() => renderTemplate(template, variables)).not.toThrow();
    });

    it('should allow buildCommand variable', () => {
      const template = '{{buildCommand}}';
      const variables = new Map([['buildCommand', 'npm run build']]);
      expect(() => renderTemplate(template, variables)).not.toThrow();
    });

    it('should allow testCommand variable', () => {
      const template = '{{testCommand}}';
      const variables = new Map([['testCommand', 'npm test']]);
      expect(() => renderTemplate(template, variables)).not.toThrow();
    });

    it('should allow framework variable', () => {
      const template = '{{framework}}';
      const variables = new Map([['framework', 'react']]);
      expect(() => renderTemplate(template, variables)).not.toThrow();
    });

    it('should allow environments variable', () => {
      const template = '{{environments}}';
      const variables = new Map([['environments', 'prod,staging']]);
      expect(() => renderTemplate(template, variables)).not.toThrow();
    });

    it('should reject disallowed variable', () => {
      const template = '{{customVar}}';
      const variables = new Map([['customVar', 'value']]);
      expect(() => renderTemplate(template, variables)).toThrow(
        GeneratorError,
      );
      expect(() => renderTemplate(template, variables)).toThrow(
        /Invalid variable name in template: customVar/,
      );
    });

    it('should reject variable with invalid characters', () => {
      const template = '{{node-version}}';
      const variables = new Map([['node-version', '18']]);
      // The pattern /\{\{\s*[a-zA-Z][a-zA-Z0-9_]*\s*\}\}/ won't match
      // "node-version" because it contains a hyphen
      // So the template will be returned unchanged (no placeholders found)
      const result = renderTemplate(template, variables);
      expect(result).toBe('{{node-version}}');
    });

    it('should reject variable starting with number', () => {
      const template = '{{1nodeVersion}}';
      const variables = new Map([['1nodeVersion', '18']]);
      // The pattern won't match "1nodeVersion" because it starts with a digit
      // So the template will be returned unchanged
      const result = renderTemplate(template, variables);
      expect(result).toBe('{{1nodeVersion}}');
    });
  });

  describe('Injection Prevention', () => {
    it('should prevent code execution via eval-like syntax', () => {
      const template = 'Value: {{buildCommand}}';
      const variables = new Map([['buildCommand', '\"; console.log(\"hacked']]);
      const result = renderTemplate(template, variables);
      expect(result).toContain('\"; console.log(\"hacked');
      // Should render as literal string, not execute
      expect(typeof result).toBe('string');
    });

    it('should prevent regex injection', () => {
      const template = 'Pattern: {{buildCommand}}';
      const variables = new Map([['buildCommand', '.*|dangerous']]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('Pattern: .*|dangerous');
    });

    it('should prevent template string injection', () => {
      const template = 'Value: {{buildCommand}}';
      const variables = new Map([['buildCommand', '${1+1}']]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('Value: ${1+1}');
      expect(result).not.toContain('2');
    });

    it('should prevent HTML injection', () => {
      const template = 'Command: {{buildCommand}}';
      const variables = new Map([
        ['buildCommand', '<script>alert("xss")</script>'],
      ]);
      const result = renderTemplate(template, variables);
      expect(result).toContain('<script>alert("xss")</script>');
    });

    it('should prevent shell injection', () => {
      const template = 'Command: {{buildCommand}}';
      const variables = new Map([
        ['buildCommand', 'npm; rm -rf /'],
      ]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('Command: npm; rm -rf /');
    });

    it('should handle backslash safely', () => {
      const template = 'Path: {{buildCommand}}';
      const variables = new Map([['buildCommand', 'C:\\Users\\test']]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('Path: C:\\Users\\test');
    });
  });

  describe('GitHub Actions Syntax Preservation', () => {
    it('should preserve GitHub Actions secrets syntax', () => {
      const template = 'Secret: ${{ secrets.API_KEY }}';
      const variables = new Map();
      const result = renderTemplate(template, variables);
      expect(result).toBe('Secret: ${{ secrets.API_KEY }}');
    });

    it('should preserve GitHub Actions environment syntax', () => {
      const template = 'Env: ${{ env.NODE_ENV }}';
      const variables = new Map();
      const result = renderTemplate(template, variables);
      expect(result).toBe('Env: ${{ env.NODE_ENV }}');
    });

    it('should preserve GitHub Actions matrix syntax', () => {
      const template = 'Node: ${{ matrix.node-version }}';
      const variables = new Map();
      const result = renderTemplate(template, variables);
      expect(result).toBe('Node: ${{ matrix.node-version }}');
    });

    it('should handle mixed GitHub Actions and Handlebars', () => {
      const template =
        'Node {{nodeVersion}} with token ${{ secrets.TOKEN }}';
      const variables = new Map([['nodeVersion', '18']]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('Node 18 with token ${{ secrets.TOKEN }}');
    });

    it('should not confuse ${{ }} with {{ }}', () => {
      const template = '${{ nodeVersion }} vs {{nodeVersion}}';
      const variables = new Map([['nodeVersion', '18']]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('${{ nodeVersion }} vs 18');
    });
  });

  describe('Undefined Variable Handling', () => {
    it('should throw error for undefined variable', () => {
      const template = '{{nodeVersion}}';
      const variables = new Map();
      expect(() => renderTemplate(template, variables)).toThrow(
        GeneratorError,
      );
      expect(() => renderTemplate(template, variables)).toThrow(
        /Undefined template variable/,
      );
    });

    it('should throw error for partial undefined variables', () => {
      const template = '{{nodeVersion}} and {{buildCommand}}';
      const variables = new Map([['nodeVersion', '18']]);
      expect(() => renderTemplate(template, variables)).toThrow(
        GeneratorError,
      );
    });

    it('should provide helpful error message with variable name', () => {
      const template = '{{missingVar}}';
      const variables = new Map();
      try {
        renderTemplate(template, variables);
        fail('Should have thrown error');
      } catch (error: unknown) {
        const err = error as { message: string };
        expect(err.message).toContain('missingVar');
        // Could be either "Invalid variable name" (not in allowlist) or
        // "Undefined template variable" (in allowlist but no value provided)
        expect(
          err.message.includes('Invalid variable name') ||
            err.message.includes('Undefined template variable'),
        ).toBe(true);
      }
    });

    it('should handle extra variables gracefully (not throw)', () => {
      const template = '{{nodeVersion}}';
      const variables = new Map([
        ['nodeVersion', '18'],
        ['extraVar', 'value'],
      ]);
      expect(() => renderTemplate(template, variables)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle template with only braces', () => {
      const template = '{ { notVariable } }';
      const variables = new Map();
      expect(() => renderTemplate(template, variables)).not.toThrow();
      expect(renderTemplate(template, variables)).toBe(
        '{ { notVariable } }',
      );
    });

    it('should handle single braces', () => {
      const template = '{nodeVersion}';
      const variables = new Map([['nodeVersion', '18']]);
      const result = renderTemplate(template, variables);
      expect(result).toBe('{nodeVersion}');
    });

    it('should handle triple braces', () => {
      const template = '{{{nodeVersion}}}';
      const variables = new Map([['nodeVersion', '18']]);
      // The inner {{nodeVersion}} matches pattern and gets replaced
      const result = renderTemplate(template, variables);
      expect(result).toBe('{18}');
    });

    it('should handle nested-looking structures', () => {
      const template = '{{ {{nodeVersion}} }}';
      const variables = new Map([['nodeVersion', '18']]);
      // Inner {{nodeVersion}} matches and gets replaced
      // This results in "{{ 18 }}" - the outer {{ }} with spaces won't match the pattern
      const result = renderTemplate(template, variables);
      // The pattern /\{\{\s*[a-zA-Z]...\s*\}\}/ requires the identifier directly after {{
      // So "{{ 18 }}" won't match anything because 18 is not a valid identifier
      expect(result).toContain('18');
    });

    it('should throw error for null template', () => {
      expect(() => renderTemplate(null as any, new Map())).toThrow(
        GeneratorError,
      );
    });

    it('should throw error for undefined template', () => {
      expect(() => renderTemplate(undefined as any, new Map())).toThrow(
        GeneratorError,
      );
    });

    it('should throw error for non-string template', () => {
      expect(() => renderTemplate(123 as any, new Map())).toThrow(
        GeneratorError,
      );
    });

    it('should throw error for null variables', () => {
      expect(() => renderTemplate('test', null as any)).toThrow(
        GeneratorError,
      );
    });

    it('should throw error for non-Map variables', () => {
      expect(() => renderTemplate('test', {} as any)).toThrow(
        GeneratorError,
      );
    });
  });

  describe('Array-Based Rendering', () => {
    it('should render from TemplateVariable array', () => {
      const template = 'Node {{nodeVersion}}, package manager {{packageManager}}';
      const variables: TemplateVariable[] = [
        { key: 'nodeVersion', value: '18' },
        { key: 'packageManager', value: 'npm' },
      ];
      const result = renderTemplateFromArray(template, variables);
      expect(result).toBe('Node 18, package manager npm');
    });

    it('should handle empty variable array', () => {
      const template = 'No variables';
      const variables: TemplateVariable[] = [];
      const result = renderTemplateFromArray(template, variables);
      expect(result).toBe('No variables');
    });

    it('should throw error for undefined variable in array', () => {
      const template = '{{nodeVersion}}';
      const variables: TemplateVariable[] = [];
      expect(() => renderTemplateFromArray(template, variables)).toThrow(
        GeneratorError,
      );
    });
  });

  describe('Placeholder Detection', () => {
    it('should detect unrendered Handlebars placeholders', () => {
      const unrendered = 'Value: {{nodeVersion}}';
      expect(hasUnrenderedPlaceholders(unrendered)).toBe(true);
    });

    it('should not detect rendered placeholders', () => {
      const rendered = 'Value: 18';
      expect(hasUnrenderedPlaceholders(rendered)).toBe(false);
    });

    it('should ignore GitHub Actions syntax when checking', () => {
      const githubSyntax = 'Value: ${{ secrets.TOKEN }}';
      expect(hasUnrenderedPlaceholders(githubSyntax)).toBe(false);
    });

    it('should detect multiple unrendered placeholders', () => {
      const unrendered = '{{nodeVersion}} and {{buildCommand}}';
      expect(hasUnrenderedPlaceholders(unrendered)).toBe(true);
    });
  });

  describe('Allowed Variables API', () => {
    it('should return list of allowed variables', () => {
      const allowed = getAllowedVariables();
      expect(allowed).toBeInstanceOf(Array);
      expect(allowed.length).toBeGreaterThan(0);
      expect(allowed).toContain('nodeVersion');
      expect(allowed).toContain('packageManager');
    });

    it('should have all expected variables in allowlist', () => {
      const allowed = getAllowedVariables();
      expect(allowed).toContain('nodeVersion');
      expect(allowed).toContain('packageManager');
      expect(allowed).toContain('installCommand');
      expect(allowed).toContain('buildCommand');
      expect(allowed).toContain('testCommand');
      expect(allowed).toContain('framework');
      expect(allowed).toContain('environments');
    });

    it('should return sorted list', () => {
      const allowed = getAllowedVariables();
      const sorted = [...allowed].sort();
      expect(allowed).toEqual(sorted);
    });

    it('should validate allowed variable', () => {
      expect(isAllowedVariable('nodeVersion')).toBe(true);
      expect(isAllowedVariable('packageManager')).toBe(true);
    });

    it('should reject disallowed variable', () => {
      expect(isAllowedVariable('customVar')).toBe(false);
      expect(isAllowedVariable('node-version')).toBe(false);
    });

    it('should reject variable with invalid format', () => {
      expect(isAllowedVariable('1nodeVersion')).toBe(false);
      expect(isAllowedVariable('node version')).toBe(false);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should render a GitHub Actions workflow template', () => {
      const template = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: {{nodeVersion}}
      - run: {{installCommand}}
      - run: {{buildCommand}}
      - run: {{testCommand}}
`;
      const variables = new Map([
        ['nodeVersion', '18'],
        ['installCommand', 'npm install'],
        ['buildCommand', 'npm run build'],
        ['testCommand', 'npm test'],
      ]);
      const result = renderTemplate(template, variables);
      expect(result).toContain('node-version: 18');
      expect(result).toContain('run: npm install');
      expect(result).toContain('run: npm run build');
      expect(result).toContain('run: npm test');
      expect(result).not.toContain('{{');
    });

    it('should render Dockerfile template', () => {
      const template = `FROM node:{{nodeVersion}}-alpine
RUN {{installCommand}}
RUN {{buildCommand}}
`;
      const variables = new Map([
        ['nodeVersion', '18'],
        ['installCommand', 'npm install'],
        ['buildCommand', 'npm run build'],
      ]);
      const result = renderTemplate(template, variables);
      expect(result).toContain('FROM node:18-alpine');
      expect(result).toContain('npm install');
      expect(result).toContain('npm run build');
    });

    it('should handle GenerationPlan template rendering', () => {
      const template = `registry: docker.io/{{framework}}-app
node-version: {{nodeVersion}}
package-manager: {{packageManager}}
commands:
  install: {{installCommand}}
  build: {{buildCommand}}
  test: {{testCommand}}
`;
      const variables = new Map([
        ['framework', 'react'],
        ['nodeVersion', '20'],
        ['packageManager', 'npm'],
        ['installCommand', 'npm install'],
        ['buildCommand', 'npm run build'],
        ['testCommand', 'npm test'],
      ]);
      const result = renderTemplate(template, variables);
      expect(result).toContain('registry: docker.io/react-app');
      expect(result).toContain('node-version: 20');
      expect(result).toContain('package-manager: npm');
    });
  });

  describe('Integration with GenerationPlan', () => {
    it('should render all template variables from ruleEngine output', () => {
      // Simulate variables from buildGenerationPlan() in ruleEngine
      const variables = new Map([
        ['nodeVersion', '18'],
        ['packageManager', 'npm'],
        ['installCommand', 'npm install'],
        ['buildCommand', 'npm run build'],
        ['testCommand', 'npm test'],
        ['framework', 'react'],
      ]);

      const ciTemplate = `
name: Build
jobs:
  ci:
    strategy:
      matrix:
        node-version: [{{nodeVersion}}]
    steps:
      - run: {{installCommand}}
      - run: {{buildCommand}}
      - run: {{testCommand}}
`;

      const result = renderTemplate(ciTemplate, variables);
      expect(result).not.toContain('{{');
      expect(result).toContain('18');
      expect(result).toContain('npm install');
    });
  });
});
