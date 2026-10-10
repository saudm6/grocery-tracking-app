import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Action, ErrorMessage } from '../components/form';
import { formatOMR, type SubcategoryDetails } from '../data/grocery';
import { useGrocery } from '../data/provider';
import { createSubmission } from '../data/submission';

function PrimaryBrandEditor({ details, readReady, refresh, onSaved, onCancel }: {
  details: SubcategoryDetails; readReady: boolean; refresh: () => void; onSaved: () => void; onCancel: () => void;
}) {
  const grocery = useGrocery();
  const [brandId, setBrandId] = useState(details.primaryBrandId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = useRef(createSubmission(setSaving)).current;
  const selected = details.eligibleBrands.find((brand) => brand.id === brandId);
  const save = async () => {
    try {
      await submit(async () => {
        if (!readReady) throw new Error('Retry subcategory details before saving.');
        setError('');
        await grocery.setPrimaryBrand(details.id, brandId);
        onSaved();
      });
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'Could not save the primary brand.'} Your brand choice is kept. Correct it or retry.`);
      refresh();
    }
  };
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ fontSize: 22 }}>Choose primary brand</Text>
    <Text selectable>Selected primary · {brandId === null ? 'No primary brand' : selected?.name ?? `Saved brand ${brandId} unavailable`}</Text>
    {brandId !== null && !selected ? <ErrorMessage message="The selected brand no longer has an active product here. Choose another eligible brand or no primary brand." /> : null}
    {details.eligibleBrands.length === 0 ? <Text>No branded active products in this subcategory. Add or assign one before choosing a primary brand.</Text> : details.eligibleBrands.map((brand) =>
      <Action key={brand.id} label={`Use primary brand ${brand.name}`} disabled={saving || !readReady} onPress={() => setBrandId(brand.id)} />)}
    <Action label="Use no primary brand" disabled={saving || !readReady} onPress={() => setBrandId(null)} />
    {error ? <ErrorMessage message={error} /> : null}
    <Action label={saving ? 'Saving primary brand…' : 'Save primary brand'} disabled={saving || !readReady || (brandId !== null && !selected)} onPress={() => { void save(); }} />
    <Action label="Cancel primary brand edit" disabled={saving} onPress={onCancel} />
  </View>;
}

export default function Subcategory() {
  const params = useLocalSearchParams<{ id: string }>();
  const subcategoryId = typeof params.id === 'string' && /^[1-9]\d*$/.test(params.id) ? Number(params.id) : NaN;
  const grocery = useGrocery();
  const [details, setDetails] = useState<SubcategoryDetails | null>(null);
  const [error, setError] = useState('');
  const [readReady, setReadReady] = useState(false);
  const [editingPrimary, setEditingPrimary] = useState(false);
  const [notice, setNotice] = useState('');
  const readId = useRef(0);
  const refresh = useCallback(() => {
    const request = ++readId.current;
    setReadReady(false);
    void grocery.getSubcategoryDetails(subcategoryId).then((saved) => { if (readId.current === request) { setDetails(saved); setError(''); setReadReady(true); } })
      .catch((failure: unknown) => { if (readId.current === request) setError(`${failure instanceof Error ? failure.message : 'Could not read this subcategory.'} Retry to see saved details.`); });
    return () => { readId.current++; };
  }, [grocery, subcategoryId]);
  useFocusEffect(refresh);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
    {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
    {error ? <><ErrorMessage message={error} /><Action label="Retry subcategory details" onPress={refresh} /></> : details === null ? <ActivityIndicator accessibilityLabel="Loading subcategory details" /> : null}
    {details ? <>
      <Text selectable accessibilityRole="header" style={{ fontSize: 24 }}>{details.category} / {details.name}</Text>
      <Text selectable>Current primary brand · {details.primaryBrandId === null ? 'Not selected' : details.eligibleBrands.find((brand) => brand.id === details.primaryBrandId)?.name ?? 'Saved brand unavailable'}</Text>
      <Text>The primary brand comes first in manual choices within this subcategory. You still choose the exact product. Codes identify their own product, and earlier purchases keep their actual brand.</Text>
      {editingPrimary ? <PrimaryBrandEditor key={details.id} details={details} readReady={readReady} refresh={refresh} onCancel={() => setEditingPrimary(false)} onSaved={() => { setEditingPrimary(false); setNotice('Primary brand saved.'); refresh(); }} /> :
        <Action label="Change primary brand" disabled={!readReady} onPress={() => { setNotice(''); setEditingPrimary(true); }} />}
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
