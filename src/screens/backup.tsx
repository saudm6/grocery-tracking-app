import { getDocumentAsync } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { shareAsync } from 'expo-sharing';
import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { Action, ErrorMessage } from '../components/form';
import { BackupError, backupFileName, checkBackup, importBackup, type BackupSummary } from '../data/backup';
import { localDate } from '../data/grocery';
import { useDatabase } from '../data/provider';

// The picked file is opened from its own folder, not deserialized: exports keep SQLite's WAL flag, which in-memory databases refuse.
const staging = () => new Directory(Paths.cache, 'backup-import');
const discard = () => { try { const folder = staging(); if (folder.exists) folder.delete(); } catch {} };
async function withPicked<T>(work: (backup: SQLiteDatabase) => Promise<T>): Promise<T> {
  const backup = await openDatabaseAsync('backup.db', { useNewConnection: true }, staging().uri);
  try { return await work(backup); } finally { await backup.closeAsync().catch(() => {}); }
}
const summarize = ({ purchases, products }: BackupSummary) => `${purchases} purchase${purchases === 1 ? '' : 's'} and ${products} product${products === 1 ? '' : 's'}`;
type Step = 'export' | 'check' | 'import';

export default function BackupPage() {
  const database = useDatabase();
  const [busy, setBusy] = useState<Step | null>(null);
  const [picked, setPicked] = useState<{ name: string; summary: BackupSummary } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const running = useRef(false);
  const run = async (step: Step, work: () => Promise<void>, fallback: string) => {
    if (running.current) return;
    running.current = true;
    setBusy(step); setError(''); setNotice('');
    try { await work(); } catch (failure) {
      if (step !== 'export') { discard(); setPicked(null); }
      // Only backup.ts messages are shown as written. Picker, file and SQLite messages are replaced by the step's plain sentence.
      setError(`${failure instanceof BackupError ? failure.message : fallback} ${step === 'export' ? 'Your data is unchanged.' : 'Your current data was kept.'}`);
    } finally { running.current = false; setBusy(null); }
  };
  const exportBackup = () => run('export', async () => {
    const file = new File(Paths.cache, backupFileName(localDate()));
    file.write(await database.serializeAsync());
    await shareAsync(file.uri, { mimeType: 'application/vnd.sqlite3', UTI: 'public.database', dialogTitle: 'Save grocery backup' });
    setNotice(`Backup file ${file.name} is ready. Check that it was saved where you sent it.`);
  }, 'Could not export a backup.');
  const chooseBackup = () => run('check', async () => {
    const result = await getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    discard();
    staging().create({ intermediates: true });
    await new File(result.assets[0].uri).move(new File(staging(), 'backup.db'));
    setPicked({ name: result.assets[0].name, summary: await withPicked((backup) => checkBackup(backup)) });
  }, 'Could not read the chosen file.');
  const replaceData = () => run('import', async () => {
    const summary = await withPicked((backup) => importBackup(backup, () => backupDatabaseAsync({ sourceDatabase: backup, destDatabase: database })));
    discard();
    setPicked(null);
    router.dismissTo('/');
    Alert.alert('Backup imported', `Your groceries now show the backup: ${summarize(summary)}.`);
  }, 'Could not import this backup.');
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
    <Text>A backup is one file with all your groceries: purchases, products, codes, saved prices, price history, brands, categories, subcategories and stores.</Text>
    {notice ? <Text selectable accessibilityLiveRegion="polite">{notice}</Text> : null}
    {error ? <ErrorMessage message={error} /> : null}
    {picked ? <>
      <Text accessibilityRole="alert">Replace all current data with {picked.name}? The backup has {summarize(picked.summary)}. Everything recorded in this app now is deleted and replaced by the backup.</Text>
      <Action label={busy === 'import' ? 'Importing backup…' : 'Replace all data with this backup'} disabled={busy !== null} onPress={() => { void replaceData(); }} />
      <Action label="Cancel import" disabled={busy !== null} onPress={() => { discard(); setPicked(null); }} />
    </> : <>
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>Export</Text>
      <Text>Export backup makes the file and opens the share sheet. Save it to Files, AirDrop it or email it.</Text>
      <Action label={busy === 'export' ? 'Exporting backup…' : 'Export backup'} disabled={busy !== null} onPress={() => { void exportBackup(); }} />
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>Import</Text>
      <Text>Import backup replaces all data in this app with a backup file. The file is checked first, and nothing is replaced until you confirm.</Text>
      <Action label={busy === 'check' ? 'Checking backup…' : 'Import backup'} disabled={busy !== null} onPress={() => { void chooseBackup(); }} />
    </>}
  </ScrollView>;
}
