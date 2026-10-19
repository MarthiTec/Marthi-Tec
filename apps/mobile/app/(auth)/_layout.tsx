import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { useThemeColors } from '../../src/hooks/useThemeColors';

export default function AuthLayout() {
  const { token, loading } = useAuth();
  const c = useThemeColors();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.side }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (token) return <Redirect href="/(app)/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
