import { useEffect, useState, type FormEvent } from 'react';
import { AdminIcon } from './AdminIcons';
import { AdminPicker } from './AdminPicker';
import { nestApiUrl } from '../services/config';
import {
  apiGetStoreWhatsAppSettings,
  apiPutStoreWhatsAppSettings,
  apiGetStoreSmtpSettings,
  apiPutStoreSmtpSettings,
  apiTestStoreSmtp,
  type StoreWhatsAppSettings,
  type StoreSmtpSettings,
} from '../services/erpApi';

type EvolutionStatus = {
  connected: boolean;
  state: 'open' | 'close' | 'connecting' | 'error' | 'offline' | string;
  instance: string;
  baseUrl: string;
  storeNumber: string;
  error?: string;
};

type CommTab = 'whatsapp' | 'email';

export function CommunicationSettingsSection() {
  const [activeTab, setActiveTab] = useState<CommTab>('whatsapp');

  // ── Estados do WhatsApp ──────────────────────────────────────────────────
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<EvolutionStatus | null>(null);
  const [whatsappSettings, setWhatsappSettings] = useState<StoreWhatsAppSettings>({
    enabled: true,
    baseUrl: 'https://marthi-tec.discloud.app',
    instance: 'marthi',
    apiKey: '5E280C9D-239A-4D8B-A765-63D00C291331',
    storeNumber: '5524981244253',
    notifyCustomer: true,
    locationLabel: 'Cell Ponto Três Rios',
  });
  const [showAdvancedWa, setShowAdvancedWa] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [waTestNumber, setWaTestNumber] = useState('');
  const [waTestMessage, setWaTestMessage] = useState('');
  const [waTesting, setWaTesting] = useState(false);
  const [waFeedback, setWaFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Estados do E-mail (SMTP) ─────────────────────────────────────────────
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [smtpSettings, setSmtpSettings] = useState<StoreSmtpSettings>({
    enabled: true,
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    user: '',
    pass: '',
    from: 'Marthi Tecnologia <marthi.tecnologia@gmail.com>',
  });
  const [smtpTestRecipient, setSmtpTestRecipient] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpFeedback, setSmtpFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Carregamento Inicial ──────────────────────────────────────────────────
  useEffect(() => {
    void loadWhatsAppConfig();
    void checkWhatsAppStatus();
    void loadSmtpConfig();
  }, []);

  async function loadWhatsAppConfig() {
    setWhatsappLoading(true);
    try {
      const res = await apiGetStoreWhatsAppSettings();
      if (res) {
        setWhatsappSettings((prev) => ({ ...prev, ...res }));
        if (res.storeNumber && !waTestNumber) {
          setWaTestNumber(res.storeNumber);
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar configurações de WhatsApp:', err);
    } finally {
      setWhatsappLoading(false);
    }
  }

  async function checkWhatsAppStatus() {
    setWhatsappLoading(true);
    try {
      const url = `${nestApiUrl()}/api/v1/whatsapp/status`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setWhatsappStatus(json);
        if (json.storeNumber && !waTestNumber) {
          setWaTestNumber(json.storeNumber);
        }
      } else {
        setWhatsappStatus({
          connected: false,
          state: 'offline',
          instance: whatsappSettings.instance || 'marthi',
          baseUrl: whatsappSettings.baseUrl || 'https://marthi-tec.discloud.app',
          storeNumber: whatsappSettings.storeNumber || '5524981244253',
          error: json.error || 'Falha ao consultar status da Evolution.',
        });
      }
    } catch {
      setWhatsappStatus({
        connected: false,
        state: 'offline',
        instance: whatsappSettings.instance || 'marthi',
        baseUrl: whatsappSettings.baseUrl || 'https://marthi-tec.discloud.app',
        storeNumber: whatsappSettings.storeNumber || '5524981244253',
        error: 'Serviço de WhatsApp inacessível.',
      });
    } finally {
      setWhatsappLoading(false);
    }
  }

  async function handleSaveWhatsApp(e: FormEvent) {
    e.preventDefault();
    setWhatsappSaving(true);
    setWaFeedback(null);
    try {
      const updated = await apiPutStoreWhatsAppSettings(whatsappSettings);
      setWhatsappSettings(updated);
      setWaFeedback({ type: 'success', message: 'Configurações de WhatsApp salvas com sucesso no banco de dados!' });
      void checkWhatsAppStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar configurações de WhatsApp.';
      setWaFeedback({ type: 'error', message: msg });
    } finally {
      setWhatsappSaving(false);
    }
  }

  async function handleFetchQrCode() {
    setLoadingQr(true);
    setWaFeedback(null);
    try {
      const url = `${nestApiUrl()}/api/v1/whatsapp/qrcode`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data) {
        const qr = json.data?.base64 || json.data?.qrcode?.base64 || json.data?.code;
        setQrCodeData(qr);
      } else {
        setWaFeedback({ type: 'error', message: 'Não foi possível gerar QR Code. A instância pode já estar conectada.' });
      }
    } catch {
      setWaFeedback({ type: 'error', message: 'Erro ao solicitar QR Code.' });
    } finally {
      setLoadingQr(false);
    }
  }

  async function handleSendWaTest() {
    if (!waTestNumber.trim()) {
      setWaFeedback({ type: 'error', message: 'Informe o número do WhatsApp com DDD (ex: 24981244253).' });
      return;
    }
    setWaTesting(true);
    setWaFeedback(null);
    try {
      const url = `${nestApiUrl()}/api/v1/whatsapp/test`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: waTestNumber.trim(),
          message: waTestMessage.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setWaFeedback({
          type: 'success',
          message: `Mensagem de teste enviada com sucesso para ${json.data?.recipient || waTestNumber}!`,
        });
      } else {
        setWaFeedback({
          type: 'error',
          message: json.error?.message || 'Falha ao enviar mensagem de teste.',
        });
      }
    } catch {
      setWaFeedback({
        type: 'error',
        message: 'Erro ao conectar com o serviço de envio. Verifique a Evolution API.',
      });
    } finally {
      setWaTesting(false);
    }
  }

  // ── Funções de E-mail (SMTP) ─────────────────────────────────────────────
  async function loadSmtpConfig() {
    setSmtpLoading(true);
    try {
      const res = await apiGetStoreSmtpSettings();
      if (res) {
        setSmtpSettings((prev) => ({ ...prev, ...res }));
        if (res.user && !smtpTestRecipient) {
          setSmtpTestRecipient(res.user);
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar configurações SMTP:', err);
    } finally {
      setSmtpLoading(false);
    }
  }

  async function handleSaveSmtp(e: FormEvent) {
    e.preventDefault();
    setSmtpSaving(true);
    setSmtpFeedback(null);
    try {
      const res = await apiPutStoreSmtpSettings(smtpSettings);
      setSmtpSettings((prev) => ({ ...prev, ...res }));
      setSmtpFeedback({ type: 'success', message: 'Configurações de E-mail (SMTP) salvas com sucesso no banco de dados!' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar configurações de E-mail.';
      setSmtpFeedback({ type: 'error', message: msg });
    } finally {
      setSmtpSaving(false);
    }
  }

  async function handleSendSmtpTest() {
    if (!smtpTestRecipient.trim()) {
      setSmtpFeedback({ type: 'error', message: 'Informe o e-mail de destino para realizar o teste.' });
      return;
    }
    setSmtpTesting(true);
    setSmtpFeedback(null);
    try {
      const res = await apiTestStoreSmtp({
        recipient: smtpTestRecipient.trim(),
        host: smtpSettings.host,
        port: Number(smtpSettings.port),
        secure: smtpSettings.secure,
        user: smtpSettings.user,
        pass: smtpSettings.pass,
        from: smtpSettings.from,
      });
      setSmtpFeedback({
        type: 'success',
        message: res?.message || `E-mail de teste disparado com sucesso para ${smtpTestRecipient}!`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao disparar e-mail de teste.';
      setSmtpFeedback({ type: 'error', message: msg });
    } finally {
      setSmtpTesting(false);
    }
  }

  const isWaConnected = whatsappStatus?.state === 'open' || whatsappStatus?.connected === true;

  return (
    <article className="admin-card comm-card" style={{ padding: 24, borderRadius: 16 }}>
      {/* Cabeçalho da Seção de Comunicação */}
      <header className="ops-board__head" style={{ marginBottom: 20 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: '1.4rem' }}>📡</span>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Canais de Comunicação &amp; Mensageria</h2>
          </div>
          <p style={{ margin: 0, color: 'var(--mute, #64748b)', fontSize: '0.9rem' }}>
            Configure o WhatsApp (Evolution API) e o Servidor de E-mail (SMTP) da loja para disparo de orçamentos, pedidos, comprovantes e ordens de serviço.
          </p>
        </div>

        {/* Alternador de Canais */}
        <div style={{ display: 'flex', gap: 8, background: 'var(--card-2, rgba(255,255,255,0.06))', padding: 4, borderRadius: 10 }}>
          <button
            type="button"
            className={`btn ${activeTab === 'whatsapp' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setActiveTab('whatsapp')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: '0.86rem' }}
          >
            <AdminIcon name="whatsapp" />
            <span>WhatsApp (Evolution)</span>
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'email' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setActiveTab('email')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: '0.86rem' }}
          >
            <span>✉️</span>
            <span>E-mail (SMTP)</span>
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 1: WHATSAPP & EVOLUTION API                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'whatsapp' && (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Card de Status de Conexão */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              padding: '16px 20px',
              borderRadius: 12,
              background: isWaConnected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${isWaConnected ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: isWaConnected ? '#22c55e' : '#ef4444',
                  boxShadow: isWaConnected ? '0 0 10px #22c55e' : 'none',
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: isWaConnected ? '#166534' : '#991b1b' }}>
                  {isWaConnected
                    ? 'WhatsApp Conectado e Operacional'
                    : whatsappStatus?.state === 'connecting'
                      ? 'Aguardando Leitura de QR Code / Conectando...'
                      : 'WhatsApp Desconectado ou Instância Offline'}
                </div>
                <div style={{ fontSize: '0.84rem', color: 'var(--mute, #64748b)', marginTop: 2 }}>
                  Instância: <strong>{whatsappStatus?.instance || whatsappSettings.instance || 'marthi'}</strong> · Servidor:{' '}
                  <code>{whatsappStatus?.baseUrl || whatsappSettings.baseUrl}</code> · Estado:{' '}
                  <span style={{ textTransform: 'uppercase', fontWeight: 650 }}>{whatsappStatus?.state || 'verificando'}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void checkWhatsAppStatus()}
                disabled={whatsappLoading}
                style={{ fontSize: '0.85rem' }}
              >
                <AdminIcon name="sync" />
                <span>{whatsappLoading ? 'Verificando…' : 'Verificar status'}</span>
              </button>

              {!isWaConnected && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void handleFetchQrCode()}
                  disabled={loadingQr}
                  style={{ fontSize: '0.85rem' }}
                >
                  {loadingQr ? 'Gerando QR…' : 'Ler QR Code'}
                </button>
              )}
            </div>
          </div>

          {/* QR Code de Leitura se Aberto */}
          {qrCodeData && (
            <div
              style={{
                textAlign: 'center',
                padding: 24,
                background: 'var(--card-2, #1c2430)',
                borderRadius: 14,
                border: '1px solid var(--line, rgba(255, 255, 255, 0.1))',
              }}
            >
              <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Escaneie o QR Code no seu WhatsApp</h3>
              <p style={{ margin: '0 0 16px', color: 'var(--mute, #94a3b8)', fontSize: '0.88rem' }}>
                Abra o WhatsApp no celular &gt; <strong>Aparelhos Conectados</strong> &gt; <strong>Conectar um Aparelho</strong>.
              </p>
              <img
                src={qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`}
                alt="QR Code WhatsApp"
                style={{ maxWidth: 260, borderRadius: 10, background: '#fff', padding: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}
              />
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn btn--ghost" onClick={() => setQrCodeData(null)}>
                  Fechar QR Code
                </button>
              </div>
            </div>
          )}

          {/* Feedback do WhatsApp */}
          {waFeedback && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                fontWeight: 600,
                fontSize: '0.9rem',
                background: waFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: waFeedback.type === 'success' ? '#166534' : '#991b1b',
                border: `1px solid ${waFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              {waFeedback.message}
            </div>
          )}

          {/* Formulário de Configurações de WhatsApp */}
          <form onSubmit={handleSaveWhatsApp} style={{ display: 'grid', gap: 16 }}>
            <div
              style={{
                background: 'var(--card-2, rgba(255, 255, 255, 0.03))',
                padding: 20,
                borderRadius: 14,
                border: '1px solid var(--line, rgba(255, 255, 255, 0.08))',
                display: 'grid',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>Configurações Operacionais de WhatsApp</h3>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--mute, #64748b)' }}>
                    Estes dados são armazenados no banco de dados e usados por todos os módulos (Totem, PDV, OS, Notificações).
                  </p>
                </div>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 650 }}>
                  <input
                    type="checkbox"
                    checked={whatsappSettings.enabled}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, enabled: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent, #0f766e)' }}
                  />
                  <span>Ativar WhatsApp na Loja</span>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: '0.85rem', fontWeight: 650 }}>
                  WhatsApp Comercial da Loja (com DDI e DDD)
                  <input
                    type="text"
                    value={whatsappSettings.storeNumber}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, storeNumber: e.target.value })}
                    placeholder="Ex.: 5524981244253"
                    style={{
                      minHeight: 40,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--line, #cbd5e1)',
                      background: 'var(--card, #fff)',
                      color: 'var(--ink, #0f172a)',
                    }}
                  />
                  <small style={{ color: 'var(--mute, #64748b)', fontWeight: 400 }}>
                    Número que recebe alertas de novos pedidos do totem, orçamentos e fechamento de caixa.
                  </small>
                </label>

                <label style={{ display: 'grid', gap: 6, fontSize: '0.85rem', fontWeight: 650 }}>
                  Identificação do Local / Shopping (opcional)
                  <input
                    type="text"
                    value={whatsappSettings.locationLabel}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, locationLabel: e.target.value })}
                    placeholder="Ex.: Cell Ponto Três Rios ou Shopping Olga Sola"
                    style={{
                      minHeight: 40,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--line, #cbd5e1)',
                      background: 'var(--card, #fff)',
                      color: 'var(--ink, #0f172a)',
                    }}
                  />
                  <small style={{ color: 'var(--mute, #64748b)', fontWeight: 400 }}>
                    Aparece no cabeçalho ou rodapé das mensagens disparadas para facilitar a identificação da filial.
                  </small>
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={whatsappSettings.notifyCustomer}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, notifyCustomer: e.target.checked })}
                    style={{ width: 17, height: 17, accentColor: 'var(--accent, #0f766e)' }}
                  />
                  <span>Enviar confirmação automática no WhatsApp do cliente após realização do pedido / OS</span>
                </label>
              </div>

              {/* Parâmetros Avançados (Evolution API) */}
              <div style={{ borderTop: '1px solid var(--line, rgba(255,255,255,0.08))', paddingTop: 14 }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowAdvancedWa((val) => !val)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.84rem' }}
                >
                  <AdminIcon name="settings" />
                  <span>{showAdvancedWa ? 'Ocultar Parâmetros Técnicos da API' : 'Configurações Avançadas da Evolution API'}</span>
                </button>

                {showAdvancedWa && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 14 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 650 }}>
                      URL Base da Evolution API
                      <input
                        type="text"
                        value={whatsappSettings.baseUrl}
                        onChange={(e) => setWhatsappSettings({ ...whatsappSettings, baseUrl: e.target.value })}
                        placeholder="https://marthi-tec.discloud.app"
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

                    <label style={{ display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 650 }}>
                      Nome da Instância Evolution
                      <input
                        type="text"
                        value={whatsappSettings.instance}
                        onChange={(e) => setWhatsappSettings({ ...whatsappSettings, instance: e.target.value })}
                        placeholder="marthi"
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

                    <label style={{ display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 650 }}>
                      Chave de Autenticação (apikey)
                      <input
                        type="text"
                        value={whatsappSettings.apiKey}
                        onChange={(e) => setWhatsappSettings({ ...whatsappSettings, apiKey: e.target.value })}
                        placeholder="5E280C9D-239A-4D8B-A765-63D00C291331"
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
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="submit" className="btn btn--primary" disabled={whatsappSaving} style={{ minWidth: 160 }}>
                  <AdminIcon name="whatsapp" />
                  <span>{whatsappSaving ? 'Salvando no banco…' : 'Salvar WhatsApp'}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Teste de Disparo WhatsApp */}
          <div
            style={{
              background: 'var(--card-2, rgba(255, 255, 255, 0.03))',
              padding: 20,
              borderRadius: 14,
              border: '1px solid var(--line, rgba(255, 255, 255, 0.08))',
              display: 'grid',
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: '0.98rem' }}>Testar Disparo de Mensagem WhatsApp</h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--mute, #64748b)' }}>
              Envie uma mensagem instantânea para validar que o WhatsApp está entregando mensagens aos seus clientes.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 650 }}>
                Número de Destino (com DDD)
                <input
                  type="text"
                  value={waTestNumber}
                  onChange={(e) => setWaTestNumber(e.target.value)}
                  placeholder="Ex.: (24) 98124-4253 ou 24981244253"
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

              <label style={{ display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 650 }}>
                Mensagem personalizada (opcional)
                <input
                  type="text"
                  value={waTestMessage}
                  onChange={(e) => setWaTestMessage(e.target.value)}
                  placeholder="Ex.: Teste de conexão Marthi ERP / Totem"
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
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void handleSendWaTest()}
                disabled={waTesting || !isWaConnected}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <AdminIcon name="whatsapp" />
                <span>{waTesting ? 'Disparando mensagem…' : 'Enviar Mensagem de Teste'}</span>
              </button>
              {!isWaConnected && (
                <span style={{ color: '#ef4444', fontSize: '0.82rem' }}>
                  * O WhatsApp precisa estar conectado (status verde) para enviar mensagens.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 2: E-MAIL (SMTP PRÓPRIO DA EMPRESA)                              */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'email' && (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Feedback do SMTP */}
          {smtpFeedback && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                fontWeight: 600,
                fontSize: '0.9rem',
                background: smtpFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: smtpFeedback.type === 'success' ? '#166534' : '#991b1b',
                border: `1px solid ${smtpFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              {smtpFeedback.message}
            </div>
          )}

          {/* Formulário de Configuração do SMTP */}
          <form onSubmit={handleSaveSmtp} style={{ display: 'grid', gap: 16 }}>
            <div
              style={{
                background: 'var(--card-2, rgba(255, 255, 255, 0.03))',
                padding: 20,
                borderRadius: 14,
                border: '1px solid var(--line, rgba(255, 255, 255, 0.08))',
                display: 'grid',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>Servidor de E-mail da Loja (SMTP)</h3>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--mute, #64748b)' }}>
                    Permite que o sistema envie orçamentos, pedidos e recibos com o domínio e endereço de e-mail da sua empresa.
                  </p>
                </div>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 650 }}>
                  <input
                    type="checkbox"
                    checked={smtpSettings.enabled}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, enabled: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent, #0f766e)' }}
                  />
                  <span>Ativar Envio de E-mails Próprios</span>
                </label>
              </div>

              {/* Grid de Parâmetros SMTP */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: '0.85rem', fontWeight: 650 }}>
                  Servidor SMTP (SMTP_HOST)
                  <input
                    type="text"
                    required
                    value={smtpSettings.host}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
                    placeholder="Ex.: smtp.gmail.com ou mail.suaempresa.com.br"
                    style={{
                      minHeight: 40,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--line, #cbd5e1)',
                      background: 'var(--card, #fff)',
                      color: 'var(--ink, #0f172a)',
                    }}
                  />
                  <small style={{ color: 'var(--mute, #64748b)', fontWeight: 400 }}>
                    Ex.: smtp.gmail.com, smtp.office365.com, mail.sualoja.com.br
                  </small>
                </label>

                <label style={{ display: 'grid', gap: 6, fontSize: '0.85rem', fontWeight: 650 }}>
                  Porta (SMTP_PORT)
                  <input
                    type="number"
                    required
                    value={smtpSettings.port}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, port: Number(e.target.value) })}
                    placeholder="465 ou 587"
                    style={{
                      minHeight: 40,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--line, #cbd5e1)',
                      background: 'var(--card, #fff)',
                      color: 'var(--ink, #0f172a)',
                    }}
                  />
                  <small style={{ color: 'var(--mute, #64748b)', fontWeight: 400 }}>
                    Porta 465 (SSL) ou 587 (TLS).
                  </small>
                </label>

                <div style={{ display: 'grid', gap: 6 }}>
                  <AdminPicker
                    label="Segurança de Conexão (SMTP_SECURE)"
                    value={smtpSettings.secure ? 'ssl' : 'tls'}
                    options={[
                      { value: 'ssl', label: 'SSL / TLS Seguro (Porta 465 recomendada)' },
                      { value: 'tls', label: 'STARTTLS / Aberta (Porta 587 ou 25)' },
                    ]}
                    onChange={(val) => setSmtpSettings({ ...smtpSettings, secure: val === 'ssl' })}
                  />
                  <small style={{ color: 'var(--mute, #64748b)', fontWeight: 400 }}>
                    Use SSL para a maioria dos provedores com porta 465.
                  </small>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: '0.85rem', fontWeight: 650 }}>
                  Usuário / E-mail de Autenticação (SMTP_USER)
                  <input
                    type="text"
                    required
                    value={smtpSettings.user}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, user: e.target.value })}
                    placeholder="Ex.: contato@suaempresa.com.br ou conta@gmail.com"
                    style={{
                      minHeight: 40,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--line, #cbd5e1)',
                      background: 'var(--card, #fff)',
                      color: 'var(--ink, #0f172a)',
                    }}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6, fontSize: '0.85rem', fontWeight: 650 }}>
                  Senha do E-mail ou Senha de App (SMTP_PASS)
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showSmtpPass ? 'text' : 'password'}
                      value={smtpSettings.pass || ''}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, pass: e.target.value })}
                      placeholder={smtpSettings.hasPassword ? '•••••••• (senha já configurada)' : 'Digite a senha do e-mail'}
                      style={{
                        width: '100%',
                        minHeight: 40,
                        padding: '8px 40px 8px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--line, #cbd5e1)',
                        background: 'var(--card, #fff)',
                        color: 'var(--ink, #0f172a)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmtpPass((val) => !val)}
                      title={showSmtpPass ? 'Ocultar senha' : 'Ver senha'}
                      style={{
                        position: 'absolute',
                        right: 10,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 4,
                        color: 'var(--mute, #64748b)',
                        fontSize: '1rem',
                      }}
                    >
                      {showSmtpPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <small style={{ color: 'var(--mute, #64748b)', fontWeight: 400 }}>
                    Para Gmail ou Outlook, utilize uma <strong>Senha de App</strong> de 16 caracteres.
                  </small>
                </label>

                <label style={{ display: 'grid', gap: 6, fontSize: '0.85rem', fontWeight: 650 }}>
                  Remetente Oficial (SMTP_FROM)
                  <input
                    type="text"
                    required
                    value={smtpSettings.from}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, from: e.target.value })}
                    placeholder='Ex.: "Cell Ponto" <contato@cellponto.com.br>'
                    style={{
                      minHeight: 40,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--line, #cbd5e1)',
                      background: 'var(--card, #fff)',
                      color: 'var(--ink, #0f172a)',
                    }}
                  />
                  <small style={{ color: 'var(--mute, #64748b)', fontWeight: 400 }}>
                    Nome e endereço visível para o cliente na caixa de entrada.
                  </small>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="submit" className="btn btn--primary" disabled={smtpSaving || smtpLoading} style={{ minWidth: 160 }}>
                  <AdminIcon name="mail" />
                  <span>{smtpSaving ? 'Gravando no banco…' : smtpLoading ? 'Carregando…' : 'Salvar Configurações de E-mail'}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Teste de Disparo de E-mail */}
          <div
            style={{
              background: 'var(--card-2, rgba(255, 255, 255, 0.03))',
              padding: 20,
              borderRadius: 14,
              border: '1px solid var(--line, rgba(255, 255, 255, 0.08))',
              display: 'grid',
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: '0.98rem' }}>Testar Disparo de E-mail (SMTP)</h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--mute, #64748b)' }}>
              Envie um e-mail de teste para verificar a autenticação SMTP e certificar que a sua caixa postal está autorizada a disparar mensagens.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 650, flex: '1 1 280px' }}>
                E-mail Destinatário de Teste
                <input
                  type="email"
                  value={smtpTestRecipient}
                  onChange={(e) => setSmtpTestRecipient(e.target.value)}
                  placeholder="Ex.: seuemail@gmail.com"
                  style={{
                    minHeight: 40,
                    padding: '8px 14px',
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
                onClick={() => void handleSendSmtpTest()}
                disabled={smtpTesting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 20px' }}
              >
                <span>✉️</span>
                <span>{smtpTesting ? 'Testando conexão…' : 'Enviar E-mail de Teste'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
