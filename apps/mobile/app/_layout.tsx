import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { AuthProvider } from '../src/auth/AuthContext';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <AuthProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'light'} />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
