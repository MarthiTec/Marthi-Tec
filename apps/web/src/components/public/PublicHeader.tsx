import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BrandLogo } from '../BrandLogo';
import { marthiWhatsAppHref } from '../../data/companyContact';
import './publicLayout.css';

function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function PublicHeader() {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Close drawer on ESC
  useEffect(() => {
    if (!drawerOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  const path = location.pathname;

  return (
    <>
      <header className="public-header">
        <Link to="/" className="public-header__brand" aria-label="Marthi Tecnologia - Início">
          <BrandLogo variant="lockup" className="public-header__logo" />
        </Link>

        <nav className="public-header__nav" aria-label="Navegação principal">
          <Link
            to="/"
            className={`public-header__link ${path === '/' ? 'is-active' : ''}`}
          >
            Início
          </Link>
          <Link
            to="/produtos"
            className={`public-header__link ${path.startsWith('/produtos') ? 'is-active' : ''}`}
          >
            Produtos
          </Link>
          <Link
            to="/planos"
            className={`public-header__link ${path.startsWith('/planos') ? 'is-active' : ''}`}
          >
            Planos
          </Link>
          <Link
            to="/sobre"
            className={`public-header__link ${path.startsWith('/sobre') ? 'is-active' : ''}`}
          >
            Sobre nós
          </Link>
          <Link
            to="/contato"
            className={`public-header__link ${path.startsWith('/contato') ? 'is-active' : ''}`}
          >
            Contato
          </Link>
        </nav>

        <div className="public-header__actions">
          <Link to="/login" className="public-header__btn-login">
            Entrar
          </Link>
          <Link to="/parceiro" className="public-header__btn-cta">
            Solicitar demo
          </Link>
          <button
            type="button"
            className={`public-header__burger ${drawerOpen ? 'is-open' : ''}`}
            aria-expanded={drawerOpen}
            aria-label={drawerOpen ? 'Fechar menu' : 'Abrir menu de navegação'}
            onClick={() => setDrawerOpen((prev) => !prev)}
          >
            <i />
            <i />
            <i />
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {drawerOpen ? (
        <>
          <div
            className="public-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="public-drawer" role="dialog" aria-modal="true" aria-label="Menu de navegação">
            <nav className="public-drawer__links">
              <Link
                to="/"
                className={`public-drawer__link ${path === '/' ? 'is-active' : ''}`}
                onClick={() => setDrawerOpen(false)}
              >
                <span>Início</span>
                <span>→</span>
              </Link>
              <Link
                to="/produtos"
                className={`public-drawer__link ${path.startsWith('/produtos') ? 'is-active' : ''}`}
                onClick={() => setDrawerOpen(false)}
              >
                <span>Produtos</span>
                <span>→</span>
              </Link>
              <Link
                to="/planos"
                className={`public-drawer__link ${path.startsWith('/planos') ? 'is-active' : ''}`}
                onClick={() => setDrawerOpen(false)}
              >
                <span>Planos & Preços</span>
                <span>→</span>
              </Link>
              <Link
                to="/sobre"
                className={`public-drawer__link ${path.startsWith('/sobre') ? 'is-active' : ''}`}
                onClick={() => setDrawerOpen(false)}
              >
                <span>Sobre a Marthi</span>
                <span>→</span>
              </Link>
              <Link
                to="/contato"
                className={`public-drawer__link ${path.startsWith('/contato') ? 'is-active' : ''}`}
                onClick={() => setDrawerOpen(false)}
              >
                <span>Fale Conosco</span>
                <span>→</span>
              </Link>
              <Link
                to="/erp"
                className="public-drawer__link"
                onClick={() => setDrawerOpen(false)}
              >
                <span>Acessar Retaguarda</span>
                <span>→</span>
              </Link>
            </nav>

            <div className="public-drawer__actions">
              <Link
                to="/parceiro"
                className="public-header__btn-cta"
                onClick={() => setDrawerOpen(false)}
              >
                Solicitar Demonstração Gratuita
              </Link>
              <Link
                to="/login"
                className="public-header__btn-login"
                onClick={() => setDrawerOpen(false)}
              >
                Entrar no Sistema
              </Link>
              <a
                href={marthiWhatsAppHref('Olá Marthi! Gostaria de tirar dúvidas sobre o sistema.')}
                target="_blank"
                rel="noreferrer"
                className="public-drawer__wa-btn"
                onClick={() => setDrawerOpen(false)}
              >
                <IconWhatsApp />
                Chamar no WhatsApp
              </a>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
