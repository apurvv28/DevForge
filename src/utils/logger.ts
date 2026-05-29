import chalk from 'chalk';

const isTest = process.env.NODE_ENV === 'test';

export const logger = {
  info(message: string, ...args: unknown[]): void {
    if (isTest) return;
    console.log(chalk.blue('[devforge]'), message, ...args);
  },
  success(message: string, ...args: unknown[]): void {
    if (isTest) return;
    console.log(chalk.green('[✓]'), message, ...args);
  },
  warn(message: string, ...args: unknown[]): void {
    if (isTest) return;
    console.warn(chalk.yellow('[!]'), message, ...args);
  },
  error(message: string, ...args: unknown[]): void {
    if (isTest) return;
    console.error(chalk.red('[✗]'), message, ...args);
  },
};
