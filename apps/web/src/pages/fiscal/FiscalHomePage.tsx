import { Link } from 'react-router-dom';
import { issuerIsReadyForCte, issuerIsReadyForMdfe, issuerIsReadyForNfe, issuerIsReadyForNfse } from '../../data/fiscalIssuerStore';

const CARDS = [
  {
    to: '/fiscal/nfe',
    tag: 'NF-e',
    title: 'Nota fiscal eletrônica',
    text: 'Entrada e saída de mercadorias, transmissão SEFAZ e DANFE.',
    ready: () => issuerIsReadyForNfe(),
  },
  {
    to: '/fiscal/nfse',
    tag: 'NFS-e',
    title: 'Nota de serviço',
    text: 'Portal Nacional (DPS → ADN) a partir de OS ou lançamento avulso.',
    ready: () => issuerIsReadyForNfse(),
  },
  {
    to: '/fiscal/cte',
    tag: 'CT-e',
    title: 'Conhecimento de transporte',
    text: 'Frete e transporte de carga entre emitente, remetente e destinatário.',
    ready: () => issuerIsReadyForCte(),
  },
  {
    to: '/fiscal/mdfe',
    tag: 'MDF-e',
    title: 'Manifesto de documentos',
    text: 'Agrupa CT-e / NF-e da viagem para fiscalização em trânsito.',
    ready: () => issuerIsReadyForMdfe(),
  },
] as const;

export function FiscalHomePage() {
  return (
    <div className="fiscal-home">
      <p className="empty" style={{ margin: 0 }}>
        Escolha o documento. NFC-e (cupom) continua no PDV / Caixa.
      </p>
      <div className="fiscal-home__grid">
        {CARDS.map((card) => (
          <Link key={card.to} to={card.to} className="fiscal-home__card">
            <em>{card.tag}</em>
            <strong>{card.title}</strong>
            <span>{card.text}</span>
            <span>{card.ready() ? 'Emissor pronto' : 'Configure certificado e emitente'}</span>
          </Link>
        ))}
        <Link to="/fiscal/config" className="fiscal-home__card">
          <em>Setup</em>
          <strong>Configuração fiscal</strong>
          <span>Certificado A1, CSC (NFC-e no PDV), séries, ambiente e pastas XML/LOG/PDF.</span>
        </Link>
        <Link to="/fiscal/cst" className="fiscal-home__card">
          <em>Tributação</em>
          <strong>CST e cClassTrib</strong>
          <span>Tabelas IBS/CBS e sincronização SVRS para o lançamento da NF-e.</span>
        </Link>
      </div>
    </div>
  );
}
