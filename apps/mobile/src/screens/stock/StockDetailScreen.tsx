import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  adjustStock,
  changeStockPrice,
  createStockEntry,
  getStock,
  listStockMovements,
  type StockItem,
  type StockMovement,
} from '../../api/stockApi';
import { useAuth } from '../../auth/AuthContext';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { useThemeColors } from '../../hooks/useThemeColors';
import { canManageStock, canSeeCost, canSeeSalePrice } from '../../permissions/areas';
import { formatBrl, formatInt } from '../../utils/format';

type Panel = 'none' | 'adjust' | 'price' | 'entry';

export function StockDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const stockId = decodeURIComponent(String(id || ''));
  const c = useThemeColors();
  const router = useRouter();
  const { token, storeId, access } = useAuth();
  const [item, setItem] = useState<StockItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('none');
  const [busy, setBusy] = useState(false);

  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [priceValue, setPriceValue] = useState('');
  const [costValue, setCostValue] = useState('');
  const [priceReason, setPriceReason] = useState('');
  const [entryQty, setEntryQty] = useState('1');
  const [entryCost, setEntryCost] = useState('');
  const [entryNotes, setEntryNotes] = useState('');

  const showPrice = canSeeSalePrice(access);
  const showCost = canSeeCost(access);
  const canWrite = canManageStock(access);

  const load = useCallback(async () => {
    if (!token || !storeId || !stockId) return;
    setLoading(true);
    setError(null);
    try {
      const [product, moves] = await Promise.all([
        getStock({ token, storeId, id: stockId }),
        listStockMovements({ token, storeId, id: stockId, limit: 40 }),
      ]);
      setItem(product);
      setMovements(moves);
      setAdjustQty(String(product.qty));
      setPriceValue(String(product.price));
      setCostValue(String(product.cost));
      setEntryCost(String(product.cost || product.avgCost || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar produto.');
    } finally {
      setLoading(false);
    }
  }, [token, storeId, stockId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdjust() {
    if (!token || !storeId || !item) return;
    const qty = Number(adjustQty);
    if (!Number.isFinite(qty) || qty < 0) {
      Alert.alert('Quantidade inválida');
      return;
    }
    if (adjustReason.trim().length < 3) {
      Alert.alert('Informe o motivo do ajuste');
      return;
    }
    setBusy(true);
    try {
      const result = await adjustStock({ token, storeId, id: item.id, qty, reason: adjustReason.trim() });
      setItem(result.product);
      setPanel('none');
      setAdjustReason('');
      await load();
      Alert.alert('Ajuste aplicado', `Saldo: ${result.previousQty} → ${result.newQty}`);
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha no ajuste');
    } finally {
      setBusy(false);
    }
  }

  async function onPrice() {
    if (!token || !storeId || !item) return;
    const price = showPrice ? Number(priceValue) : undefined;
    const cost = showCost ? Number(costValue) : undefined;
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      Alert.alert('Preço inválido');
      return;
    }
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) {
      Alert.alert('Custo inválido');
      return;
    }
    setBusy(true);
    try {
      const result = await changeStockPrice({
        token,
        storeId,
        id: item.id,
        price: showPrice ? price : undefined,
        cost: showCost ? cost : undefined,
        reason: priceReason.trim(),
      });
      setItem(result.product);
      setPanel('none');
      setPriceReason('');
      await load();
      Alert.alert(
        'Preço atualizado',
        `Venda ${formatBrl(result.before.price)} → ${formatBrl(result.after.price)}\nCusto ${formatBrl(result.before.cost)} → ${formatBrl(result.after.cost)}`,
      );
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha na alteração');
    } finally {
      setBusy(false);
    }
  }

  async function onEntry() {
    if (!token || !storeId || !item) return;
    const qty = Number(entryQty);
    const unitCost = Number(entryCost);
    if (!Number.isInteger(qty) || qty <= 0) {
      Alert.alert('Quantidade da entrada inválida');
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      Alert.alert('Custo unitário inválido');
      return;
    }
    setBusy(true);
    try {
      const result = await createStockEntry({
        token,
        storeId,
        id: item.id,
        qty,
        unitCost,
        notes: entryNotes.trim(),
        payment: 'none',
      });
      setItem(result.product);
      setPanel('none');
      setEntryQty('1');
      setEntryNotes('');
      await load();
      Alert.alert('Entrada registrada', `+${qty} unidade(s)`);
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha na entrada');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !item) {
    return (
      <Screen title="Produto" scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (error && !item) {
    return (
      <Screen title="Produto">
        <Text style={{ color: c.danger }}>{error}</Text>
        <PrimaryButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (!item) return null;

  const low = item.qty <= item.minQty;

  return (
    <Screen title={item.name} subtitle={[item.sku, item.brand].filter(Boolean).join(' · ') || item.id}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: c.accent, fontWeight: '700' }}>← Voltar</Text>
      </Pressable>

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <Text style={[styles.label, { color: c.mute }]}>Saldo</Text>
        <Text style={[styles.big, { color: low ? c.warning : c.ink }]}>
          {formatInt(item.qty)} {item.unit || 'UN'}
          {low ? ' · baixo' : ''}
        </Text>
        <Text style={{ color: c.mute, marginTop: 4 }}>Mínimo {formatInt(item.minQty)}</Text>
        {showPrice ? (
          <Text style={{ color: c.ink, marginTop: 10, fontWeight: '700' }}>Venda {formatBrl(item.price)}</Text>
        ) : null}
        {showCost ? <Text style={{ color: c.mute }}>Custo {formatBrl(item.cost)}</Text> : null}
        <Text style={{ color: c.mute, marginTop: 8, fontSize: 12 }}>
          {[item.condition, item.color, item.capacity, item.barcode, item.imei].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {item.variations?.length ? (
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
          <Text style={[styles.section, { color: c.ink }]}>Variações</Text>
          {item.variations.map((v) => (
            <View key={v.id} style={[styles.varRow, { borderBottomColor: c.line }]}>
              <Text style={{ color: c.ink, fontWeight: '600', flex: 1 }}>
                {Object.values(v.attrs || {}).filter(Boolean).join(' / ') || v.condition || v.id}
              </Text>
              <Text style={{ color: c.mute }}>{formatInt(v.qty)}</Text>
              {showPrice ? <Text style={{ color: c.mute, width: 72, textAlign: 'right' }}>{formatBrl(v.price)}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {canWrite ? (
        <View style={styles.actions}>
          <PrimaryButton label="Ajustar saldo" onPress={() => setPanel('adjust')} />
          <PrimaryButton label="Alterar preço" variant="ghost" onPress={() => setPanel('price')} />
          <PrimaryButton label="Entrada" variant="ghost" onPress={() => setPanel('entry')} />
        </View>
      ) : (
        <Text style={{ color: c.mute, fontSize: 12 }}>Somente consulta — peça liberação em Pessoas › Permissões.</Text>
      )}

      {panel === 'adjust' ? (
        <View style={[styles.card, { backgroundColor: c.card2, borderColor: c.line, gap: 8 }]}>
          <Text style={[styles.section, { color: c.ink }]}>Ajuste de saldo</Text>
          <Field label="Novo saldo" value={adjustQty} onChange={setAdjustQty} keyboard="numeric" c={c} />
          <Field label="Motivo" value={adjustReason} onChange={setAdjustReason} c={c} />
          <PrimaryButton label="Confirmar ajuste" loading={busy} onPress={() => void onAdjust()} />
          <PrimaryButton label="Cancelar" variant="ghost" onPress={() => setPanel('none')} />
        </View>
      ) : null}

      {panel === 'price' ? (
        <View style={[styles.card, { backgroundColor: c.card2, borderColor: c.line, gap: 8 }]}>
          <Text style={[styles.section, { color: c.ink }]}>Alterar preço (com auditoria)</Text>
          {showPrice ? <Field label="Preço de venda" value={priceValue} onChange={setPriceValue} keyboard="numeric" c={c} /> : null}
          {showCost ? <Field label="Custo" value={costValue} onChange={setCostValue} keyboard="numeric" c={c} /> : null}
          <Field label="Motivo (opcional)" value={priceReason} onChange={setPriceReason} c={c} />
          <PrimaryButton label="Salvar preço" loading={busy} onPress={() => void onPrice()} />
          <PrimaryButton label="Cancelar" variant="ghost" onPress={() => setPanel('none')} />
        </View>
      ) : null}

      {panel === 'entry' ? (
        <View style={[styles.card, { backgroundColor: c.card2, borderColor: c.line, gap: 8 }]}>
          <Text style={[styles.section, { color: c.ink }]}>Entrada simplificada</Text>
          <Field label="Quantidade" value={entryQty} onChange={setEntryQty} keyboard="numeric" c={c} />
          <Field label="Custo unitário" value={entryCost} onChange={setEntryCost} keyboard="numeric" c={c} />
          <Field label="Observação" value={entryNotes} onChange={setEntryNotes} c={c} />
          <PrimaryButton label="Registrar entrada" loading={busy} onPress={() => void onEntry()} />
          <PrimaryButton label="Cancelar" variant="ghost" onPress={() => setPanel('none')} />
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <Text style={[styles.section, { color: c.ink }]}>Histórico de movimentos</Text>
        {movements.length === 0 ? (
          <Text style={{ color: c.mute }}>Sem movimentações nesta loja.</Text>
        ) : (
          movements.map((m) => (
            <View key={m.id} style={[styles.varRow, { borderBottomColor: c.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink, fontWeight: '600' }}>
                  {m.direction === 'in' ? '+' : m.direction === 'out' ? '−' : '±'}
                  {formatInt(m.qty)} · {m.origin || m.type}
                </Text>
                <Text style={{ color: c.mute, fontSize: 11 }}>
                  {new Date(m.at).toLocaleString('pt-BR')} · {m.operator || '—'}
                  {m.notes ? ` · ${m.notes}` : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboard,
  c,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: 'numeric';
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View>
      <Text style={{ color: c.mute, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard === 'numeric' ? 'decimal-pad' : 'default'}
        style={{
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.line,
          backgroundColor: c.card,
          color: c.ink,
          borderRadius: 10,
          minHeight: 44,
          paddingHorizontal: 12,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  big: { fontSize: 28, fontWeight: '900', marginTop: 4 },
  section: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  varRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actions: { gap: 8 },
});
