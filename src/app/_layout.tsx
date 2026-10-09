import { Stack } from 'expo-router/stack';
import { GroceryProvider } from '../data/provider';

export default function RootLayout() {
  return <GroceryProvider><Stack>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="purchase" options={{ title: 'Add purchase' }} />
  </Stack></GroceryProvider>;
}
