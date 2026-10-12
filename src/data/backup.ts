import { initializeDatabase, type Database, type Executor } from './grocery';
import { migrations } from './schema';

const tables = ['brands', 'categories', 'stores', 'subcategories', 'products', 'product_codes', 'purchases', 'price_history'];
const foreign = 'This file is not a grocery backup.';
const damaged = 'This backup file is damaged.';
export type BackupSummary = { purchases: number; products: number };

export const backupFileName = (date: string) => `grocery-backup-${date}.db`;

export async function checkBackup(backup: Executor, versions: readonly string[] = migrations): Promise<BackupSummary> {
  let integrity: { integrity_check: string }[];
  try { integrity = await backup.getAllAsync('PRAGMA integrity_check'); }
  catch (error) { throw new Error(error instanceof Error && /malformed/.test(error.message) ? damaged : foreign); }
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error(damaged);
  const present = new Set((await backup.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((row) => row.name));
  const version = (await backup.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  if (version < 1 || tables.some((table) => !present.has(table))) throw new Error(foreign);
  if (version > versions.length) throw new Error('This backup comes from a newer version of the app. Update the app, then import it again.');
  if ((await backup.getAllAsync('PRAGMA foreign_key_check')).length) throw new Error(damaged);
  return (await backup.getFirstAsync<BackupSummary>('SELECT (SELECT count(*) FROM purchases) AS purchases, (SELECT count(*) FROM products) AS products'))!;
}

// `backup` is a disposable copy of the picked file. It is upgraded before `copy` replaces the live data, so a failed upgrade changes nothing.
export async function importBackup(backup: Database, copy: () => Promise<void>, versions: readonly string[] = migrations): Promise<BackupSummary> {
  const summary = await checkBackup(backup, versions);
  try { await initializeDatabase(backup, versions); } catch { throw new Error('This backup could not be upgraded to this version of the app.'); }
  try { await copy(); } catch { throw new Error('The backup could not be copied into the app.'); }
  return summary;
}
