import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import { Action, ErrorMessage, Field } from '../components/form';
import { GroupingField } from '../components/grouping-field';
import { ProductChooser } from '../components/product-chooser';
import { ReferenceField } from '../components/reference-field';
import { formatOMR, lineTotal, localDate, parseOMR, parseQuantity, validateMonth, type Grouping, type ProductDetails, type Reference, type References } from '../data/grocery';
import { useGrocery } from '../data/provider';
import { createSubmission } from '../data/submission';

type Selection = { kind: 'new' } | { kind: 'known'; id: number; details: ProductDetails | null };
export default function Purchase() {
  const params = useLocalSearchParams<{ month?: string; productId?: string }>();
  const grocery = useGrocery();
  let routeError = '';
  const routeProductId = params.productId === undefined ? null : Number(params.productId);
  try {
    if (params.month !== undefined) validateMonth(params.month);
    if (params.productId !== undefined && (typeof params.productId !== 'string' || !/^[1-9]\d*$/.test(params.productId) || !Number.isSafeInteger(routeProductId))) throw new Error('Choose a valid saved product.');
  } catch (failure) { routeError = failure instanceof Error ? failure.message : 'Invalid purchase context.'; }
  const [draft, setDraft] = useState({ month: typeof params.month === 'string' ? params.month : localDate().slice(0, 7), name: '', quantity: '1', price: '', date: '' });
  const [selection, setSelection] = useState<Selection>(routeProductId === null || routeError ? { kind: 'new' } : { kind: 'known', id: routeProductId, details: null });
  const selectedId = selection.kind === 'known' ? selection.id : null;
  const product = selection.kind === 'known' ? selection.details : null;
  const [choosingProduct, setChoosingProduct] = useState(false);
  const [grouping, setGrouping] = useState<Grouping>({ category: { name: '' } });
  const [brand, setBrand] = useState<Reference>({ name: '' });
  const [store, setStore] = useState<Reference>({ name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [references, setReferences] = useState<References | null>(null);
  const [readState, setReadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [readError, setReadError] = useState('');
  const readId = useRef(0);
  const initializedProduct = useRef<number | null>(null);
  const refresh = useCallback(() => {
    const request = ++readId.current;
    setReadState('loading');
    void Promise.all([grocery.listReferences(), selectedId === null ? Promise.resolve(null) : grocery.getProductDetails(selectedId)])
      .then(([records, details]) => {
        if (readId.current !== request) return;
        setReferences(records);
        if (details) {
          setSelection({ kind: 'known', id: details.id, details });
          if (initializedProduct.current !== details.id) {
            initializedProduct.current = details.id;
            setDraft((previous) => ({ ...previous, quantity: '1', price: details.savedPrice === null ? '' : formatOMR(details.savedPrice) }));
            setStore(details.savedStoreId === null ? { name: '' } : { id: details.savedStoreId });
          }
        }
        setReadError('');
        setReadState('ready');
      }).catch((failure: unknown) => {
        if (readId.current === request) { setReadState('error'); setReadError(`${failure instanceof Error ? failure.message : 'Could not load purchase choices.'} Your entries are kept. Retry before saving.`); }
      });
    return () => { readId.current++; };
  }, [grocery, selectedId]);
  useFocusEffect(refresh);
  const submit = useRef(createSubmission(setSaving)).current;
  const set = (key: keyof typeof draft) => (value: string) => setDraft((previous) => ({ ...previous, [key]: value }));
  const chooseProduct = (id: number) => {
    if (id !== selectedId) { readId.current++; setSelection({ kind: 'known', id, details: null }); }
    setChoosingProduct(false);
  };
  const chooseNew = () => { readId.current++; initializedProduct.current = null; setSelection({ kind: 'new' }); setChoosingProduct(false); };
  let preview = '';
  try { preview = `${formatOMR(lineTotal(parseQuantity(draft.quantity), parseOMR(draft.price)))} OMR`; } catch {}
  const save = async () => {
    try {
      await submit(async () => {
        if (routeError) throw new Error(routeError);
        if (!references || readState !== 'ready' || (selectedId !== null && !product)) throw new Error('Wait for purchase choices to load.');
        setError('');
        const result = await grocery.recordPurchase({ product: selectedId === null ? { name: draft.name, brand: brand.id !== undefined || brand.name.trim() ? brand : null, grouping } : { id: selectedId }, store,
          month: draft.month, purchaseDate: draft.date.trim(), quantity: draft.quantity, unitPrice: draft.price });
        router.back();
        return result;
      });
    } catch (failure) { setError(`${failure instanceof Error ? failure.message : 'Could not save the purchase.'} Your entries are kept. Correct them or retry.`); refresh(); }
  };
  const editing = !saving && (selectedId === null || product !== null);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      <Text>Choose the exact saved product or enter a new product, then confirm the price and store paid for this purchase.</Text>
      {routeError ? <ErrorMessage message={`${routeError} Return and open a purchase from a valid month or product.`} /> : null}
      <Field label="Purchase month (YYYY-MM)" value={draft.month} editable={false} />
      <Action label={choosingProduct ? 'Close saved product choices' : selectedId === null ? 'Choose a saved product' : 'Change selected product'} disabled={saving || !!routeError} onPress={() => setChoosingProduct((open) => !open)} />
      {choosingProduct ? <><ProductChooser month={draft.month} subcategories={references?.subcategories ?? []} onChoose={chooseProduct} disabled={saving || !!routeError} /><Text>If there is no saved match, enter a new product in this form. Close these choices to return to your entries.</Text></> : null}
      {selectedId === null ? <>
        <Field label="Product name" value={draft.name} onChangeText={set('name')} editable={editing} autoFocus />
        <ReferenceField label="Brand (optional)" kind="brand" value={brand} onChange={setBrand} rows={references?.brands ?? []} editable={editing} />
        {references ? <GroupingField value={grouping} references={references} onChange={setGrouping} editable={editing} /> : null}
      </> : <>
        {product ? <>
          <Text selectable accessibilityRole="header" style={{ fontSize: 22 }}>{product.name} · Product {product.id}{product.archived ? ' · Archived' : ''}</Text>
          <Text selectable>Brand · {product.brand ?? 'No brand'}</Text>
          <Text selectable>Category · {product.category}{product.subcategory ? ` / ${product.subcategory}` : ''}</Text>
          <Text>New purchases use the current brand and grouping of this product. Earlier purchases keep their recorded identity.</Text>
          {product.archived ? <ErrorMessage message="This product is archived. Reactivate its original identity from details before saving. Your paid entries are kept." /> : null}
          <Action label={product.archived ? 'Open archived product details' : 'Open selected product details'} disabled={saving} onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id, month: draft.month } })} />
        </> : <ActivityIndicator accessibilityLabel="Loading selected product" />}
        <Action label="Enter a new product instead" disabled={saving || !!routeError || product === null} onPress={chooseNew} />
      </>}
      <ReferenceField label="Store" kind="store" value={store} onChange={setStore} rows={references?.stores ?? []} editable={editing} />
      <Field label="Quantity (whole items)" value={draft.quantity} onChangeText={set('quantity')} editable={editing} keyboardType="number-pad" />
      <Field label="Unit price (OMR)" value={draft.price} onChangeText={set('price')} editable={editing} keyboardType="decimal-pad" placeholder="0.000" />
      <Field label="Purchase date (optional, YYYY-MM-DD)" value={draft.date} onChangeText={set('date')} editable={editing} autoCapitalize="none" autoCorrect={false} returnKeyType="done" />
      <Text selectable>Line total · {preview || 'Enter a valid price and quantity'}</Text>
      <Text>A first or changed current-month price updates the saved price and store. An unchanged price keeps saved defaults. Older receipts affect spending only.</Text>
      {error ? <ErrorMessage message={error} /> : null}
      {readState === 'error' ? <><ErrorMessage message={readError} /><Action label="Retry purchase choices" onPress={refresh} /></> : null}
      <Action label={readState === 'loading' ? 'Loading purchase choices…' : saving ? 'Saving purchase…' : 'Save purchase'} disabled={!editing || !!routeError || readState !== 'ready' || !!product?.archived} onPress={() => { void save(); }} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
