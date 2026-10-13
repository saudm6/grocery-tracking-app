import { ScrollView, Text } from 'react-native';
import { Action, pushScreen } from '../../components/form';

export default function Catalog() {
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 16 }}>
    <Text>Manage the products, brands, categories, subcategories, and stores used in your groceries.</Text>
    <Action label="Products" onPress={() => pushScreen('/products')} />
    <Action label="Brands" onPress={() => pushScreen('/brands')} />
    <Action label="Categories" onPress={() => pushScreen('/categories')} />
    <Action label="Subcategories" onPress={() => pushScreen('/subcategories')} />
    <Action label="Stores" onPress={() => pushScreen('/stores')} />
    <Text>Catalog product saves do not record spending. You can also create products and categories while adding a purchase in Total Spending.</Text>
    <Text>Backup exports all your grocery data to one file, or replaces it with a backup file.</Text>
    <Action label="Backup" onPress={() => pushScreen('/backup')} />
  </ScrollView>;
}
