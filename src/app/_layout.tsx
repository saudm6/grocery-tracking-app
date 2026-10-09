import { Stack } from 'expo-router/stack';
import { GroceryProvider } from '../data/provider';

export default function RootLayout() {
  return <GroceryProvider><Stack>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="purchase" options={{ title: 'Add purchase' }} />
    <Stack.Screen name="brands" options={{ title: 'Brands' }} />
    <Stack.Screen name="stores" options={{ title: 'Stores' }} />
  </Stack></GroceryProvider>;
}
