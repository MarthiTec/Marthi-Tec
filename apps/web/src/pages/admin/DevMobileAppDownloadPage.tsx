import { AdminIcon } from '../../components/AdminIcons';
import { MobileAppDownloadSection } from '../../components/MobileAppDownloadSection';
import './admin.css';
import './operations.css';

/**
 * Prévia local (somente DEV) da aba Operações → Download do App,
 * sem login — para smoke visual e screenshots quando a MarthiDB não está no ambiente.
 */
export function DevMobileAppDownloadPage() {
  return (
    <div className="admin" style={{ minHeight: '100vh', background: 'var(--surface, #f4f7fb)' }}>
      <main className="admin-main" style={{ padding: '20px 22px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <p className="empty" style={{ margin: '0 0 6px' }}>
          Prévia local · equivalente a <code>/painel/operacoes?tab=app</code>
        </p>
        <section className="admin-page ops-page">
          <div className="dash-hero">
            <div>
              <p className="empty" style={{ margin: 0 }}>
                Configure o ramo do negócio, campos ativos, atalhos rápidos e a equipe de operação.
              </p>
              <h1 className="dash-hero__title">Operações & Configurações da Loja</h1>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              borderBottom: '1px solid var(--line)',
              paddingBottom: 14,
              marginBottom: 8,
            }}
          >
            <button type="button" className="btn btn--ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 650 }}>
              <AdminIcon name="settings" />
              <span>Ramo da Loja & Personalização</span>
            </button>
            <button type="button" className="btn btn--primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 650 }}>
              <AdminIcon name="smartphone" />
              <span>Download do App</span>
            </button>
          </div>
          <MobileAppDownloadSection />
        </section>
      </main>
    </div>
  );
}
