import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  CRM_EVENT,
  ensureCrmSellerProfile,
  listCrmConvertedCustomers,
  listCrmPublicProfiles,
  listCrmWonLeads,
} from '../../data/crmStore';

type SellerCtx = { sellerId: string; sellerName: string };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export function CrmNetworkPage() {
  const me = useOutletContext<SellerCtx>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    void ensureCrmSellerProfile(me.sellerId, me.sellerName);
    function refresh() {
      setTick((value) => value + 1);
    }
    window.addEventListener(CRM_EVENT, refresh);
    return () => window.removeEventListener(CRM_EVENT, refresh);
  }, [me.sellerId, me.sellerName]);

  const profiles = useMemo(() => listCrmPublicProfiles(), [tick]);
  const closedDeals = useMemo(() => listCrmWonLeads(), [tick]);
  const converted = useMemo(() => listCrmConvertedCustomers(), [tick]);
  const awaitingPay = closedDeals.filter((item) => !item.customerId);

  const mine = profiles.find((item) => item.sellerId === me.sellerId);

  return (
    <section className="crm-network">
      <p className="crm-network__lead">
        Rede interna Marthi — perfis dos vendedores da equipe. Leads fechados só viram cliente após
        pagar.
      </p>

      <div className="crm-network__toolbar">
        <Link className="btn btn--primary" to="/crm/perfil">
          {mine ? 'Editar meu perfil' : 'Configurar meu perfil'}
        </Link>
        <Link className="btn btn--ghost" to="/crm">
          Voltar aos negócios
        </Link>
      </div>

      <h2 className="crm-network__section-title">
        Vendedores <em>{profiles.length}</em>
      </h2>
      <div className="crm-network-grid">
        {profiles.map((profile) => {
          const isMe = profile.sellerId === me.sellerId;
          return (
            <article key={profile.sellerId} className={`crm-network-card ${isMe ? 'is-me' : ''}`}>
              <div
                className="crm-network-card__cover"
                style={
                  profile.coverUrl ? { backgroundImage: `url(${profile.coverUrl})` } : undefined
                }
              />
              <div className="crm-network-card__body">
                <div
                  className="crm-network-card__avatar"
                  style={
                    profile.avatarUrl
                      ? { backgroundImage: `url(${profile.avatarUrl})` }
                      : undefined
                  }
                >
                  {!profile.avatarUrl ? initials(profile.displayName) : null}
                </div>
                <strong>{profile.displayName}</strong>
                <span>
                  @{profile.handle}
                  {isMe ? ' · você' : ''}
                </span>
                <p>{profile.bio || 'Sem bio ainda.'}</p>
                <em>
                  {profile.specialty || 'Comercial'}
                  {profile.city ? ` · ${profile.city}` : ''}
                </em>
              </div>
            </article>
          );
        })}
        {profiles.length === 0 ? (
          <p className="empty">Nenhum perfil público ainda. Configure o seu em Meu perfil.</p>
        ) : null}
      </div>

      <h2 className="crm-network__section-title">
        Fechados aguardando pagamento <em>{awaitingPay.length}</em>
      </h2>
      {awaitingPay.length === 0 ? (
        <p className="empty">Nenhum negócio fechado aguardando pagamento.</p>
      ) : (
        <div className="crm-network-clients">
          {awaitingPay.map((lead) => (
            <article key={lead.id} className="crm-network-client">
              <div className="crm-network-client__avatar">{initials(lead.name)}</div>
              <div>
                <strong>{lead.name}</strong>
                <span>
                  {lead.ownerName ? `Com ${lead.ownerName}` : 'Sem responsável'} · ainda lead
                </span>
                <em>{lead.interest || 'Negócio fechado'}</em>
              </div>
              <Link className="btn btn--ghost" to={`/crm/negocio/${lead.id}`}>
                Abrir lead
              </Link>
            </article>
          ))}
        </div>
      )}

      <h2 className="crm-network__section-title">
        Clientes Marthi (pagos) <em>{converted.length}</em>
      </h2>
      {converted.length === 0 ? (
        <p className="empty">
          Depois de fechar e confirmar pagamento, o lead vira cliente Marthi no painel.
        </p>
      ) : (
        <div className="crm-network-clients">
          {converted.map((lead) => (
            <article key={lead.id} className="crm-network-client">
              <div className="crm-network-client__avatar">{initials(lead.name)}</div>
              <div>
                <strong>{lead.name}</strong>
                <span>
                  {lead.ownerName ? `Atendido por ${lead.ownerName}` : 'Sem responsável'}
                  {lead.customerId ? ` · ${lead.customerId}` : ''}
                </span>
                <em>{lead.interest || 'Cliente Marthi'}</em>
              </div>
              <Link className="btn btn--ghost" to={`/crm/negocio/${lead.id}`}>
                Negócio
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
