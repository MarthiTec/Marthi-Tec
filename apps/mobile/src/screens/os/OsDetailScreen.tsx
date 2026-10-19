import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getWorkOrder,
  OS_STATUS_LABEL,
  OS_TRANSITIONS,
  updateWorkOrderStatus,
  type WorkOrder,
  type WorkOrderStatus,
} from '../../api/workOrdersApi';
import { useAuth } from '../../auth/AuthContext';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { useThemeColors } from '../../hooks/useThemeColors';
import { formatBrl } from '../../utils/format';

export function OsDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const osId = decodeURIComponent(String(id || ''));
  const c = useThemeColors();
  const router = useRouter();
  const { token, storeId } = useAuth();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !storeId || !osId) return;
    setLoading(true);
    setError(null);
    try {
      setOrder(await getWorkOrder({ token, storeId, id: osId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar OS.');
    } finally {
      setLoading(false);
    }
  }, [token, storeId, osId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(next: WorkOrderStatus) {
    if (!token || !storeId || !order) return;
    setBusy(true);
    try {
      const updated = await updateWorkOrderStatus({
        token,
        storeId,
        id: order.id,
        status: next,
        note: note.trim(),
      });
      setOrder(updated);
      setNote('');
      Alert.alert('Status atualizado', OS_STATUS_LABEL[next]);
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Transição inválida');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !order) {
    return (
      <Screen title="OS" scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen title="OS">
        <Text style={{ color: c.danger }}>{error || 'OS não encontrada.'}</Text>
        <PrimaryButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const status = (order.status as WorkOrderStatus) || 'open';
  const nextStatuses = OS_TRANSITIONS[status] ?? [];

  return (
    <Screen title={order.id} subtitle={OS_STATUS_LABEL[status] || status}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: c.accent, fontWeight: '700' }}>← Voltar</Text>
      </Pressable>

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <Text style={{ color: c.ink, fontWeight: '800', fontSize: 16 }}>{order.customerName}</Text>
        <Text style={{ color: c.mute }}>{order.customerPhone || 'Sem telefone'}</Text>
        <Text style={{ color: c.ink, marginTop: 10, fontWeight: '700' }}>
          {order.itemName} {order.itemBrand ? `· ${order.itemBrand}` : ''} {order.itemModel}
        </Text>
        {order.itemRef ? <Text style={{ color: c.mute }}>IMEI/Ref {order.itemRef}</Text> : null}
        <Text style={{ color: c.mute, marginTop: 8 }}>Defeito: {order.defect || '—'}</Text>
        {order.diagnosis ? <Text style={{ color: c.mute }}>Diagnóstico: {order.diagnosis}</Text> : null}
        <Text style={{ color: c.mute, marginTop: 8 }}>
          Técnico: {order.technician || '—'} · Mão de obra {formatBrl(order.labor)} · Peças {formatBrl(order.parts)}
        </Text>
        {order.notes ? <Text style={{ color: c.mute, marginTop: 8 }}>Obs.: {order.notes}</Text> : null}
      </View>

      {nextStatuses.length ? (
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line, gap: 8 }]}>
          <Text style={{ color: c.ink, fontWeight: '800' }}>Atualizar status</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Nota opcional (entra no histórico)"
            placeholderTextColor={c.mute}
            style={{
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: c.line,
              borderRadius: 10,
              minHeight: 44,
              paddingHorizontal: 12,
              color: c.ink,
              backgroundColor: c.card2,
            }}
          />
          {nextStatuses.map((s) => (
            <PrimaryButton
              key={s}
              label={OS_STATUS_LABEL[s]}
              loading={busy}
              variant={s === 'cancelled' ? 'danger' : s === 'delivered' ? 'primary' : 'ghost'}
              onPress={() => void changeStatus(s)}
            />
          ))}
        </View>
      ) : (
        <Text style={{ color: c.mute }}>Status terminal — sem novas transições.</Text>
      )}

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <Text style={{ color: c.ink, fontWeight: '800', marginBottom: 8 }}>Histórico</Text>
        {(order.history || []).length === 0 ? (
          <Text style={{ color: c.mute }}>Sem eventos ainda.</Text>
        ) : (
          [...(order.history || [])]
            .reverse()
            .slice(0, 40)
            .map((h) => (
              <View key={h.id} style={{ paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
                <Text style={{ color: c.ink, fontWeight: '600' }}>
                  {h.field || 'campo'} {h.action || ''} {h.fromValue ? `${h.fromValue} → ` : ''}
                  {h.toValue}
                </Text>
                <Text style={{ color: c.mute, fontSize: 11 }}>
                  {h.authorName || '—'}
                  {h.createdAt ? ` · ${new Date(h.createdAt).toLocaleString('pt-BR')}` : ''}
                  {h.note ? ` · ${h.note}` : ''}
                </Text>
              </View>
            ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14 },
});
