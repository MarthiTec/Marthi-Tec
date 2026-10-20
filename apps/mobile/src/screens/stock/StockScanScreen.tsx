import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { lookupStock } from '../../api/stockApi';
import { useAuth } from '../../auth/AuthContext';
import { BarcodeImeiScanner } from '../../components/BarcodeImeiScanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { useThemeColors } from '../../hooks/useThemeColors';

/**
 * Leitura de código (câmera nativa) → lookup API → detalhe do produto.
 */
export function StockScanScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { token, storeId } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(true);

  const resolveCode = useCallback(
    async (code: string) => {
      const value = code.trim();
      if (!value || !token || !storeId || busy) return;
      setBusy(true);
      setError(null);
      try {
        const item = await lookupStock({ token, storeId, code: value });
        if (!item) {
          setError(`Nenhum produto com código "${value}" nesta loja.`);
          setScannerOpen(true);
          return;
        }
        setScannerOpen(false);
        router.replace(`/(app)/stock/${encodeURIComponent(item.id)}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha na busca.');
        setScannerOpen(true);
      } finally {
        setBusy(false);
      }
    },
    [token, storeId, router, busy],
  );

  return (
    <Screen title="Ler código" subtitle="Barras / QR / IMEI / SKU">
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: c.accent, fontWeight: '700' }}>← Voltar</Text>
      </Pressable>

      <PrimaryButton
        label={busy ? 'Buscando…' : 'Abrir câmera / digitar'}
        loading={busy}
        onPress={() => setScannerOpen(true)}
      />

      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}

      <BarcodeImeiScanner
        visible={scannerOpen}
        title="Buscar no estoque"
        subtitle="Aponte para IMEI, EAN ou QR do produto"
        onClose={() => {
          setScannerOpen(false);
          router.back();
        }}
        onCaptured={(code) => {
          setScannerOpen(false);
          void resolveCode(code);
        }}
      />
    </Screen>
  );
}
