import { useEffect, useState, type FormEvent } from 'react';
import { AdminIcon } from './AdminIcons';
import { AdminPicker } from './AdminPicker';
import {
  apiGetStoreWhatsAppSettings,
  apiPutStoreWhatsAppSettings,
  apiGetWhatsAppStatus,
  apiGetWhatsAppQrCode,
  apiDisconnectWhatsApp,
  apiGetStoreSmtpSettings,
  apiPutStoreSmtpSettings,
  apiTestStoreSmtp,
  type StoreWhatsAppSettings,
  type StoreSmtpSettings,
} from '../services/erpApi';
import { nestPost, nestGet } from '../services/nestClient';

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
  const [deliveryLogs, setDeliveryLogs] = useState<{id:string;channel:string;recipient:string;status:string;created_at:string}[] | null>(null);
  const [deliveryError, setDeliveryError] = useState('');
  async function loadDeliveryLogs() {
    try {setDeliveryError('');setDeliveryLogs(await nestGet('/store/communication-deliveries'));}
    catch(error){setDeliveryError(error instanceof Error ? error.message : 'Falha ao carregar o histórico.');}
  }
  const [activeTab, setActiveTab] = useState<CommTab>('whatsapp');

  // ── Estados do WhatsApp ──────────────────────────────────────────────────
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<EvolutionStatus | null>(null);
  const [whatsappSettings, setWhatsappSettings] = useState<StoreWhatsAppSettings>({
    enabled: true,
    baseUrl: '',
    instance: '',
    apiKey: '',
    storeNumber: '',
    notifyCustomer: true,
    locationLabel: 'Loja Principal',
  });
  const [showAdvancedWa, setShowAdvancedWa] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [disconnectingWa, setDisconnectingWa] = useState(false);
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
      const res = await apiGetWhatsAppStatus();
      if (res && res.success) {
        setWhatsappStatus(res);
        if (res.storeNumber && !waTestNumber) {
          setWaTestNumber(res.storeNumber);
        }
        if (res.connected) {
          // Se já está conectado, limpa qualquer QR code aberto
          setQrCodeData(null);
        }
      } else {
        setWhatsappStatus({
          connected: false,
          state: 'offline',
          instance: whatsappSettings.instance || '',
          baseUrl: whatsappSettings.baseUrl || '',
          storeNumber: whatsappSettings.storeNumber || '',
          error: res?.error || 'Instância offline ou aguardando conexão.',
        });
      }
    } catch {
      setWhatsappStatus({
        connected: false,
        state: 'offline',
        instance: whatsappSettings.instance || '',
        baseUrl: whatsappSettings.baseUrl || '',
        storeNumber: whatsappSettings.storeNumber || '',
        error: 'Serviço de WhatsApp inacessível no momento.',
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
      const sanitized = { ...whatsappSettings, instance: whatsappSettings.instance.trim() };
      const updated = await apiPutStoreWhatsAppSettings(sanitized);
      setWhatsappSettings(updated);
      // Mantém o teste alinhado ao destino salvo para esta loja. Assim, um
      // número usado num teste anterior não fica como destino implícito.
      setWaTestNumber(updated.storeNumber || '');
      setWaFeedback({ type: 'success', message: 'Configurações de WhatsApp salvas com sucesso no banco de dados!' });
      void checkWhatsAppStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar configurações de WhatsApp.';
      setWaFeedback({ type: 'error', message: msg });
    } finally {
      setWhatsappSaving(false);
    }
  }

  async function handleFetchQrCode(forceNew = false) {
    setLoadingQr(true);
    setWaFeedback(null);
    try {
      const res = await apiGetWhatsAppQrCode(forceNew);
      // O backend pode ter provisionado a instância exclusiva desta loja agora mesmo.
      void loadWhatsAppConfig();
      if (res.alreadyConnected || res.state === 'open') {
        setQrCodeData(null);
        setWhatsappStatus((prev) => ({
          connected: true,
          state: 'open',
          instance: prev?.instance || '',
          baseUrl: prev?.baseUrl || '',
          storeNumber: prev?.storeNumber || whatsappSettings.storeNumber || '',
        }));
        setWaFeedback({
          type: 'success',
          message: 'O WhatsApp desta loja já está conectado e pronto para disparar mensagens!',
        });
        return;
      }

      const qr =
        res.data?.base64 ||
        res.data?.qrcode?.base64 ||
        res.data?.code ||
        res.data?.qrcode?.code;

      if (qr) {
        setQrCodeData(qr);
        setWaFeedback({
          type: 'success',
          message: 'QR Code gerado! Abra o WhatsApp no celular e escaneie o código abaixo.',
        });
      } else {
        setWaFeedback({
          type: 'error',
          message: 'Não foi possível renderizar o QR Code. A instância pode já estar conectada ou reiniciando.',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao solicitar QR Code.';
      setWaFeedback({ type: 'error', message: msg });
    } finally {
      setLoadingQr(false);
    }
  }

  async function handleDisconnectWhatsApp() {
    if (!window.confirm('Deseja realmente desconectar o WhatsApp desta loja? Será necessário ler um novo QR Code para reconectar.')) {
      return;
    }
    setDisconnectingWa(true);
    setWaFeedback(null);
    try {
      await apiDisconnectWhatsApp();
      setQrCodeData(null);
      setWhatsappStatus((prev) => ({
        connected: false,
        state: 'close',
        instance: prev?.instance || '',
        baseUrl: prev?.baseUrl || '',
        storeNumber: prev?.storeNumber || '',
      }));
      setWaFeedback({
        type: 'success',
        message: 'WhatsApp desconectado com sucesso. Clique em "Ler QR Code" para conectar um novo aparelho.',
      });
      // Busca automaticamente o novo QR Code
      void handleFetchQrCode(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao desconectar WhatsApp.';
      setWaFeedback({ type: 'error', message: msg });
    } finally {
      setDisconnectingWa(false);
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
      const result = await nestPost<{recipient: string}>('/whatsapp/test', {number: waTestNumber.trim(), message: waTestMessage.trim() || undefined});
      setWaFeedback({type:'success', message: `Mensagem aceita pelo Evolution para ${result.recipient}. A entrega depende da conexão do WhatsApp.`});
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
      setSmtpFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Não foi possível carregar a configuração de e-mail da loja.' });
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
    const missing = [!smtpSettings.host.trim() && 'Servidor SMTP', !smtpSettings.from.trim() && 'Remetente', !smtpSettings.user.trim() && 'Usuário', !smtpSettings.pass && 'Senha de app'].filter(Boolean);
    if (missing.length) {
      setSmtpFeedback({ type: 'error', message: `Preencha a configuração de e-mail: ${missing.join(', ')}.` });
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
            <AdminIcon name="mail" />
            <span>E-mail (SMTP)</span>
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div style={{marginBottom:16}}>
        <button type="button" className="btn btn--ghost" onClick={() => void loadDeliveryLogs()}>Atualizar histórico de envios</button>
        {deliveryError && <p role="alert">{deliveryError}</p>}
        {deliveryLogs && <><p>Aceito indica confirmação do provedor. Sem confirmação exige verificar antes de repetir o envio.</p><div style={{overflowX:'auto'}}><table className="admin-table"><thead><tr><th>Canal</th><th>Destinatário</th><th>Situação</th><th>Data</th></tr></thead><tbody>{deliveryLogs.map(log=><tr key={log.id}><td>{log.channel === 'email' ? 'E-mail' : 'WhatsApp'}</td><td>{log.recipient}</td><td>{({accepted:'Aceito pelo provedor',failed:'Recusado',unknown:'Sem confirmação',pending:'Em processamento'} as Record<string,string>)[log.status] || log.status}</td><td>{new Date(log.created_at).toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div></>}
      </div>
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
                  Instância: <strong>{whatsappStatus?.instance || whatsappSettings.instance || 'será criada automaticamente'}</strong> · Servidor:{' '}
                  <code>{whatsappStatus?.baseUrl || whatsappSettings.baseUrl}</code> · Estado:{' '}
                  <span style={{ textTransform: 'uppercase', fontWeight: 650 }}>{whatsappStatus?.state || 'verificando'}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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

              {isWaConnected ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void handleDisconnectWhatsApp()}
                  disabled={disconnectingWa}
                  style={{ fontSize: '0.85rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                  title="Desconecta este chip para ler outro WhatsApp com QR Code"
                >
                  <span>{disconnectingWa ? 'Desconectando…' : 'Desconectar / Trocar de WhatsApp'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void handleFetchQrCode(false)}
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
              <div style={{ display: 'inline-block', padding: 12, background: '#fff', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
                <img
                  src={qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`}
                  alt="QR Code WhatsApp"
                  style={{ maxWidth: 260, width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 10 }}>
                <button type="button" className="btn btn--ghost" onClick={() => void handleFetchQrCode(true)} disabled={loadingQr}>
                  <AdminIcon name="sync" />
                  <span>Atualizar QR Code</span>
                </button>
                <button type="button" className="btn btn--primary" onClick={() => setQrCodeData(null)}>
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

              {/* Linha de Campos Alinhada: WhatsApp Comercial e Identificação do Local */}
              <div className="comm-form-row comm-form-row--2">
                <div className="comm-field">
                  <label htmlFor="wa-store-number" className="comm-field__label">
                    WhatsApp Comercial da Loja (com DDI e DDD)
                  </label>
                  <input
                    id="wa-store-number"
                    type="text"
                    className="comm-field__input"
                    value={whatsappSettings.storeNumber}
                    onChange={(e) => {
                      setWhatsappSettings({ ...whatsappSettings, storeNumber: e.target.value });
                      setWaFeedback(null);
                    }}
                    placeholder="Ex.: 5524981244253"
                  />
                  <span className="comm-field__hint">
                    Número que recebe alertas de novos pedidos do totem, orçamentos e fechamento de caixa. O remetente é definido pela instância Evolution conectada abaixo.
                  </span>
                </div>

                <div className="comm-field">
                  <label htmlFor="wa-location-label" className="comm-field__label">
                    Identificação do Local / Shopping (opcional)
                  </label>
                  <input
                    id="wa-location-label"
                    type="text"
                    className="comm-field__input"
                    value={whatsappSettings.locationLabel}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, locationLabel: e.target.value })}
                    placeholder="Ex.: Loja Centro ou Shopping Matriz"
                  />
                  <span className="comm-field__hint">
                    Aparece no cabeçalho ou rodapé das mensagens disparadas para facilitar a identificação da filial.
                  </span>
                </div>
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
                  <span>{showAdvancedWa ? 'Ocultar Parâmetros Técnicos da API' : 'Usar meu próprio servidor Evolution (opcional)'}</span>
                </button>
                <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--mute, #64748b)' }}>
                  Por padrão você não precisa preencher nada aqui: ao clicar em <strong>"Ler QR Code"</strong> abaixo, a plataforma cria automaticamente uma instância exclusiva para esta loja. Só use os campos abaixo se a sua empresa tiver um servidor Evolution próprio.
                </p>

                {showAdvancedWa && (
                  <div className="comm-form-row comm-form-row--3" style={{ marginTop: 14 }}>
                    <div className="comm-field">
                      <label htmlFor="wa-base-url" className="comm-field__label">
                        URL Base da Evolution API
                      </label>
                      <input
                        id="wa-base-url"
                        type="text"
                        className="comm-field__input"
                        value={whatsappSettings.baseUrl}
                        onChange={(e) => setWhatsappSettings({ ...whatsappSettings, baseUrl: e.target.value })}
                        placeholder="Deixe em branco para usar o servidor padrão da plataforma"
                      />
                      <span className="comm-field__hint">Preencha só se sua empresa tiver um servidor Evolution próprio.</span>
                    </div>

                    <div className="comm-field">
                      <label htmlFor="wa-instance" className="comm-field__label">
                        Nome da Instância Evolution
                      </label>
                      <input
                        id="wa-instance"
                        type="text"
                        className="comm-field__input"
                        value={whatsappSettings.instance}
                        onChange={(e) => setWhatsappSettings({ ...whatsappSettings, instance: e.target.value })}
                        placeholder="Gerado automaticamente para esta loja"
                      />
                      <span className="comm-field__hint">Deixe em branco para a plataforma criar e nomear automaticamente.</span>
                    </div>

                    <div className="comm-field">
                      <label htmlFor="wa-api-key" className="comm-field__label">
                        Chave de Autenticação (apikey)
                      </label>
                      <input
                        id="wa-api-key"
                        type="text"
                        className="comm-field__input"
                        value={whatsappSettings.apiKey}
                        onChange={(e) => setWhatsappSettings({ ...whatsappSettings, apiKey: e.target.value })}
                        placeholder="Chave da instância Evolution desta loja"
                      />
                      <span className="comm-field__hint">Chave de segurança da API.</span>
                    </div>
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

            <div className="comm-form-row comm-form-row--2">
              <div className="comm-field">
                <label htmlFor="wa-test-num" className="comm-field__label">
                  Número de Destino (com DDD)
                </label>
                <input
                  id="wa-test-num"
                  type="text"
                  className="comm-field__input"
                  value={waTestNumber}
                    onChange={(e) => {
                      setWaTestNumber(e.target.value);
                      setWaFeedback(null);
                    }}
                  placeholder="Ex.: (24) 98124-4253 ou 24981244253"
                />
                <span className="comm-field__hint">Destino da mensagem de teste.</span>
              </div>

              <div className="comm-field">
                <label htmlFor="wa-test-msg" className="comm-field__label">
                  Mensagem personalizada (opcional)
                </label>
                <input
                  id="wa-test-msg"
                  type="text"
                  className="comm-field__input"
                  value={waTestMessage}
                  onChange={(e) => setWaTestMessage(e.target.value)}
                  placeholder="Ex.: Teste de conexão Marthi ERP / Totem"
                />
                <span className="comm-field__hint">Texto que será enviado ao destinatário.</span>
              </div>
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

              {/* LINHA 1 (Alinhamento Perfeito): Host, Porta e Segurança */}
              <div className="comm-form-row comm-form-row--3">
                <div className="comm-field">
                  <label htmlFor="smtp-host" className="comm-field__label">
                    Servidor SMTP (SMTP_HOST)
                  </label>
                  <input
                    id="smtp-host"
                    type="text"
                    required
                    className="comm-field__input"
                    value={smtpSettings.host}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
                    placeholder="Ex.: smtp.gmail.com ou mail.suaempresa.com.br"
                  />
                  <span className="comm-field__hint">
                    Ex.: smtp.gmail.com, smtp.office365.com, mail.sualoja.com.br
                  </span>
                </div>

                <div className="comm-field">
                  <label htmlFor="smtp-port" className="comm-field__label">
                    Porta (SMTP_PORT)
                  </label>
                  <input
                    id="smtp-port"
                    type="number"
                    required
                    className="comm-field__input"
                    value={smtpSettings.port}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, port: Number(e.target.value) })}
                    placeholder="465 ou 587"
                  />
                  <span className="comm-field__hint">
                    Porta 465 (SSL) ou 587 (TLS).
                  </span>
                </div>

                <div className="comm-field">
                  <label className="comm-field__label">
                    Segurança de Conexão (SMTP_SECURE)
                  </label>
                  <AdminPicker
                    compact
                    label="Segurança de Conexão"
                    value={smtpSettings.secure ? 'ssl' : 'tls'}
                    options={[
                      { value: 'ssl', label: 'SSL / TLS Seguro (Porta 465 recomendada)' },
                      { value: 'tls', label: 'STARTTLS / Aberta (Porta 587 ou 25)' },
                    ]}
                    onChange={(val) => setSmtpSettings({ ...smtpSettings, secure: val === 'ssl' })}
                  />
                  <span className="comm-field__hint">
                    Use SSL para a maioria dos provedores com porta 465.
                  </span>
                </div>
              </div>

              {/* LINHA 2 (Alinhamento Perfeito): Usuário, Senha e Remetente */}
              <div className="comm-form-row comm-form-row--3">
                <div className="comm-field">
                  <label htmlFor="smtp-user" className="comm-field__label">
                    Usuário / E-mail (SMTP_USER)
                  </label>
                  <input
                    id="smtp-user"
                    type="text"
                    required
                    className="comm-field__input"
                    value={smtpSettings.user}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, user: e.target.value })}
                    placeholder="contato@suaempresa.com.br"
                  />
                  <span className="comm-field__hint">
                    E-mail ou login da conta utilizado para autenticação.
                  </span>
                </div>

                <div className="comm-field">
                  <label htmlFor="smtp-pass" className="comm-field__label">
                    Senha de E-mail / App (SMTP_PASS)
                  </label>
                  <div className="comm-field__pass-wrap">
                    <input
                      id="smtp-pass"
                      type={showSmtpPass ? 'text' : 'password'}
                      className="comm-field__input"
                      value={smtpSettings.pass || ''}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, pass: e.target.value })}
                      placeholder={smtpSettings.hasPassword ? '•••••••• (senha gravada)' : 'Digite a senha do e-mail'}
                    />
                    <button
                      type="button"
                      className="comm-field__pass-toggle"
                      onClick={() => setShowSmtpPass((val) => !val)}
                      title={showSmtpPass ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showSmtpPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <span className="comm-field__hint">
                    Para Gmail ou Outlook, utilize uma <strong>Senha de App</strong> de 16 caracteres.
                  </span>
                </div>

                <div className="comm-field">
                  <label htmlFor="smtp-from" className="comm-field__label">
                    Remetente Oficial (SMTP_FROM)
                  </label>
                  <input
                    id="smtp-from"
                    type="text"
                    required
                    className="comm-field__input"
                    value={smtpSettings.from}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, from: e.target.value })}
                    placeholder='"Loja Central" <contato@sualoja.com.br>'
                  />
                  <span className="comm-field__hint">
                    Nome e endereço visível para o cliente na caixa de entrada.
                  </span>
                </div>
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
              <div className="comm-field" style={{ flex: '1 1 280px' }}>
                <label htmlFor="smtp-test-dest" className="comm-field__label">
                  E-mail Destinatário de Teste
                </label>
                <input
                  id="smtp-test-dest"
                  type="email"
                  className="comm-field__input"
                  value={smtpTestRecipient}
                  onChange={(e) => setSmtpTestRecipient(e.target.value)}
                  placeholder="Ex.: seuemail@gmail.com"
                />
              </div>

              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void handleSendSmtpTest()}
                disabled={smtpTesting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 20px' }}
              >
                <AdminIcon name="mail" />
                <span>{smtpTesting ? 'Testando conexão…' : 'Enviar E-mail de Teste'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
