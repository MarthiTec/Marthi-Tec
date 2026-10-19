import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listStock, type StockItem } from '../../api/stockApi';
import { useAuth } from '../../auth/AuthContext';
import { Screen } from '../../components/Screen';
import { useThemeColors } from '../../hooks/useThemeColors';
import { canSeeCost, canSeeSalePrice } from '../../permissions/areas';
import { formatBrl, formatInt } from '../../utils/format';

export function StockListScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { token, storeId, access } = useAuth();
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showPrice = canSeeSalePrice(access);
  const showCost = canSeeCost(access);

  const load = useCallback(async () => {
    if (!token || !storeId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listStock({ token, storeId, q: query, low: lowOnly });
      setItems(data.filter((item) => item.active !== false));
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar estoque.');
    } finally {
      setLoading(false);
    }
  }, [token, storeId, query, lowOnly]);

  useEffect(() => {
    const handle = setTimeout(() => void load(), 280);
    return () => clearTimeout(handle);
  }, [load]);

  return (
    <Screen title="Estoque" subtitle="Consulta e movimentação" scroll={false} style={{ padding: 0 }}>
      <View style={[styles.toolbar, { backgroundColor: c.surface }]}>
        <View style={[styles.search, { backgroundColor: c.card, borderColor: c.line }]}>
          <Ionicons name="search" size={18} color={c.mute} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Nome, SKU, código ou IMEI"
            placeholderTextColor={c.mute}
            style={[styles.input, { color: c.ink }]}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => void load()}
          />
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => setLowOnly((v) => !v)}
            style={[
              styles.chip,
              { borderColor: lowOnly ? c.warning : c.line, backgroundColor: lowOnly ? c.card2 : c.card },
            ]}
          >
            <Text style={{ color: lowOnly ? c.warning : c.ink, fontWeight: '700', fontSize: 12 }}>Baixo</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(app)/stock/scan')}
            style={[styles.chip, { borderColor: c.accent, backgroundColor: c.card }]}
          >
            <Ionicons name="barcode-outline" size={16} color={c.accent} />
            <Text style={{ color: c.accent, fontWeight: '700', fontSize: 12 }}>Ler</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <Pressable onPress={() => void load()} style={[styles.error, { borderColor: c.danger }]}>
          <Text style={{ color: c.danger }}>{error}</Text>
          <Text style={{ color: c.accent, marginTop: 6, fontWeight: '700' }}>Tentar de novo</Text>
        </Pressable>
      ) : null}

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10, paddingBottom: 40 }}
          ListEmptyComponent={
            !loading ? (
              <Text style={{ color: c.mute, textAlign: 'center', marginTop: 24 }}>
                Nenhum produto encontrado nesta loja.
              </Text>
            ) : null
          }
          refreshing={loading}
          onRefresh={() => void load()}
          renderItem={({ item }) => {
            const low = item.qty <= item.minQty;
            return (
              <Pressable
                onPress={() => router.push(`/(app)/stock/${encodeURIComponent(item.id)}`)}
                style={[styles.row, { backgroundColor: c.card, borderColor: c.line }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.name, { color: c.ink }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={{ color: c.mute, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {[item.sku, item.brand, item.capacity, item.color].filter(Boolean).join(' · ') || item.id}
                  </Text>
                  <View style={styles.meta}>
                    <Text style={{ color: low ? c.warning : c.ink, fontWeight: '800' }}>
                      {formatInt(item.qty)} {item.unit || 'UN'}
                    </Text>
                    {showPrice ? (
                      <Text style={{ color: c.mute, fontSize: 12 }}>Venda {formatBrl(item.price)}</Text>
                    ) : null}
                    {showCost ? (
                      <Text style={{ color: c.mute, fontSize: 12 }}>Custo {formatBrl(item.cost)}</Text>
                    ) : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.mute} />
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { margin: 16, borderWidth: 1, borderRadius: 12, padding: 12 },
});
