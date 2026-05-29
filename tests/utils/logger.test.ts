describe('logger', () => {
  let originalEnv: string | undefined;
  let logger: any;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeAll(() => {
    originalEnv = process.env.NODE_ENV;
    // Set to non-test so the logging code is executed
    process.env.NODE_ENV = 'development';
    // Use dynamic require so that the module evaluates with the new env variable
    logger = require('../../src/utils/logger').logger;
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('info method logs message and args to console.log', () => {
    logger.info('hello info', 'extra');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[devforge]'), 'hello info', 'extra');
  });

  it('success method logs message and args to console.log', () => {
    logger.success('hello success', 'yay');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[✓]'), 'hello success', 'yay');
  });

  it('warn method logs message and args to console.warn', () => {
    logger.warn('hello warn', 'warning');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[!]'), 'hello warn', 'warning');
  });

  it('error method logs message and args to console.error', () => {
    logger.error('hello error', 'fatal');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[✗]'), 'hello error', 'fatal');
  });
});
