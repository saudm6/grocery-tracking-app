import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { Action, ErrorMessage } from '../components/form';
import { createGrocery, initializeDatabase, type Grocery } from './grocery';

type Ready = { status: 'ready'; grocery: Grocery; database: SQLiteDatabase };
const Context = createContext<Ready | null>(null);
type Startup = { status: 'loading' } | { status: 'failed'; error: string } | Ready;
export function GroceryProvider({ children }: PropsWithChildren) {
  const [attempt, setAttempt] = useState(0);
  const [startup, setStartup] = useState<Startup>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    const opening = (async () => {
      const connection = await openDatabaseAsync('grocery.db', { useNewConnection: true });
      try {
        await initializeDatabase(connection);
        if (active) setStartup({ status: 'ready', grocery: createGrocery(connection), database: connection });
        return connection;
      } catch (error) {
        await connection.closeAsync();
        throw error;
      }
    })();
    void opening.catch((error: unknown) => {
      if (active) setStartup({ status: 'failed', error: error instanceof Error ? error.message : 'The local database could not open.' });
    });
    return () => { active = false; void opening.then((db) => db.closeAsync()).catch(() => {}); };
  }, [attempt]);
  if (startup.status === 'ready') return <Context value={startup}>{children}</Context>;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, paddingTop: 72, gap: 20 }}>
    <Text accessibilityRole="header" style={{ fontSize: 26 }}>Grocery tracker</Text>
    {startup.status === 'loading' ? <><ActivityIndicator accessibilityLabel="Opening local database" /><Text>Opening your groceries…</Text></> : <>
      <ErrorMessage message={`Could not open your groceries. ${startup.error}`} />
      <Text>Your database has been kept. Retry to open it again.</Text>
      <Action label="Retry opening database" onPress={() => { setStartup({ status: 'loading' }); setAttempt((value) => value + 1); }} />
    </>}
  </ScrollView>;
}
function useReady(): Ready {
  const ready = use(Context);
  if (!ready) throw new Error('Grocery data must be ready before a screen mounts.');
  return ready;
}
export function useGrocery(): Grocery { return useReady().grocery; }
// Only the Backup page uses the connection itself, to copy the whole database.
export function useDatabase(): SQLiteDatabase { return useReady().database; }
