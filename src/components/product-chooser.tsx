import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { ActivityIndicator, AppState, Keyboard, Linking, Platform, Text, View } from 'react-native';
import { Action, ErrorMessage, Field } from './form';
import { ProductRow } from './product-row';
import { cameraCode, type CodeFormat, type CodeInput } from '../data/code';
import type { ProductSummary, SubcategoryRow } from '../data/grocery';
import { useGrocery } from '../data/provider';

const formats: { value: CodeFormat; label: string }[] = [
  { value: 'upc_a', label: 'UPC-A (12 digits)' }, { value: 'upc_e', label: 'UPC-E (8 digits)' },
  { value: 'ean8', label: 'EAN-8 (8 digits)' }, { value: 'ean13', label: 'EAN-13 (13 digits)' }, { value: 'qr', label: 'QR (exact text)' },
];
type Lookup = { status: 'idle' | 'loading' } | { status: 'ready'; product: ProductSummary | null } | { status: 'error'; message: string };
type Capture = { generation: number } & (
  { status: 'idle' | 'requesting' | 'preview' } | { status: 'captured'; input: CodeInput } | { status: 'error'; message: string }
);
export type ProductChooserHandle = { cancelIdentification: () => void };

function SavedProductChoice({ product, month, disabled, onChoose }: {
  product: ProductSummary; month: string; disabled: boolean; onChoose: (id: number) => void;
}) {
  return <ProductRow product={product}>
    {product.archived ? <>
      <Text>Reactivate this existing product from details before selecting it.</Text>
      <Action label={`Open archived product ${product.name}`} disabled={disabled} onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id, month } })} />
    </> : <Action label={`Use product ${product.name} · Product ${product.id}`} disabled={disabled} onPress={() => onChoose(product.id)} />}
  </ProductRow>;
}

export function ProductChooser({ month, subcategories, onChoose, disabled, visible = true, cameraEnabled = false, ref }: {
  month: string; subcategories: SubcategoryRow[]; onChoose: (id: number) => void; disabled: boolean; visible?: boolean; cameraEnabled?: boolean; ref?: Ref<ProductChooserHandle>;
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
  const [capture, setCapture] = useState<Capture>({ status: 'idle', generation: 0 });
  const captureRef = useRef(capture);
  const [permission, requestPermission, refreshPermission] = useCameraPermissions({ get: cameraEnabled });
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const latest = useRef({ visible, disabled, onChoose });
  useLayoutEffect(() => { latest.current = { visible, disabled, onChoose }; }, [visible, disabled, onChoose]);
  const mounted = useRef(true);
  const listReadId = useRef(0);
  const lookupReadId = useRef(0);
  const previewId = useRef(0);
  const [previewSession, setPreviewSession] = useState(0);
  const invalidatePreview = useCallback(() => { previewId.current++; setPreviewSession(previewId.current); }, []);
  const lastLookup = useRef<CodeInput | null>(null);
  const changeCapture = useCallback((next: Capture) => { captureRef.current = next; setCapture(next); }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    setFocused(true);
    return () => { focusedRef.current = false; setFocused(false); lookupReadId.current++; invalidatePreview(); };
  }, [invalidatePreview]));
  useLayoutEffect(() => { if (!visible || disabled) invalidatePreview(); }, [visible, disabled, invalidatePreview]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppState(state);
      if (state !== 'active') { lookupReadId.current++; invalidatePreview(); }
      else if (cameraEnabled) {
        const generation = captureRef.current.generation;
        void refreshPermission().catch(() => {
          if (mounted.current && captureRef.current.generation === generation && captureRef.current.status !== 'captured') changeCapture({ status: 'error', generation, message: 'Could not read camera permission. Your entries are kept. Retry the camera or use manual search and code entry.' });
        });
      }
    });
    return () => subscription.remove();
  }, [cameraEnabled, refreshPermission, changeCapture, invalidatePreview]);
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
    const generation = captureRef.current.generation;
    setLookup({ status: 'loading' });
    void grocery.lookupCode(input).then((product) => {
      if (lookupReadId.current !== request || captureRef.current.generation !== generation || !mounted.current || !latest.current.visible || !focusedRef.current || AppState.currentState !== 'active') return;
      setLookup({ status: 'ready', product });
      if (selectOwner && product && !product.archived && !latest.current.disabled) {
        lookupReadId.current++;
        latest.current.onChoose(product.id);
      }
    }).catch((failure: unknown) => {
      if (lookupReadId.current === request && captureRef.current.generation === generation && mounted.current) setLookup({ status: 'error', message: `${failure instanceof Error ? failure.message : 'Could not look up the code.'} Your code is kept. Correct it or retry.` });
    });
  }, [grocery]);
  useFocusEffect(useCallback(() => {
    if (visible && appState === 'active' && lastLookup.current) resolveCode(lastLookup.current);
    return () => { lookupReadId.current++; };
  }, [resolveCode, visible, appState]));
  const clearLookup = useCallback(() => {
    lookupReadId.current++;
    lastLookup.current = null;
    changeCapture({ status: 'idle', generation: captureRef.current.generation + 1 });
    setLookup({ status: 'idle' });
  }, [changeCapture]);
  useImperativeHandle(ref, () => ({ cancelIdentification: clearLookup }), [clearLookup]);
  const findCode = () => {
    if (format === null) { setLookup({ status: 'error', message: 'Choose the code format before looking it up.' }); return; }
    clearLookup();
    lastLookup.current = { format, value: code };
    resolveCode(lastLookup.current);
  };
  const retryCode = () => { if (lastLookup.current) resolveCode(lastLookup.current); else findCode(); };
  const openCamera = async () => {
    const previous = captureRef.current;
    if (latest.current.disabled || !latest.current.visible || !focusedRef.current || AppState.currentState !== 'active' || previous.status === 'requesting') return;
    clearLookup();
    const generation = captureRef.current.generation;
    changeCapture({ status: 'requesting', generation });
    setChoosingFormat(false);
    Keyboard.dismiss();
    try {
      const access = permission?.granted || permission?.canAskAgain === false ? permission : await requestPermission();
      if (!mounted.current || captureRef.current.generation !== generation || captureRef.current.status !== 'requesting') return;
      changeCapture(access?.granted ? { status: 'preview', generation } : { status: 'error', generation, message: 'Camera permission is denied. Your entries are kept. Use manual search or type the code below.' });
    } catch {
      if (mounted.current && captureRef.current.generation === generation) changeCapture({ status: 'error', generation, message: 'Could not open the camera. Your entries are kept. Retry or use manual search and code entry.' });
    }
  };
  const scanned = (result: BarcodeScanningResult) => {
    if (!mounted.current || latest.current.disabled || !latest.current.visible || !focusedRef.current || AppState.currentState !== 'active' || captureRef.current.status !== 'preview' || captureRef.current.generation !== capture.generation || previewId.current !== previewSession) return;
    try {
      const input = cameraCode(result, Platform.OS);
      changeCapture({ status: 'captured', generation: capture.generation, input });
      setFormat(input.format);
      setCode(input.value);
      setChoosingFormat(false);
      lastLookup.current = input;
      resolveCode(input, true);
    } catch (failure) {
      changeCapture({ status: 'error', generation: capture.generation, message: `${failure instanceof Error ? failure.message : 'Could not read this code.'} Use manual search or typed entry.` });
    }
  };
  const chooseSaved = (id: number) => { clearLookup(); onChoose(id); };
  const preview = cameraEnabled && visible && focused && appState === 'active' && permission?.granted && !disabled && capture.status === 'preview';
  const openSettings = () => {
    const generation = captureRef.current.generation;
    void Linking.openSettings().catch(() => {
      if (mounted.current && captureRef.current.generation === generation) changeCapture({ status: 'error', generation, message: 'Could not open Settings. Enable camera permission in the app settings, or use manual search and code entry.' });
    });
  };
  const selectedSubcategory = subcategories.find((row) => row.id === subcategoryId);
  const chooseSubcategory = (id: number | null) => {
    if (id !== subcategoryId) { listReadId.current++; setRows(null); setSubcategoryId(id); }
    setChoosingSubcategory(false);
  };
  return <View style={visible ? { gap: 16 } : { display: 'none' }} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
    {cameraEnabled ? <>
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>Scan a product code</Text>
      <Text>Scanning identifies a product. Confirm the paid price and store before saving. Manual search and code entry remain available below.</Text>
      {permission === null ? <Text>Camera permission is loading. You can use manual search or code entry.</Text> : null}
      <Action label={capture.status === 'captured' ? 'Retake code' : capture.status === 'requesting' ? 'Requesting camera permission…' : capture.status === 'preview' ? 'Camera open' : capture.status === 'error' ? 'Retry camera' : 'Open camera'} disabled={disabled || capture.status === 'requesting' || capture.status === 'preview' || (!!permission && !permission.granted && !permission.canAskAgain)} onPress={() => { void openCamera(); }} />
      {capture.status === 'error' ? <ErrorMessage message={capture.message} /> : null}
      {permission && !permission.granted && !permission.canAskAgain ? <Action label="Open camera permission settings" disabled={disabled} onPress={openSettings} /> : null}
      {preview ? <CameraView key={capture.generation} style={{ width: '100%', height: 260 }} facing="back" autofocus="on" barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean8', 'ean13', 'qr'] }} onBarcodeScanned={scanned} onMountError={() => {
        if (mounted.current && captureRef.current.generation === capture.generation && previewId.current === previewSession && captureRef.current.status === 'preview') changeCapture({ status: 'error', generation: capture.generation, message: 'The camera preview could not start. Your entries are kept. Retry or use manual search and code entry.' });
      }} /> : null}
      {capture.status === 'preview' ? <><Text>Point the back camera at a UPC, EAN or QR label. If it is unreadable, close the camera and type the code or search by name.</Text><Action label="Close camera" disabled={disabled} onPress={clearLookup} /></> : null}
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
    {lookup.status === 'error' ? <><ErrorMessage message={lookup.message} /><Action label="Retry code lookup" disabled={disabled} onPress={retryCode} /></> : lookup.status === 'ready' ? lookup.product ? <SavedProductChoice product={lookup.product} month={month} disabled={disabled} onChoose={chooseSaved} /> : <Text>No saved product owns this code. Your code is kept. Change it or choose another saved product. This lookup does not attach a code.</Text> : null}
  </View>;
}
