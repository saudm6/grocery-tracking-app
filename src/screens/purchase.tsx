import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import { Action, ErrorMessage, Field } from '../components/form';
import { ReferenceField } from '../components/reference-field';
import { formatOMR, lineTotal, localDate, parseOMR, parseQuantity, referenceNameKey, type Reference, type ReferenceRow, type References } from '../data/grocery';
import { useGrocery } from '../data/provider';
import { createSubmission } from '../data/submission';

export default function Purchase() {
  const params = useLocalSearchParams<{ month?: string }>();
  const grocery = useGrocery();
  const [draft, setDraft] = useState({ month: typeof params.month === 'string' ? params.month : localDate().slice(0, 7), name: '', category: '', quantity: '1', price: '', date: '' });
  const [brand, setBrand] = useState<Reference>({ name: '' });
  const [store, setStore] = useState<Reference>({ name: '' });
  const [status, setStatus] = useState<'editing' | 'saving'>('editing');
  const [error, setError] = useState('');
  const [references, setReferences] = useState<References | null>(null);
  const [referencesError, setReferencesError] = useState('');
  const readId = useRef(0);
  const refreshReferences = useCallback(() => {
    const request = ++readId.current;
    void grocery.listReferences().then((records) => { if (readId.current === request) { setReferences(records); setReferencesError(''); } })
      .catch(() => { if (readId.current === request) setReferencesError('Could not load saved references. Retry before saving.'); });
    return () => { readId.current++; };
  }, [grocery]);
  useFocusEffect(refreshReferences);
  const submit = useRef(createSubmission((pending) => setStatus(pending ? 'saving' : 'editing'))).current;
  const set = (key: keyof typeof draft) => (value: string) => setDraft((previous) => ({ ...previous, [key]: value }));
  let preview = '';
  try { preview = `${formatOMR(lineTotal(parseQuantity(draft.quantity), parseOMR(draft.price)))} OMR`; } catch {}
  const selection = (text: string, rows: ReferenceRow[]): Reference => {
    const saved = text.trim() ? rows.find((row) => row.nameKey === referenceNameKey(text)) : undefined;
    return saved ? { id: saved.id } : { name: text };
  };
  const hint = (text: string, rows: ReferenceRow[], kind: string) => {
    if (!text.trim()) return null;
    const selected = selection(text, rows);
    return <Text>{selected.id ? `Use saved ${kind} · ${rows.find((row) => row.id === selected.id)!.name}` : `Create new ${kind} · ${text.trim()}`}</Text>;
  };
  const save = async () => {
    try {
      await submit(async () => {
        if (!references) throw new Error('Wait for saved references to load.');
        setError('');
        const result = await grocery.recordPurchase({ product: { name: draft.name, brand: brand.id !== undefined || brand.name.trim() ? brand : null, grouping: { category: selection(draft.category, references.categories) } }, store, month: draft.month.trim(), purchaseDate: draft.date.trim(), quantity: draft.quantity, unitPrice: draft.price });
        router.back();
        return result;
      });
    } catch (failure) { setError(`${failure instanceof Error ? failure.message : 'Could not save the purchase.'} Your entries are kept. Correct them or retry.`); refreshReferences(); }
  };
  const editing = status === 'editing';
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      <Text>Enter one new product and the price paid for each item. Choose saved brands and stores or enter new names.</Text>
      <Field label="Purchase month (YYYY-MM)" value={draft.month} editable={false} />
      <Field label="Product name" value={draft.name} onChangeText={set('name')} editable={editing} autoFocus />
      <ReferenceField label="Brand (optional)" kind="brand" value={brand} onChange={setBrand} rows={references?.brands ?? []} editable={editing} />
      <Field label="Category" value={draft.category} onChangeText={set('category')} editable={editing} />
      {references ? hint(draft.category, references.categories, 'category') : null}
      <ReferenceField label="Store" kind="store" value={store} onChange={setStore} rows={references?.stores ?? []} editable={editing} />
      <Field label="Quantity (whole items)" value={draft.quantity} onChangeText={set('quantity')} editable={editing} keyboardType="number-pad" />
      <Field label="Unit price (OMR)" value={draft.price} onChangeText={set('price')} editable={editing} keyboardType="decimal-pad" placeholder="0.000" />
      <Field label="Purchase date (optional, YYYY-MM-DD)" value={draft.date} onChangeText={set('date')} editable={editing} autoCapitalize="none" autoCorrect={false} returnKeyType="done" />
      <Text selectable>Line total · {preview || 'Enter a valid price and quantity'}</Text>
      <Text>Current-month purchases set the saved price and store. Older receipts affect spending only.</Text>
      {error ? <ErrorMessage message={error} /> : null}
      {referencesError ? <><ErrorMessage message={referencesError} /><Action label="Retry saved references" onPress={refreshReferences} /></> : null}
      <Action label={!references ? 'Loading saved references…' : editing ? 'Save purchase' : 'Saving purchase…'} disabled={!editing || !references || !!referencesError} onPress={() => { void save(); }} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
