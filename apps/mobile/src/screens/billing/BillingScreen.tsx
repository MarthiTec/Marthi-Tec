import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  Share,
} from 'react-native';
import { fetchStoreBilling, type BillingInvoice, type StoreBillingPayload } from '../../api/billingApi';
import { useAuth } from '../../auth/AuthContext';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { useThemeColors } from '../../hooks/useThemeColors';
import { canSeeBilling } from '../../permissions/areas';
import { formatBrl } from '../../utils/format';

const STATUS_LABEL: Record<string, string> = {
  trialing: 'Em trial',
  active: 'Ativa',
  past_due: 'Em atraso',
  canceled: 'Cancelada',
  incomplete: 'Incompleta',
  unpaid: 'Não paga',
  draft: 'Rascunho',
  open: 'Em aberto',
  paid: 'Paga',
  void: 'Anulada',
  uncollectible: 'Não cobrável',
};

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function BillingScreen() {
  const c = useThemeColors();
  const { token, storeId, access } = useAuth();
  const [data, setData] = useState<StoreBillingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPix, setShowPix] = useState(true);

  const canManage = canSeeBilling(access);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchStoreBilling(token, storeId);
      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Falha ao carregar faturamento.');
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyPix() {
    const code = data?.pix?.brCode;
    if (!code) return;
    try {
      await Share.share({ message: code, title: 'Pix Copia e Cola Marthi' });
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Não foi possível compartilhar o código Pix.');
    }
  }

  if (!canManage) {
    return (
      <Screen title="Planos & Faturamento" subtitle="Assinatura Marthi">
        <Text style={{ color: c.mute }}>Somente administradores da loja veem faturamento e Pix.</Text>
      </Screen>
    );
  }

  const sub = data?.subscription;
  const pix = data?.pix;
  const amount = data?.amountDue ?? sub?.amount ?? null;

  return (
    <Screen title="Planos & Faturamento" subtitle="Assinatura, faturas e Pix">
      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : null}

      {error ? (
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
          <Text style={{ color: c.ink }}>{error}</Text>
          <PrimaryButton label="Tentar de novo" onPress={() => void load()} />
        </View>
      ) : null}

      {sub ? (
        <>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
            <Metric label="Plano atual" value={sub.planId} sub={STATUS_LABEL[sub.status] || sub.status} />
            <Metric
              label={data?.amountDue != null ? 'Valor em aberto' : 'Valor da assinatura'}
              value={amount != null ? formatBrl(amount) : '—'}
              sub={`/${sub.billingCycle === 'yearly' ? 'ano' : 'mês'}`}
              accent
            />
            <Metric label="Próxima cobrança" value={formatDate(sub.nextChargeAt)} sub={sub.paymentMethodPreference || 'pix'} />
          </View>

          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line, padding: 14, gap: 10 }]}>
            <Text style={{ color: c.ink, fontWeight: '800', fontSize: 16 }}>Pagar via Pix</Text>
            <Text style={{ color: c.mute, fontSize: 13, lineHeight: 18 }}>
              BR Code EMV com a chave da Marthi no MarthiDB. Valor só da fatura/assinatura — sem valores inventados.
            </Text>
            <PrimaryButton
              label={showPix ? 'Atualizar Pix' : 'Mostrar QR e Copia e Cola'}
              onPress={() => {
                setShowPix(true);
                void load();
              }}
            />

            {showPix && pix ? (
              <View style={styles.pixBlock}>
                {pix.qrDataUrl ? (
                  <Image source={{ uri: pix.qrDataUrl }} style={styles.qr} accessibilityLabel="QR Code Pix" />
                ) : (
                  <Text style={{ color: c.mute, textAlign: 'center' }}>
                    QR indisponível neste build — use Copia e Cola abaixo.
                  </Text>
                )}
                <Text style={{ color: c.ink, fontWeight: '700', textAlign: 'center' }}>
                  {pix.amount != null ? formatBrl(pix.amount) : 'Sem valor em aberto'}
                </Text>
                <Text style={{ color: c.mute, fontSize: 12, textAlign: 'center' }}>
                  {pix.receiverName} · {pix.keyValue}
                </Text>
                <Pressable
                  onPress={() => void copyPix()}
                  style={[styles.copyBtn, { backgroundColor: c.accent }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                    {copied ? 'Pronto — cole no banco' : 'Copiar / Compartilhar Pix'}
                  </Text>
                </Pressable>
                <Text style={{ color: c.mute, fontSize: 11, lineHeight: 16 }} numberOfLines={4}>
                  {pix.brCode}
                </Text>
                <Text style={{ color: c.mute, fontSize: 12 }}>{pix.instructions}</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
            <Text style={[styles.section, { color: c.ink }]}>Faturas e pagamentos</Text>
            {(data?.invoices?.length ?? 0) === 0 ? (
              <Text style={{ color: c.mute, padding: 14 }}>Nenhuma fatura registrada ainda.</Text>
            ) : (
              data!.invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} />)
            )}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  const c = useThemeColors();
  return (
    <View style={[styles.metric, { borderBottomColor: c.line }]}>
      <Text style={{ color: c.mute, fontSize: 12 }}>{label}</Text>
      <Text
        style={{
          color: accent ? c.accent : c.ink,
          fontWeight: '800',
          fontSize: 20,
          textTransform: value === value.toLowerCase() ? 'capitalize' : 'none',
          marginTop: 2,
        }}
      >
        {value}
      </Text>
      {sub ? <Text style={{ color: c.mute, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}

function InvoiceRow({ invoice }: { invoice: BillingInvoice }) {
  const c = useThemeColors();
  return (
    <View style={[styles.invoice, { borderBottomColor: c.line }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.ink, fontWeight: '700' }}>{invoice.description || 'Mensalidade Marthi'}</Text>
        <Text style={{ color: c.mute, fontSize: 12 }}>{formatDate(invoice.dueAt || invoice.createdAt)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={{ color: c.ink, fontWeight: '700' }}>{formatBrl(invoice.amount)}</Text>
        <Text style={{ color: c.mute, fontSize: 12 }}>{STATUS_LABEL[invoice.status] || invoice.status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 40, alignItems: 'center' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 4,
  },
  metric: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  section: { fontWeight: '800', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  pixBlock: { gap: 12, alignItems: 'stretch', paddingTop: 4 },
  qr: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  copyBtn: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  invoice: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
