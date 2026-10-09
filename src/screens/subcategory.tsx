import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Action, ErrorMessage } from '../components/form';
import { formatOMR, type SubcategoryDetails } from '../data/grocery';
import { useGrocery } from '../data/provider';

export default function Subcategory() {
  const params = useLocalSearchParams<{ id: string }>();
  const subcategoryId = typeof params.id === 'string' && /^[1-9]\d*$/.test(params.id) ? Number(params.id) : NaN;
  const grocery = useGrocery();
  const [details, setDetails] = useState<SubcategoryDetails | null>(null);
  const [error, setError] = useState('');
  const readId = useRef(0);
  const refresh = useCallback(() => {
    const request = ++readId.current;
    void grocery.getSubcategoryDetails(subcategoryId).then((saved) => { if (readId.current === request) { setDetails(saved); setError(''); } })
      .catch((failure: unknown) => { if (readId.current === request) setError(`${failure instanceof Error ? failure.message : 'Could not read this subcategory.'} Retry to see saved details.`); });
    return () => { readId.current++; };
  }, [grocery, subcategoryId]);
  useFocusEffect(refresh);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
    {error ? <><ErrorMessage message={error} /><Action label="Retry subcategory details" onPress={refresh} /></> : details === null ? <ActivityIndicator accessibilityLabel="Loading subcategory details" /> : null}
    {details ? <>
      <Text selectable accessibilityRole="header" style={{ fontSize: 24 }}>{details.category} / {details.name}</Text>
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>Current linked products</Text>
      {details.products.length === 0 ? <Text>No products are currently assigned to this subcategory. Earlier purchases still appear in recorded spending below.</Text> : details.products.map((product) => <View key={product.id} style={{ gap: 6 }}>
        <Text selectable>{product.name} · {product.brand ?? 'No brand'}{product.archived ? ' · Archived' : ''}</Text>
        <Action label={`Open linked product ${product.name} · Product ${product.id}`} disabled={!!error} onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })} />
      </View>)}
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>All recorded spending</Text>
      <Text selectable>Total · {formatOMR(details.total)} OMR</Text>
      <Text>These amounts use each purchase&apos;s recorded subcategory, brand, quantity, and paid price. Reassigning a product does not move its earlier spending.</Text>
      {details.brands.length === 0 ? <Text>No purchases recorded in this subcategory yet.</Text> : details.brands.map((brand) => <View key={brand.brandId ?? 'none'} style={{ padding: 16, gap: 10, borderWidth: 1, borderColor: '#657469', borderRadius: 10, backgroundColor: '#fff' }}>
        <Text selectable accessibilityRole="header" style={{ fontSize: 20 }}>{brand.brand ?? 'No brand'} · {formatOMR(brand.total)} OMR</Text>
        {brand.products.map((product) => <View key={product.productId} style={{ gap: 6 }}>
          <Text selectable>{product.product} · Product {product.productId} · {formatOMR(product.total)} OMR</Text>
          <Action label={`Open recorded product ${product.product} · Product ${product.productId} · ${brand.brand ?? 'No brand'}`} disabled={!!error} onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.productId } })} />
        </View>)}
      </View>)}
    </> : null}
  </ScrollView>;
}
