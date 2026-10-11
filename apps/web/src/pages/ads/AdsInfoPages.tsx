import { Link } from 'react-router-dom';
import { AdsPage, PhaseBlocked, useAdsStatus } from './AdsShared';

/** Créditos e pagamentos: hoje a Meta cobra direto o lojista; créditos do Marthi dependem da Fase 2. */
export function AdsCreditsPage() {
  const { status } = useAdsStatus();
  const account = status?.connection?.adAccount;
  return (
    <AdsPage title="Créditos e pagamentos" lead="Quem paga o quê nos seus anúncios." status={status}>
      <article className="admin-card">
        <h2 className="ads-card-title">Como funciona hoje</h2>
        <ul className="ads-checks">
          <li className="is-ok">
            <span className="ads-checks__icon">✓</span>
            <span>
              <strong>A Meta cobra você diretamente</strong>
              <small>
                Os anúncios rodam na sua conta de anúncios{account ? ` (${account.name}, ${account.currency})` : ''} e a Meta cobra pela forma de pagamento cadastrada nela. Gastos, faturas e recibos ficam
                no Gerenciador de Anúncios da Meta, em Cobrança e pagamentos.
              </small>
            </span>
          </li>
          <li className="is-ok">
            <span className="ads-checks__icon">✓</span>
            <span>
              <strong>Você controla o limite</strong>
              <small>Cada anúncio só gasta depois que o administrador autoriza o orçamento (por dia ou total). Pausar a campanha interrompe a veiculação.</small>
            </span>
          </li>
          <li>
            <span className="ads-checks__icon">○</span>
            <span>
              <strong>O Marthi não guarda saldo de mídia</strong>
              <small>Nenhum valor pago ao Marthi vira crédito na Meta. Por isso esta tela não mostra saldo.</small>
            </span>
          </li>
        </ul>
      </article>
      <PhaseBlocked phase="Fase 2" title="Créditos do Marthi">
        <p>Pagar anúncios pelo Marthi (com saldo, reservas e devoluções) está bloqueado até:</p>
        <ul>
          <li>definir o provedor de pagamento (hoje não há um integrado ao sistema);</li>
          <li>confirmar com a Meta e com o jurídico o modelo — não existe forma oficial de transferir saldo do Marthi para a conta de anúncios de cada loja;</li>
          <li>definir as regras de pagamento pendente, falha, reprovação, cancelamento, estorno e saldo não usado.</li>
        </ul>
        <p>Enquanto isso, nada aqui cobra você. Os gastos reais estão sempre no Gerenciador de Anúncios.</p>
      </PhaseBlocked>
    </AdsPage>
  );
}

/** Publicações orgânicas e calendário: Fase 3 (Instagram Platform). */
export function AdsPostsPage() {
  const { status } = useAdsStatus();
  return (
    <AdsPage title="Publicações e calendário" lead="Publicar no Instagram sem pagar anúncio, com agenda." status={status}>
      <PhaseBlocked phase="Fase 3" title="Publicações no Instagram">
        <p>Esta área chega depois de validarmos os anúncios no Facebook. Ela vai permitir:</p>
        <ul>
          <li>publicar foto, carrossel, Reels e Stories no Instagram profissional ligado à sua Página, conforme o que a conta e a API oficial permitirem;</li>
          <li>agendar com o horário da loja, cancelar e ver o que falhou;</li>
          <li>guardar o link de cada publicação.</li>
        </ul>
        <p>
          Recursos do aplicativo do Instagram como música, figurinhas e links interativos não estão disponíveis pela API oficial e não serão oferecidos. Publicação (gratuita) e anúncio (pago) são ações
          separadas.
        </p>
        <p>
          {status?.connection?.instagram ? `Instagram identificado: @${status.connection.instagram.username}.` : 'Nenhum Instagram profissional ligado à sua Página foi identificado ainda.'}{' '}
          <Link to="/painel/ads/contas">Contas conectadas</Link>
        </p>
      </PhaseBlocked>
    </AdsPage>
  );
}
