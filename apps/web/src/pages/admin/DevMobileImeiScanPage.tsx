import './admin.css';
import './devMobileImeiScan.css';

/**
 * Prévia local (DEV) do fluxo de scan IMEI/EAN do app lojista —
 * espelha rótulos/ações de BarcodeImeiScanner + entrada/venda (sem câmera nativa no web).
 */
export function DevMobileImeiScanPage() {
  return (
    <div className="dev-imei">
      <p className="dev-imei__eyebrow">Prévia local · apps/mobile BarcodeImeiScanner</p>
      <h1>IMEI / código de barras</h1>
      <p className="dev-imei__lead">
        Câmera nativa (Expo) lê EAN, Code128/39 e QR; normaliza IMEI de 15 dígitos e preenche
        estoque, entrada e venda externa. Mesmas APIs do web — sem venda offline.
      </p>

      <section className="dev-imei__phone" aria-label="Scanner">
        <header>
          <strong>IMEI da entrada</strong>
          <span>Leia o IMEI / código de barras do aparelho</span>
        </header>
        <div className="dev-imei__viewfinder">
          <div className="dev-imei__frame" />
          <p>Aponte para IMEI / código de barras</p>
        </div>
        <label>
          Código manual
          <input readOnly value="356938035643809" aria-label="IMEI exemplo" />
        </label>
        <button type="button" className="dev-imei__cta">
          Usar código
        </button>
      </section>

      <ul className="dev-imei__flows">
        <li>
          <strong>Estoque · Ler código</strong> — lookup por IMEI/EAN/SKU → detalhe do produto
        </li>
        <li>
          <strong>Entrada</strong> — lista de IMEIs enviada em <code>entry.imeis</code>
        </li>
        <li>
          <strong>Venda externa</strong> — scan adiciona produto; IMEI na linha do carrinho
        </li>
      </ul>
    </div>
  );
}
