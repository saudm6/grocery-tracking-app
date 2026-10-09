import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Action, ErrorMessage, Field } from '../components/form';
import type { ProductSummary } from '../data/grocery';
import { useGrocery } from '../data/provider';

export default function Products() {
  const grocery = useGrocery();
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [rows, setRows] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState('');
  const readId = useRef(0);
  const refresh = useCallback(() => {
    const request = ++readId.current;
    void grocery.listProducts(search, includeArchived).then((products) => { if (readId.current === request) { setRows(products); setError(''); } })
      .catch(() => { if (readId.current === request) setError('Could not refresh products. Retry to see the saved catalog.'); });
    return () => { readId.current++; };
  }, [grocery, search, includeArchived]);
  useFocusEffect(refresh);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
    <Text>Find a product by name. Catalog saves keep your month totals unchanged.</Text>
    <Field label="Search product names" value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" />
    <Action label={includeArchived ? 'Hide archived products' : 'Show archived products'} onPress={() => setIncludeArchived((shown) => !shown)} />
    <Action label="Add product" onPress={() => router.push('/product-edit')} />
    {error ? <><ErrorMessage message={error} /><Action label="Retry products" onPress={refresh} /></> : rows === null ? <ActivityIndicator accessibilityLabel="Loading products" /> : null}
    {rows?.length === 0 ? <Text>{search.trim() ? 'No matching products. Change the search or add a product.' : 'No products here yet. Add one with or without a code.'}</Text> : rows?.map((product) => <View key={product.id} style={{ padding: 16, gap: 8, borderWidth: 1, borderColor: '#657469', borderRadius: 10, backgroundColor: '#fff' }}>
      <Text selectable style={{ fontSize: 20, color: '#17251b' }}>{product.name}</Text>
      <Text selectable>Brand · {product.brand ?? 'No brand'}{product.archived ? ' · Archived' : ''}</Text>
      <Action label={`Open ${product.archived ? 'archived ' : ''}product ${product.name}`} onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })} />
    </View>)}
  </ScrollView>;
}
