import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../hooks/useThemeColors';

type Props = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'accent' | 'danger' | 'success' | 'warning';
};

export function MetricCard({ label, value, hint, tone = 'default' }: Props) {
  const c = useThemeColors();
  const valueColor =
    tone === 'accent'
      ? c.accent
      : tone === 'danger'
        ? c.danger
        : tone === 'success'
          ? c.success
          : tone === 'warning'
            ? c.warning
            : c.ink;

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
      <Text style={[styles.label, { color: c.mute }]}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
      {hint ? <Text style={[styles.hint, { color: c.mute }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    minWidth: '47%',
    flexGrow: 1,
    flexBasis: '47%',
  },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 20, fontWeight: '800', marginTop: 6, letterSpacing: -0.3 },
  hint: { fontSize: 11, marginTop: 4 },
});
