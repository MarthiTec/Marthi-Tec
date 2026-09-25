import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { useStoreCustomization } from '../../data/storeSegment';

type EcosystemApp = {
  id: string;
  name: string;
  desc: string;
  path: string;
  icon: 'home' | 'box' | 'cart' | 'wrench' | 'totem' | 'fiscal' | 'people' | 'store';
  badge?: string;
  color: string;
};

const ECOSYSTEM_APPS: EcosystemApp[] = [
  {
    id: 'os',
    name: 'Oficina & OS',
    desc: 'Ordens de serviço, bancada e kanban de técnicos',
    path: '/os',
    icon: 'wrench',
    badge: 'Liberado',
    color: '#d97706',
  },
  {
    id: 'erp',
    name: 'Retaguarda & Estoque',
    desc: 'Catálogo de peças, almoxarifado, compras e balanço',
    path: '/erp',
    icon: 'box',
    badge: 'Liberado',
    color: '#0f766e',
  },
  {
    id: 'pdv',
    name: 'Caixa & PDV',
    desc: 'Frente de caixa, múltiplas formas de pagamento e sangria',
    path: '/caixa',
    icon: 'cart',
    badge: 'Liberado',
    color: '#2563eb',
  },
  {
    id: 'totem',
    name: 'Totem Autoatendimento',
    desc: 'Terminal de consulta e auto-venda para clientes',
    path: '/totem',
    icon: 'totem',
    badge: 'Liberado',
    color: '#7c3aed',
  },
  {
    id: 'fiscal',
    name: 'Fiscal & NFS-e',
    desc: 'Emissão de notas de serviço e produtos vinculados',
    path: '/fiscal',
    icon: 'fiscal',
    badge: 'Liberado',
    color: '#059669',
  },
  {
    id: 'ecommerce',
    name: 'E-commerce & Canais',
    desc: 'Pedidos online, catálogo web e integrações de canais',
    path: '/ecommerce',
    icon: 'store',
    badge: 'Liberado',
    color: '#0284c7',
  },
  {
    id: 'crm',
    name: 'CRM & Vendas',
    desc: 'Funil comercial, gestão de oportunidades e clientes',
    path: '/crm',
    icon: 'people',
    badge: 'Liberado',
    color: '#ea580c',
  },
  {
    id: 'cozinha',
    name: 'Mesas & Comandas',
    desc: 'Controle de pedidos e serviços por comanda',
    path: '/cozinha',
    icon: 'store',
    badge: 'Liberado',
    color: '#db2777',
  },
];

export function OsEcosystemMenu() {
  const customization = useStoreCustomization();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const availableApps = ECOSYSTEM_APPS.filter((app) => {
    if (app.id === 'cozinha') return customization.showTablesAndKitchen;
    return true;
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  return (
    <div className="os-ecosystem-menu" ref={containerRef}>
      <button
        type="button"
        className={`os-ecosystem-menu__icon-btn ${open ? 'is-active' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        title="Acessar outras funcionalidades liberadas no ecossistema Marthi"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Ecossistema Marthi"
      >
        <span className="os-ecosystem-menu__grid-icon" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
      </button>

      {open ? (
        <div className="os-ecosystem-popover" role="menu">
          <div className="os-ecosystem-popover__head">
            <div>
              <strong>Ecossistema Integrado Marthi</strong>
              <p>Funcionalidades liberadas para a sua operação</p>
            </div>
            <span className="os-ecosystem-popover__status">Plano Completo</span>
          </div>

          <div className="os-ecosystem-popover__grid">
            {availableApps.map((app) => {
              const isCurrent = location.pathname.startsWith(app.path);
              return (
                <button
                  key={app.id}
                  type="button"
                  className={`os-ecosystem-card ${isCurrent ? 'is-current' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    navigate(app.path);
                  }}
                >
                  <div
                    className="os-ecosystem-card__icon"
                    style={{ backgroundColor: `${app.color}22`, color: app.color }}
                  >
                    <AdminIcon name={app.icon} />
                  </div>
                  <div className="os-ecosystem-card__body">
                    <div className="os-ecosystem-card__title">
                      <strong>{app.name}</strong>
                      {isCurrent ? (
                        <span className="os-ecosystem-card__badge os-ecosystem-card__badge--active">
                          Módulo Atual
                        </span>
                      ) : app.badge ? (
                        <span className="os-ecosystem-card__badge">
                          {app.badge}
                        </span>
                      ) : null}
                    </div>
                    <p>{app.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="os-ecosystem-popover__footer">
            <span>Todas as operações sincronizadas em tempo real</span>
            <button
              type="button"
              className="os-ecosystem-popover__close"
              onClick={() => setOpen(false)}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
