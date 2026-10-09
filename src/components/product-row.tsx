import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { ProductSummary } from '../data/grocery';

export function ProductRow({ product, children }: { product: ProductSummary; children: ReactNode }) {
  return <View style={{ padding: 16, gap: 8, borderWidth: 1, borderColor: '#657469', borderRadius: 10, backgroundColor: '#fff' }}>
    <Text selectable style={{ fontSize: 20, color: '#17251b' }}>{product.name}</Text>
    <Text selectable>Brand · {product.brand ?? 'No brand'}{product.archived ? ' · Archived' : ''}</Text>
    <Text selectable>Product {product.id}</Text>
    {children}
  </View>;
}
