import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { logger } from '../../src/utils/logger';

const execAsync = promisify(exec);

describe('CLI and Logger Smoke Tests', () => {
  const cliPath = path.resolve(__dirname, '../../dist/cli/index.js');

  it('exits with code 0 when run with --help', async () => {
    const { stdout, stderr } = await execAsync(`node "${cliPath}" --help`);
    expect(stderr).toBe('');
    expect(stdout).toContain('Automated CI/CD Pipeline Generator');
    expect(stdout).toContain('Usage: devforge');
  });

  it('exits with code 1 for unknown commands', async () => {
    let threw = false;
    try {
      await execAsync(`node "${cliPath}" invalidcommand`);
    } catch (err: any) {
      threw = true;
      expect(err.code).toBe(1);
      expect(err.stderr).toContain("error: unknown command 'invalidcommand'");
    }
    expect(threw).toBe(true);
  });

  it('logger does not write to stdout/stderr when NODE_ENV=test', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    logger.info('suppressed info');
    logger.success('suppressed success');
    logger.warn('suppressed warn');
    logger.error('suppressed error');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('CLI direct module coverage', () => {
    let originalArgv: string[];

    beforeAll(() => {
      originalArgv = process.argv;
    });

    afterAll(() => {
      process.argv = originalArgv;
    });

    it('requires the CLI shebang file and triggers init action', () => {
      process.argv = ['node', 'devforge', 'init'];
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);

      jest.isolateModules(() => {
        require('../../src/cli/index');
      });

      exitSpy.mockRestore();
    });

    it('requires the CLI shebang file and triggers update action', () => {
      process.argv = ['node', 'devforge', 'update'];
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);

      jest.isolateModules(() => {
        require('../../src/cli/index');
      });

      exitSpy.mockRestore();
    });

    it('requires the CLI shebang file and triggers audit action', () => {
      process.argv = ['node', 'devforge', 'audit'];
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);

      jest.isolateModules(() => {
        require('../../src/cli/index');
      });

      exitSpy.mockRestore();
    });

    it('requires the CLI shebang file and triggers preview action', () => {
      process.argv = ['node', 'devforge', 'preview'];
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);

      jest.isolateModules(() => {
        require('../../src/cli/index');
      });

      exitSpy.mockRestore();
    });
  });
});
