import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { Action, ErrorMessage, Field } from '../components/form';
import type { ReferenceRow, SubcategoryRow } from '../data/grocery';
import { useGrocery } from '../data/provider';
import { createSubmission } from '../data/submission';

type Kind = 'brands' | 'stores' | 'categories';
const nouns = { brands: 'brand', stores: 'store', categories: 'category' };

function ReferenceEditor({ kind, record, onSaved, onCancel }: {
  kind: Kind; record: ReferenceRow | null; onSaved: () => void; onCancel: () => void;
}) {
  const grocery = useGrocery();
  const noun = nouns[kind];
  const [name, setName] = useState(record?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = useRef(createSubmission(setSaving)).current;
  const save = async () => {
    try {
      await submit(async () => {
        setError('');
        const savedId = await ({ brands: grocery.saveBrand, stores: grocery.saveStore, categories: grocery.saveCategory }[kind])({ id: record?.id, name });
        onSaved();
        return savedId;
      });
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : `Could not save the ${noun}.`} Your name is kept. Correct it or retry.`);
    }
  };
  return <View style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={{ fontSize: 22 }}>{record ? `Rename ${record.name}` : `Add ${noun}`}</Text>
    <Field label={`${noun[0].toUpperCase()}${noun.slice(1)} name`} value={name} onChangeText={setName} editable={!saving} autoFocus returnKeyType="done" onSubmitEditing={() => { void save(); }} />
    {error ? <ErrorMessage message={error} /> : null}
    <Action label={saving ? `Saving ${noun}…` : `Save ${noun}`} disabled={saving} onPress={() => { void save(); }} />
    <Action label={`Cancel ${noun} edit`} disabled={saving} onPress={onCancel} />
  </View>;
}

export default function ReferencesPage({ kind }: { kind: Kind }) {
  const grocery = useGrocery();
  const noun = nouns[kind];
  const [rows, setRows] = useState<ReferenceRow[] | null>(null);
  const [children, setChildren] = useState<SubcategoryRow[]>([]);
  const [readError, setReadError] = useState('');
  const readId = useRef(0);
  const [editor, setEditor] = useState<ReferenceRow | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const refresh = useCallback(() => {
    const request = ++readId.current;
    void grocery.listReferences().then((refs) => { if (readId.current === request) { setRows(refs[kind]); setChildren(refs.subcategories); setReadError(''); } })
      .catch(() => { if (readId.current === request) setReadError(`Could not refresh ${kind}. Retry to see the saved list.`); });
    return () => { readId.current++; };
  }, [grocery, kind]);
  useFocusEffect(refresh);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      <Text>Rename a {noun} to correct its name everywhere. Previous purchases keep their identities and paid amounts.</Text>
      {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
      {readError ? <><ErrorMessage message={readError} /><Action label={`Retry ${kind}`} onPress={refresh} /></> : rows === null ? <ActivityIndicator accessibilityLabel={`Loading ${kind}`} /> : null}
      {editor !== null ? <ReferenceEditor key={editor === 'new' ? 'new' : editor.id} kind={kind} record={editor === 'new' ? null : editor} onCancel={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice(`${noun[0].toUpperCase()}${noun.slice(1)} saved.`); refresh(); }} /> : <>
        <Action label={`Add ${noun}`} disabled={rows === null || !!readError} onPress={() => { setNotice(''); setEditor('new'); }} />
        {rows?.length === 0 ? <Text>No {kind} yet. Add a {noun} here or while recording a purchase.</Text> : rows?.map((row) => <View key={row.id} style={{ padding: 16, gap: 8, borderWidth: 1, borderColor: '#657469', borderRadius: 10, backgroundColor: '#fff' }}>
          <Text selectable style={{ fontSize: 20, color: '#17251b' }}>{row.name}</Text>
          <Action label={`Rename ${noun} ${row.name}`} disabled={!!readError} onPress={() => { setNotice(''); setEditor(row); }} />
          {kind === 'categories' ? <>
            <Text>Subcategories</Text>
            {children.some((child) => child.categoryId === row.id) ? children.filter((child) => child.categoryId === row.id).map((child) => <Action key={child.id} label={`Open subcategory ${row.name} / ${child.name}`} disabled={!!readError} onPress={() => router.push({ pathname: '/subcategory/[id]', params: { id: child.id } })} />) : <Text>No subcategories in this category yet.</Text>}
          </> : null}
        </View>)}
        {kind === 'categories' ? <Action label="Manage subcategories" onPress={() => router.push('/subcategories')} /> : null}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
