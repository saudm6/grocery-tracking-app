import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { Action, ErrorMessage, Field } from '../../components/form';
import { PriceChart } from '../../components/price-chart';
import { ProductRow } from '../../components/product-row';
import { formatOMR, localDate, validateMonth, type InflationProduct, type ReferenceRow } from '../../data/grocery';
import { useGrocery } from '../../data/provider';

type Filters = { startMonth: string; endMonth: string; categoryId: number | null };
type ReadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; products: InflationProduct[] };

export default function Inflation() {
  const grocery = useGrocery();
  const [selection, setSelection] = useState<Filters>(() => {
    const month = localDate().slice(0, 7);
    return { startMonth: month, endMonth: month, categoryId: null };
  });
  const [draft, setDraft] = useState(selection);
  const [filterError, setFilterError] = useState('');
  const [categories, setCategories] = useState<ReferenceRow[]>([]);
  const [choosingCategory, setChoosingCategory] = useState(false);
  const [read, setRead] = useState<ReadState>({ status: 'loading' });
  const readId = useRef(0);
  useFocusEffect(useCallback(() => {
    const request = ++readId.current;
    setRead({ status: 'loading' });
    void Promise.all([grocery.getInflation(selection.categoryId, selection.startMonth, selection.endMonth), grocery.listReferences()])
      .then(([products, references]) => { if (readId.current === request) { setCategories(references.categories); setRead({ status: 'ready', products }); } })
      .catch((error: unknown) => { if (readId.current === request) setRead({ status: 'error', message: error instanceof Error ? error.message : 'Could not read recorded price changes.' }); });
    return () => { readId.current++; };
  }, [grocery, selection]));
  const showRange = () => {
    try {
      const startMonth = validateMonth(draft.startMonth.trim());
      const endMonth = validateMonth(draft.endMonth.trim());
      if (startMonth > endMonth) throw new Error('The start month must be at or before the end month.');
      readId.current++;
      setRead({ status: 'loading' });
      setSelection({ ...draft, startMonth, endMonth });
      setFilterError('');
      setChoosingCategory(false);
    } catch (error) { setFilterError(error instanceof Error ? error.message : 'Choose a valid month range.'); }
  };
  const categoryLabel = (categoryId: number | null) => categoryId === null ? 'All categories' : categories.find((category) => category.id === categoryId)?.name ?? `Category ${categoryId}`;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
    <Text>Explore counted changes in recorded prices. Saved-price observations and explicitly applied receipts use their effective months. Spending and today’s saved defaults are separate.</Text>
    <Field label="Start month (YYYY-MM)" value={draft.startMonth} onChangeText={(startMonth) => setDraft((current) => ({ ...current, startMonth }))} autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
    <Field label="End month (YYYY-MM)" value={draft.endMonth} onChangeText={(endMonth) => setDraft((current) => ({ ...current, endMonth }))} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={showRange} />
    <Action label={`${choosingCategory ? 'Hide category choices' : 'Choose category'} · ${categoryLabel(draft.categoryId)}`} onPress={() => setChoosingCategory((shown) => !shown)} />
    {choosingCategory ? <>
      <Action label={`All categories${draft.categoryId === null ? ' · Selected' : ''}`} onPress={() => { setDraft((current) => ({ ...current, categoryId: null })); setChoosingCategory(false); }} />
      {categories.map((category) => <Action key={category.id} label={`${category.name}${draft.categoryId === category.id ? ' · Selected' : ''}`} onPress={() => { setDraft((current) => ({ ...current, categoryId: category.id })); setChoosingCategory(false); }} />)}
    </> : null}
    <Action label="Show range" onPress={showRange} />
    {filterError ? <ErrorMessage message={filterError} /> : null}
    <Text selectable accessibilityRole="header" style={{ fontSize: 22 }}>{selection.startMonth} through {selection.endMonth} · {categoryLabel(selection.categoryId)}</Text>
    {read.status === 'loading' ? <ActivityIndicator accessibilityLabel="Loading recorded price changes" /> : read.status === 'error' ? <>
      <ErrorMessage message={read.message} />
      <Action label="Retry inflation report" onPress={() => { readId.current++; setRead({ status: 'loading' }); setSelection({ ...selection }); }} />
    </> : <>
      <Text>Ranked by positive counted net increase. Included decreases offset increases. Categories reflect the product’s current grouping; archived products keep their history.</Text>
      {read.products.length === 0 ? <>
        <Text>No positive counted net increases in this range. Try another range or category. Product details show all observations and their inflation status.</Text>
        <Action label="Open products" onPress={() => router.push('/products')} />
      </> : read.products.map((product, index) => <ProductRow key={product.id} product={product}>
        <Text selectable>Rank {index + 1} · Current category · {product.category}{product.subcategory ? ` / ${product.subcategory}` : ''}</Text>
        <Text selectable style={{ fontSize: 22, fontVariant: ['tabular-nums'] }}>Counted net increase · {formatOMR(product.increase)} OMR</Text>
        <Text selectable>{product.percentIncrease === null ? 'Percentage unavailable · Reference price is zero' : `Percentage increase · ${product.percentIncrease.toFixed(2)}%`}</Text>
        <Text selectable>Reference price · {formatOMR(product.referencePrice)} OMR · Actual predecessor of the first included change in this range</Text>
        <Text selectable>Price at period end · {formatOMR(product.periodEndPrice)} OMR · Latest actual observation through {selection.endMonth}, including Not inflation prices</Text>
        <PriceChart points={product.points} />
        <Action label={`Open product ${product.name} · Full price history`} onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })} />
      </ProductRow>)}
    </>}
  </ScrollView>;
}
