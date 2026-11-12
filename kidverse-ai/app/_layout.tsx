import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ProfilesProvider } from '@/contexts/ProfilesContext';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <ProfilesProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: '#F8FAFC' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="realm/[tier]"
          options={{ title: 'Realm Hub', headerBackTitle: 'Home' }}
        />
        <Stack.Screen
          name="play/[sessionId]"
          options={{ title: 'Adventure', headerBackTitle: 'Hub' }}
        />
        <Stack.Screen
          name="parent"
          options={{ title: 'Parent Dashboard', presentation: 'modal' }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
    </ProfilesProvider>
  );
}
