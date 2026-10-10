import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { Action, ErrorMessage, Field } from './form';
import { ProductRow } from './product-row';
import type { CodeFormat, CodeInput } from '../data/code';
import type { ProductSummary } from '../data/grocery';
import { useGrocery } from '../data/provider';

const formats: { value: CodeFormat; label: string }[] = [
  { value: 'upc_a', label: 'UPC-A (12 digits)' }, { value: 'upc_e', label: 'UPC-E (8 digits)' },
  { value: 'ean8', label: 'EAN-8 (8 digits)' }, { value: 'ean13', label: 'EAN-13 (13 digits)' }, { value: 'qr', label: 'QR (exact text)' },
];
type Lookup = { status: 'idle' | 'loading' } | { status: 'ready'; product: ProductSummary | null } | { status: 'error'; message: string };

export function ProductChooser({ month, onChoose, disabled }: { month: string; onChoose: (id: number) => void; disabled: boolean }) {
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
      <Text>Reactivate this existing product from details before selecting it.</Text>
      <Action label={`Open archived product ${product.name}`} disabled={disabled} onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id, month } })} />
    </> : <Action label={`Use product ${product.name} · Product ${product.id}`} disabled={disabled} onPress={() => onChoose(product.id)} />}
  </ProductRow>;
  return <>
    <Field label="Search saved product names" value={search} onChangeText={(value) => { listReadId.current++; setRows(null); setSearch(value); }} editable={!disabled} autoCorrect={false} returnKeyType="search" />
    <Action label={includeArchived ? 'Hide archived products' : 'Show archived products'} disabled={disabled} onPress={() => { listReadId.current++; setRows(null); setIncludeArchived((shown) => !shown); }} />
    {error ? <><ErrorMessage message={error} /><Action label="Retry saved products" disabled={disabled} onPress={refresh} /></> : rows === null ? <ActivityIndicator accessibilityLabel="Loading saved products" /> : null}
    {rows?.length === 0 ? <Text>No matching saved products. Change the search or type a code.</Text> : rows?.map(result)}
    <Text accessibilityRole="header" style={{ fontSize: 22 }}>Find a typed code</Text>
    <Action label={`Code format · ${formats.find((choice) => choice.value === format)?.label ?? 'Choose a format'} · Change`} disabled={disabled} onPress={() => setChoosingFormat((open) => !open)} />
    {choosingFormat ? formats.map((choice) => <Action key={choice.value} label={`Use ${choice.label}`} disabled={disabled} onPress={() => { clearLookup(); setFormat(choice.value); setChoosingFormat(false); }} />) : null}
    <Field label={format === 'qr' ? 'QR content (exact text)' : 'Product code (including check digit)'} value={code} onChangeText={(value) => { clearLookup(); setCode(value); }} editable={!disabled} autoCapitalize="none" autoCorrect={false} multiline={format === 'qr'} />
    {format === 'qr' ? <Text selectable>QR preview · {JSON.stringify(code)}</Text> : <Text>Enter all digits and choose their format. Eight-digit UPC-E and EAN-8 codes are different formats.</Text>}
    <Action label={lookup.status === 'loading' ? 'Looking up code…' : 'Look up typed code'} disabled={disabled || lookup.status === 'loading'} onPress={findCode} />
    {lookup.status === 'error' ? <><ErrorMessage message={lookup.message} /><Action label="Retry typed code lookup" disabled={disabled} onPress={findCode} /></> : lookup.status === 'ready' ? lookup.product ? result(lookup.product) : <Text>No saved product owns this code. Your code is kept. Change it or choose another saved product. This lookup does not attach a code.</Text> : null}
  </>;
}
