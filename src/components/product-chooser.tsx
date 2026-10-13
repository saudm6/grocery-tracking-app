import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { CodeScanner, type CodeScannerHandle } from './code-scanner';
import { Action, ErrorMessage, Field, pushScreen } from './form';
import { ProductRow } from './product-row';
import type { CodeFormat, CodeInput } from '../data/code';
import type { ProductSummary, SubcategoryRow } from '../data/grocery';
import { useGrocery } from '../data/provider';

const formats: { value: CodeFormat; label: string }[] = [
  { value: 'upc_a', label: 'UPC-A (12 digits)' }, { value: 'upc_e', label: 'UPC-E (8 digits)' },
  { value: 'ean8', label: 'EAN-8 (8 digits)' }, { value: 'ean13', label: 'EAN-13 (13 digits)' }, { value: 'qr', label: 'QR (exact text)' },
];
type Lookup = { status: 'idle' | 'loading' } | { status: 'ready'; input: CodeInput; product: ProductSummary | null } | { status: 'error'; message: string };
export type ProductChooserHandle = { cancelIdentification: () => void };

function SavedProductChoice({ product, month, disabled, onChoose }: {
  product: ProductSummary; month: string; disabled: boolean; onChoose: (id: number) => void;
}) {
  return <ProductRow product={product}>
    {product.archived ? <>
      <Text>Reactivate this existing product from details before selecting it.</Text>
      <Action label={`Open archived product ${product.name}`} disabled={disabled} onPress={() => pushScreen({ pathname: '/product/[id]', params: { id: product.id, month } })} />
    </> : <Action label={`Use product ${product.name} · Product ${product.id}`} disabled={disabled} onPress={() => onChoose(product.id)} />}
  </ProductRow>;
}

export function ProductChooser({ month, subcategories, onChoose, onAddCode, disabled, visible = true, cameraEnabled = false, ref }: {
  month: string; subcategories: SubcategoryRow[]; onChoose: (id: number) => void; onAddCode?: (input: CodeInput) => void; disabled: boolean; visible?: boolean; cameraEnabled?: boolean; ref?: Ref<ProductChooserHandle>;
}) {
  const grocery = useGrocery();
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [choosingSubcategory, setChoosingSubcategory] = useState(false);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [rows, setRows] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState('');
  const [format, setFormat] = useState<CodeFormat | null>(null);
  const [choosingFormat, setChoosingFormat] = useState(false);
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' });
  const scanner = useRef<CodeScannerHandle | null>(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const latest = useRef({ visible, disabled, onChoose });
  useLayoutEffect(() => { latest.current = { visible, disabled, onChoose }; }, [visible, disabled, onChoose]);
  const mounted = useRef(true);
  const listReadId = useRef(0);
  const lookupReadId = useRef(0);
  const lastLookup = useRef<CodeInput | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppState(state);
      if (state !== 'active') lookupReadId.current++;
    });
    return () => subscription.remove();
  }, []);
  const refresh = useCallback(() => {
    if (!visible) return () => {};
    const request = ++listReadId.current;
    setRows(null);
    void grocery.listProducts(search, includeArchived, subcategoryId).then((products) => { if (mounted.current && listReadId.current === request) { setRows(products); setError(''); } })
      .catch(() => { if (mounted.current && listReadId.current === request) setError('Could not read saved products. Your entries are kept. Retry.'); });
    return () => { listReadId.current++; };
  }, [grocery, search, includeArchived, subcategoryId, visible]);
  useFocusEffect(refresh);
  const resolveCode = useCallback((input: CodeInput, selectOwner = false) => {
    const request = ++lookupReadId.current;
    setLookup({ status: 'loading' });
    void grocery.lookupCode(input).then((product) => {
      if (lookupReadId.current !== request || !mounted.current || !latest.current.visible || AppState.currentState !== 'active') return;
      setLookup({ status: 'ready', input, product });
      if (selectOwner && product && !product.archived && !latest.current.disabled) {
        lookupReadId.current++;
        latest.current.onChoose(product.id);
      }
    }).catch((failure: unknown) => {
      if (lookupReadId.current === request && mounted.current) setLookup({ status: 'error', message: `${failure instanceof Error ? failure.message : 'Could not look up the code.'} Your code is kept. Correct it or retry.` });
    });
  }, [grocery]);
  useFocusEffect(useCallback(() => {
    if (visible && appState === 'active' && lastLookup.current) resolveCode(lastLookup.current);
    return () => { lookupReadId.current++; };
  }, [resolveCode, visible, appState]));
  const clearLookup = useCallback(() => {
    lookupReadId.current++;
    lastLookup.current = null;
    scanner.current?.cancel();
    setLookup({ status: 'idle' });
  }, []);
  useImperativeHandle(ref, () => ({ cancelIdentification: clearLookup }), [clearLookup]);
  const findCode = () => {
    if (format === null) { setLookup({ status: 'error', message: 'Choose the code format before looking it up.' }); return; }
    clearLookup();
    lastLookup.current = { format, value: code };
    resolveCode(lastLookup.current);
  };
  const retryCode = () => { if (lastLookup.current) resolveCode(lastLookup.current); else findCode(); };
  const scanned = (input: CodeInput) => {
    setFormat(input.format);
    setCode(input.value);
    setChoosingFormat(false);
    lastLookup.current = input;
    resolveCode(input, true);
  };
  const chooseSaved = (id: number) => { clearLookup(); onChoose(id); };
  const selectedSubcategory = subcategories.find((row) => row.id === subcategoryId);
  const chooseSubcategory = (id: number | null) => {
    if (id !== subcategoryId) { listReadId.current++; setRows(null); setSubcategoryId(id); }
    setChoosingSubcategory(false);
  };
  return <View style={visible ? { gap: 16 } : { display: 'none' }} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
    {cameraEnabled ? <>
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>Scan a product code</Text>
      <Text>Scanning identifies a product. Confirm the paid price and store before saving. Manual search and code entry remain available below.</Text>
      <CodeScanner ref={scanner} label="Open camera" onCapture={scanned} onOpen={() => { clearLookup(); setChoosingFormat(false); }} disabled={disabled} visible={visible} />
    </> : null}
    <Text selectable>Manual subcategory · {subcategoryId === null ? 'All saved products' : selectedSubcategory ? `${selectedSubcategory.category} / ${selectedSubcategory.name}` : `Saved subcategory ${subcategoryId} unavailable`}</Text>
    <Action label={choosingSubcategory ? 'Close manual subcategory choices' : 'Choose manual subcategory'} disabled={disabled} onPress={() => setChoosingSubcategory((open) => !open)} />
    {choosingSubcategory ? <>
      <Action label="Use all saved products" disabled={disabled} onPress={() => chooseSubcategory(null)} />
      {subcategories.map((row) => <Action key={row.id} label={`Use products from ${row.category} / ${row.name}`} disabled={disabled} onPress={() => chooseSubcategory(row.id)} />)}
    </> : null}
    {subcategoryId !== null && !selectedSubcategory ? <ErrorMessage message="This saved subcategory is unavailable. Retry purchase choices or choose another manual context." /> : null}
    <Text>A subcategory&apos;s current primary brand comes first in manual choices. Choose the exact product. Changing these choices keeps your selected product and purchase entries.</Text>
    <Field label="Search saved product names" value={search} onChangeText={(value) => { clearLookup(); listReadId.current++; setRows(null); setSearch(value); }} editable={!disabled} autoCorrect={false} returnKeyType="search" />
    <Action label={includeArchived ? 'Hide archived products' : 'Show archived products'} disabled={disabled} onPress={() => { clearLookup(); listReadId.current++; setRows(null); setIncludeArchived((shown) => !shown); }} />
    {error ? <><ErrorMessage message={error} /><Action label="Retry saved products" disabled={disabled} onPress={refresh} /></> : rows === null ? <ActivityIndicator accessibilityLabel="Loading saved products" /> : null}
    {rows?.length === 0 ? <Text>No matching saved products. Change the search or type a code.</Text> : rows?.map((product) => <SavedProductChoice key={product.id} product={product} month={month} disabled={disabled} onChoose={chooseSaved} />)}
    <Text accessibilityRole="header" style={{ fontSize: 22 }}>Find a typed code</Text>
    <Action label={`Code format · ${formats.find((choice) => choice.value === format)?.label ?? 'Choose a format'} · Change`} disabled={disabled} onPress={() => setChoosingFormat((open) => !open)} />
    {choosingFormat ? formats.map((choice) => <Action key={choice.value} label={`Use ${choice.label}`} disabled={disabled} onPress={() => { clearLookup(); setFormat(choice.value); setChoosingFormat(false); }} />) : null}
    <Field label={format === 'qr' ? 'QR content (exact text)' : 'Product code (including check digit)'} value={code} onChangeText={(value) => { clearLookup(); setCode(value); }} editable={!disabled} autoCapitalize="none" autoCorrect={false} multiline={format === 'qr'} />
    {format === 'qr' ? <Text selectable>QR preview · {JSON.stringify(code)}</Text> : <Text>Enter all digits and choose their format. Eight-digit UPC-E and EAN-8 codes are different formats.</Text>}
    <Action label={lookup.status === 'loading' ? 'Looking up code…' : 'Look up typed code'} disabled={disabled || lookup.status === 'loading'} onPress={findCode} />
    {lookup.status === 'error' ? <><ErrorMessage message={lookup.message} /><Action label="Retry code lookup" disabled={disabled} onPress={retryCode} /></> : lookup.status === 'ready' ? lookup.product ? <SavedProductChoice product={lookup.product} month={month} disabled={disabled} onChoose={chooseSaved} /> : <>
      <Text>No saved product owns this code. Your code is kept. Change it or choose another saved product. This lookup does not attach a code.</Text>
      {onAddCode ? <Action label="Add as new product" disabled={disabled} onPress={() => onAddCode(lookup.input)} /> : null}
    </> : null}
  </View>;
}
