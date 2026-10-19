import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { listStock, type StockItem } from '../../api/stockApi';
import {
  createCustomer,
  createExternalSale,
  listCustomers,
  newSaleRequestId,
  type Customer,
} from '../../api/salesApi';
import { useAuth } from '../../auth/AuthContext';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { useThemeColors } from '../../hooks/useThemeColors';
import { canSeeSalePrice } from '../../permissions/areas';
import { formatBrl } from '../../utils/format';

type CartLine = { stockId: string; name: string; qty: number; unitPrice: number; maxQty: number };

const PAY_METHODS = ['PIX', 'Dinheiro', 'Cartão de Débito', 'Cartão de Crédito'];

export function SalesNewScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { token, storeId, access } = useAuth();
  const canDiscount = Boolean(access?.fullAccess) || ['admin', 'manager', 'owner'].includes(String(access?.role || '').toLowerCase());

  const [step, setStep] = useState(1);
  const [customerQ, setCustomerQ] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [productQ, setProductQ] = useState('');
  const [products, setProducts] = useState<StockItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState(PAY_METHODS[0]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => newSaleRequestId());

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.qty * l.unitPrice, 0), [cart]);
  const discountNum = canDiscount ? Math.max(0, Number(discount) || 0) : 0;
  const total = Math.max(0, subtotal - discountNum);

  const loadCustomers = useCallback(async () => {
    if (!token || !storeId) return;
    try {
      setCustomers(await listCustomers({ token, storeId, q: customerQ }));
    } catch {
      setCustomers([]);
    }
  }, [token, storeId, customerQ]);

  const loadProducts = useCallback(async () => {
    if (!token || !storeId) return;
    try {
      setProducts(await listStock({ token, storeId, q: productQ }));
    } catch {
      setProducts([]);
    }
  }, [token, storeId, productQ]);

  useEffect(() => {
    const t = setTimeout(() => void loadCustomers(), 250);
    return () => clearTimeout(t);
  }, [loadCustomers]);

  useEffect(() => {
    const t = setTimeout(() => void loadProducts(), 250);
    return () => clearTimeout(t);
  }, [loadProducts]);

  function addProduct(item: StockItem) {
    if (item.qty <= 0) {
      Alert.alert('Sem estoque', item.name);
      return;
    }
    setCart((prev) => {
      const found = prev.find((l) => l.stockId === item.id);
      if (found) {
        if (found.qty >= item.qty) return prev;
        return prev.map((l) => (l.stockId === item.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          stockId: item.id,
          name: item.name,
          qty: 1,
          unitPrice: Number(item.price) || 0,
          maxQty: Number(item.qty) || 0,
        },
      ];
    });
  }

  async function onCreateCustomer() {
    if (!token || !storeId || newName.trim().length < 2) {
      Alert.alert('Informe o nome do cliente');
      return;
    }
    setBusy(true);
    try {
      const created = await createCustomer({ token, storeId, name: newName.trim(), phone: newPhone.trim() });
      setCustomer(created);
      setStep(2);
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha ao criar cliente');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!token || !storeId) return;
    if (!cart.length) {
      Alert.alert('Inclua ao menos um produto');
      return;
    }
    setBusy(true);
    try {
      const result = await createExternalSale({
        token,
        storeId,
        body: {
          requestId,
          customerId: customer?.id ?? null,
          customerName: customer?.name || 'Consumidor Final',
          customerPhone: customer?.phone || '',
          customerDocument: customer?.document || '',
          paymentMethod,
          installments: 1,
          discount: discountNum,
          notes,
          lines: cart.map((l) => ({
            stockId: l.stockId,
            name: l.name,
            qty: l.qty,
            unitPrice: l.unitPrice,
            discount: 0,
            attributes: [],
          })),
        },
      });
      Alert.alert('Venda confirmada', result.id, [{ text: 'OK', onPress: () => router.replace('/(app)/sales') }]);
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha ao confirmar venda');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Nova venda" subtitle={`Passo ${step}/3 · online`}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: c.accent, fontWeight: '700' }}>← Voltar</Text>
      </Pressable>

      {step === 1 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: c.ink, fontWeight: '800' }}>Cliente</Text>
          <TextInput
            value={customerQ}
            onChangeText={setCustomerQ}
            placeholder="Buscar nome, telefone ou documento"
            placeholderTextColor={c.mute}
            style={inputStyle(c)}
          />
          <ScrollView style={{ maxHeight: 180 }}>
            {customers.slice(0, 20).map((cu) => (
              <Pressable
                key={cu.id}
                onPress={() => {
                  setCustomer(cu);
                  setStep(2);
                }}
                style={[styles.row, { borderColor: c.line, backgroundColor: c.card }]}
              >
                <Text style={{ color: c.ink, fontWeight: '700' }}>{cu.name}</Text>
                <Text style={{ color: c.mute, fontSize: 12 }}>{cu.phone || cu.document || cu.id}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={{ color: c.mute, fontWeight: '700', marginTop: 8 }}>Ou cadastrar</Text>
          <TextInput value={newName} onChangeText={setNewName} placeholder="Nome" placeholderTextColor={c.mute} style={inputStyle(c)} />
          <TextInput value={newPhone} onChangeText={setNewPhone} placeholder="Telefone" placeholderTextColor={c.mute} style={inputStyle(c)} keyboardType="phone-pad" />
          <PrimaryButton label="Criar e continuar" loading={busy} onPress={() => void onCreateCustomer()} />
          <PrimaryButton
            label="Consumidor final"
            variant="ghost"
            onPress={() => {
              setCustomer(null);
              setStep(2);
            }}
          />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: c.ink, fontWeight: '800' }}>
            Produtos {customer ? `· ${customer.name}` : '· Consumidor final'}
          </Text>
          <TextInput
            value={productQ}
            onChangeText={setProductQ}
            placeholder="Buscar produto"
            placeholderTextColor={c.mute}
            style={inputStyle(c)}
          />
          <ScrollView style={{ maxHeight: 160 }}>
            {products
              .filter((p) => p.active !== false && (canSeeSalePrice(access) ? true : true))
              .slice(0, 30)
              .map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => addProduct(p)}
                  style={[styles.row, { borderColor: c.line, backgroundColor: c.card }]}
                >
                  <Text style={{ color: c.ink, fontWeight: '700' }} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={{ color: c.mute, fontSize: 12 }}>
                    {p.qty} un · {formatBrl(p.price)}
                  </Text>
                </Pressable>
              ))}
          </ScrollView>
          <Text style={{ color: c.ink, fontWeight: '800' }}>Carrinho</Text>
          {cart.length === 0 ? <Text style={{ color: c.mute }}>Vazio</Text> : null}
          {cart.map((l) => (
            <View key={l.stockId} style={[styles.row, { borderColor: c.line, backgroundColor: c.card2, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink, fontWeight: '700' }} numberOfLines={1}>
                  {l.name}
                </Text>
                <Text style={{ color: c.mute, fontSize: 12 }}>
                  {l.qty} × {formatBrl(l.unitPrice)}
                </Text>
              </View>
              <Pressable onPress={() => setCart((prev) => prev.map((x) => (x.stockId === l.stockId ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>
                <Text style={{ color: c.accent, fontWeight: '800', fontSize: 18 }}>−</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  setCart((prev) =>
                    prev.map((x) => (x.stockId === l.stockId && x.qty < x.maxQty ? { ...x, qty: x.qty + 1 } : x)),
                  )
                }
              >
                <Text style={{ color: c.accent, fontWeight: '800', fontSize: 18 }}>+</Text>
              </Pressable>
              <Pressable onPress={() => setCart((prev) => prev.filter((x) => x.stockId !== l.stockId))}>
                <Text style={{ color: c.danger, fontWeight: '700' }}>Rem</Text>
              </Pressable>
            </View>
          ))}
          <PrimaryButton label="Continuar pagamento" onPress={() => setStep(3)} disabled={!cart.length} />
          <PrimaryButton label="Voltar ao cliente" variant="ghost" onPress={() => setStep(1)} />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: c.ink, fontWeight: '800' }}>Pagamento</Text>
          <Text style={{ color: c.mute }}>Subtotal {formatBrl(subtotal)}</Text>
          {canDiscount ? (
            <TextInput
              value={discount}
              onChangeText={setDiscount}
              placeholder="Desconto (R$)"
              placeholderTextColor={c.mute}
              keyboardType="decimal-pad"
              style={inputStyle(c)}
            />
          ) : (
            <Text style={{ color: c.mute, fontSize: 12 }}>Desconto restrito à gestão.</Text>
          )}
          <Text style={{ color: c.ink, fontWeight: '900', fontSize: 20 }}>Total {formatBrl(total)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PAY_METHODS.map((m) => (
              <Pressable
                key={m}
                onPress={() => setPaymentMethod(m)}
                style={{
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: paymentMethod === m ? c.accent : c.line,
                  backgroundColor: paymentMethod === m ? c.accent : c.card,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: paymentMethod === m ? '#fff' : c.ink, fontWeight: '700', fontSize: 12 }}>{m}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={notes} onChangeText={setNotes} placeholder="Observações" placeholderTextColor={c.mute} style={inputStyle(c)} />
          <Text style={{ color: c.mute, fontSize: 11 }}>Idempotência: {requestId}</Text>
          <PrimaryButton label="Confirmar venda" loading={busy} onPress={() => void onConfirm()} />
          <PrimaryButton label="Voltar ao carrinho" variant="ghost" onPress={() => setStep(2)} />
        </View>
      ) : null}
    </Screen>
  );
}

function inputStyle(c: ReturnType<typeof useThemeColors>) {
  return {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    backgroundColor: c.card,
    color: c.ink,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
  } as const;
}

const styles = StyleSheet.create({
  row: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10, marginBottom: 6 },
});
