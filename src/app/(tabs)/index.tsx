import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { Action, ErrorMessage, Field } from '../../components/form';
import { formatOMR, localDate, validateMonth, type HomeAnalytics } from '../../data/grocery';
import { useGrocery } from '../../data/provider';

type ReadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; report: HomeAnalytics };
export default function Home() {
  const grocery = useGrocery();
  const [selection, setSelection] = useState(() => ({ month: localDate().slice(0, 7) }));
  const month = selection.month;
  const [draftMonth, setDraftMonth] = useState(month);
  const [monthError, setMonthError] = useState('');
  const [read, setRead] = useState<ReadState>({ status: 'loading' });
  useFocusEffect(useCallback(() => {
    let active = true;
    setRead({ status: 'loading' });
    void grocery.getHomeAnalytics(selection.month).then((report) => { if (active) setRead({ status: 'ready', report }); })
      .catch((error: unknown) => { if (active) setRead({ status: 'error', message: error instanceof Error ? error.message : 'Could not read this month.' }); });
    return () => { active = false; };
  }, [grocery, selection]));
  const chooseMonth = () => {
    try { validateMonth(draftMonth.trim()); setSelection({ month: draftMonth.trim() }); setMonthError(''); }
    catch (error) { setMonthError(error instanceof Error ? error.message : 'Choose a valid month.'); }
  };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
    <Field label="Year and month (YYYY-MM)" value={draftMonth} onChangeText={setDraftMonth} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={chooseMonth} />
    <Action label="Show month" onPress={chooseMonth} />
    {monthError ? <ErrorMessage message={monthError} /> : null}
    <Link href="/spending" accessibilityLabel="Open Total Spending" style={{ fontSize: 18, color: '#21643c', paddingVertical: 12 }}>Open Total Spending</Link>
    {read.status === 'loading' ? <ActivityIndicator accessibilityLabel="Loading monthly analytics" /> : read.status === 'error' ? <>
      <ErrorMessage message={read.message} />
      <Text>Your month selection is kept. Retry to read the saved purchases.</Text>
      <Action label="Retry monthly analytics" onPress={() => setSelection({ month })} />
    </> : <>
      <Text selectable accessibilityRole="header" style={{ fontSize: 24, fontVariant: ['tabular-nums'] }}>{read.report.month} total · {formatOMR(read.report.total)} OMR</Text>
      {read.report.purchaseCount === 0 ? <Text>No purchases in this month. Open Total Spending to record one.</Text> : null}
      {read.report.previousMonth === null ? <Text>Prior-month comparison is unavailable before 0001-01.</Text> : <>
        <Text selectable accessibilityRole="header" style={{ fontSize: 22 }}>Compared with {read.report.previousMonth}</Text>
        <Text selectable>Previous total · {formatOMR(read.report.previousTotal!)} OMR</Text>
        <Text selectable>Change · {read.report.difference! > 0 ? '+' : read.report.difference! < 0 ? '-' : ''}{formatOMR(Math.abs(read.report.difference!))} OMR</Text>
        {read.report.percentChange === null ? <Text>The prior month has no paid spending. Percentage comparison is unavailable.</Text>
          : <Text selectable>Percentage change · {read.report.percentChange > 0 ? '+' : ''}{read.report.percentChange.toFixed(2)}%</Text>}
      </>}
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>Spending by category</Text>
      {read.report.categories.length === 0 ? <Text>No category spending in this month.</Text> : read.report.categories.map((category) =>
        <Text key={category.id} selectable style={{ fontSize: 18 }}>{category.name} · {formatOMR(category.total)} OMR</Text>)}
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>Spending by subcategory</Text>
      <Text>Direct-category purchases count in category and store totals. Subcategory amounts use each purchase&apos;s recorded subcategory and its current parent.</Text>
      {read.report.subcategories.length === 0 ? <Text>No subcategory spending in this month.</Text> : read.report.subcategories.map((child) =>
        <Text key={child.id} selectable style={{ fontSize: 18 }}>{child.category} / {child.name} · {formatOMR(child.total)} OMR</Text>)}
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>Spending by store</Text>
      {read.report.stores.length === 0 ? <Text>No store spending in this month.</Text> : read.report.stores.map((store) =>
        <Text key={store.id} selectable style={{ fontSize: 18 }}>{store.name} · {formatOMR(store.total)} OMR</Text>)}
    </>}
  </ScrollView>;
}
