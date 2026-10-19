import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchDashboardSummary } from '../api/authApi';
import type { DashboardSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { MetricCard } from '../components/MetricCard';
import { Screen } from '../components/Screen';
import { StorePicker } from '../components/StorePicker';
import { useThemeColors } from '../hooks/useThemeColors';
import { canSeeFinance, canSeeOs, canSeeSales, canSeeStock } from '../permissions/areas';
import { formatBrl, formatInt, formatPercent } from '../utils/format';

const PERIODS = [
  { days: 1, label: 'Hoje' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
] as const;

export function DashboardScreen() {
  const c = useThemeColors();
  const { token, storeId, stores, access, setStoreId, user } = useAuth();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !storeId) return;
    setLoading(true);
    setError(null);
    try {
      const summary = await fetchDashboardSummary(token, storeId, days);
      setData(summary);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Falha ao carregar indicadores.');
    } finally {
      setLoading(false);
    }
  }, [token, storeId, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const showFinance = canSeeFinance(access);
  const showOs = canSeeOs(access);
  const showSales = canSeeSales(access);
  const showStock = canSeeStock(access);

  return (
    <Screen title="Início" subtitle={user?.name ? `Olá, ${user.name.split(' ')[0]}` : 'Painel da loja'}>
      <StorePicker stores={stores} storeId={storeId} onSelect={(id) => void setStoreId(id)} />

      <View style={styles.periods}>
        {PERIODS.map((period) => {
          const active = period.days === days;
          return (
            <Pressable
              key={period.days}
              onPress={() => setDays(period.days)}
              style={[
                styles.period,
                {
                  backgroundColor: active ? c.accent : c.card,
                  borderColor: active ? c.accent : c.line,
                },
              ]}
            >
              <Text style={{ color: active ? '#fff' : c.ink, fontWeight: '700', fontSize: 13 }}>
                {period.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
          <Text style={{ color: c.mute, marginTop: 8 }}>Carregando do MarthiDB…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.errorBox, { borderColor: c.danger, backgroundColor: c.card }]}>
          <Text style={{ color: c.danger }}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={{ color: c.accent, fontWeight: '700', marginTop: 8 }}>Tentar de novo</Text>
          </Pressable>
        </View>
      ) : null}

      {data ? (
        <>
          <View style={styles.grid}>
            {showFinance ? (
              <>
                <MetricCard label="Receita" value={formatBrl(data.revenuePeriod)} tone="success" hint="Período" />
                <MetricCard
                  label="Resultado"
                  value={formatBrl(data.resultPeriod)}
                  tone={data.resultPeriod >= 0 ? 'success' : 'danger'}
                  hint="Receita − despesa"
                />
                <MetricCard label="Tesouraria" value={formatBrl(data.treasury)} hint="Saldo contas" />
                <MetricCard label="A receber" value={formatBrl(data.receivablesOpen)} />
              </>
            ) : (
              <MetricCard
                label="Financeiro"
                value="Restrito"
                hint="Peça liberação em Pessoas › Permissões"
              />
            )}

            {showSales ? (
              <>
                <MetricCard label="Vendas" value={formatInt(data.soldCount)} hint="Concluídas (total)" />
                <MetricCard label="Tickets PDV" value={formatInt(data.openPosTickets)} hint="Abertos" />
              </>
            ) : null}

            {showStock ? (
              <>
                <MetricCard label="SKUs" value={formatInt(data.skuCount)} />
                <MetricCard
                  label="Estoque baixo"
                  value={formatInt(data.lowStock)}
                  tone={data.lowStock > 0 ? 'warning' : 'default'}
                />
              </>
            ) : null}

            {showOs ? (
              <>
                <MetricCard label="OS abertas" value={formatInt(data.openOs)} tone="accent" />
                <MetricCard
                  label="Retornos OS"
                  value={formatPercent(data.returnRate)}
                  hint={`${formatInt(data.deliveredCount)} entregues`}
                />
              </>
            ) : null}
          </View>

          {showFinance && data.series.length > 0 ? (
            <View style={[styles.series, { backgroundColor: c.card, borderColor: c.line }]}>
              <Text style={[styles.section, { color: c.ink }]}>Vendas no período</Text>
              {data.series.map((day) => {
                const max = Math.max(...data.series.map((d) => d.sales), 1);
                const width = `${Math.max(4, Math.round((day.sales / max) * 100))}%`;
                return (
                  <View key={day.key} style={styles.barRow}>
                    <Text style={[styles.barLabel, { color: c.mute }]}>{day.label}</Text>
                    <View style={[styles.barTrack, { backgroundColor: c.card2 }]}>
                      <View style={[styles.barFill, { width: width as `${number}%`, backgroundColor: c.accent }]} />
                    </View>
                    <Text style={[styles.barValue, { color: c.ink }]}>{formatBrl(day.sales)}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {showOs && data.topCloser ? (
            <View style={[styles.series, { backgroundColor: c.card, borderColor: c.line }]}>
              <Text style={[styles.section, { color: c.ink }]}>Oficina</Text>
              <Text style={{ color: c.mute }}>
                Mais entregas: <Text style={{ color: c.ink, fontWeight: '700' }}>{data.topCloser.name}</Text> (
                {data.topCloser.closedCount})
              </Text>
              {data.topEarner ? (
                <Text style={{ color: c.mute, marginTop: 4 }}>
                  Maior faturamento:{' '}
                  <Text style={{ color: c.ink, fontWeight: '700' }}>{data.topEarner.name}</Text> (
                  {formatBrl(data.topEarner.revenue)})
                </Text>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  periods: { flexDirection: 'row', gap: 8 },
  period: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  center: { alignItems: 'center', paddingVertical: 24 },
  errorBox: { borderWidth: 1, borderRadius: 12, padding: 12 },
  series: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 8 },
  section: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 52, fontSize: 11 },
  barTrack: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 999 },
  barValue: { width: 88, fontSize: 11, textAlign: 'right', fontWeight: '600' },
});
