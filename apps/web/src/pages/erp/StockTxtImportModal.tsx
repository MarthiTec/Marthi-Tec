import { useState, type ChangeEvent } from 'react';
import {
  parseTxtContent,
  recordBatchCounts,
  validateImportRows,
  type DuplicateRule,
  type ImportValidationReport,
  type StockBalanceAudit,
} from '../../data/stockInventoryStore';

type Props = {
  balance: StockBalanceAudit;
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
};

export function StockTxtImportModal({ balance, isOpen, onClose, onImportComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState('');
  const [delimiter, setDelimiter] = useState(';');
  const [duplicateRule, setDuplicateRule] = useState<DuplicateRule>(balance.duplicateRule || 'sum');
  const [report, setReport] = useState<ImportValidationReport | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError('');
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setContent(text);
      runValidation(text, delimiter);
    };
    reader.onerror = () => {
      setError('Falha ao ler o arquivo selecionado.');
    };
    reader.readAsText(selected, 'UTF-8');
  }

  function handleDelimiterChange(newDelim: string) {
    setDelimiter(newDelim);
    if (content) {
      runValidation(content, newDelim);
    }
  }

  function runValidation(text: string, delim: string) {
    setError('');
    try {
      const rows = parseTxtContent(text, delim);
      if (rows.length === 0) {
        setReport(null);
        setError('Nenhuma linha válida encontrada no formato CÓDIGO' + delim + 'QUANTIDADE.');
        return;
      }
      const valReport = validateImportRows(balance, rows);
      setReport(valReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo.');
    }
  }

  function handleConfirm() {
    if (!report || report.matchedRows.length === 0) {
      setError('Não há produtos válidos para importar.');
      return;
    }

    setIsProcessing(true);
    try {
      const entries = report.matchedRows.map((r) => ({
        code: r.code,
        qty: r.qty,
        source: 'txt' as const,
        note: `Importação TXT (${file?.name || 'arquivo.txt'})`,
      }));

      const res = recordBatchCounts(balance.id, entries, duplicateRule);
      if (!res.ok) {
        setError(res.error || 'Falha ao registrar importação.');
        setIsProcessing(false);
        return;
      }

      onImportComplete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aplicar contagens.');
      setIsProcessing(false);
    }
  }

  return (
    <div className="stock-modal-backdrop" onClick={onClose}>
      <div
        className="stock-modal stock-modal--large"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="stock-modal__head">
          <h3 className="stock-modal__title">📄 Importar Contagem via Arquivo TXT</h3>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="stock-modal__body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            <label style={{ flex: '1 1 240px' }}>
              <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Selecione o arquivo .txt
              </span>
              <input
                type="file"
                accept=".txt"
                onChange={handleFileChange}
                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: 8 }}
              />
            </label>

            <label style={{ flex: '0 1 180px' }}>
              <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Delimitador
              </span>
              <select
                value={delimiter}
                onChange={(e) => handleDelimiterChange(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: 8 }}
              >
                <option value=";">Ponto e vírgula ( ; )</option>
                <option value="|">Pipe ( | )</option>
                <option value=",">Vírgula ( , )</option>
                <option value="\t">Tabulação ( Tab )</option>
              </select>
            </label>

            <label style={{ flex: '1 1 240px' }}>
              <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Regra para códigos repetidos
              </span>
              <select
                value={duplicateRule}
                onChange={(e) => setDuplicateRule(e.target.value as DuplicateRule)}
                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: 8 }}
              >
                <option value="sum">Somar quantidades (Ex: 5 + 3 = 8) [Recomendado]</option>
                <option value="overwrite">Sobrescrever com último valor</option>
              </select>
            </label>
          </div>

          <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
            Formato esperado em cada linha:{' '}
            <code>
              CÓDIGO_OU_BARRAS{delimiter}QUANTIDADE
            </code>{' '}
            (Exemplo: <code>12345{delimiter}10</code>)
          </p>

          {error ? (
            <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#991b1b', borderRadius: 8, fontSize: '0.88rem' }}>
              ⚠️ {error}
            </div>
          ) : null}

          {report ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Total de Linhas</span>
                  <strong style={{ fontSize: '1.2rem', color: '#0f172a' }}>{report.totalRows}</strong>
                </div>

                <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: '#166534', display: 'block' }}>Produtos Encontrados</span>
                  <strong style={{ fontSize: '1.2rem', color: '#15803d' }}>
                    {report.matchedRows.length} ({report.uniqueMatchedItemsCount} únicos)
                  </strong>
                </div>

                <div style={{ padding: '8px 12px', background: report.unmatchedRows.length ? '#fef2f2' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: report.unmatchedRows.length ? '#b91c1c' : '#64748b', display: 'block' }}>Não Encontrados</span>
                  <strong style={{ fontSize: '1.2rem', color: report.unmatchedRows.length ? '#dc2626' : '#64748b' }}>
                    {report.unmatchedRows.length}
                  </strong>
                </div>

                <div style={{ padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: '#1e40af', display: 'block' }}>Total de Peças</span>
                  <strong style={{ fontSize: '1.2rem', color: '#1d4ed8' }}>{report.totalUnitsToImport} UN</strong>
                </div>
              </div>

              {report.unmatchedRows.length > 0 ? (
                <div style={{ border: '1px solid #fecaca', background: '#fff5f5', borderRadius: 8, padding: 12 }}>
                  <strong style={{ color: '#991b1b', fontSize: '0.88rem', display: 'block', marginBottom: 6 }}>
                    ⚠️ {report.unmatchedRows.length} itens não foram encontrados no estoque e serão ignorados:
                  </strong>
                  <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '0.82rem', color: '#7f1d1d' }}>
                    {report.unmatchedRows.slice(0, 50).map((u, i) => (
                      <div key={i} style={{ padding: '2px 0' }}>
                        Linha {u.line}: Código <strong>"{u.code}"</strong> ({u.reason})
                      </div>
                    ))}
                    {report.unmatchedRows.length > 50 ? (
                      <div style={{ fontStyle: 'italic', marginTop: 4 }}>
                        ... e mais {report.unmatchedRows.length - 50} itens não cadastrados.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {report.duplicateSummary.length > 0 ? (
                <div style={{ border: '1px solid #fed7aa', background: '#fffbeb', borderRadius: 8, padding: 10, fontSize: '0.84rem', color: '#9a3412' }}>
                  ℹ️ <strong>{report.duplicateSummary.length} produtos repetidos</strong> no arquivo. As quantidades serão {duplicateRule === 'sum' ? 'somadas' : 'atualizadas pelo último valor'}.
                </div>
              ) : null}

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: '200px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                      <th style={{ padding: '6px 10px' }}>Linha</th>
                      <th style={{ padding: '6px 10px' }}>Código Lido</th>
                      <th style={{ padding: '6px 10px' }}>Produto Identificado</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>Qtd Contada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.matchedRows.slice(0, 100).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.line}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{r.code}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{r.item.name}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>
                          +{r.qty} {r.item.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="stock-modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!report || report.matchedRows.length === 0 || isProcessing}
            onClick={handleConfirm}
          >
            {isProcessing ? 'Importando...' : `Confirmar e Importar (${report?.matchedRows.length || 0} itens)`}
          </button>
        </div>
      </div>
    </div>
  );
}
