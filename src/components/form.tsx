import { Button, Host } from '@expo/ui';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 6 }}>
    <Text style={{ color: '#17251b', fontSize: 16 }}>{label}</Text>
    <TextInput {...props} accessibilityLabel={label} style={{ borderWidth: 1, borderColor: '#657469', borderRadius: 8, padding: 12, minHeight: 48, fontSize: 18, color: '#17251b', backgroundColor: '#fff' }} />
  </View>;
}
export function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Host matchContents={{ vertical: true }} style={{ minHeight: 48 }}><Button label={label} onPress={onPress} disabled={disabled} style={{ paddingVertical: 6 }} /></Host>;
}
export function ErrorMessage({ message }: { message: string }) {
  return <Text selectable accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: '#a32020', fontSize: 16 }}>{message}</Text>;
}
