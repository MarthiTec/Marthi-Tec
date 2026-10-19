import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { listWorkOrders, OS_FILTERS, OS_STATUS_LABEL, type WorkOrder, type WorkOrderStatus } from '../../api/workOrdersApi';
import { useAuth } from '../../auth/AuthContext';
import { Screen } from '../../components/Screen';
import { useThemeColors } from '../../hooks/useThemeColors';

export function OsListScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { token, storeId } = useAuth();
  const [status, setStatus] = useState<WorkOrderStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !storeId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listWorkOrders({ token, storeId, status, q: query }));
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar OS.');
    } finally {
      setLoading(false);
    }
  }, [token, storeId, status, query]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <Screen title="Ordens de serviço" subtitle="Oficina" scroll={false} style={{ padding: 0 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Cliente, aparelho, IMEI, nº OS"
          placeholderTextColor={c.mute}
          style={{
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.line,
            backgroundColor: c.card,
            color: c.ink,
            borderRadius: 12,
            minHeight: 44,
            paddingHorizontal: 12,
          }}
        />
        <FlatList
          horizontal
          data={OS_FILTERS}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const active = item === status;
            const label = item === 'all' ? 'Todas' : OS_STATUS_LABEL[item];
            return (
              <Pressable
                onPress={() => setStatus(item)}
                style={{
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? c.accent : c.line,
                  backgroundColor: active ? c.accent : c.card,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: active ? '#fff' : c.ink, fontWeight: '700', fontSize: 12 }}>{label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {error ? (
        <Pressable onPress={() => void load()} style={{ margin: 16 }}>
          <Text style={{ color: c.danger }}>{error}</Text>
        </Pressable>
      ) : null}

      {loading && !items.length ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshing={loading}
          onRefresh={() => void load()}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          ListEmptyComponent={!loading ? <Text style={{ color: c.mute, textAlign: 'center' }}>Nenhuma OS nesta loja.</Text> : null}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(app)/os/${encodeURIComponent(item.id)}`)}
              style={{
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: c.line,
                backgroundColor: c.card,
                borderRadius: 12,
                padding: 14,
              }}
            >
              <Text style={{ color: c.ink, fontWeight: '800' }} numberOfLines={1}>
                {item.customerName || 'Sem cliente'} · {item.itemName}
              </Text>
              <Text style={{ color: c.mute, fontSize: 12, marginTop: 4 }}>
                {OS_STATUS_LABEL[(item.status as WorkOrderStatus) || 'open'] || item.status}
                {item.technician ? ` · ${item.technician}` : ''}
              </Text>
              <Text style={{ color: c.mute, fontSize: 11, marginTop: 2 }}>{item.id}</Text>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
