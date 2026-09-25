import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

type QrCodeViewProps = {
  value: string;
  size?: number;
  className?: string;
  colorDark?: string;
  colorLight?: string;
};

export function QrCodeView({
  value,
  size = 200,
  className = '',
  colorDark = '#1d1d1f',
  colorLight = '#ffffff',
}: QrCodeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 1,
        color: {
          dark: colorDark,
          light: colorLight,
        },
        errorCorrectionLevel: 'M',
      },
      (err) => {
        if (err) {
          setError(err.message);
        } else {
          setError(null);
        }
      },
    );
  }, [value, size, colorDark, colorLight]);

  if (error) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fee2e2',
          color: '#991b1b',
          fontSize: 12,
          padding: 8,
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        Erro ao gerar QR Code: {error}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', maxWidth: '100%', height: 'auto', borderRadius: 6 }}
    />
  );
}

export async function generateQrDataUrl(value: string, size = 400): Promise<string> {
  return QRCode.toDataURL(value, {
    width: size,
    margin: 1,
    color: {
      dark: '#1d1d1f',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'H',
  });
}
