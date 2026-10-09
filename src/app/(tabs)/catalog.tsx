import { router } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { Action } from '../../components/form';

export default function Catalog() {
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 16 }}>
    <Text>Manage the products, brands, categories, subcategories, and stores used in your groceries.</Text>
    <Action label="Products" onPress={() => router.push('/products')} />
    <Action label="Brands" onPress={() => router.push('/brands')} />
    <Action label="Categories" onPress={() => router.push('/categories')} />
    <Action label="Subcategories" onPress={() => router.push('/subcategories')} />
    <Action label="Stores" onPress={() => router.push('/stores')} />
    <Text>Catalog product saves do not record spending. You can also create products and categories while adding a purchase in Total Spending.</Text>
  </ScrollView>;
}
