import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { nestRequest } from '../services/nestClient';
import { SaleReceiptDocument, type SaleReceipt } from '../components/SaleReceiptDocument';
import '../components/saleReceipt.css';

/** Página aberta pelo QR Code do comprovante: mostra o documento para conferir e imprimir. */
export function ReceiptPublicPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void nestRequest<SaleReceipt>(`/public/receipts/${encodeURIComponent(id)}?t=${encodeURIComponent(params.get('t') ?? '')}`)
      .then((data) => alive && setReceipt(data))
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Comprovante não encontrado.'));
    return () => {
      alive = false;
    };
  }, [id, params]);

  return (
    <main className="receipt-public">
      {error ? <p role="alert" className="receipt-public__error">{error}</p> : null}
      {!error && !receipt ? <p className="receipt-public__loading">Carregando comprovante…</p> : null}
      {receipt ? (
        <>
          <div className="receipt-public__bar">
            <span>Comprovante conferido: emitido por <strong>{receipt.store.name}</strong></span>
            <button type="button" onClick={() => window.print()}>Imprimir</button>
          </div>
          <SaleReceiptDocument receipt={receipt} />
        </>
      ) : null}
    </main>
  );
}
