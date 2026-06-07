/* eslint-disable security/detect-non-literal-fs-filename */
import * as fs from 'fs/promises';
import type { RmOptions } from 'fs';
import path from 'path';

function resolveAbsolutePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path');
  }
  return path.resolve(filePath);
}

export async function safeAccess(filePath: string): Promise<void> {
  await fs.access(resolveAbsolutePath(filePath));
}

export async function safeReadFile(
  filePath: string,
  encoding: BufferEncoding = 'utf-8',
): Promise<string> {
  return fs.readFile(resolveAbsolutePath(filePath), encoding);
}

export async function safeWriteFile(
  filePath: string,
  data: string,
  encoding: BufferEncoding = 'utf-8',
): Promise<void> {
  await fs.mkdir(path.dirname(resolveAbsolutePath(filePath)), { recursive: true });
  await fs.writeFile(resolveAbsolutePath(filePath), data, encoding);
}

export async function safeMkdir(filePath: string): Promise<void> {
  await fs.mkdir(resolveAbsolutePath(filePath), { recursive: true });
}

export async function safeUnlink(filePath: string): Promise<void> {
  await fs.unlink(resolveAbsolutePath(filePath));
}

export async function safeRm(filePath: string, options?: RmOptions): Promise<void> {
  await fs.rm(resolveAbsolutePath(filePath), options);
}
