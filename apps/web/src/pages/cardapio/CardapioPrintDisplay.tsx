import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getCardapioConfig } from '../../data/cardapioStore';
import { listRestaurantTables } from '../../data/kitchenOrderStore';
import { QrCodeView, generateQrDataUrl } from '../../components/QrCodeView';
import './cardapioPrint.css';

function CoffeeBeanIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="12" cy="12" rx="7" ry="10" transform="rotate(30 12 12)" />
      <path
        d="M12 3 C10 8, 14 16, 12 21"
        stroke="#fff"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CardapioPrintDisplay() {
  const config = getCardapioConfig();
  const tables = listRestaurantTables();
  const [selectedTable, setSelectedTable] = useState<string>('geral');
  const [printAll, setPrintAll] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/cardapio` : '';

  function getQrUrl(tableId: string) {
    if (!tableId || tableId === 'geral') return baseUrl;
    const tableObj = tables.find((t) => t.id === tableId);
    return `${baseUrl}?mesa=${tableObj?.number ?? 1}`;
  }

  const currentUrl = getQrUrl(selectedTable);
  const currentTableObj = tables.find((t) => t.id === selectedTable);

  async function handleDownloadQr() {
    try {
      const dataUrl = await generateQrDataUrl(currentUrl, 600);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `qrcode-cardapio-${selectedTable}.png`;
      link.click();
    } catch (e) {
      console.error(e);
    }
  }

  function renderCard(tableId: string, tableLabel?: string) {
    const url = getQrUrl(tableId);

    return (
      <div key={tableId} className="cardapio-acrylic-card">
        <div className="cardapio-acrylic-card__border" />

        <CoffeeBeanIcon className="cardapio-dec-bean cardapio-dec-bean--1" />
        <CoffeeBeanIcon className="cardapio-dec-bean cardapio-dec-bean--2" />
        <CoffeeBeanIcon className="cardapio-dec-bean cardapio-dec-bean--3" />
        <CoffeeBeanIcon className="cardapio-dec-bean cardapio-dec-bean--4" />

        <header className="cardapio-acrylic__header">
          {config.logoUrl ? (
            <img
              src={config.logoUrl}
              alt={config.restaurantName}
              className="cardapio-acrylic__logo-img"
            />
          ) : (
            <div className="cardapio-acrylic__logo-fallback">☕</div>
          )}
          <h1 className="cardapio-acrylic__name">{config.restaurantName}</h1>
          <span className="cardapio-acrylic__slogan">{config.slogan}</span>
          {tableLabel ? (
            <span className="cardapio-acrylic__mesa-badge">{tableLabel}</span>
          ) : null}
        </header>

        <section className="cardapio-acrylic__cta">
          <div className="cardapio-acrylic__kicker">Aponte a câmera e</div>
          <h2 className="cardapio-acrylic__title">Acesse nosso cardápio</h2>
          <p className="cardapio-acrylic__sub">
            Confira pratos, cafés, sobremesas, combos e <strong>promoções</strong>.
          </p>
        </section>

        <div className="cardapio-acrylic__qr-box">
          <QrCodeView
            value={url}
            size={180}
            colorDark="#2c1d11"
            colorLight="#ffffff"
          />
        </div>

        <div className="cardapio-acrylic__scan-hint">
          <span>📱</span> Escaneie aqui
        </div>

        <footer className="cardapio-acrylic__footer">
          {config.instagram ? (
            <span>📷 {config.instagram}</span>
          ) : config.whatsapp ? (
            <span>💬 {config.whatsapp}</span>
          ) : (
            <span>☕ Bom apetite!</span>
          )}
        </footer>
      </div>
    );
  }

  return (
    <div className="cardapio-display-wrap">
      <div className="cardapio-display-controls">
        <div className="cardapio-display-controls__row">
          <div>
            <h2>Display de Mesa (Acrílico)</h2>
            <small style={{ color: '#6b7280' }}>
              Baseado no display de mesa real com QR Code
            </small>
          </div>
          <Link to="/painel/cardapio" className="cardapio-btn cardapio-btn--secondary">
            ← Voltar ao Editor
          </Link>
        </div>

        <div className="cardapio-display-controls__row">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
            <span>Mesa:</span>
            <select
              value={printAll ? 'all' : selectedTable}
              onChange={(e) => {
                if (e.target.value === 'all') {
                  setPrintAll(true);
                } else {
                  setPrintAll(false);
                  setSelectedTable(e.target.value);
                }
              }}
              disabled={printAll}
            >
              <option value="geral">QR Code Geral (Sem mesa)</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} (Mesa {t.number})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem' }}>
            <input
              type="checkbox"
              checked={printAll}
              onChange={(e) => setPrintAll(e.target.checked)}
            />
            <span>Imprimir todas as {tables.length} mesas em lote</span>
          </label>
        </div>

        <div className="cardapio-display-actions">
          <button
            type="button"
            className="cardapio-btn cardapio-btn--primary"
            onClick={() => window.print()}
          >
            🖨️ Imprimir Display (Folha A4 / Acrílico)
          </button>
          {!printAll ? (
            <button
              type="button"
              className="cardapio-btn cardapio-btn--secondary"
              onClick={handleDownloadQr}
            >
              📥 Baixar QR Code (PNG)
            </button>
          ) : null}
        </div>
      </div>

      {printAll ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 32,
            alignItems: 'center',
            width: '100%',
          }}
        >
          {tables.map((t) => renderCard(t.id, t.label))}
        </div>
      ) : (
        renderCard(selectedTable, currentTableObj?.label)
      )}
    </div>
  );
}
