#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from '../utils/logger';
import { initCommand } from './initCommand';

const program = new Command();

program
  .name('devforge')
  .description('Automated CI/CD Pipeline Generator and Deployment Automation Tool')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize a new CI/CD workflow configuration')
  .option('--dry-run', 'Simulate generation without writing files')
  .option('--force-detect', 'Skip detection cache and re-detect project')
  .option('--preview', 'Show file previews before generating')
  .action(async (options) => {
    try {
      await initCommand(process.cwd(), {
        dryRun: options.dryRun ?? false,
        forceDetect: options.forceDetect ?? false,
        preview: options.preview ?? false,
      });
    } catch (err) {
      logger.error('\n✗ DevForge initialization failed');
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  });

program
  .command('update')
  .description('Update existing workflow files with latest template versions')
  .action(() => {
    updateCommand();
  });

program
  .command('audit')
  .description('Audit generated workflows for security misconfigurations')
  .action(() => {
    auditCommand();
  });

program
  .command('preview')
  .description('Preview generated workflows before writing to disk')
  .action(() => {
    previewCommand();
  });

function updateCommand(): void {
  logger.warn('Command not yet implemented');
}

function auditCommand(): void {
  logger.warn('Command not yet implemented');
}

function previewCommand(): void {
  logger.warn('Command not yet implemented');
}

// Parse command line arguments
program.parse(process.argv);
