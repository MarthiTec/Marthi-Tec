import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../hooks/useThemeColors';

type Props = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
  right?: ReactNode;
  style?: ViewStyle;
};

export function Screen({ title, subtitle, children, scroll = true, right, style }: Props) {
  const c = useThemeColors();
  const body = scroll ? (
    <ScrollView contentContainerStyle={[styles.scroll, style]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.body, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.surface }]} edges={['top', 'left', 'right']}>
      {(title || right) && (
        <View style={[styles.header, { borderBottomColor: c.line, backgroundColor: c.side }]}>
          <View style={styles.headerText}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      )}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 32, gap: 12 },
  body: { flex: 1, padding: 16 },
});
