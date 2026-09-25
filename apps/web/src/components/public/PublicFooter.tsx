import { Link } from 'react-router-dom';
import { BrandLogo } from '../BrandLogo';
import { MARTHI_COMPANY, marthiWhatsAppHref } from '../../data/companyContact';
import './publicLayout.css';

function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zM12 7a5 5 0 110 10 5 5 0 010-10zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM17.5 6a1 1 0 110 2 1 1 0 010-2z" />
    </svg>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer__inner">
        <div className="public-footer__grid">
          {/* Coluna Marca e Sede */}
          <div className="public-footer__col public-footer__col--brand">
            <Link to="/" aria-label="Marthi Tecnologia">
              <BrandLogo variant="lockup" className="public-footer__logo" />
            </Link>
            <p className="public-footer__tagline">
              Ecossistema completo de tecnologia para o varejo e serviços: do balcão à retaguarda,
              do totem à emissão fiscal.
            </p>
            <div className="public-footer__address">
              <strong>{MARTHI_COMPANY.legalName}</strong>
              <span>{MARTHI_COMPANY.venue} · {MARTHI_COMPANY.district}</span>
              <span>{MARTHI_COMPANY.city} — {MARTHI_COMPANY.stateUf}</span>
              <a href={MARTHI_COMPANY.emailHref} style={{ color: '#94a3b8' }}>
                {MARTHI_COMPANY.email}
              </a>
            </div>
            <a
              href={marthiWhatsAppHref('Olá! Vim pelo site da Marthi e gostaria de informações.')}
              target="_blank"
              rel="noreferrer"
              className="public-footer__direct-wa"
            >
              <IconWhatsApp />
              WhatsApp: {MARTHI_COMPANY.whatsappDisplay}
            </a>
          </div>

          {/* Coluna 1: Soluções */}
          <div className="public-footer__col">
            <h4>Soluções</h4>
            <ul className="public-footer__links">
              <li>
                <Link to="/produtos">
                  Totem Touch <span className="public-footer__badge">Autoatendimento</span>
                </Link>
              </li>
              <li>
                <Link to="/produtos">PDV / Caixa Rápido</Link>
              </li>
              <li>
                <Link to="/produtos">Ordem de Serviço (OS)</Link>
              </li>
              <li>
                <Link to="/produtos">Retaguarda & Gestão</Link>
              </li>
              <li>
                <Link to="/produtos">Emissor Fiscal (NF-e/NFC-e)</Link>
              </li>
              <li>
                <Link to="/produtos">E-commerce Integrado</Link>
              </li>
            </ul>
          </div>

          {/* Coluna 2: Institucional */}
          <div className="public-footer__col">
            <h4>Marthi</h4>
            <ul className="public-footer__links">
              <li>
                <Link to="/">Página Inicial</Link>
              </li>
              <li>
                <Link to="/produtos">Catálogo de Produtos</Link>
              </li>
              <li>
                <Link to="/planos">Planos & Preços</Link>
              </li>
              <li>
                <Link to="/sobre">Sobre a Marthi</Link>
              </li>
              <li>
                <Link to="/contato">Fale Conosco</Link>
              </li>
              <li>
                <Link to="/parceiro">Solicitar Demonstração</Link>
              </li>
            </ul>
          </div>

          {/* Coluna 3: Acesso ao Sistema */}
          <div className="public-footer__col">
            <h4>Acesso ao Sistema</h4>
            <ul className="public-footer__links">
              <li>
                <Link to="/login">Entrar na Conta</Link>
              </li>
              <li>
                <Link to="/erp">Acessar Retaguarda</Link>
              </li>
              <li>
                <Link to="/painel">Painel Operacional</Link>
              </li>
              <li>
                <Link to="/caixa">Frente de Caixa (PDV)</Link>
              </li>
              <li>
                <Link to="/os">Quadro de OS / Oficina</Link>
              </li>
              <li>
                <Link to="/parceiro">Quero Contratar</Link>
              </li>
            </ul>
          </div>

          {/* Coluna 4: Contato & Redes */}
          <div className="public-footer__col">
            <h4>Atendimento</h4>
            <ul className="public-footer__links">
              <li>
                <a
                  href={marthiWhatsAppHref('Olá! Gostaria de falar com o suporte ou comercial da Marthi.')}
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconWhatsApp /> WhatsApp Oficial
                </a>
              </li>
              <li>
                <a href={MARTHI_COMPANY.instagramHref} target="_blank" rel="noreferrer">
                  <IconInstagram /> Instagram
                </a>
              </li>
              <li>
                <a href={MARTHI_COMPANY.emailHref}>
                  E-mail Comercial
                </a>
              </li>
              <li>
                <Link to="/contato">Formulário de Contato</Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Rodapé inferior / Copyright */}
        <div className="public-footer__bottom">
          <p className="public-footer__copy">
            © {new Date().getFullYear()} {MARTHI_COMPANY.legalName}. Todos os direitos reservados.
            Sede no {MARTHI_COMPANY.addressLine}.
          </p>
          <div className="public-footer__socials">
            <a
              href={MARTHI_COMPANY.whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="public-footer__social-link"
              aria-label="WhatsApp Marthi"
            >
              <IconWhatsApp />
              <span>{MARTHI_COMPANY.whatsappDisplay}</span>
            </a>
            <a
              href={MARTHI_COMPANY.instagramHref}
              target="_blank"
              rel="noreferrer"
              className="public-footer__social-link"
              aria-label="Instagram Marthi"
            >
              <IconInstagram />
              <span>@{MARTHI_COMPANY.instagramHandle}</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
