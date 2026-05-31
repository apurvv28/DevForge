import { DevForgeFS } from '../utils/fs';

export interface TransactionEntry {
  path: string;
  action: 'write' | 'backup';
  previousContent?: string | undefined;
}

export interface TransactionRecord {
  planHash?: string;
  transaction: TransactionEntry[];
  errors?: Array<{ path: string; error: string }>;
}

export async function listTransactionFiles(fs: DevForgeFS): Promise<string[]> {
  const exists = await fs.fileExists('.devforge/transactions');
  if (!exists) return [];
  const files = await fs.listFiles('.devforge/transactions');
  // return relative paths under the transactions dir
  return files.map((f) => `.devforge/transactions/${f}`);
}

export async function loadTransaction(fs: DevForgeFS, txPath: string): Promise<TransactionRecord> {
  const content = await fs.readFile(txPath);
  return JSON.parse(content) as TransactionRecord;
}

export async function rollbackTransaction(fs: DevForgeFS, txPath: string): Promise<string[]> {
  const messages: string[] = [];
  const tx = await loadTransaction(fs, txPath);
  if (!tx || !tx.transaction) throw new Error('Invalid transaction file');

  // Apply actions in reverse order
  for (let i = tx.transaction.length - 1; i >= 0; i--) {
    const entry = tx.transaction[i];
    if (!entry) continue;
    try {
      if (entry.action === 'backup') {
        // Restore previous content back to the path
        if (entry.previousContent !== undefined) {
          await fs.writeFile(entry.path, entry.previousContent);
          messages.push(`Restored backup for ${entry.path}`);
        }
      } else if (entry.action === 'write') {
        if (entry.previousContent !== undefined) {
          // Restore previous content
          await fs.writeFile(entry.path, entry.previousContent);
          messages.push(`Restored previous content for ${entry.path}`);
        } else {
          // No previous content — remove the newly written file
          if (await fs.fileExists(entry.path)) {
            await fs.removeFile(entry.path);
            messages.push(`Removed generated file ${entry.path}`);
          }
        }
      }
    } catch (err) {
      messages.push(`Failed to rollback ${entry.path}: ${String(err)}`);
    }
  }

  return messages;
}

export default {
  listTransactionFiles,
  loadTransaction,
  rollbackTransaction,
};
