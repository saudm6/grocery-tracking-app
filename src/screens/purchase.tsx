import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import { Action, ErrorMessage, Field } from '../components/form';
import { GroupingField } from '../components/grouping-field';
import { ProductRow } from '../components/product-row';
import { ReferenceField } from '../components/reference-field';
import type { CodeFormat, CodeInput } from '../data/code';
import { formatOMR, lineTotal, localDate, parseOMR, parseQuantity, validateMonth, type Grouping, type ProductDetails, type ProductSummary, type Reference, type References } from '../data/grocery';
import { useGrocery } from '../data/provider';
import { createSubmission } from '../data/submission';

const formats: { value: CodeFormat; label: string }[] = [
  { value: 'upc_a', label: 'UPC-A (12 digits)' }, { value: 'upc_e', label: 'UPC-E (8 digits)' },
  { value: 'ean8', label: 'EAN-8 (8 digits)' }, { value: 'ean13', label: 'EAN-13 (13 digits)' }, { value: 'qr', label: 'QR (exact text)' },
];
type Selection = { kind: 'new' } | { kind: 'known'; id: number; details: ProductDetails | null };
type Lookup = { status: 'idle' | 'loading' } | { status: 'ready'; product: ProductSummary | null } | { status: 'error'; message: string };

function ProductChooser({ month, onChoose, disabled }: { month: string; onChoose: (id: number) => void; disabled: boolean }) {
  const grocery = useGrocery();
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [rows, setRows] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState('');
  const [format, setFormat] = useState<CodeFormat | null>(null);
  const [choosingFormat, setChoosingFormat] = useState(false);
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' });
  const listReadId = useRef(0);
  const lookupReadId = useRef(0);
  const lastLookup = useRef<CodeInput | null>(null);
  const refresh = useCallback(() => {
    const request = ++listReadId.current;
    setRows(null);
    void grocery.listProducts(search, includeArchived).then((products) => { if (listReadId.current === request) { setRows(products); setError(''); } })
      .catch(() => { if (listReadId.current === request) setError('Could not read saved products. Your entries are kept. Retry.'); });
    return () => { listReadId.current++; };
  }, [grocery, search, includeArchived]);
  useFocusEffect(refresh);
  const resolveCode = useCallback((input: CodeInput) => {
    const request = ++lookupReadId.current;
    setLookup({ status: 'loading' });
    void grocery.lookupCode(input).then((product) => { if (lookupReadId.current === request) setLookup({ status: 'ready', product }); })
      .catch((failure: unknown) => { if (lookupReadId.current === request) setLookup({ status: 'error', message: `${failure instanceof Error ? failure.message : 'Could not look up the code.'} Your code is kept. Correct it or retry.` }); });
  }, [grocery]);
  useFocusEffect(useCallback(() => {
    if (lastLookup.current) resolveCode(lastLookup.current);
    return () => { lookupReadId.current++; };
  }, [resolveCode]));
  const clearLookup = () => { lookupReadId.current++; lastLookup.current = null; setLookup({ status: 'idle' }); };
  const findCode = () => {
    if (format === null) { setLookup({ status: 'error', message: 'Choose the code format before looking it up.' }); return; }
    lastLookup.current = { format, value: code };
    resolveCode(lastLookup.current);
  };
  const result = (product: ProductSummary) => <ProductRow key={product.id} product={product}>
    {product.archived ? <>
      <Text>Reactivate this existing product from details before recording another purchase.</Text>
      <Action label={`Open archived product ${product.name}`} disabled={disabled} onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id, month } })} />
    </> : <Action label={`Use product ${product.name} · Product ${product.id}`} disabled={disabled} onPress={() => onChoose(product.id)} />}
  </ProductRow>;
  return <>
    <Field label="Search saved product names" value={search} onChangeText={(value) => { listReadId.current++; setRows(null); setSearch(value); }} editable={!disabled} autoCorrect={false} returnKeyType="search" />
    <Action label={includeArchived ? 'Hide archived products' : 'Show archived products'} disabled={disabled} onPress={() => { listReadId.current++; setRows(null); setIncludeArchived((shown) => !shown); }} />
    {error ? <><ErrorMessage message={error} /><Action label="Retry saved products" disabled={disabled} onPress={refresh} /></> : rows === null ? <ActivityIndicator accessibilityLabel="Loading saved products" /> : null}
    {rows?.length === 0 ? <Text>No matching saved products. Change the search, type a code, or close these choices to enter a new product.</Text> : rows?.map(result)}
    <Text accessibilityRole="header" style={{ fontSize: 22 }}>Find a typed code</Text>
    <Action label={`Code format · ${formats.find((choice) => choice.value === format)?.label ?? 'Choose a format'} · Change`} disabled={disabled} onPress={() => setChoosingFormat((open) => !open)} />
    {choosingFormat ? formats.map((choice) => <Action key={choice.value} label={`Use ${choice.label}`} disabled={disabled} onPress={() => { clearLookup(); setFormat(choice.value); setChoosingFormat(false); }} />) : null}
    <Field label={format === 'qr' ? 'QR content (exact text)' : 'Product code (including check digit)'} value={code} onChangeText={(value) => { clearLookup(); setCode(value); }} editable={!disabled} autoCapitalize="none" autoCorrect={false} multiline={format === 'qr'} />
    {format === 'qr' ? <Text selectable>QR preview · {JSON.stringify(code)}</Text> : <Text>Enter all digits and choose their format. Eight-digit UPC-E and EAN-8 codes are different formats.</Text>}
    <Action label={lookup.status === 'loading' ? 'Looking up code…' : 'Look up typed code'} disabled={disabled || lookup.status === 'loading'} onPress={findCode} />
    {lookup.status === 'error' ? <><ErrorMessage message={lookup.message} /><Action label="Retry typed code lookup" disabled={disabled} onPress={findCode} /></> : lookup.status === 'ready' ? lookup.product ? result(lookup.product) : <Text>No saved product owns this code. Your code is kept. Close these choices to enter a new product manually. This lookup does not attach a code.</Text> : null}
  </>;
}

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
  const [notInflation, setNotInflation] = useState(false);
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
    if (id !== selectedId) { readId.current++; setNotInflation(false); setSelection({ kind: 'known', id, details: null }); }
    setChoosingProduct(false);
  };
  const chooseNew = () => { readId.current++; initializedProduct.current = null; setNotInflation(false); setSelection({ kind: 'new' }); setChoosingProduct(false); };
  let preview = '';
  try { preview = `${formatOMR(lineTotal(parseQuantity(draft.quantity), parseOMR(draft.price)))} OMR`; } catch {}
  let canExclude = false;
  try { canExclude = readState === 'ready' && draft.month === localDate().slice(0, 7) && !!product?.canExcludeSavedPrice && !product.archived && parseOMR(draft.price) !== product.savedPrice; } catch {}
  const save = async () => {
    try {
      await submit(async () => {
        if (routeError) throw new Error(routeError);
        if (!references || readState !== 'ready' || (selectedId !== null && !product)) throw new Error('Wait for purchase choices to load.');
        setError('');
        const result = await grocery.recordPurchase({ product: selectedId === null ? { name: draft.name, brand: brand.id !== undefined || brand.name.trim() ? brand : null, grouping } : { id: selectedId }, store,
          month: draft.month, purchaseDate: draft.date.trim(), quantity: draft.quantity, unitPrice: draft.price, notInflation: canExclude && notInflation });
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
      {choosingProduct ? <ProductChooser month={draft.month} onChoose={chooseProduct} disabled={saving || !!routeError} /> : null}
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
      {canExclude ? <><Text>This price has an earlier observation. Choose its inflation status before saving.</Text><Action label={notInflation ? 'Not inflation selected · switch to Included' : 'Included in inflation · mark Not inflation'} disabled={!editing} onPress={() => setNotInflation((excluded) => !excluded)} /></> : null}
      {error ? <ErrorMessage message={error} /> : null}
      {readState === 'error' ? <><ErrorMessage message={readError} /><Action label="Retry purchase choices" onPress={refresh} /></> : null}
      <Action label={readState === 'loading' ? 'Loading purchase choices…' : saving ? 'Saving purchase…' : 'Save purchase'} disabled={!editing || !!routeError || readState !== 'ready' || !!product?.archived} onPress={() => { void save(); }} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
