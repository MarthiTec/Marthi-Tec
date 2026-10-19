import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StoreRow } from '../api/types';
import { useThemeColors } from '../hooks/useThemeColors';

type Props = {
  stores: StoreRow[];
  storeId: string | null;
  onSelect: (id: string) => void;
};

export function StorePicker({ stores, storeId, onSelect }: Props) {
  const c = useThemeColors();
  if (stores.length <= 1) {
    const only = stores[0];
    return (
      <View style={[styles.single, { backgroundColor: c.card2, borderColor: c.line }]}>
        <Text style={[styles.label, { color: c.mute }]}>Loja</Text>
        <Text style={[styles.name, { color: c.ink }]} numberOfLines={1}>
          {only?.tradeName ?? '—'}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.label, { color: c.mute, marginBottom: 8 }]}>Loja ativa</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {stores.map((store) => {
          const active = store.id === storeId;
          return (
            <Pressable
              key={store.id}
              onPress={() => onSelect(store.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? c.accent : c.card,
                  borderColor: active ? c.accent : c.line,
                },
              ]}
            >
              <Text style={{ color: active ? '#fff' : c.ink, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                {store.tradeName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  single: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  row: { gap: 8, paddingRight: 8 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: 220,
  },
});
