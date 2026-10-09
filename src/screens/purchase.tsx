import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import { Action, ErrorMessage, Field } from '../components/form';
import { formatOMR, lineTotal, localDate, parseOMR, parseQuantity, referenceNameKey, type Reference, type ReferenceRow, type References } from '../data/grocery';
import { useGrocery } from '../data/provider';
import { createSubmission } from '../data/submission';

export default function Purchase() {
  const params = useLocalSearchParams<{ month?: string }>();
  const grocery = useGrocery();
  const [draft, setDraft] = useState({ month: typeof params.month === 'string' ? params.month : localDate().slice(0, 7), name: '', brand: '', category: '', store: '', quantity: '1', price: '', date: '' });
  const [status, setStatus] = useState<'editing' | 'saving'>('editing');
  const [error, setError] = useState('');
  const [references, setReferences] = useState<References | null>(null);
  const [referencesError, setReferencesError] = useState('');
  const [referencesAttempt, setReferencesAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void grocery.listReferences().then((records) => { if (active) { setReferences(records); setReferencesError(''); } })
      .catch(() => { if (active) setReferencesError('Could not load saved references. Retry before saving.'); });
    return () => { active = false; };
  }, [grocery, referencesAttempt]);
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
        const result = await grocery.recordPurchase({ product: { name: draft.name, brand: draft.brand.trim() ? selection(draft.brand, references.brands) : null, grouping: { category: selection(draft.category, references.categories) } }, store: selection(draft.store, references.stores), month: draft.month.trim(), purchaseDate: draft.date.trim(), quantity: draft.quantity, unitPrice: draft.price });
        router.back();
        return result;
      });
    } catch (failure) { setError(`${failure instanceof Error ? failure.message : 'Could not save the purchase.'} Your entries are kept. Correct them or retry.`); setReferencesAttempt((value) => value + 1); }
  };
  const editing = status === 'editing';
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      <Text>Enter one new product and the price paid for each item. Existing reference names are reused.</Text>
      <Field label="Purchase month (YYYY-MM)" value={draft.month} editable={false} />
      <Field label="Product name" value={draft.name} onChangeText={set('name')} editable={editing} autoFocus />
      <Field label="Brand (optional)" value={draft.brand} onChangeText={set('brand')} editable={editing} />
      {references ? hint(draft.brand, references.brands, 'brand') : null}
      <Field label="Category" value={draft.category} onChangeText={set('category')} editable={editing} />
      {references ? hint(draft.category, references.categories, 'category') : null}
      <Field label="Store" value={draft.store} onChangeText={set('store')} editable={editing} />
      {references ? hint(draft.store, references.stores, 'store') : null}
      <Field label="Quantity (whole items)" value={draft.quantity} onChangeText={set('quantity')} editable={editing} keyboardType="number-pad" />
      <Field label="Unit price (OMR)" value={draft.price} onChangeText={set('price')} editable={editing} keyboardType="decimal-pad" placeholder="0.000" />
      <Field label="Purchase date (optional, YYYY-MM-DD)" value={draft.date} onChangeText={set('date')} editable={editing} autoCapitalize="none" autoCorrect={false} returnKeyType="done" />
      <Text selectable>Line total · {preview || 'Enter a valid price and quantity'}</Text>
      <Text>Current-month purchases set the saved price and store. Older receipts affect spending only.</Text>
      {error ? <ErrorMessage message={error} /> : null}
      {referencesError ? <><ErrorMessage message={referencesError} /><Action label="Retry saved references" onPress={() => setReferencesAttempt((value) => value + 1)} /></> : null}
      <Action label={!references ? 'Loading saved references…' : editing ? 'Save purchase' : 'Saving purchase…'} disabled={!editing || !references || !!referencesError} onPress={() => { void save(); }} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
