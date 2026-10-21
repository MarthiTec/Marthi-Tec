import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { listAuditLogs, type AuditLogEntry } from '../../api/auditApi';
import { useAuth } from '../../auth/AuthContext';
import { Screen } from '../../components/Screen';
import { useThemeColors } from '../../hooks/useThemeColors';

const ACTION_TYPE_LABEL: Record<string, string> = {
  inclusao: 'Inclusão',
  alteracao: 'Alteração',
  exclusao: 'Exclusão',
  conclusao: 'Conclusão',
};

function titleFor(item: AuditLogEntry) {
  const type = item.actionTypeLabel || (item.actionType ? ACTION_TYPE_LABEL[item.actionType] : '');
  const module = item.moduleLabel || item.module || '';
  if (type && module) return `${type} · ${module}`;
  if (type) return type;
  return item.action;
}

export function ActivitiesScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { token, storeId } = useAuth();
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !storeId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listAuditLogs({ token, storeId, action, entity, limit: 80 }));
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar atividades.');
    } finally {
      setLoading(false);
    }
  }, [token, storeId, action, entity]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <Screen title="Atividades" subtitle="Auditoria da loja" scroll={false} style={{ padding: 0 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: c.accent, fontWeight: '700' }}>← Menu</Text>
        </Pressable>
        <TextInput
          value={action}
          onChangeText={setAction}
          placeholder="Filtrar ação (ex.: produto.criar)"
          placeholderTextColor={c.mute}
          style={{
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.line,
            backgroundColor: c.card,
            color: c.ink,
            borderRadius: 10,
            minHeight: 42,
            paddingHorizontal: 12,
          }}
        />
        <TextInput
          value={entity}
          onChangeText={setEntity}
          placeholder="Filtrar entidade (ex.: stock_item)"
          placeholderTextColor={c.mute}
          style={{
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.line,
            backgroundColor: c.card,
            color: c.ink,
            borderRadius: 10,
            minHeight: 42,
            paddingHorizontal: 12,
          }}
        />
      </View>

      {error ? <Text style={{ color: c.danger, margin: 16 }}>{error}</Text> : null}

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
          ListEmptyComponent={!loading ? <Text style={{ color: c.mute, textAlign: 'center' }}>Sem atividades nesta loja.</Text> : null}
          renderItem={({ item }) => (
            <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, backgroundColor: c.card, borderRadius: 12, padding: 12 }}>
              <Text style={{ color: c.ink, fontWeight: '800' }}>{titleFor(item)}</Text>
              <Text style={{ color: c.mute, fontSize: 12, marginTop: 2 }}>
                {item.menuLabel || item.action}
                {item.entityId ? ` · ${item.entityId}` : ''}
              </Text>
              {item.summary ? (
                <Text style={{ color: c.ink, fontSize: 13, marginTop: 6 }} numberOfLines={3}>
                  {item.summary}
                </Text>
              ) : null}
              <Text style={{ color: c.mute, fontSize: 11, marginTop: 4 }}>
                {item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : ''}
                {item.actorName ? ` · ${item.actorName}` : ''}
              </Text>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
