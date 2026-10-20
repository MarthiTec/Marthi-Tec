import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { IMEI_BARCODE_TYPES, normalizeScanPayload } from '../utils/scanCode';
import { useThemeColors } from '../hooks/useThemeColors';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  /** Placeholder do fallback manual */
  manualPlaceholder?: string;
  onClose: () => void;
  /** Código normalizado (IMEI/EAN/raw) */
  onCaptured: (code: string, meta: { kind: string; raw: string }) => void;
};

/**
 * Scanner reutilizável: câmera (IMEI/EAN/QR) + digitação manual.
 * Usado em lookup de estoque, entrada com IMEI e venda externa.
 */
export function BarcodeImeiScanner({
  visible,
  title = 'Ler código',
  subtitle = 'Barras, QR ou IMEI',
  manualPlaceholder = 'IMEI, EAN ou SKU',
  onClose,
  onCaptured,
}: Props) {
  const c = useThemeColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const locked = useRef(false);

  useEffect(() => {
    if (!visible) {
      locked.current = false;
      setManual('');
      return;
    }
    if (Platform.OS !== 'web' && permission && !permission.granted) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  function emit(raw: string) {
    const value = raw.trim();
    if (!value || locked.current) return;
    const n = normalizeScanPayload(value);
    if (!n.code) return;
    locked.current = true;
    onCaptured(n.code, { kind: n.kind, raw: n.raw });
  }

  function onBarcode(result: BarcodeScanningResult) {
    const raw = result.data?.trim();
    if (raw) emit(raw);
  }

  const cameraOk = Platform.OS !== 'web' && permission?.granted;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: c.surface }]}>
        <Text style={[styles.title, { color: c.ink }]}>{title}</Text>
        <Text style={{ color: c.mute, marginBottom: 12 }}>{subtitle}</Text>
        <Pressable onPress={onClose}>
          <Text style={{ color: c.accent, fontWeight: '700', marginBottom: 12 }}>← Fechar</Text>
        </Pressable>

        {cameraOk ? (
          <View style={[styles.cameraWrap, { borderColor: c.line }]}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...IMEI_BARCODE_TYPES] }}
              onBarcodeScanned={locked.current ? undefined : onBarcode}
            />
            <View style={styles.overlay}>
              <Text style={styles.overlayText}>Aponte para IMEI / código de barras</Text>
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
            placeholder={manualPlaceholder}
            placeholderTextColor={c.mute}
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType="default"
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
            onSubmitEditing={() => emit(manual)}
          />
          <View style={{ marginTop: 10 }}>
            <PrimaryButton label="Usar código" onPress={() => emit(manual)} disabled={!manual.trim()} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, paddingTop: 48, gap: 8 },
  title: { fontSize: 22, fontWeight: '900' },
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
