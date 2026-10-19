import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { listExternalSales, type ExternalSaleListItem } from '../../api/salesApi';
import { useAuth } from '../../auth/AuthContext';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { useThemeColors } from '../../hooks/useThemeColors';
import { formatBrl } from '../../utils/format';

export function SalesListScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { token, storeId } = useAuth();
  const [items, setItems] = useState<ExternalSaleListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !storeId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listExternalSales({ token, storeId }));
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar vendas.');
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen title="Vendas" subtitle="Venda externa" scroll={false} style={{ padding: 0 }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <PrimaryButton label="Nova venda externa" onPress={() => router.push('/(app)/sales/new')} />
      </View>
      {error ? <Text style={{ color: c.danger, marginHorizontal: 16 }}>{error}</Text> : null}
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
          ListEmptyComponent={!loading ? <Text style={{ color: c.mute, textAlign: 'center' }}>Nenhuma venda externa nesta loja.</Text> : null}
          renderItem={({ item }) => (
            <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, backgroundColor: c.card, borderRadius: 12, padding: 14 }}>
              <Text style={{ color: c.ink, fontWeight: '800' }}>{item.customerName || 'Consumidor'}</Text>
              <Text style={{ color: c.mute, marginTop: 4 }}>
                {formatBrl(Number(item.amount) || 0)}
                {item.payment ? ` · ${item.payment}` : ''}
              </Text>
              <Text style={{ color: c.mute, fontSize: 11, marginTop: 2 }}>
                {item.id}
                {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString('pt-BR')}` : ''}
              </Text>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
