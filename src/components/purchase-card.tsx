import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { formatOMR, type PurchaseRow } from '../data/grocery';
import { Action } from './form';

export function PurchaseCard({ purchase, disabled }: { purchase: PurchaseRow; disabled: boolean }) {
  return <View style={{ padding: 16, gap: 6, borderWidth: 1, borderColor: '#657469', borderRadius: 10, backgroundColor: '#fff' }}>
    <Text selectable style={{ fontSize: 20, color: '#17251b' }}>{purchase.product}</Text>
    <Text selectable>Brand · {purchase.brand ?? 'No brand'}</Text>
    <Text selectable>Category · {purchase.category}{purchase.subcategory ? ` / ${purchase.subcategory}` : ''}</Text>
    <Text selectable>Store · {purchase.store}</Text>
    <Text selectable>{purchase.quantity} items × {formatOMR(purchase.unitPrice)} OMR each</Text>
    <Text selectable style={{ fontSize: 18, fontVariant: ['tabular-nums'] }}>Line total · {formatOMR(purchase.lineTotal)} OMR</Text>
    <Text selectable>Month · {purchase.month} · {purchase.purchaseDate ?? 'Exact purchase date not supplied'}</Text>
    <Action label={`Correct or delete ${purchase.product} · Purchase ${purchase.id}`} disabled={disabled} onPress={() => router.push({ pathname: '/purchase/[id]', params: { id: purchase.id } })} />
  </View>;
}
