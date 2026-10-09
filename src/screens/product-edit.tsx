import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import { Action, ErrorMessage, Field } from '../components/form';
import { GroupingField } from '../components/grouping-field';
import { ReferenceField } from '../components/reference-field';
import type { CodeFormat } from '../data/code';
import { formatOMR, parseOMR, type Grouping, type ProductDetails, type ProductSummary, type Reference, type References } from '../data/grocery';
import { useGrocery } from '../data/provider';
import { createSubmission } from '../data/submission';

const formats: { value: CodeFormat | 'none'; label: string }[] = [
  { value: 'none', label: 'No new code' }, { value: 'upc_a', label: 'UPC-A (12 digits)' }, { value: 'upc_e', label: 'UPC-E (8 digits)' },
  { value: 'ean8', label: 'EAN-8 (8 digits)' }, { value: 'ean13', label: 'EAN-13 (13 digits)' }, { value: 'qr', label: 'QR (exact text)' },
];

function ProductEditor({ product, references, readError, refresh }: { product: ProductDetails | null; references: References; readError: string; refresh: () => void }) {
  const grocery = useGrocery();
  const [name, setName] = useState(product?.name ?? '');
  const [brand, setBrand] = useState<Reference>(product?.brandId ? { id: product.brandId } : { name: '' });
  const [grouping, setGrouping] = useState<Grouping>(product ? product.subcategoryId !== null ? { subcategory: { id: product.subcategoryId } } : { category: { id: product.categoryId! } } : { category: { name: '' } });
  const [price, setPrice] = useState(product?.savedPrice === null || !product ? '' : formatOMR(product.savedPrice));
  const [store, setStore] = useState<Reference>(product?.savedStoreId ? { id: product.savedStoreId } : { name: '' });
  const [format, setFormat] = useState<CodeFormat | 'none'>('none');
  const [choosingFormat, setChoosingFormat] = useState(false);
  const [code, setCode] = useState('');
  const [notInflation, setNotInflation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [owner, setOwner] = useState<ProductSummary | null>(null);
  const [ownerError, setOwnerError] = useState('');
  const ownerReadId = useRef(0);
  useFocusEffect(useCallback(() => () => { ownerReadId.current++; }, []));
  const submit = useRef(createSubmission(setSaving)).current;
  const clearOwner = () => { ownerReadId.current++; setOwner(null); setOwnerError(''); };
  const checkOwner = () => {
    const request = ++ownerReadId.current;
    if (format === 'none') return;
    void grocery.lookupCode({ format, value: code }).then((found) => {
      if (ownerReadId.current === request) { setOwner(found && found.id !== product?.id ? found : null); setOwnerError(''); }
    }).catch(() => { if (ownerReadId.current === request) setOwnerError('Could not look up this code. Check the format and value, or retry.'); });
  };
  let canExclude = false;
  try { canExclude = !!product?.canExcludeSavedPrice && !!price.trim() && parseOMR(price) !== product.savedPrice; } catch {}
  const save = async () => {
    try {
      await submit(async () => {
        setError('');
        clearOwner();
        const productId = await grocery.saveProduct({ id: product?.id, name, brand: brand.id !== undefined || brand.name.trim() ? brand : null, grouping,
          savedPrice: price, savedStore: store.id !== undefined || store.name.trim() ? store : null,
          code: format === 'none' ? undefined : { format, value: code }, notInflation: canExclude && notInflation });
        router.dismissTo({ pathname: '/product/[id]', params: { id: productId } });
        return productId;
      });
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'Could not save the product.'} Your entries are kept. Correct them or retry.`);
      refresh();
      checkOwner();
    }
  };
  const editing = !saving && !product?.archived;
  return <>
    <Text accessibilityRole="header" style={{ fontSize: 22 }}>{product ? 'Edit product' : 'Add product'}</Text>
    <Text>This saves catalog defaults without recording a purchase or changing spending.</Text>
    {product?.archived ? <><ErrorMessage message="This product is archived. Reactivate it from its details before editing. Your entries are kept." /><Action label="Open archived product details" onPress={() => router.dismissTo({ pathname: '/product/[id]', params: { id: product.id } })} /></> : null}
    <Field label="Product name" value={name} onChangeText={setName} editable={editing} autoFocus />
    <ReferenceField label="Brand (optional)" kind="brand" value={brand} rows={references.brands} onChange={setBrand} editable={editing} />
    <Action label="Use no brand" disabled={!editing} onPress={() => setBrand({ name: '' })} />
    <GroupingField value={grouping} references={references} onChange={setGrouping} editable={editing} />
    <Field label="Saved price (optional, OMR)" value={price} onChangeText={setPrice} editable={editing} keyboardType="decimal-pad" placeholder="0.000" />
    <Text>{product?.savedPrice !== null && product ? 'A blank price keeps the existing saved price.' : 'Leave price blank to save without a price observation.'}</Text>
    <ReferenceField label="Saved store (optional)" kind="store" value={store} rows={references.stores} onChange={setStore} editable={editing} />
    <Action label="Use no saved store" disabled={!editing} onPress={() => setStore({ name: '' })} />
    {canExclude ? <><Text>This changed price has an earlier observation. Choose its inflation status before saving.</Text><Action label={notInflation ? 'Not inflation selected · switch to Included' : 'Included in inflation · mark Not inflation'} disabled={!editing} onPress={() => setNotInflation((excluded) => !excluded)} /></> : null}
    <Text>{product?.codes.length ? `${product.codes.length} existing ${product.codes.length === 1 ? 'code remains' : 'codes remain'} on this product. You can add another.` : 'A product code is optional.'}</Text>
    <Action label={`Code format · ${formats.find((choice) => choice.value === format)!.label} · Change`} disabled={!editing} onPress={() => setChoosingFormat((open) => !open)} />
    {choosingFormat ? formats.map((choice) => <Action key={choice.value} label={`Use ${choice.label}`} disabled={!editing} onPress={() => { clearOwner(); setFormat(choice.value); setChoosingFormat(false); }} />) : null}
    {format !== 'none' ? <>
      <Field label={format === 'qr' ? 'QR content (exact text)' : 'Product code (including check digit)'} value={code} onChangeText={(value) => { clearOwner(); setCode(value); }} editable={editing} autoCapitalize="none" autoCorrect={false} multiline={format === 'qr'} />
      {format === 'qr' ? <Text selectable>QR preview · {JSON.stringify(code)}</Text> : <Text>Enter all digits without spaces or separators. UPC-E needs its full 8 digits.</Text>}
    </> : null}
    {owner ? <><Text>This code identifies {owner.name}{owner.archived ? ' · Archived. Reactivate its existing identity from details.' : '.'}</Text><Action label={`Open code owner ${owner.name}`} onPress={() => router.push({ pathname: '/product/[id]', params: { id: owner.id } })} /></> : null}
    {ownerError ? <><ErrorMessage message={ownerError} /><Action label="Retry code owner lookup" onPress={checkOwner} /></> : null}
    {error ? <ErrorMessage message={error} /> : null}
    <Action label={saving ? 'Saving product…' : 'Save product'} disabled={!editing || !!readError} onPress={() => { void save(); }} />
  </>;
}

export default function ProductEdit() {
  const params = useLocalSearchParams<{ id?: string }>();
  const productId = params.id === undefined ? undefined : Number(params.id);
  const grocery = useGrocery();
  const [loaded, setLoaded] = useState<{ references: References; product: ProductDetails | null } | null>(null);
  const [readError, setReadError] = useState('');
  const readId = useRef(0);
  const refresh = useCallback(() => {
    const request = ++readId.current;
    void Promise.all([grocery.listReferences(), productId === undefined ? Promise.resolve(null) : grocery.getProductDetails(productId)])
      .then(([references, product]) => { if (readId.current === request) { setLoaded({ references, product }); setReadError(''); } })
      .catch((failure: unknown) => { if (readId.current === request) setReadError(`${failure instanceof Error ? failure.message : 'Could not load product choices.'} Retry before saving. Your entries are kept.`); });
    return () => { readId.current++; };
  }, [grocery, productId]);
  useFocusEffect(refresh);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      {readError ? <><ErrorMessage message={readError} /><Action label="Retry product choices" onPress={refresh} /></> : loaded === null ? <ActivityIndicator accessibilityLabel="Loading product choices" /> : null}
      {loaded ? <ProductEditor key={productId ?? 'new'} product={loaded.product} references={loaded.references} readError={readError} refresh={refresh} /> : null}
    </ScrollView>
  </KeyboardAvoidingView>;
}
