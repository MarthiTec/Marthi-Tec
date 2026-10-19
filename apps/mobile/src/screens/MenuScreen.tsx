import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useThemeColors } from '../hooks/useThemeColors';
import { canSeeReports } from '../permissions/areas';
import { apiBaseUrl } from '../api/config';

function Row({ label, value }: { label: string; value: string }) {
  const c = useThemeColors();
  return (
    <View style={[styles.row, { borderBottomColor: c.line }]}>
      <Text style={{ color: c.mute, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: c.ink, fontWeight: '600', marginTop: 2 }}>{value}</Text>
    </View>
  );
}

export function MenuScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { user, access, storeId, stores, logout } = useAuth();
  const store = stores.find((s) => s.id === storeId);

  return (
    <Screen title="Menu" subtitle="Conta e configuração">
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <Row label="Perfil" value={user?.name ?? '—'} />
        <Row label="E-mail" value={user?.email ?? '—'} />
        <Row label="Papel" value={access?.role ?? user?.role ?? '—'} />
        <Row label="Loja" value={store?.tradeName ?? storeId ?? '—'} />
        <Row
          label="Acesso"
          value={access?.fullAccess ? 'Completo (admin/gerente)' : (access?.accessAreas ?? []).join(', ') || '—'}
        />
      </View>

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <Text style={[styles.section, { color: c.ink }]}>Atalhos</Text>
        <Pressable style={styles.soon} onPress={() => router.push('/(app)/activities')}>
          <Text style={{ color: c.ink, fontWeight: '700' }}>Atividades / auditoria</Text>
        </Pressable>
        {[
          { label: 'Relatórios', ok: canSeeReports(access) },
          { label: 'Loja', ok: true },
          { label: 'Configurações', ok: true },
        ].map((item) => (
          <Pressable key={item.label} disabled style={styles.soon}>
            <Text style={{ color: c.mute }}>
              {item.label}
              {item.ok ? '' : ' (sem permissão)'} · em breve
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ color: c.mute, fontSize: 11, textAlign: 'center' }}>API {apiBaseUrl()}</Text>
      <PrimaryButton label="Sair" variant="danger" onPress={() => void logout()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  row: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  section: { fontWeight: '800', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  soon: { paddingHorizontal: 14, paddingVertical: 10 },
});
