import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { lookupStock } from '../../api/stockApi';
import { useAuth } from '../../auth/AuthContext';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { useThemeColors } from '../../hooks/useThemeColors';

/**
 * Leitura de código (câmera nativa). No web / sem permissão: digitação manual + lookup API.
 */
export function StockScanScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { token, storeId } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  const resolveCode = useCallback(
    async (code: string) => {
      const value = code.trim();
      if (!value || !token || !storeId || locked.current) return;
      locked.current = true;
      setBusy(true);
      setError(null);
      try {
        const item = await lookupStock({ token, storeId, code: value });
        if (!item) {
          setError(`Nenhum produto com código "${value}" nesta loja.`);
          locked.current = false;
          return;
        }
        router.replace(`/(app)/stock/${encodeURIComponent(item.id)}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha na busca.');
        locked.current = false;
      } finally {
        setBusy(false);
      }
    },
    [token, storeId, router],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' && permission && !permission.granted) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  function onBarcode(result: BarcodeScanningResult) {
    const raw = result.data?.trim();
    if (raw) void resolveCode(raw);
  }

  const cameraOk = Platform.OS !== 'web' && permission?.granted;

  return (
    <Screen title="Ler código" subtitle="Barras / QR / IMEI / SKU">
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: c.accent, fontWeight: '700' }}>← Voltar</Text>
      </Pressable>

      {cameraOk ? (
        <View style={[styles.cameraWrap, { borderColor: c.line }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'qr', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={locked.current || busy ? undefined : onBarcode}
          />
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Aponte para o código</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.fallback, { backgroundColor: c.card, borderColor: c.line }]}>
          <Text style={{ color: c.ink, fontWeight: '700' }}>
            {Platform.OS === 'web'
              ? 'Câmera indisponível no web — digite o código'
              : permission?.granted === false
                ? 'Permissão de câmera negada — digite o código'
                : 'Preparando câmera… ou digite o código'}
          </Text>
          {Platform.OS !== 'web' && !permission?.granted ? (
            <PrimaryButton label="Permitir câmera" onPress={() => void requestPermission()} />
          ) : null}
        </View>
      )}

      <View style={[styles.manual, { backgroundColor: c.card, borderColor: c.line }]}>
        <Text style={{ color: c.mute, fontSize: 12, fontWeight: '700' }}>Código manual</Text>
        <TextInput
          value={manual}
          onChangeText={setManual}
          placeholder="SKU, barras ou IMEI"
          placeholderTextColor={c.mute}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{
            marginTop: 8,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.line,
            borderRadius: 10,
            minHeight: 44,
            paddingHorizontal: 12,
            color: c.ink,
            backgroundColor: c.card2,
          }}
          onSubmitEditing={() => void resolveCode(manual)}
        />
        <View style={{ marginTop: 10 }}>
          <PrimaryButton label="Buscar" loading={busy} onPress={() => void resolveCode(manual)} disabled={!manual.trim()} />
        </View>
      </View>

      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraWrap: {
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  overlayText: {
    color: '#fff',
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fallback: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 10 },
  manual: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14 },
});
