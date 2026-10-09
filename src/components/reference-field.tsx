import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Reference, ReferenceRow } from '../data/grocery';
import { Action, Field } from './form';

export function ReferenceField({ label, kind, value, rows, onChange, editable }: {
  label: string; kind: 'brand' | 'store' | 'category' | 'subcategory'; value: Reference; rows: ReferenceRow[];
  onChange: (value: Reference) => void; editable: boolean;
}) {
  const [choosing, setChoosing] = useState(false);
  const selected = value.id === undefined ? undefined : rows.find((row) => row.id === value.id);
  const text = value.id === undefined ? value.name : selected?.name ?? 'Saved record unavailable';
  return <View style={{ gap: 10 }}>
    <Field label={label} value={text} onChangeText={(name) => onChange({ name })} editable={editable} />
    {value.id !== undefined ? <Text>Use saved {kind} · {text}</Text> : text.trim() ? <Text>Create new {kind} · {text.trim()}</Text> : null}
    {rows.length ? <Action label={choosing ? `Close saved ${kind} choices` : `Choose saved ${kind}`} disabled={!editable} onPress={() => setChoosing((open) => !open)} /> : null}
    {choosing ? rows.map((row) => <Action key={row.id} label={`Use ${kind} ${row.name}`} disabled={!editable} onPress={() => { onChange({ id: row.id }); setChoosing(false); }} />) : null}
  </View>;
}
