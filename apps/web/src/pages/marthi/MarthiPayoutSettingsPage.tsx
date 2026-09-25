import { useEffect, useState } from 'react';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import {
  getPayoutSettings,
  updateBankAccount,
  updatePixConfig,
  validatePixKey,
  PAYOUT_UPDATED_EVENT,
  type PayoutSettings,
  type PixKeyType,
} from '../../data/paymentSettingsStore';

const PIX_TYPE_OPTIONS = [
  { value: 'email', label: 'E-mail' },
  { value: 'cpf_cnpj', label: 'CPF / CNPJ' },
  { value: 'telefone', label: 'Telefone Celular' },
  { value: 'aleatoria', label: 'Chave Aleatória (EVP)' },
];

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'corrente', label: 'Conta Corrente (PJ/PF)' },
  { value: 'poupanca', label: 'Conta Poupança' },
];

const BRAZILIAN_BANKS = [
  { value: '077', label: '077 - Banco Inter S.A.' },
  { value: '260', label: '260 - Nu Pagamentos S.A. (Nubank)' },
  { value: '001', label: '001 - Banco do Brasil S.A.' },
  { value: '237', label: '237 - Banco Bradesco S.A.' },
  { value: '341', label: '341 - Itaú Unibanco S.A.' },
  { value: '033', label: '033 - Banco Santander (Brasil) S.A.' },
  { value: '104', label: '104 - Caixa Econômica Federal' },
  { value: '336', label: '336 - Banco C6 S.A.' },
  { value: '290', label: '290 - PagBank PagSeguro S.A.' },
  { value: '422', label: '422 - Banco Safra S.A.' },
];

export function MarthiPayoutSettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PayoutSettings>(() => getPayoutSettings());
  const [feedback, setFeedback] = useState<string | null>(null);

  // Bank Form State
  const [bankCode, setBankCode] = useState(settings.bankAccount.bankCode);
  const [agency, setAgency] = useState(settings.bankAccount.agency);
  const [accountNumber, setAccountNumber] = useState(settings.bankAccount.accountNumber);
  const [accountType, setAccountType] = useState<string>(settings.bankAccount.accountType);
  const [holderName, setHolderName] = useState(settings.bankAccount.holderName);
  const [holderDocument, setHolderDocument] = useState(settings.bankAccount.holderDocument);

  // Pix Form State
  const [pixType, setPixType] = useState<PixKeyType>(settings.pix.keyType);
  const [pixKey, setPixKey] = useState(settings.pix.keyValue);
  const [validatingPix, setValidatingPix] = useState(false);
  const [pixValidationResult, setPixValidationResult] = useState<{
    success: boolean;
    message: string;
    data?: {
      receiverName: string;
      receiverInstitution: string;
      receiverType: string;
      validatedAt: string;
    };
  } | null>(null);

  useEffect(() => {
    function onUpdate() {
      const s = getPayoutSettings();
      setSettings(s);
      setBankCode(s.bankAccount.bankCode);
      setAgency(s.bankAccount.agency);
      setAccountNumber(s.bankAccount.accountNumber);
      setAccountType(s.bankAccount.accountType);
      setHolderName(s.bankAccount.holderName);
      setHolderDocument(s.bankAccount.holderDocument);
      setPixType(s.pix.keyType);
      setPixKey(s.pix.keyValue);
    }

    window.addEventListener(PAYOUT_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(PAYOUT_UPDATED_EVENT, onUpdate);
  }, []);

  function handleSaveBank(e: React.FormEvent) {
    e.preventDefault();
    const bankFound = BRAZILIAN_BANKS.find((b) => b.value === bankCode);
    const bankName = bankFound ? bankFound.label.split(' - ')[1] : 'Banco Cadastrado';

    updateBankAccount(
      {
        bankCode,
        bankName,
        agency: agency.trim(),
        accountNumber: accountNumber.trim(),
        accountType: accountType as 'corrente' | 'poupanca',
        holderName: holderName.trim(),
        holderDocument: holderDocument.trim(),
        validationStatus: 'validado',
      },
      {
        name: user?.name || 'Administrador Marthi',
        email: user?.email || 'admin@marthi.com.br',
      },
    );

    setFeedback('Dados da conta bancária atualizados e salvos com sucesso.');
    setTimeout(() => setFeedback(null), 4000);
  }

  function handleValidatePix() {
    setValidatingPix(true);
    setPixValidationResult(null);

    setTimeout(() => {
      const res = validatePixKey(pixType, pixKey);
      setValidatingPix(false);
      setPixValidationResult(res);

      if (res.success && res.data) {
        updatePixConfig(
          pixType,
          pixKey,
          {
            receiverName: res.data.receiverName,
            receiverInstitution: res.data.receiverInstitution,
            receiverType: res.data.receiverType,
          },
          {
            name: user?.name || 'Administrador Marthi',
            email: user?.email || 'admin@marthi.com.br',
          },
        );
        setFeedback('Chave Pix validada e configurada com sucesso para recebimento.');
        setTimeout(() => setFeedback(null), 4000);
      }
    }, 600);
  }

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <span className="admin-page__kicker">Financeiro & Recebimentos</span>
          <h1 className="admin-page__title">Configurações de Recebimento & Pix</h1>
          <p className="admin-page__lead">
            Configure e valide a conta bancária e chave Pix da Marthi Tecnologia utilizadas para recebimento das assinaturas e contratações de clientes.
          </p>
        </div>
      </header>

      {feedback ? (
        <div className="marthi-feedback-banner">
          <span>✓ {feedback}</span>
          <button type="button" onClick={() => setFeedback(null)}>✕</button>
        </div>
      ) : null}

      <div className="marthi-payout-grid">
        {/* Seção 1: Configuração do Pix (Ponto 10) */}
        <section className="marthi-payout-card">
          <div className="marthi-payout-card__head">
            <div className="marthi-payout-card__icon-wrap marthi-payout-card__icon-wrap--pix">
              <AdminIcon name="payments" />
            </div>
            <div>
              <h2>Pix para Recebimento</h2>
              <p>Chave utilizada para emissão de QR Code Pix e transferências diretas das mensalidades.</p>
            </div>
          </div>

          <div className="marthi-payout-card__body">
            <div className="marthi-form-field">
              <label>Tipo de chave</label>
              <AdminPicker
                value={pixType}
                options={PIX_TYPE_OPTIONS}
                onChange={(val) => {
                  setPixType(val as PixKeyType);
                  setPixValidationResult(null);
                }}
              />
            </div>

            <div className="marthi-form-field">
              <label>Chave Pix cadastrada</label>
              <div className="marthi-input-action-row">
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => {
                    setPixKey(e.target.value);
                    setPixValidationResult(null);
                  }}
                  placeholder={
                    pixType === 'email'
                      ? 'ex: marthi.tecnologia@gmail.com'
                      : pixType === 'cpf_cnpj'
                        ? '00.000.000/0000-00'
                        : pixType === 'telefone'
                          ? '(11) 98765-4321'
                          : 'uuid-aleatorio-...'
                  }
                />
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleValidatePix}
                  disabled={validatingPix || !pixKey.trim()}
                >
                  {validatingPix ? 'Consultando DICT…' : 'Validar chave'}
                </button>
              </div>
            </div>

            {/* Resultado da validação do Pix */}
            {pixValidationResult ? (
              <div
                className={`marthi-pix-result ${
                  pixValidationResult.success ? 'is-valid' : 'is-invalid'
                }`}
              >
                {pixValidationResult.success && pixValidationResult.data ? (
                  <>
                    <div className="marthi-pix-result__badge">
                      <span>✓ Chave validada no DICT</span>
                    </div>
                    <div className="marthi-pix-result__info">
                      <div>
                        <span className="marthi-pix-meta-label">Recebedor:</span>
                        <strong className="marthi-pix-meta-val">{pixValidationResult.data.receiverName}</strong>
                      </div>
                      <div>
                        <span className="marthi-pix-meta-label">Instituição:</span>
                        <span className="marthi-pix-meta-val">{pixValidationResult.data.receiverInstitution}</span>
                      </div>
                      <div>
                        <span className="marthi-pix-meta-label">Tipo:</span>
                        <span className="marthi-pix-meta-val">{pixValidationResult.data.receiverType}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="marthi-pix-result__error">
                    <strong>⚠️ Chave não validada:</strong> {pixValidationResult.message}
                  </div>
                )}
              </div>
            ) : settings.pix.isValidated ? (
              <div className="marthi-pix-result is-valid">
                <div className="marthi-pix-result__badge">
                  <span>✓ Chave Ativa e Pronta para Recebimento</span>
                </div>
                <div className="marthi-pix-result__info">
                  <div>
                    <span className="marthi-pix-meta-label">Recebedor:</span>
                    <strong className="marthi-pix-meta-val">{settings.pix.receiverName || 'MARTHI TECNOLOGIA'}</strong>
                  </div>
                  <div>
                    <span className="marthi-pix-meta-label">Instituição:</span>
                    <span className="marthi-pix-meta-val">{settings.pix.receiverInstitution || 'BANCO INTER S.A.'}</span>
                  </div>
                  <div>
                    <span className="marthi-pix-meta-label">Tipo:</span>
                    <span className="marthi-pix-meta-val">{settings.pix.receiverType || 'E-mail'}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* Seção 2: Conta Bancária (Ponto 9) */}
        <section className="marthi-payout-card">
          <div className="marthi-payout-card__head">
            <div className="marthi-payout-card__icon-wrap marthi-payout-card__icon-wrap--bank">
              <AdminIcon name="dollar" />
            </div>
            <div>
              <h2>Conta Bancária Principal</h2>
              <p>Dados bancários para transferências TED/DOC, boletos de cobrança e conciliação.</p>
            </div>
          </div>

          <form onSubmit={handleSaveBank} className="marthi-payout-card__body">
            <div className="marthi-form-field">
              <label>Banco</label>
              <AdminPicker
                value={bankCode}
                options={BRAZILIAN_BANKS}
                onChange={(val) => setBankCode(val)}
                searchable={true}
              />
            </div>

            <div className="marthi-form-row-2">
              <label className="marthi-form-field">
                <span>Agência (sem dígito) *</span>
                <input
                  type="text"
                  required
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  placeholder="0001"
                />
              </label>

              <label className="marthi-form-field">
                <span>Conta (com dígito) *</span>
                <input
                  type="text"
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="1234567-8"
                />
              </label>
            </div>

            <div className="marthi-form-field">
              <label>Tipo de Conta</label>
              <AdminPicker
                value={accountType}
                options={ACCOUNT_TYPE_OPTIONS}
                onChange={(val) => setAccountType(val)}
              />
            </div>

            <label className="marthi-form-field">
              <span>Titular da Conta *</span>
              <input
                type="text"
                required
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder="Ex: MARTHI TECNOLOGIA LTDA"
              />
            </label>

            <label className="marthi-form-field">
              <span>CPF ou CNPJ do Titular *</span>
              <input
                type="text"
                required
                value={holderDocument}
                onChange={(e) => setHolderDocument(e.target.value)}
                placeholder="00.000.000/0001-00"
              />
            </label>

            <div className="marthi-payout-card__status-row">
              <span className="marthi-status-indicator is-active">
                ● Status da validação bancária: <strong>{settings.bankAccount.validationStatus.toUpperCase()}</strong>
              </span>
              <small>Última alteração: {new Date(settings.bankAccount.updatedAt).toLocaleDateString('pt-BR')}</small>
            </div>

            <footer className="marthi-payout-card__foot">
              <button type="submit" className="btn btn--primary">
                Salvar Dados Bancários
              </button>
            </footer>
          </form>
        </section>
      </div>

      <div className="marthi-security-notice">
        <span className="marthi-security-notice__icon">🔒</span>
        <div className="marthi-security-notice__text">
          <strong>Segurança & Proteção de Dados Comerciais:</strong>
          <p>
            Estas informações são restritas ao painel administrativo interno da Marthi.
            Os dados sensíveis da conta não são expostos em APIs públicas; apenas o titular e a chave Pix validada são utilizados nos fluxos de assinatura.
          </p>
        </div>
      </div>
    </div>
  );
}
