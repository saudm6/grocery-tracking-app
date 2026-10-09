import { Link } from 'expo-router';
import { ScrollView, Text } from 'react-native';

export default function Home() {
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 16 }}>
    <Text style={{ fontSize: 20 }}>Record your groceries offline.</Text>
    <Text>Monthly analytics will appear here in a later slice.</Text>
    <Link href="/spending" accessibilityLabel="Open Total Spending" style={{ fontSize: 18, color: '#21643c', paddingVertical: 12 }}>Open Total Spending</Link>
  </ScrollView>;
}
