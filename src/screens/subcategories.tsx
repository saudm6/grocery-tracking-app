import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { Action, ErrorMessage, Field } from '../components/form';
import type { References, SubcategoryRow } from '../data/grocery';
import { useGrocery } from '../data/provider';
import { createSubmission } from '../data/submission';

function SubcategoryEditor({ record, references, readError, refresh, onSaved, onCancel }: {
  record: SubcategoryRow | null; references: References; readError: string; refresh: () => void; onSaved: () => void; onCancel: () => void;
}) {
  const grocery = useGrocery();
  const [name, setName] = useState(record?.name ?? '');
  const [parentId, setParentId] = useState<number | null>(record?.categoryId ?? null);
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = useRef(createSubmission(setSaving)).current;
  const parent = references.categories.find((row) => row.id === parentId);
  const save = async () => {
    try {
      await submit(async () => {
        setError('');
        const savedId = await grocery.saveSubcategory({ id: record?.id, name, parentCategoryId: parentId ?? 0 });
        onSaved();
        return savedId;
      });
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'Could not save the subcategory.'} Your name and parent choice are kept. Correct them or retry.`);
      refresh();
    }
  };
  return <View style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={{ fontSize: 22 }}>{record ? `Rename ${record.name}` : 'Add subcategory'}</Text>
    <Field label="Subcategory name" value={name} onChangeText={setName} editable={!saving} autoFocus returnKeyType="done" onSubmitEditing={() => { void save(); }} />
    <Text selectable>Parent category · {parent?.name ?? (parentId === null ? 'Choose a category' : 'Saved category unavailable')}</Text>
    {record ? <Text>Renaming keeps this subcategory in its parent category.</Text> : <>
      {references.categories.length ? <Action label={choosing ? 'Close parent category choices' : 'Choose parent category'} disabled={saving || !!readError} onPress={() => setChoosing((open) => !open)} /> : <Text>Add a category first. Your subcategory name stays here while you visit Categories.</Text>}
      {choosing ? references.categories.map((category) => <Action key={category.id} label={`Use parent category ${category.name}`} disabled={saving || !!readError} onPress={() => { setParentId(category.id); setChoosing(false); }} />) : null}
      <Action label="Manage parent categories" disabled={saving} onPress={() => router.push('/categories')} />
    </>}
    {error ? <ErrorMessage message={error} /> : null}
    <Action label={saving ? 'Saving subcategory…' : 'Save subcategory'} disabled={saving || !!readError} onPress={() => { void save(); }} />
    <Action label="Cancel subcategory edit" disabled={saving} onPress={onCancel} />
  </View>;
}

export default function Subcategories() {
  const grocery = useGrocery();
  const [references, setReferences] = useState<References | null>(null);
  const [readError, setReadError] = useState('');
  const [editor, setEditor] = useState<SubcategoryRow | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const readId = useRef(0);
  const refresh = useCallback(() => {
    const request = ++readId.current;
    void grocery.listReferences().then((rows) => { if (readId.current === request) { setReferences(rows); setReadError(''); } })
      .catch(() => { if (readId.current === request) setReadError('Could not refresh subcategories and parent choices. Retry to see saved records.'); });
    return () => { readId.current++; };
  }, [grocery]);
  useFocusEffect(refresh);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      <Text>A subcategory belongs to one category. Open it to see current products and spending recorded under that subcategory.</Text>
      {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
      {readError ? <><ErrorMessage message={readError} /><Action label="Retry subcategories" onPress={refresh} /></> : references === null ? <ActivityIndicator accessibilityLabel="Loading subcategories" /> : null}
      {editor !== null && references ? <SubcategoryEditor key={editor === 'new' ? 'new' : editor.id} record={editor === 'new' ? null : editor} references={references} readError={readError} refresh={refresh} onCancel={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice('Subcategory saved.'); refresh(); }} /> : <>
        <Action label="Add subcategory" disabled={!references || !!readError} onPress={() => { setNotice(''); setEditor('new'); }} />
        {references?.subcategories.length === 0 ? <Text>No subcategories yet. Add one here or enter a new subcategory while saving a product or purchase.</Text> : references?.subcategories.map((row) => <View key={row.id} style={{ padding: 16, gap: 8, borderWidth: 1, borderColor: '#657469', borderRadius: 10, backgroundColor: '#fff' }}>
          <Text selectable style={{ fontSize: 20, color: '#17251b' }}>{row.category} / {row.name}</Text>
          <Action label={`Open subcategory ${row.category} / ${row.name}`} disabled={!!readError} onPress={() => router.push({ pathname: '/subcategory/[id]', params: { id: row.id } })} />
          <Action label={`Rename subcategory ${row.category} / ${row.name}`} disabled={!!readError} onPress={() => { setNotice(''); setEditor(row); }} />
        </View>)}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
