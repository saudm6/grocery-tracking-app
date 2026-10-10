import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import { Action, ErrorMessage, Field } from '../components/form';
import { GroupingField } from '../components/grouping-field';
import { ProductChooser } from '../components/product-chooser';
import { ReferenceField } from '../components/reference-field';
import { formatOMR, lineTotal, parseOMR, parseQuantity, type Grouping, type ProductDetails, type PurchaseDetails, type Reference, type References } from '../data/grocery';
import { useGrocery } from '../data/provider';
import { createSubmission } from '../data/submission';

type Selection = { kind: 'recorded' } | { kind: 'replacement'; id: number; details: ProductDetails | null };

function PurchaseEditor({ purchase, references, readReady, refresh, onCommitted }: {
  purchase: PurchaseDetails; references: References; readReady: boolean; refresh: () => void; onCommitted: (notice: string) => void;
}) {
  const grocery = useGrocery();
  const [draft, setDraft] = useState({ month: purchase.month, date: purchase.purchaseDate ?? '', quantity: String(purchase.quantity), price: formatOMR(purchase.unitPrice) });
  const [store, setStore] = useState<Reference>({ id: purchase.storeId });
  const [grouping, setGrouping] = useState<Grouping | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: 'recorded' });
  const selectedId = selection.kind === 'replacement' ? selection.id : null;
  const product = selection.kind === 'replacement' ? selection.details : null;
  const [choosingProduct, setChoosingProduct] = useState(false);
  const [productRead, setProductRead] = useState<'loading' | 'ready' | 'error'>('ready');
  const [productError, setProductError] = useState('');
  const productReadId = useRef(0);
  const initializedProduct = useRef<number | null>(null);
  const refreshProduct = useCallback(() => {
    if (selectedId === null) return () => {};
    const request = ++productReadId.current;
    setProductRead('loading');
    void grocery.getProductDetails(selectedId).then((details) => {
      if (productReadId.current !== request) return;
      setSelection({ kind: 'replacement', id: details.id, details });
      if (initializedProduct.current !== details.id) {
        initializedProduct.current = details.id;
        setGrouping(details.subcategoryId !== null ? { subcategory: { id: details.subcategoryId } } : { category: { id: details.categoryId! } });
      }
      setProductError('');
      setProductRead('ready');
    }).catch((failure: unknown) => {
      if (productReadId.current === request) { setProductRead('error'); setProductError(`${failure instanceof Error ? failure.message : 'Could not load the replacement product.'} Your paid entries are kept. Retry before saving.`); }
    });
    return () => { productReadId.current++; };
  }, [grocery, selectedId]);
  useFocusEffect(refreshProduct);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = useRef(createSubmission(setSaving)).current;
  const set = (key: keyof typeof draft) => (value: string) => setDraft((previous) => ({ ...previous, [key]: value }));
  const keepRecorded = () => {
    productReadId.current++;
    initializedProduct.current = null;
    setSelection({ kind: 'recorded' });
    setGrouping(null);
    setProductError('');
    setProductRead('ready');
    setChoosingProduct(false);
  };
  const chooseProduct = (id: number) => {
    if (id === purchase.productId) { if (selectedId !== null) keepRecorded(); else setChoosingProduct(false); return; }
    if (id !== selectedId) { productReadId.current++; setSelection({ kind: 'replacement', id, details: null }); setGrouping(null); setProductError(''); setProductRead('loading'); }
    setChoosingProduct(false);
  };
  const commit = async (kind: 'save' | 'delete') => {
    try {
      await submit(async () => {
        if (!readReady) throw new Error('Retry purchase choices before saving.');
        setError('');
        if (kind === 'delete') await grocery.deletePurchase(purchase.id);
        else {
          if (selectedId !== null && (!product || productRead !== 'ready')) throw new Error('Wait for the replacement product to load.');
          await grocery.updatePurchase(purchase.id, { productId: selectedId ?? purchase.productId, grouping: grouping ?? undefined, store,
            month: draft.month.trim(), purchaseDate: draft.date.trim(), quantity: draft.quantity, unitPrice: draft.price });
        }
        onCommitted(kind === 'delete' ? 'Purchase deleted. Price history is kept.' : 'Purchase corrected. Saved defaults and price history are kept.');
      });
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'Could not change the purchase.'} Your entries are kept. Correct them or retry.`);
      refresh();
      refreshProduct();
    }
  };
  let preview = '';
  try { preview = `${formatOMR(lineTotal(parseQuantity(draft.quantity), parseOMR(draft.price)))} OMR`; } catch {}
  const editing = !saving && !confirmingDelete && (selectedId === null || product !== null);
  const shownGrouping = grouping ?? (purchase.subcategoryId !== null ? { subcategory: { id: purchase.subcategoryId } } : { category: { id: purchase.categoryId! } });
  return <>
    <Text selectable accessibilityRole="header" style={{ fontSize: 22 }}>Purchase {purchase.id}</Text>
    <Text>Corrections affect spending only. Saved product defaults and every price observation stay unchanged.</Text>
    <Field label="Purchase month (YYYY-MM)" value={draft.month} onChangeText={set('month')} editable={editing} autoCapitalize="none" autoCorrect={false} />
    <Action label={choosingProduct ? 'Close saved product choices' : 'Change purchased product'} disabled={!editing} onPress={() => setChoosingProduct((open) => !open)} />
    {choosingProduct ? <ProductChooser month={draft.month} subcategories={references.subcategories} onChoose={chooseProduct} disabled={saving || confirmingDelete} /> : null}
    <Text selectable accessibilityRole="header" style={{ fontSize: 22 }}>{selectedId === null ? purchase.product : product?.name ?? 'Loading replacement product…'} · Product {selectedId ?? purchase.productId}</Text>
    <Text selectable>{selectedId === null ? 'Recorded brand' : 'Replacement brand'} · {selectedId === null ? purchase.brand ?? 'No brand' : product?.brand ?? 'No brand'}</Text>
    {selectedId === null ? <Text>Keep the recorded product and brand, including an archived product. Its grouping stays recorded unless you correct it below.</Text> : <>
      <Text>Confirm this replacement&apos;s brand and grouping. Your quantity, paid price, store, month and date are kept.</Text>
      {productRead === 'loading' ? <ActivityIndicator accessibilityLabel="Loading replacement product" /> : null}
      {productError ? <><ErrorMessage message={productError} /><Action label="Retry replacement product" disabled={saving} onPress={refreshProduct} /></> : null}
      {product?.archived ? <ErrorMessage message="This replacement is archived. Reactivate its existing identity from details before saving. Your paid entries are kept." /> : null}
      {product ? <Action label={product.archived ? 'Open archived replacement product' : 'Open replacement product details'} disabled={saving || confirmingDelete} onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id, month: draft.month } })} /> : null}
      <Action label="Keep original recorded product and grouping" disabled={saving || confirmingDelete} onPress={keepRecorded} />
    </>}
    <Text>Grouping here corrects this purchase only. Other purchases and the product&apos;s current grouping are kept.</Text>
    <GroupingField value={shownGrouping} references={references} onChange={setGrouping} editable={editing} />
    <ReferenceField label="Store" kind="store" value={store} onChange={setStore} rows={references.stores} editable={editing} />
    <Field label="Quantity (whole items)" value={draft.quantity} onChangeText={set('quantity')} editable={editing} keyboardType="number-pad" />
    <Field label="Unit price (OMR)" value={draft.price} onChangeText={set('price')} editable={editing} keyboardType="decimal-pad" placeholder="0.000" />
    <Field label="Purchase date (optional, YYYY-MM-DD)" value={draft.date} onChangeText={set('date')} editable={editing} autoCapitalize="none" autoCorrect={false} returnKeyType="done" />
    <Text selectable>Line total · {preview || 'Enter a valid price and quantity'}</Text>
    <Text>When changing the month, correct or clear an exact date that belongs to the old month.</Text>
    {error ? <ErrorMessage message={error} /> : null}
    {confirmingDelete ? <>
      <Text accessibilityRole="alert">Delete recorded purchase {purchase.id} of {purchase.product} in {purchase.month}, worth {formatOMR(purchase.lineTotal)} OMR? This removes spending and discards unsaved corrections. Price history remains with its own product, price, store and period.</Text>
      <Action label={saving ? 'Deleting purchase…' : 'Confirm delete purchase'} disabled={saving || !readReady} onPress={() => { void commit('delete'); }} />
      <Action label="Cancel purchase deletion" disabled={saving} onPress={() => setConfirmingDelete(false)} />
    </> : <>
      <Action label={saving ? 'Saving correction…' : 'Save purchase correction'} disabled={!editing || !readReady || (selectedId !== null && (productRead !== 'ready' || !!product?.archived))} onPress={() => { void commit('save'); }} />
      <Action label="Delete purchase" disabled={saving || !readReady} onPress={() => setConfirmingDelete(true)} />
    </>}
  </>;
}

export default function PurchaseEdit() {
  const params = useLocalSearchParams<{ id: string }>();
  const purchaseId = typeof params.id === 'string' && /^[1-9]\d*$/.test(params.id) ? Number(params.id) : NaN;
  const grocery = useGrocery();
  const [loaded, setLoaded] = useState<{ purchase: PurchaseDetails; references: References } | null>(null);
  const [readState, setReadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [readError, setReadError] = useState('');
  const [notice, setNotice] = useState('');
  const readId = useRef(0);
  const completed = useRef(false);
  const refresh = useCallback(() => {
    if (completed.current) return () => {};
    const request = ++readId.current;
    setReadState('loading');
    void Promise.all([grocery.getPurchase(purchaseId), grocery.listReferences()]).then(([purchase, references]) => {
      if (readId.current === request) { setLoaded({ purchase, references }); setReadError(''); setReadState('ready'); }
    }).catch((failure: unknown) => {
      if (readId.current === request) { setReadState('error'); setReadError(`${failure instanceof Error ? failure.message : 'Could not read this purchase.'} Your entries are kept. Retry before saving.`); }
    });
    return () => { readId.current++; };
  }, [grocery, purchaseId]);
  useFocusEffect(refresh);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      {notice ? <><Text accessibilityLiveRegion="polite">{notice}</Text><Action label="Return to spending" onPress={() => router.back()} /></> : <>
        {readState === 'loading' ? <ActivityIndicator accessibilityLabel="Loading purchase choices" /> : readState === 'error' ? <><ErrorMessage message={readError} /><Action label="Retry purchase choices" onPress={refresh} /></> : null}
        {loaded ? <PurchaseEditor key={purchaseId} purchase={loaded.purchase} references={loaded.references} readReady={readState === 'ready'} refresh={refresh} onCommitted={(message) => { completed.current = true; readId.current++; setNotice(message); router.back(); }} /> : null}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
