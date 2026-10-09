import { Text, View } from 'react-native';
import type { Grouping, Reference, References } from '../data/grocery';
import { Action } from './form';
import { ReferenceField } from './reference-field';

export function GroupingField({ value, references, onChange, editable }: {
  value: Grouping; references: References; onChange: (value: Grouping) => void; editable: boolean;
}) {
  const child = value.subcategory;
  const selected = child?.id === undefined ? undefined : references.subcategories.find((row) => row.id === child.id);
  const category: Reference = value.category ?? (child?.id === undefined ? child?.parentCategory ?? { name: '' } : selected ? { id: selected.categoryId } : { name: '' });
  const children = category.id === undefined ? [] : references.subcategories.filter((row) => row.categoryId === category.id);
  const subcategory: Reference = child?.id === undefined ? { name: child?.name ?? '' } : { id: child.id };
  const changeCategory = (parentCategory: Reference) => {
    onChange(child && child.id === undefined ? { subcategory: { name: child.name, parentCategory } } : { category: parentCategory });
  };
  const changeSubcategory = (reference: Reference) => {
    onChange(reference.id !== undefined ? { subcategory: { id: reference.id } } : reference.name === '' ? { category } : { subcategory: { name: reference.name, parentCategory: category } });
  };
  return <View style={{ gap: 12 }}>
    <ReferenceField label="Category" kind="category" value={category} rows={references.categories} onChange={changeCategory} editable={editable} />
    <Text>Choose an optional subcategory under this category. A blank subcategory assigns the product directly to the category. Changing category clears a saved subcategory choice.</Text>
    <ReferenceField label="Subcategory (optional)" kind="subcategory" value={subcategory} rows={children} onChange={changeSubcategory} editable={editable} />
    {child ? <Action label="Use direct category only" disabled={!editable} onPress={() => onChange({ category })} /> : null}
    {child?.id !== undefined && !selected ? <Text accessibilityRole="alert">The saved subcategory is unavailable. Retry saved references or choose another grouping.</Text> : null}
  </View>;
}
