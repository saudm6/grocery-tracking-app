import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Action, ErrorMessage } from '../components/form';
import { formatOMR, type ProductDetails } from '../data/grocery';
import { useGrocery } from '../data/provider';
import { createSubmission } from '../data/submission';

function ArchiveAction({ product, disabled, onCommitted }: { product: ProductDetails; disabled: boolean; onCommitted: (archived: boolean) => void }) {
  const grocery = useGrocery();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = useRef(createSubmission(setSaving)).current;
  const save = async () => {
    try {
      await submit(async () => {
        setError('');
        await grocery.setProductArchived(product.id, !product.archived);
        onCommitted(!product.archived);
      });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not change the product status. Retry.'); }
  };
  return <>
    {error ? <ErrorMessage message={error} /> : null}
    <Action label={saving ? 'Saving product status…' : product.archived ? 'Reactivate product' : 'Archive product'} disabled={saving || disabled} onPress={() => { void save(); }} />
  </>;
}

export default function Product() {
  const params = useLocalSearchParams<{ id: string }>();
  const productId = Number(params.id);
  const grocery = useGrocery();
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const readId = useRef(0);
  const refresh = useCallback(() => {
    const request = ++readId.current;
    void grocery.getProductDetails(productId).then((details) => { if (readId.current === request) { setProduct(details); setError(''); } })
      .catch((failure: unknown) => { if (readId.current === request) setError(`${failure instanceof Error ? failure.message : 'Could not read this product.'} Retry to see the saved details.`); });
    return () => { readId.current++; };
  }, [grocery, productId]);
  useFocusEffect(refresh);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
    {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
    {error ? <><ErrorMessage message={error} /><Action label="Retry product details" onPress={refresh} /></> : product === null ? <ActivityIndicator accessibilityLabel="Loading product details" /> : null}
    {product ? <>
      <Text selectable accessibilityRole="header" style={{ fontSize: 24 }}>{product.name}{product.archived ? ' · Archived' : ''}</Text>
      <Text selectable>Brand · {product.brand ?? 'No brand'}</Text>
      <Text selectable>Category · {product.category}{product.subcategory ? ` / ${product.subcategory}` : ''}</Text>
      {product.subcategoryId !== null ? <Action label={`Open subcategory ${product.category} / ${product.subcategory}`} disabled={!!error} onPress={() => router.push({ pathname: '/subcategory/[id]', params: { id: product.subcategoryId! } })} /> : null}
      <Text selectable>Saved price · {product.savedPrice === null ? 'Not set' : `${formatOMR(product.savedPrice)} OMR`}</Text>
      <Text selectable>Saved store · {product.savedStore ?? 'Not set'}</Text>
      <Text selectable>Price first set · {product.priceFirstSet ? new Date(product.priceFirstSet).toLocaleString() : 'Not set'}</Text>
      <Text selectable>Last saved price changed · {product.lastSavedPriceChanged ? new Date(product.lastSavedPriceChanged).toLocaleString() : 'Not set'}</Text>
      {product.archived ? <Text>Reactivate this product to edit it or record a new purchase. Its codes and history remain owned by this product.</Text> : <Action label="Edit product" disabled={!!error} onPress={() => router.push({ pathname: '/product-edit', params: { id: product.id } })} />}
      <ArchiveAction key={`${product.id}:${product.archived}`} product={product} disabled={!!error} onCommitted={(archived) => { setProduct({ ...product, archived }); setNotice(archived ? 'Product archived. Spending, codes, and history are kept.' : 'Product reactivated with its original identity.'); refresh(); }} />
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>Product codes</Text>
      {product.codes.length === 0 ? <Text>No codes. You can add a typed code when editing.</Text> : product.codes.map((code) => <View key={code.id} style={{ gap: 6 }}>
        <Text selectable>{code.format ? code.format.toUpperCase().replace('_', '-') : code.namespace === 'qr' ? 'QR' : 'Retail format not recorded'}</Text>
        <Text selectable>{code.namespace === 'qr' ? JSON.stringify(code.original) : code.original}</Text>
      </View>)}
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>Price history</Text>
      {product.history.length === 0 ? <Text>No price observations yet. Setting a saved price records one without spending.</Text> : product.history.map((observation) => <View key={observation.id} style={{ padding: 16, gap: 6, borderWidth: 1, borderColor: '#657469', borderRadius: 10, backgroundColor: '#fff' }}>
        <Text selectable>{formatOMR(observation.price)} OMR · {observation.effectiveDate ?? `${observation.effectiveMonth} · Exact date not supplied`}</Text>
        <Text selectable>{observation.baseline ? 'Timeline baseline' : observation.included ? 'Included in inflation' : 'Not inflation'}</Text>
        <Text selectable>Source · {observation.source === 'saved_price' ? 'Saved price' : 'Receipt'}{observation.sourcePurchaseId !== null ? ` · Purchase ${observation.sourcePurchaseId}` : ''}</Text>
        <Text selectable>Observed store · {observation.store ?? 'Not supplied'}</Text>
        <Text selectable>Recorded · {new Date(observation.recordedAt).toLocaleString()}</Text>
      </View>)}
    </> : null}
  </ScrollView>;
}
