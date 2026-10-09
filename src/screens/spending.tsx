import { router, Tabs, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Action, ErrorMessage, Field } from '../components/form';
import { formatOMR, localDate, validateMonth, type MonthReport } from '../data/grocery';
import { useGrocery } from '../data/provider';

type ReadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; report: MonthReport };
export default function Spending() {
  const grocery = useGrocery();
  const [selection, setSelection] = useState(() => ({ month: localDate().slice(0, 7) }));
  const month = selection.month;
  const [draftMonth, setDraftMonth] = useState(month);
  const [monthError, setMonthError] = useState('');
  const [read, setRead] = useState<ReadState>({ status: 'loading' });
  useFocusEffect(useCallback(() => {
    let active = true;
    setRead({ status: 'loading' });
    void grocery.getMonth(selection.month).then((report) => { if (active) setRead({ status: 'ready', report }); })
      .catch((error: unknown) => { if (active) setRead({ status: 'error', message: error instanceof Error ? error.message : 'Could not read this month.' }); });
    return () => { active = false; };
  }, [grocery, selection]));
  const chooseMonth = () => {
    try { validateMonth(draftMonth.trim()); setSelection({ month: draftMonth.trim() }); setMonthError(''); }
    catch (error) { setMonthError(error instanceof Error ? error.message : 'Choose a valid month.'); }
  };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
    <Tabs.Screen options={{ headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Add purchase" onPress={() => router.push({ pathname: '/purchase', params: { month } })} style={{ padding: 14, minHeight: 48 }}><Text style={{ color: '#21643c', fontSize: 18 }}>Add</Text></Pressable> }} />
    <Field label="Year and month (YYYY-MM)" value={draftMonth} onChangeText={setDraftMonth} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={chooseMonth} />
    <Action label="Show month" onPress={chooseMonth} />
    {monthError ? <ErrorMessage message={monthError} /> : null}
    {read.status === 'loading' ? <ActivityIndicator accessibilityLabel="Loading monthly purchases" /> : read.status === 'error' ? <><ErrorMessage message={read.message} /><Action label="Retry month" onPress={() => setSelection({ month })} /></> : <>
      <Text selectable accessibilityRole="header" style={{ fontSize: 24, fontVariant: ['tabular-nums'] }}>{month} total · {formatOMR(read.report.total)} OMR</Text>
      {read.report.purchases.length === 0 ? <Text>No purchases in this month. Tap Add to record one.</Text> : read.report.purchases.map((purchase) => <View key={purchase.id} style={{ padding: 16, gap: 6, borderWidth: 1, borderColor: '#657469', borderRadius: 10, backgroundColor: '#fff' }}>
        <Text selectable style={{ fontSize: 20, color: '#17251b' }}>{purchase.product}</Text>
        <Text selectable>Brand · {purchase.brand ?? 'No brand'}</Text>
        <Text selectable>Category · {purchase.category}{purchase.subcategory ? ` / ${purchase.subcategory}` : ''}</Text>
        <Text selectable>Store · {purchase.store}</Text>
        <Text selectable>{purchase.quantity} items × {formatOMR(purchase.unitPrice)} OMR each</Text>
        <Text selectable style={{ fontSize: 18, fontVariant: ['tabular-nums'] }}>Line total · {formatOMR(purchase.lineTotal)} OMR</Text>
        <Text selectable>{purchase.purchaseDate ?? 'Exact purchase date not supplied'}</Text>
      </View>)}
    </>}
  </ScrollView>;
}
