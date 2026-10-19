import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { useThemeColors } from '../hooks/useThemeColors';
import { apiBaseUrl } from '../api/config';

export function LoginScreen() {
  const c = useThemeColors();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.side }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hero}>
        <Text style={styles.brand}>Marthi</Text>
        <Text style={styles.tag}>App do lojista · celular e assistência</Text>
      </View>

      <View style={[styles.card, { backgroundColor: c.card }]}>
        <Text style={[styles.heading, { color: c.ink }]}>Entrar</Text>
        <Text style={[styles.hint, { color: c.mute }]}>Use a mesma conta do painel web.</Text>

        <Text style={[styles.label, { color: c.mute }]}>E-mail</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          value={email}
          onChangeText={setEmail}
          placeholder="voce@loja.com.br"
          placeholderTextColor={c.mute}
          style={[styles.input, { color: c.ink, borderColor: c.line, backgroundColor: c.card2 }]}
        />

        <Text style={[styles.label, { color: c.mute }]}>Senha</Text>
        <TextInput
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={c.mute}
          style={[styles.input, { color: c.ink, borderColor: c.line, backgroundColor: c.card2 }]}
        />

        {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}

        <PrimaryButton label="Entrar" onPress={onSubmit} loading={busy} disabled={!email || !password} />

        <Text style={[styles.api, { color: c.mute }]}>API: {apiBaseUrl()}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 20 },
  hero: { marginBottom: 20, paddingHorizontal: 4 },
  brand: { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  tag: { color: 'rgba(255,255,255,0.7)', marginTop: 6, fontSize: 14 },
  card: { borderRadius: 16, padding: 18, gap: 8 },
  heading: { fontSize: 22, fontWeight: '800' },
  hint: { fontSize: 13, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  error: { fontSize: 13, marginVertical: 4 },
  api: { fontSize: 11, marginTop: 10, textAlign: 'center' },
});
