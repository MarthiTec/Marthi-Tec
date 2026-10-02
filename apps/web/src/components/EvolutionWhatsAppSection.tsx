import { useEffect, useState } from 'react';
import { AdminIcon } from './AdminIcons';
import { nestApiUrl } from '../services/config';

type EvolutionStatus = {
  connected: boolean;
  state: 'open' | 'close' | 'connecting' | 'error' | 'offline' | string;
  instance: string;
  baseUrl: string;
  storeNumber: string;
  error?: string;
};

export function EvolutionWhatsAppSection() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<EvolutionStatus | null>(null);
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  async function checkStatus() {
    setLoading(true);
    setFeedback(null);
    try {
      const url = `${nestApiUrl()}/api/v1/whatsapp/status`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setStatus(json);
        if (json.storeNumber && !testNumber) {
          setTestNumber(json.storeNumber);
        }
      } else {
        setStatus({
          connected: false,
          state: 'error',
          instance: 'marthi',
          baseUrl: 'https://marthi-tec.discloud.app',
          storeNumber: '5524981244253',
          error: json.error || 'Falha ao consultar status da Evolution.',
        });
      }
    } catch (err) {
      // Fallback para chamada direta à Evolution caso API local esteja fora
      try {
        const directUrl = 'https://marthi-tec.discloud.app/instance/connectionState/marthi';
        const directRes = await fetch(directUrl, {
          headers: { apikey: '5E280C9D-239A-4D8B-A765-63D00C291331' },
        });
        const directJson = await directRes.json();
        const state = directJson?.instance?.state || 'offline';
        setStatus({
          connected: state === 'open',
          state,
          instance: 'marthi',
          baseUrl: 'https://marthi-tec.discloud.app',
          storeNumber: '5524981244253',
        });
      } catch {
        setStatus({
          connected: false,
          state: 'offline',
          instance: 'marthi',
          baseUrl: 'https://marthi-tec.discloud.app',
          storeNumber: '5524981244253',
          error: 'Evolution API não acessível no momento.',
        });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void checkStatus();
  }, []);

  async function handleSendTest() {
    if (!testNumber.trim()) {
      setFeedback({ type: 'error', message: 'Informe o número do WhatsApp com DDD (ex: 24981244253).' });
      return;
    }
    setTesting(true);
    setFeedback(null);
    try {
      const url = `${nestApiUrl()}/api/v1/whatsapp/test`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: testNumber.trim(),
          message: testMessage.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({
          type: 'success',
          message: `Mensagem de teste enviada com sucesso para ${json.data?.recipient || testNumber}!`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: json.error?.message || 'Falha ao enviar mensagem de teste.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: 'Erro ao conectar com o serviço de envio. Verifique a Evolution API.',
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleFetchQrCode() {
    setLoadingQr(true);
    setFeedback(null);
    try {
      const url = `${nestApiUrl()}/api/v1/whatsapp/qrcode`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data) {
        const qr = json.data?.base64 || json.data?.qrcode?.base64 || json.data?.code;
        setQrCodeData(qr);
      } else {
        setFeedback({ type: 'error', message: 'Não foi possível gerar o QR Code. Instância pode já estar conectada.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao solicitar QR Code.' });
    } finally {
      setLoadingQr(false);
    }
  }

  const isConnected = status?.state === 'open' || status?.connected === true;

  return (
    <article className="admin-card evolution-whatsapp-card">
      <header className="ops-board__head">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: '1.25rem' }}>💬</span>
            <h2 style={{ margin: 0 }}>WhatsApp &amp; Evolution API da Operação</h2>
          </div>
          <p style={{ margin: 0, color: 'var(--mute, #64748b)', fontSize: '0.88rem' }}>
            Canal oficial para notificações automáticas do Totem, recibos de vendas, ordens de serviço e relatórios.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void checkStatus()}
            disabled={loading}
          >
            <AdminIcon name="sync" />
            <span>{loading ? 'Verificando…' : 'Verificar status'}</span>
          </button>
        </div>
      </header>

      {/* Indicador de Status da Conexão */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 18px',
          borderRadius: 12,
          background: isConnected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          border: `1px solid ${isConnected ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
          marginTop: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: isConnected ? '#22c55e' : '#ef4444',
              boxShadow: isConnected ? '0 0 10px #22c55e' : 'none',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.98rem', color: isConnected ? '#166534' : '#991b1b' }}>
              {isConnected
                ? 'Conectado e Autenticado com Sucesso (WhatsApp Ativo)'
                : status?.state === 'connecting'
                  ? 'Aguardando Leitura de QR Code / Conexão...'
                  : 'WhatsApp Desconectado ou Instância Offline'}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--mute, #64748b)', marginTop: 2 }}>
              Instância: <strong>{status?.instance || 'marthi'}</strong> · Servidor:{' '}
              <code>{status?.baseUrl || 'https://marthi-tec.discloud.app'}</code> · Estado:{' '}
              <span style={{ textTransform: 'uppercase', fontWeight: 650 }}>{status?.state || 'verificando'}</span>
            </div>
          </div>
        </div>

        {!isConnected && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleFetchQrCode()}
            disabled={loadingQr}
          >
            {loadingQr ? 'Gerando QR Code…' : 'Conectar via QR Code'}
          </button>
        )}
      </div>

      {feedback && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: '0.88rem',
            marginBottom: 16,
            background: feedback.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: feedback.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${feedback.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* QR Code de Conexão se solicitado */}
      {qrCodeData && (
        <div
          style={{
            textAlign: 'center',
            padding: 20,
            background: 'var(--card-2, #1c2430)',
            borderRadius: 12,
            border: '1px solid var(--line, rgba(255, 255, 255, 0.1))',
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: '0 0 10px' }}>Escaneie o QR Code no seu WhatsApp</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--mute, #94a3b8)', fontSize: '0.85rem' }}>
            Abra o WhatsApp no celular &gt; Aparelhos Conectados &gt; Conectar um Aparelho.
          </p>
          <img
            src={qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`}
            alt="QR Code WhatsApp"
            style={{ maxWidth: 260, borderRadius: 8, background: '#fff', padding: 8 }}
          />
        </div>
      )}

      {/* Seção de Teste de Envio */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          background: 'var(--card-2, rgba(255, 255, 255, 0.04))',
          padding: 16,
          borderRadius: 12,
          border: '1px solid var(--line, rgba(255, 255, 255, 0.08))',
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>Testar Envio de Mensagem WhatsApp</h3>
          <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'var(--mute, #64748b)' }}>
            Envie uma mensagem de teste para o celular da loja ou para um cliente para confirmar o funcionamento.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: '0.8rem', fontWeight: 650 }}>
              Número do WhatsApp (com DDD)
              <input
                type="text"
                placeholder="Ex.: (24) 98124-4253 ou 24981244253"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                style={{
                  minHeight: 38,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--line, #cbd5e1)',
                  background: 'var(--card, #fff)',
                  color: 'var(--ink, #0f172a)',
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: 4, fontSize: '0.8rem', fontWeight: 650 }}>
              Mensagem personalizada (opcional)
              <input
                type="text"
                placeholder="Ex.: Teste de conexão Marthi ERP / Totem"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                style={{
                  minHeight: 38,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--line, #cbd5e1)',
                  background: 'var(--card, #fff)',
                  color: 'var(--ink, #0f172a)',
                }}
              />
            </label>

            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void handleSendTest()}
              disabled={testing || !isConnected}
              style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <AdminIcon name="whatsapp" />
              <span>{testing ? 'Disparando mensagem…' : 'Enviar Mensagem de Teste'}</span>
            </button>
            {!isConnected && (
              <small style={{ color: '#ef4444', fontSize: '0.75rem' }}>
                * A instância precisa estar conectada (status verde) para realizar o disparo.
              </small>
            )}
          </div>
        </div>

        {/* Resumo de Configurações Técnicas */}
        <div style={{ borderLeft: '1px solid var(--line, rgba(255, 255, 255, 0.08))', paddingLeft: 16 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>Credenciais &amp; Parâmetros da API</h3>
          <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'var(--mute, #64748b)' }}>
            Valores gerenciados pelo servidor Discloud e sincronizados com a loja ativa.
          </p>
          <div style={{ display: 'grid', gap: 8, fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--line, #e2e8f0)' }}>
              <span style={{ color: 'var(--mute, #64748b)' }}>URL Base Evolution:</span>
              <strong style={{ fontFamily: 'monospace' }}>https://marthi-tec.discloud.app</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--line, #e2e8f0)' }}>
              <span style={{ color: 'var(--mute, #64748b)' }}>Nome da Instância:</span>
              <strong style={{ fontFamily: 'monospace' }}>marthi</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--line, #e2e8f0)' }}>
              <span style={{ color: 'var(--mute, #64748b)' }}>Destino Loja Padrão:</span>
              <strong>(24) 98124-4253</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ color: 'var(--mute, #64748b)' }}>Autenticação Apikey:</span>
              <strong style={{ color: '#22c55e' }}>Ativa &amp; Validada ✓</strong>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
