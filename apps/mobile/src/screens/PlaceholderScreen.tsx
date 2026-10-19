import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useThemeColors } from '../hooks/useThemeColors';

type Props = {
  title: string;
  phase: string;
  description: string;
};

export function PlaceholderScreen({ title, phase, description }: Props) {
  const c = useThemeColors();
  return (
    <Screen title={title} subtitle={phase}>
      <View style={[styles.box, { backgroundColor: c.card, borderColor: c.line }]}>
        <Text style={[styles.title, { color: c.ink }]}>Em breve nesta fase</Text>
        <Text style={{ color: c.mute, lineHeight: 20 }}>{description}</Text>
        <Text style={[styles.note, { color: c.mute }]}>
          Sem dados fictícios: esta tela só abre contra a API Marthi quando a fase correspondente for
          implementada.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, gap: 8 },
  title: { fontSize: 16, fontWeight: '800' },
  note: { fontSize: 12, marginTop: 8 },
});
