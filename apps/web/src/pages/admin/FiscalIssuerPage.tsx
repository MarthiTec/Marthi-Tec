import { useMemo, useState, type ChangeEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  applyRootPathCascade,
  clearCertificate,
  FISCAL_FAMILY_LABEL,
  FISCAL_STORAGE_LABEL,
  getFiscalIssuerSettings,
  issuerIsReady,
  issuerIsReadyForCte,
  issuerIsReadyForMdfe,
  issuerIsReadyForNfce,
  issuerIsReadyForNfe,
  issuerIsReadyForNfse,
  listFiscalLogs,
  readCertificateFile,
  resolveFiscalPaths,
  saveFiscalIssuerSettings,
  SEFAZ_ENV_LABEL,
  type FiscalIssuerSettings,
  type FiscalSefazEnvironment,
  type FiscalStorageMode,
} from '../../data/fiscalIssuerStore';

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`fiscal-config__chip ${ok ? 'is-ok' : 'is-wait'}`}>
      <span>{label}</span>
      <em>{ok ? 'pronto' : 'pendente'}</em>
    </li>
  );
}

export function FiscalIssuerPage() {
  const { pathname } = useLocation();
  const inPanel = pathname.startsWith('/painel');
  const [form, setForm] = useState<FiscalIssuerSettings>(() => getFiscalIssuerSettings());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [logTick, setLogTick] = useState(0);
  const logs = useMemo(() => listFiscalLogs(30), [logTick, message]);
  const paths = useMemo(() => resolveFiscalPaths(form), [form]);

  function patch<K extends keyof FiscalIssuerSettings>(key: K, value: FiscalIssuerSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onCertificate(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const loaded = await readCertificateFile(file);
      setForm((current) => ({
        ...current,
        certificateFileName: loaded.name,
        certificateBase64: loaded.base64,
      }));
      setMessage(`Certificado ${loaded.name} carregado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ler certificado.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  function save() {
    const result = saveFiscalIssuerSettings(form);
    if (!result.ok) {
      setError(result.error);
      setMessage('');
      return;
    }
    setForm(result.settings);
    setError('');
    setMessage('Configuração salva para todos os documentos fiscais.');
    setLogTick((value) => value + 1);
  }

  function removeCert() {
    const next = clearCertificate();
    setForm(next);
    setMessage('Certificado removido.');
    setError('');
  }

  function syncFoldersFromRoot() {
    setForm((current) => ({ ...current, ...applyRootPathCascade(current.localRootPath) }));
    setMessage('Pastas XML / LOG / PDF / PDV alinhadas.');
  }

  const ready = issuerIsReady(form);

  return (
    <section className="admin-page fiscal-config">
      <article className="admin-card">
        <h2>Configuração fiscal</h2>
        <p className="fiscal-config__lead">
          Certificado, CSC, ambiente e pastas valem para NF-e, NFC-e, NFS-e, CT-e e MDF-e.
        </p>
        {message ? <p className="empty">{message}</p> : null}
        {error ? <p className="qty-low">{error}</p> : null}

        <div className="fiscal-config__summary">
          <div>
            <h3>Documentos</h3>
            <ul className="fiscal-config__chips">
              <StatusChip ok={issuerIsReadyForNfe(form)} label={FISCAL_FAMILY_LABEL.nfe} />
              <StatusChip
                ok={issuerIsReadyForNfce(form)}
                label={`${FISCAL_FAMILY_LABEL.nfce}${issuerIsReadyForNfce(form) ? '' : ' · CSC'}`}
              />
              <StatusChip ok={issuerIsReadyForNfse(form)} label={FISCAL_FAMILY_LABEL.nfse} />
              <StatusChip ok={issuerIsReadyForCte(form)} label={FISCAL_FAMILY_LABEL.cte} />
              <StatusChip ok={issuerIsReadyForMdfe(form)} label={FISCAL_FAMILY_LABEL.mdfe} />
            </ul>
          </div>
          <div>
            <h3>Ambiente</h3>
            <p className="fiscal-config__env">{SEFAZ_ENV_LABEL[form.environment]}</p>
            <p className="empty">Mesmo ambiente para todos os tipos.</p>
          </div>
        </div>

        <div className="admin-form" style={{ marginTop: 14 }}>
          <label className="span-2">
            Razão social
            <input
              value={form.emitenteName}
              onChange={(e) => patch('emitenteName', e.target.value)}
              placeholder="Empresa LTDA"
            />
          </label>
          <label>
            CNPJ
            <input
              value={form.cnpj}
              onChange={(e) => patch('cnpj', e.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </label>
          <label>
            IE
            <input value={form.ie} onChange={(e) => patch('ie', e.target.value)} />
          </label>
          <label>
            IM
            <input
              value={form.im}
              onChange={(e) => patch('im', e.target.value)}
              placeholder="Inscrição municipal"
            />
          </label>
          <label>
            Município
            <input value={form.municipio} onChange={(e) => patch('municipio', e.target.value)} />
          </label>
          <label>
            UF
            <input
              value={form.uf}
              maxLength={2}
              onChange={(e) => patch('uf', e.target.value.toUpperCase())}
            />
          </label>
          <label>
            Código IBGE
            <input
              value={form.cMun}
              onChange={(e) => patch('cMun', e.target.value)}
              placeholder="3304557"
            />
          </label>
          <AdminPicker
            label="Ambiente"
            value={form.environment}
            options={[
              { value: 'homologacao', label: SEFAZ_ENV_LABEL.homologacao },
              { value: 'producao', label: SEFAZ_ENV_LABEL.producao },
            ]}
            onChange={(value) => patch('environment', value as FiscalSefazEnvironment)}
          />
          <label>
            Série NF-e
            <input value={form.nfeSeries} onChange={(e) => patch('nfeSeries', e.target.value)} />
          </label>
          <label>
            Série NFC-e
            <input value={form.nfceSeries} onChange={(e) => patch('nfceSeries', e.target.value)} />
          </label>
          <label>
            Série NFS-e
            <input value={form.nfseSeries} onChange={(e) => patch('nfseSeries', e.target.value)} />
          </label>
          <label>
            Série CT-e
            <input value={form.cteSeries} onChange={(e) => patch('cteSeries', e.target.value)} />
          </label>
          <label>
            Série MDF-e
            <input value={form.mdfeSeries} onChange={(e) => patch('mdfeSeries', e.target.value)} />
          </label>
        </div>
      </article>

      <article className="admin-card">
        <h2>Alíquotas</h2>
        <p className="fiscal-config__lead">
          CBS/IBS (reforma) e ISSQN da NFS-e no município {form.municipio || '—'}/{form.uf || '—'}{' '}
          · cMun {form.cMun || '—'}
          {form.im ? ` · IM ${form.im}` : ''}.
        </p>
        <div className="admin-form">
          <label>
            CBS base (%)
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.cbsRateBase}
              onChange={(e) => patch('cbsRateBase', Number(e.target.value) || 0)}
            />
          </label>
          <label>
            IBS base (%)
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.ibsRateBase}
              onChange={(e) => patch('ibsRateBase', Number(e.target.value) || 0)}
            />
          </label>
          <label>
            ISSQN padrão (%)
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.issqnRateDefault}
              onChange={(e) => patch('issqnRateDefault', Number(e.target.value) || 0)}
            />
          </label>
          <label>
            ISSQN retido (%)
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.issqnRetainedRate}
              onChange={(e) => patch('issqnRetainedRate', Number(e.target.value) || 0)}
            />
          </label>
          <label className="span-2">
            Código serviço municipal
            <input
              value={form.issqnMunicipalCode}
              onChange={(e) => patch('issqnMunicipalCode', e.target.value)}
              placeholder="Lista do município (além do LC 116)"
            />
          </label>
        </div>
      </article>

      <div className="fiscal-config__split">
        <article className="admin-card">
          <h2>Certificado A1</h2>
          <p className="fiscal-config__lead">Um .pfx/.p12 e senha para todos os documentos.</p>
          <div className="admin-form">
            <label className="span-2">
              Arquivo
              <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={onCertificate} />
            </label>
            <label className="span-2">
              Carregado
              <input value={form.certificateFileName || 'Nenhum'} readOnly />
            </label>
            <label className="span-2">
              Senha
              <input
                type="password"
                autoComplete="new-password"
                value={form.certificatePassword}
                onChange={(e) => patch('certificatePassword', e.target.value)}
                placeholder="Senha do .pfx"
              />
            </label>
          </div>
          <div className="admin-toolbar" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--ghost" onClick={removeCert}>
              Remover
            </button>
            <span className={ready ? 'empty' : 'qty-low'}>
              {ready ? 'Pronto' : 'Falta certificado/senha'}
            </span>
          </div>
        </article>

        <article className="admin-card">
          <h2>CSC (NFC-e)</h2>
          <p className="fiscal-config__lead">Só a NFC-e exige Id + Token da SEFAZ.</p>
          <div className="admin-form">
            <label>
              CSC Id
              <input
                value={form.cscId}
                onChange={(e) => patch('cscId', e.target.value)}
                placeholder="1"
              />
            </label>
            <label className="span-2">
              CSC Token
              <input
                type="password"
                autoComplete="new-password"
                value={form.cscToken}
                onChange={(e) => patch('cscToken', e.target.value)}
                placeholder="Token SEFAZ"
              />
            </label>
          </div>
        </article>
      </div>

      <article className="admin-card">
        <h2>Arquivos</h2>
        <p className="fiscal-config__lead">
          Pasta na máquina e/ou nuvem Marthi (XML, LOG, PDF/DANFE, PDV).
        </p>
        <div className="admin-form">
          <AdminPicker
            className="span-2"
            label="Onde salvar"
            value={form.storageMode}
            options={[
              { value: 'local', label: FISCAL_STORAGE_LABEL.local },
              { value: 'cloud', label: FISCAL_STORAGE_LABEL.cloud },
              { value: 'both', label: FISCAL_STORAGE_LABEL.both },
            ]}
            onChange={(value) => patch('storageMode', value as FiscalStorageMode)}
          />
          <label className="span-2">
            Pasta base
            <input
              value={form.localRootPath}
              onChange={(e) => patch('localRootPath', e.target.value)}
              placeholder="C:\Marthi\Fiscal"
            />
          </label>
          <div className="span-2 admin-toolbar">
            <button type="button" className="btn btn--ghost" onClick={syncFoldersFromRoot}>
              Gerar subpastas
            </button>
          </div>
          <label>
            XML
            <input value={form.localXmlPath} onChange={(e) => patch('localXmlPath', e.target.value)} />
          </label>
          <label>
            LOG
            <input value={form.localLogPath} onChange={(e) => patch('localLogPath', e.target.value)} />
          </label>
          <label>
            PDF
            <input value={form.localPdfPath} onChange={(e) => patch('localPdfPath', e.target.value)} />
          </label>
          <label>
            PDV
            <input value={form.localPdvPath} onChange={(e) => patch('localPdvPath', e.target.value)} />
          </label>
          <label className="span-2">
            Nuvem Marthi
            <input
              value={form.cloudBucketHint}
              onChange={(e) => patch('cloudBucketHint', e.target.value)}
              placeholder="marthi-fiscal"
              disabled={form.storageMode === 'local'}
            />
          </label>
        </div>
        <p className="empty fiscal-config__paths">
          {paths.xml} · {paths.log} · {paths.pdf} · {paths.pdv}
          {form.storageMode !== 'local' ? ` · nuvem ${form.cloudBucketHint || 'marthi-fiscal'}` : ''}
        </p>
      </article>

      <article className="admin-card">
        <h2>Log recente</h2>
        {logs.length === 0 ? (
          <p className="empty">Nenhum evento ainda.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Tipo</th>
                <th>Ação</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.at).toLocaleString('pt-BR')}</td>
                  <td>{FISCAL_FAMILY_LABEL[entry.family]}</td>
                  <td>{entry.action}</td>
                  <td>{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      <div className="admin-toolbar">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>
          Salvar
        </button>
        {inPanel ? (
          <>
            <Link to="/painel/notas" className="btn btn--ghost">
              Notas
            </Link>
            <Link to="/fiscal" className="btn btn--ghost">
              Abrir emissor
            </Link>
          </>
        ) : (
          <Link to="/fiscal/nfe" className="btn btn--ghost">
            NF-e
          </Link>
        )}
      </div>
    </section>
  );
}
