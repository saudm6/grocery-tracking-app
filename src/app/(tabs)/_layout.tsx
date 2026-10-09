import { Tabs } from 'expo-router';

export default function TabLayout() {
  return <Tabs screenOptions={{ tabBarActiveTintColor: '#21643c', tabBarLabelStyle: { fontSize: 12 }, tabBarIconStyle: { display: 'none' } }}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} />
    <Tabs.Screen name="spending" options={{ title: 'Total Spending' }} />
    <Tabs.Screen name="inflation" options={{ title: 'Inflation' }} />
    <Tabs.Screen name="catalog" options={{ title: 'Catalog' }} />
  </Tabs>;
}
