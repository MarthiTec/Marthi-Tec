import { useCallback, useEffect, useState } from 'react';
import { AdminPicker } from './AdminPicker';
import {
  apiApproveTradeEvaluation,
  apiCancelTradeEvaluation,
  apiRejectTradeEvaluation,
  apiRequestTradeEvaluation,
  apiTradeEvaluationByImei,
  TRADE_EVALUATION_STATUS_LABEL,
  type TradeEvaluation,
} from '../services/tradeEvaluationApi';
import './tradeEvaluation.css';

const formatMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Mode = 'request' | 'evaluated' | 'skip';

/** Resumo do que a oficina viu no aparelho (vai para a observação do usado). */
export function tradeEvaluationSummary(evaluation: TradeEvaluation) {
  return [
    evaluation.batteryLevel !== null ? `bateria ${evaluation.batteryLevel}%` : '',
    evaluation.opened ? 'já foi aberto' : 'nunca aberto',
    evaluation.cracked ? 'quebrado/trincado' : 'sem trincas',
    evaluation.evaluationNotes,
  ]
    .filter(Boolean)
    .join(' · ');
}

const imeiReady = (imei: string) => imei.replace(/\D/g, '').length >= 14;

/**
 * Venda externa, troca: "Já avaliado pela oficina?". Pede a avaliação (aparece na esteira da OS, sem custo),
 * mostra o resultado pelo IMEI e o vendedor aprova (o crédito vira o preço sugerido) ou recusa.
 * Seminovo na caixa não precisa de avaliação.
 */
export function TradeEvaluationPanel({
  imei,
  deviceName,
  customerId,
  customerName,
  capacity,
  color,
  notes,
  onApproved,
}: {
  imei: string;
  deviceName: string;
  customerId?: string | null;
  customerName: string;
  capacity?: string;
  color?: string;
  notes?: string;
  onApproved: (evaluation: TradeEvaluation) => void;
}) {
  const [mode, setMode] = useState<Mode>('request');
  const [evaluation, setEvaluation] = useState<TradeEvaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!imeiReady(imei)) {
      setEvaluation(null);
      return;
    }
    try {
      const found = await apiTradeEvaluationByImei(imei);
      setEvaluation(found);
      if (found) setMode('evaluated');
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível consultar a avaliação.');
    }
  }, [imei]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 350);
    return () => clearTimeout(timer);
  }, [refresh]);

  const run = async (work: () => Promise<TradeEvaluation>, done?: (result: TradeEvaluation) => void) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await work();
      setEvaluation(result.status === 'canceled' ? null : result);
      done?.(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  const request = () =>
    run(() => apiRequestTradeEvaluation({ customerId: customerId || null, customerName, deviceName, imei, capacity, color, notes }), () => setMode('evaluated'));

  return (
    <div className="trade-eval">
      <AdminPicker
        label="Já avaliado pela oficina?"
        value={mode}
        options={[
          { value: 'request', label: 'Não — enviar para a oficina avaliar' },
          { value: 'evaluated', label: 'Sim — já avaliado pela oficina' },
          { value: 'skip', label: 'Não precisa (seminovo na caixa)' },
        ]}
        onChange={(value) => setMode(value as Mode)}
      />

      {mode === 'skip' && !evaluation ? <p className="xsale-muted">Seminovo na caixa: informe o valor combinado direto, sem avaliação.</p> : null}

      {!evaluation && mode !== 'skip' ? (
        !imeiReady(imei) ? (
          <p className="xsale-muted">Informe o IMEI do aparelho entregue para {mode === 'request' ? 'enviar para avaliação' : 'ver a avaliação'}.</p>
        ) : mode === 'request' ? (
          <div className="trade-eval__row">
            <p className="xsale-muted">A oficina vê na esteira: avaliação de produto pendente, cliente {customerName || '—'}, IMEI {imei}. Sem custo para o cliente.</p>
            <button type="button" className="btn btn--primary btn--sm" disabled={busy || !deviceName.trim()} onClick={request} title={deviceName.trim() ? '' : 'Informe o aparelho entregue'}>
              Enviar para avaliação
            </button>
          </div>
        ) : (
          <p className="xsale-muted">Nenhuma avaliação da oficina para o IMEI {imei}.</p>
        )
      ) : null}

      {evaluation ? (
        <div className={`trade-eval__card is-${evaluation.status}`} role="status">
          <div className="trade-eval__head">
            <strong>IMEI {evaluation.imei}</strong>
            <span className="trade-eval__badge">{TRADE_EVALUATION_STATUS_LABEL[evaluation.status]}</span>
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void refresh()} title="Ver se a oficina já respondeu">
              Atualizar
            </button>
          </div>
          {evaluation.status === 'pending' ? (
            <p className="xsale-muted">Na esteira da oficina desde {new Date(evaluation.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</p>
          ) : (
            <>
              <p>
                {tradeEvaluationSummary(evaluation)}
                {evaluation.evaluatedBy ? <small> — avaliado por {evaluation.evaluatedBy}</small> : null}
              </p>
              <p>
                Preço sugerido: <strong className="xsale-accent">{formatMoney(evaluation.suggestedPrice ?? 0)}</strong>
                {evaluation.status === 'approved' ? <> · aprovado {formatMoney(evaluation.approvedPrice ?? 0)}</> : null}
              </p>
            </>
          )}
          <div className="trade-eval__actions">
            {evaluation.status === 'evaluated' ? (
              <>
                <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => run(() => apiApproveTradeEvaluation(evaluation.id), onApproved)}>
                  Aprovar preço
                </button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => apiRejectTradeEvaluation(evaluation.id))}>
                  Recusar
                </button>
              </>
            ) : null}
            {evaluation.status === 'approved' ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onApproved(evaluation)}>
                Usar avaliação no crédito
              </button>
            ) : null}
            {evaluation.status === 'pending' ? (
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => apiCancelTradeEvaluation(evaluation.id))}>
                Cancelar pedido
              </button>
            ) : null}
            {evaluation.status === 'rejected' ? (
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={request}>
                Pedir nova avaliação
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {message ? <p className="trade-eval__error" role="alert">{message}</p> : null}
    </div>
  );
}
