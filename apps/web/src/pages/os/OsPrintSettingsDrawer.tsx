import React, { useState, useRef } from 'react';
import {
  useOsPrintSettings,
  getDefaultCompanyData,
  DEFAULT_WARRANTY_TERMS,
  type OsPrintSettings,
} from '../../data/osPrintSettings';
import { fileToStoreLogo } from '../../data/totemSettings';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function OsPrintSettingsDrawer({ open, onClose }: Props) {
  const [settings, saveSettings] = useOsPrintSettings();
  const [form, setForm] = useState<OsPrintSettings>(settings);
  const [activeTab, setActiveTab] = useState<'company' | 'model' | 'qrcode' | 'terms'>('company');
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(settings);
    }
  }, [open, settings]);

  if (!open) return null;

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadLoading(true);
      const dataUrl = await fileToStoreLogo(file);
      setForm((prev) => ({
        ...prev,
        company: {
          ...prev.company,
          logoUrl: dataUrl,
        },
      }));
    } catch {
      const reader = new FileReader();
      reader.onload = (event) => {
        const raw = event.target?.result as string;
        if (raw) {
          setForm((prev) => ({
            ...prev,
            company: {
              ...prev.company,
              logoUrl: raw,
            },
          }));
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleResetCompanyDefaults() {
    if (window.confirm('Deseja recarregar os dados da empresa cadastrados no emissor fiscal e configurações da loja?')) {
      const fresh = getDefaultCompanyData();
      setForm((prev) => ({
        ...prev,
        company: fresh,
      }));
    }
  }

  function handleSave() {
    let qrUrl = form.qrCode.url.trim();
    if (qrUrl && !/^https?:\/\//i.test(qrUrl)) {
      qrUrl = `https://${qrUrl}`;
    }

    saveSettings({
      ...form,
      qrCode: {
        ...form.qrCode,
        url: qrUrl,
      },
    });
    onClose();
  }

  return (
    <div className="os-modal-backdrop os-settings-drawer-backdrop" onClick={onClose}>
      <div
        className="os-settings-drawer-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="os-settings-drawer__header">
          <div className="os-settings-drawer__title-box">
            <span className="os-settings-drawer__icon">⚙️</span>
            <div>
              <h3>Configuração da Impressão de OS</h3>
              <p>Personalize logo, dados comerciais da empresa, QR Code e vias</p>
            </div>
          </div>
          <button
            type="button"
            className="os-settings-drawer__btn-close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        {/* Abas */}
        <div className="os-settings-drawer__tabs">
          <button
            type="button"
            className={`os-settings-tab ${activeTab === 'company' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('company')}
          >
            🏢 Dados & Logo
          </button>
          <button
            type="button"
            className={`os-settings-tab ${activeTab === 'model' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('model')}
          >
            📄 Modelo & Vias
          </button>
          <button
            type="button"
            className={`os-settings-tab ${activeTab === 'qrcode' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('qrcode')}
          >
            📱 QR Code
          </button>
          <button
            type="button"
            className={`os-settings-tab ${activeTab === 'terms' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('terms')}
          >
            ⚖️ Termos da OS
          </button>
        </div>

        {/* Conteúdo da Aba */}
        <div className="os-settings-drawer__body">
          {activeTab === 'company' && (
            <div className="os-settings-pane">
              <div className="os-settings-toolbar-sub">
                <p className="os-settings-hint">
                  Dados da empresa reutilizados automaticamente do sistema.
                  Você pode ajustá-los livremente para o cabeçalho das impressões.
                </p>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={handleResetCompanyDefaults}
                >
                  Recarregar do Cadastro
                </button>
              </div>

              {/* Upload de Logo Limpo: Clicar na caixinha ou colar URL */}
              <div className="os-settings-logo-section">
                <label className="os-settings-label">Logotipo da Empresa na OS</label>
                <div className="os-settings-logo-wrap">
                  <div
                    className="os-settings-logo-preview"
                    onClick={() => fileInputRef.current?.click()}
                    title="Clique para escolher imagem do seu computador (PNG ou JPG)"
                  >
                    {form.company.logoUrl ? (
                      <>
                        <img src={form.company.logoUrl} alt="Logo" />
                        <button
                          type="button"
                          className="btn-remove-logo"
                          onClick={(e) => {
                            e.stopPropagation();
                            setForm({ ...form, company: { ...form.company, logoUrl: '' } });
                          }}
                          title="Remover logo"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <div className="os-settings-logo-placeholder">
                        <span style={{ fontSize: 18, marginBottom: 2 }}>📷</span>
                        <span>{uploadLoading ? 'Processando...' : 'Clique para anexar logo'}</span>
                      </div>
                    )}
                  </div>

                  <div className="os-settings-logo-actions">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      style={{ display: 'none' }}
                    />
                    <input
                      type="text"
                      placeholder="Ou cole a URL direta da imagem da logo aqui"
                      value={form.company.logoUrl}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          company: { ...form.company, logoUrl: e.target.value },
                        })
                      }
                      className="os-settings-input"
                    />
                    <small style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 4, display: 'block' }}>
                      Clique na caixa ao lado para anexar imagem (PNG/JPG) ou cole o link direto.
                    </small>
                  </div>
                </div>
              </div>

              <div className="os-settings-form-grid">
                <label className="os-settings-field">
                  <span>Razão Social / Nome da Empresa:</span>
                  <input
                    type="text"
                    value={form.company.name}
                    onChange={(e) =>
                      setForm({ ...form, company: { ...form.company, name: e.target.value } })
                    }
                  />
                </label>

                <label className="os-settings-field">
                  <span>Nome Fantasia:</span>
                  <input
                    type="text"
                    value={form.company.tradeName}
                    onChange={(e) =>
                      setForm({ ...form, company: { ...form.company, tradeName: e.target.value } })
                    }
                  />
                </label>

                <label className="os-settings-field">
                  <span>CNPJ / CPF:</span>
                  <input
                    type="text"
                    value={form.company.document}
                    onChange={(e) =>
                      setForm({ ...form, company: { ...form.company, document: e.target.value } })
                    }
                  />
                </label>

                <label className="os-settings-field">
                  <span>Telefone / WhatsApp:</span>
                  <input
                    type="text"
                    value={form.company.phone}
                    onChange={(e) =>
                      setForm({ ...form, company: { ...form.company, phone: e.target.value } })
                    }
                  />
                </label>

                <label className="os-settings-field os-settings-span-2">
                  <span>Endereço Comercial (Rua, nº, complemento):</span>
                  <input
                    type="text"
                    value={form.company.address}
                    onChange={(e) =>
                      setForm({ ...form, company: { ...form.company, address: e.target.value } })
                    }
                  />
                </label>

                <label className="os-settings-field">
                  <span>Bairro:</span>
                  <input
                    type="text"
                    value={form.company.neighborhood}
                    onChange={(e) =>
                      setForm({ ...form, company: { ...form.company, neighborhood: e.target.value } })
                    }
                  />
                </label>

                <label className="os-settings-field">
                  <span>Cidade / UF:</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      placeholder="Cidade"
                      value={form.company.city}
                      onChange={(e) =>
                        setForm({ ...form, company: { ...form.company, city: e.target.value } })
                      }
                      style={{ flex: 1 }}
                    />
                    <input
                      type="text"
                      placeholder="UF"
                      value={form.company.state}
                      maxLength={2}
                      onChange={(e) =>
                        setForm({ ...form, company: { ...form.company, state: e.target.value.toUpperCase() } })
                      }
                      style={{ width: 60 }}
                    />
                  </div>
                </label>

                <label className="os-settings-field">
                  <span>CEP:</span>
                  <input
                    type="text"
                    value={form.company.zip}
                    onChange={(e) =>
                      setForm({ ...form, company: { ...form.company, zip: e.target.value } })
                    }
                  />
                </label>

                <label className="os-settings-field">
                  <span>E-mail de Atendimento:</span>
                  <input
                    type="email"
                    value={form.company.email}
                    onChange={(e) =>
                      setForm({ ...form, company: { ...form.company, email: e.target.value } })
                    }
                  />
                </label>
              </div>
            </div>
          )}

          {activeTab === 'model' && (
            <div className="os-settings-pane">
              <div className="os-settings-group">
                <label className="os-settings-label">Modelo Padrão de Impressão</label>
                <div className="os-settings-radio-cards">
                  <label className={`os-radio-card ${form.model === 'commercial' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="printModel"
                      value="commercial"
                      checked={form.model === 'commercial'}
                      onChange={() => setForm({ ...form, model: 'commercial' })}
                    />
                    <div className="os-radio-card__content">
                      <span className="os-radio-card__badge">Recomendado</span>
                      <strong>Modelo Personalizado (Nota Fiscal / Comercial)</strong>
                      <p>
                        2 vias em 1 folha A4: 1ª via compacta da loja com senha e 2ª via do cliente com QR Code e termos.
                      </p>
                    </div>
                  </label>

                  <label className={`os-radio-card ${form.model === 'default' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="printModel"
                      value="default"
                      checked={form.model === 'default'}
                      onChange={() => setForm({ ...form, model: 'default' })}
                    />
                    <div className="os-radio-card__content">
                      <strong>Modelo Atual</strong>
                      <p>
                        Modelo padrão clássico de 2 vias existente no sistema.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="os-settings-group">
                <label className="os-settings-label">Vias a Imprimir por Padrão</label>
                <select
                  value={form.copies}
                  onChange={(e) => setForm({ ...form, copies: e.target.value as any })}
                  className="os-settings-select"
                >
                  <option value="both">Duas vias na mesma folha (1ª Via Loja + 2ª Via Cliente)</option>
                  <option value="customer">Apenas 2ª Via (Comprovante do Cliente)</option>
                  <option value="shop">Apenas 1ª Via (Bancada da Loja)</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'qrcode' && (
            <div className="os-settings-pane">
              <div className="os-settings-group">
                <label className="os-settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.qrCode.enabled}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        qrCode: { ...form.qrCode, enabled: e.target.checked },
                      })
                    }
                  />
                  <strong>Exibir QR Code na 2ª Via (Comprovante do Cliente)</strong>
                </label>
                <p className="os-settings-hint">
                  Gera dinamicamente um QR Code escaneável para que o cliente acesse seu canal
                  (Instagram, WhatsApp, Google Avaliações, site institucional ou link de consulta).
                  O QR Code é exibido exclusivamente na via do cliente.
                </p>
              </div>

              {form.qrCode.enabled && (
                <div className="os-settings-form-grid" style={{ marginTop: 12 }}>
                  <label className="os-settings-field os-settings-span-2">
                    <span>URL / Endereço do QR Code:</span>
                    <input
                      type="text"
                      placeholder="https://instagram.com/seu-perfil ou https://wa.me/55..."
                      value={form.qrCode.url}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          qrCode: { ...form.qrCode, url: e.target.value },
                        })
                      }
                    />
                  </label>

                  <label className="os-settings-field os-settings-span-2">
                    <span>Legenda / Texto abaixo do QR Code:</span>
                    <input
                      type="text"
                      placeholder="Ex: Siga nosso Instagram · Avalie no Google"
                      value={form.qrCode.label}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          qrCode: { ...form.qrCode, label: e.target.value },
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="os-settings-pane">
              <div className="os-settings-group">
                <label className="os-settings-field">
                  <span>Prazo Padrão de Garantia Geral (dias):</span>
                  <input
                    type="number"
                    min={1}
                    max={730}
                    value={form.warranty.defaultDays}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        warranty: {
                          ...form.warranty,
                          defaultDays: Number(e.target.value) || 90,
                        },
                      })
                    }
                    style={{ width: 140 }}
                  />
                </label>
              </div>

              <div className="os-settings-group">
                <label className="os-settings-field">
                  <span>Termos de Garantia e Condições de Retirada (Exibidos na Via do Cliente):</span>
                  <textarea
                    rows={8}
                    value={form.warranty.termsText}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        warranty: {
                          ...form.warranty,
                          termsText: e.target.value,
                        },
                      })
                    }
                    className="os-settings-textarea"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() =>
                    setForm({
                      ...form,
                      warranty: {
                        ...form.warranty,
                        termsText: DEFAULT_WARRANTY_TERMS,
                      },
                    })
                  }
                  style={{ marginTop: 6 }}
                >
                  Restaurar Texto Padrão
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <footer className="os-settings-drawer__footer">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSave}
          >
            Salvar Preferências
          </button>
        </footer>
      </div>
    </div>
  );
}
