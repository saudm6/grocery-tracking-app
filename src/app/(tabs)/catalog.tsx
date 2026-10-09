import { router } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { Action } from '../../components/form';

export default function Catalog() {
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 16 }}>
    <Text>Manage the brands and stores used in your groceries.</Text>
    <Action label="Brands" onPress={() => router.push('/brands')} />
    <Action label="Stores" onPress={() => router.push('/stores')} />
    <Text>You can create products and categories while adding a purchase in Total Spending.</Text>
  </ScrollView>;
}
