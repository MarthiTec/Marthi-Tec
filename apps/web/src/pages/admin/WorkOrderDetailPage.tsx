import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { SignaturePad } from '../../components/SignaturePad';
import {
  findStockMatches,
  getStockItem,
  STOCK_CONDITION_LABEL,
  STOCK_KIND_LABEL,
  stockItemImages,
  type StockItem,
} from '../../data/adminStore';
import { listSellers } from '../../data/erpRegistry';
import {
  BOARD_COLUMNS,
  CHECKLIST_MARK_LABEL,
  DISPOSITION_LABEL,
  PHOTO_KIND_LABEL,
  MAX_WORK_ORDER_PHOTOS,
  addWorkOrderPhoto,
  approveQuote,
  checklistSummary,
  clearCustomerSignature,
  draftQuote,
  fileToWorkOrderPhoto,
  findWorkOrdersByCustomer,
  findWorkOrdersByItemRef,
  getWorkOrder,
  PRIORITY_LABEL,
  QUOTE_STATUS_LABEL,
  rejectQuote,
  removeWorkOrderPhoto,
  reopenQuote,
  resetWorkOrderChecklist,
  saveCustomerSignature,
  sendQuote,
  setChecklistItem,
  STATUS_LABEL,
  updateWorkOrder,
  workOrderTotal,
  type AssetDisposition,
  type ChecklistMark,
  type WorkOrderPhotoKind,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '../../data/osStore';
import {
  cancelWorkOrderWithReversal,
  consumeStockOnWorkOrder,
  deliverWorkOrder,
  purchaseAssetFromWorkOrder,
  removeWorkOrderLine,
  setAssetDisposition,
} from '../../data/workshopLedger';
import { AdminIcon } from '../../components/AdminIcons';
import {
  emitNfseFromOs,
  FISCAL_KIND_LABEL,
  getFiscalDocumentForRef,
} from '../../data/fiscalDocuments';
import { hasModule } from '../../data/storePlan';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function WorkOrderDetailPage() {
  const { id = '' } = useParams();
  const current = getWorkOrder(id);
  const [form, setForm] = useState(current);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [stockQuery, setStockQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [consumeQty, setConsumeQty] = useState(1);
  const [sellPrice, setSellPrice] = useState(0);
  const [purchaseCost, setPurchaseCost] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [photoKind, setPhotoKind] = useState<WorkOrderPhotoKind>('entry');
  const [photoBusy, setPhotoBusy] = useState(false);

  const matches = useMemo(() => findStockMatches(stockQuery, 6), [stockQuery]);
  const sellers = useMemo(() => listSellers(true), []);
  const fiscalOn = hasModule('fiscal');
  const fiscalDoc = form ? getFiscalDocumentForRef('os', form.id) : null;
  const relatedByImei = useMemo(
    () => (form ? findWorkOrdersByItemRef(form.itemRef, form.id) : []),
    [form?.id, form?.itemRef],
  );
  const relatedByCustomer = useMemo(
    () =>
      form
        ? findWorkOrdersByCustomer(
            { phone: form.customerPhone, document: form.customerDocument },
            form.id,
          ).filter((order) => !relatedByImei.some((same) => same.id === order.id))
        : [],
    [form?.id, form?.customerPhone, form?.customerDocument, relatedByImei],
  );
  const checkStats = form ? checklistSummary(form) : null;

  if (!current || !form) {
    return (
      <section className="admin-page">
        <article className="admin-card">
          <h2>OS não encontrada</h2>
          <p>Essa ordem não está no histórico local.</p>
          <Link to="/os" className="btn btn--ghost">
            Voltar ao quadro
          </Link>
        </article>
      </section>
    );
  }

  const locked = form.status === 'delivered' || form.status === 'cancelled';
  const partsCharge = form.lines.some((line) => line.kind === 'part')
    ? form.lines
        .filter((line) => line.kind === 'part')
        .reduce((sum, line) => sum + line.unitPrice * line.qty, 0)
    : form.parts;

  function refresh(next = getWorkOrder(id)) {
    if (next) setForm(next);
  }

  function flash(ok: string) {
    setMessage(ok);
    setError('');
    setSaved(true);
  }

  function fail(err: string) {
    setError(err);
    setMessage('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    updateWorkOrder(form.id, {
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerDocument: form.customerDocument,
      customerEmail: form.customerEmail,
      itemName: form.itemName,
      itemBrand: form.itemBrand,
      itemModel: form.itemModel,
      itemColor: form.itemColor,
      itemRef: form.itemRef,
      devicePassword: form.devicePassword,
      accessories: form.accessories,
      conditionOnEntry: form.conditionOnEntry,
      defect: form.defect,
      diagnosis: form.diagnosis,
      notes: form.notes,
      estimatedReadyAt: form.estimatedReadyAt,
      technician: form.technician,
      sellerId: form.sellerId,
      priority: form.priority,
      labor: form.labor,
    });
    refresh();
    flash('OS atualizada.');
  }

  function setStatus(status: WorkOrderStatus) {
    if (!form) return;
    if (status === 'delivered') {
      const result = deliverWorkOrder(form.id);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      setForm(result.data);
      flash('OS entregue · receita lançada no financeiro.');
      return;
    }
    if (status === 'cancelled') {
      const result = cancelWorkOrderWithReversal(form.id);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      setForm(result.data);
      flash('OS cancelada · estoque e custos estornados.');
      return;
    }
    const next = updateWorkOrder(form.id, { status });
    if (next) setForm(next);
    flash('Status atualizado.');
  }

  function emitNfse() {
    if (!form) return;
    const amount = workOrderTotal(form);
    const result = emitNfseFromOs({
      workOrderId: form.id,
      customerName: form.customerName,
      amount,
    });
    if (!result.ok) {
      fail(result.error);
      return;
    }
    flash(
      `${FISCAL_KIND_LABEL[result.document.kind]} ${result.document.number} autorizada (simulação).`,
    );
  }

  function pickStock(item: StockItem) {
    setSelectedStock(item);
    setStockQuery(`${item.name} · ${item.sku}`);
    setSellPrice(item.price);
    setConsumeQty(1);
  }

  function consumePart() {
    if (!form || !selectedStock) {
      fail(selectedStock ? 'OS inválida.' : 'Selecione um item do estoque.');
      return;
    }
    const result = consumeStockOnWorkOrder(form.id, selectedStock.id, consumeQty, sellPrice);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setForm(result.data);
    setSelectedStock(null);
    setStockQuery('');
    flash(`Peça baixada · custo ${money(selectedStock.cost * consumeQty)} no financeiro.`);
  }

  function removeLine(lineId: string) {
    if (!form) return;
    const result = removeWorkOrderLine(form.id, lineId);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setForm(result.data);
    flash('Peça estornada do estoque e do financeiro.');
  }

  function changeDisposition(value: AssetDisposition) {
    if (!form) return;
    if (value === 'purchased') {
      setForm({ ...form, assetDisposition: 'purchased' });
      return;
    }
    const result = setAssetDisposition(form.id, value);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setForm(result.data);
    flash('Destino do equipamento atualizado.');
  }

  function buyAsset() {
    if (!form) return;
    const result = purchaseAssetFromWorkOrder(form.id, {
      cost: purchaseCost,
      name: form.itemName,
      imei: form.itemRef,
      price: purchasePrice || undefined,
    });
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setForm(result.data.order);
    flash(
      `Recondicionado ${result.data.stock.sku} no estoque · débito ${money(purchaseCost)}.`,
    );
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <div className="os-detail__top">
          <div>
            <h2>{form.id}</h2>
            <p>
              {form.customerName} · {form.customerPhone || 'sem telefone'}
            </p>
          </div>
          <strong>{money(workOrderTotal(form))}</strong>
        </div>
        <div className="os-flow">
          {[...BOARD_COLUMNS, 'delivered' as const, 'cancelled' as const].map((status) => (
            <button
              key={status}
              type="button"
              className={`os-flow__step ${form.status === status ? 'is-current' : ''}`}
              onClick={() => setStatus(status)}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
        {message ? <p className="empty">{message}</p> : null}
        {error ? <p className="qty-low">{error}</p> : null}
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <Link to={`/os/${form.id}/relatorio`} className="btn btn--ghost">
            Relatório / imprimir
          </Link>
          <Link
            to={
              form.estimatedReadyAt
                ? `/os/agenda?week=${form.estimatedReadyAt.slice(0, 10)}${
                    form.technician.trim()
                      ? `&tech=${encodeURIComponent(form.technician.trim())}`
                      : ''
                  }`
                : '/os/agenda'
            }
            className="btn btn--ghost"
          >
            Ver na agenda
          </Link>
        </div>
      </article>

      <article className="admin-card">
        <h2>Orçamento e aprovação</h2>
        <p>
          Monte o valor, envie ao cliente e registre a aprovação ou recusa — evita deixar isso só na
          OBS. Status atual:{' '}
          <strong>{QUOTE_STATUS_LABEL[form.quoteStatus]}</strong>
          {form.quoteSentAt
            ? ` · enviado ${new Date(form.quoteSentAt).toLocaleString('pt-BR')}`
            : ''}
          {form.quoteDecidedAt
            ? ` · decisão ${new Date(form.quoteDecidedAt).toLocaleString('pt-BR')}`
            : ''}
        </p>
        <div className="admin-form">
          <label>
            Mão de obra (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.labor}
              disabled={locked || form.quoteStatus === 'approved' || form.quoteStatus === 'sent'}
              onChange={(event) => {
                setForm({ ...form, labor: Number(event.target.value) || 0 });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Peças / materiais (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={partsCharge}
              readOnly={form.lines.some((line) => line.kind === 'part')}
              disabled={
                locked ||
                form.quoteStatus === 'approved' ||
                form.quoteStatus === 'sent' ||
                form.lines.some((line) => line.kind === 'part')
              }
              onChange={(event) => {
                setForm({ ...form, parts: Number(event.target.value) || 0 });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Validade do orçamento
            <input
              type="date"
              value={form.quoteValidUntil}
              disabled={locked || form.quoteStatus === 'approved'}
              onChange={(event) => {
                setForm({ ...form, quoteValidUntil: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label className="span-2">
            Escopo / condições do orçamento
            <textarea
              value={form.quoteNotes}
              disabled={locked || form.quoteStatus === 'approved' || form.quoteStatus === 'sent'}
              onChange={(event) => {
                setForm({ ...form, quoteNotes: event.target.value });
                setSaved(false);
              }}
              placeholder="Ex.: troca de tela original, garantia 90 dias, sem backup…"
            />
          </label>
        </div>
        <p className="empty" style={{ marginTop: 8 }}>
          Total do orçamento: {money(workOrderTotal(form))}
        </p>
        {!locked ? (
          <div className="admin-toolbar" style={{ marginTop: 12 }}>
            {form.quoteStatus === 'none' ||
            form.quoteStatus === 'draft' ||
            form.quoteStatus === 'rejected' ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  const result = draftQuote(form.id, {
                    labor: form.labor,
                    parts: form.lines.some((line) => line.kind === 'part')
                      ? partsCharge
                      : form.parts,
                    quoteNotes: form.quoteNotes,
                    quoteValidUntil: form.quoteValidUntil,
                  });
                  if (!result.ok) {
                    fail(result.error);
                    return;
                  }
                  setForm(result.order);
                  flash('Orçamento salvo como rascunho.');
                }}
              >
                Salvar rascunho
              </button>
            ) : null}
            {form.quoteStatus === 'none' ||
            form.quoteStatus === 'draft' ||
            form.quoteStatus === 'rejected' ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  const savedDraft = draftQuote(form.id, {
                    labor: form.labor,
                    parts: form.lines.some((line) => line.kind === 'part')
                      ? partsCharge
                      : form.parts,
                    quoteNotes: form.quoteNotes,
                    quoteValidUntil: form.quoteValidUntil,
                  });
                  if (!savedDraft.ok) {
                    fail(savedDraft.error);
                    return;
                  }
                  const result = sendQuote(form.id);
                  if (!result.ok) {
                    fail(result.error);
                    return;
                  }
                  setForm(result.order);
                  flash('Orçamento enviado · OS em Aguardando aprovação.');
                }}
              >
                Enviar ao cliente
              </button>
            ) : null}
            {form.quoteStatus === 'sent' ? (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    const result = approveQuote(form.id, true);
                    if (!result.ok) {
                      fail(result.error);
                      return;
                    }
                    setForm(result.order);
                    flash('Orçamento aprovado · OS em serviço.');
                  }}
                >
                  Cliente aprovou
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    const result = rejectQuote(form.id);
                    if (!result.ok) {
                      fail(result.error);
                      return;
                    }
                    setForm(result.order);
                    flash('Orçamento recusado.');
                  }}
                >
                  Cliente recusou
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    const result = reopenQuote(form.id);
                    if (!result.ok) {
                      fail(result.error);
                      return;
                    }
                    setForm(result.order);
                    flash('Orçamento reaberto para edição.');
                  }}
                >
                  Reabrir edição
                </button>
              </>
            ) : null}
            {form.quoteStatus === 'rejected' ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  const result = reopenQuote(form.id);
                  if (!result.ok) {
                    fail(result.error);
                    return;
                  }
                  setForm(result.order);
                  flash('Orçamento reaberto.');
                }}
              >
                Revisar orçamento
              </button>
            ) : null}
            {form.quoteStatus === 'approved' ? (
              <span className="empty">Aprovado — peça e mão de obra liberados para execução.</span>
            ) : null}
          </div>
        ) : null}
      </article>

      <article className="admin-card">
        <h2>Fotos do equipamento</h2>
        <p>
          Registre o estado na entrada e na saída (até {MAX_WORK_ORDER_PHOTOS} fotos). Aparecem no
          relatório da OS.
        </p>
        {!locked ? (
          <div className="admin-toolbar" style={{ marginBottom: 12 }}>
            <AdminPicker
              compact
              label="Momento"
              value={photoKind}
              options={[
                { value: 'entry', label: PHOTO_KIND_LABEL.entry },
                { value: 'exit', label: PHOTO_KIND_LABEL.exit },
                { value: 'other', label: PHOTO_KIND_LABEL.other },
              ]}
              onChange={(value) => setPhotoKind(value as WorkOrderPhotoKind)}
            />
            <label className="btn btn--primary" style={{ cursor: photoBusy ? 'wait' : 'pointer' }}>
              {photoBusy ? 'Processando…' : 'Adicionar foto'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                disabled={photoBusy || form.photos.length >= MAX_WORK_ORDER_PHOTOS}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  setPhotoBusy(true);
                  try {
                    const dataUrl = await fileToWorkOrderPhoto(file);
                    const result = addWorkOrderPhoto(form.id, { kind: photoKind, dataUrl });
                    if (!result.ok) {
                      fail(result.error);
                      return;
                    }
                    setForm(result.order);
                    flash('Foto adicionada.');
                  } catch {
                    fail('Não foi possível processar esta imagem.');
                  } finally {
                    setPhotoBusy(false);
                  }
                }}
              />
            </label>
          </div>
        ) : null}

        {form.photos.length === 0 ? (
          <p className="empty">Nenhuma foto ainda.</p>
        ) : (
          <div className="os-photos">
            {form.photos.map((photo) => (
              <figure key={photo.id} className="os-photos__item">
                <img src={photo.dataUrl} alt={photo.caption || PHOTO_KIND_LABEL[photo.kind]} />
                <figcaption>
                  <strong>{PHOTO_KIND_LABEL[photo.kind]}</strong>
                  <span>{new Date(photo.createdAt).toLocaleString('pt-BR')}</span>
                </figcaption>
                {!locked ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      const result = removeWorkOrderPhoto(form.id, photo.id);
                      if (!result.ok) {
                        fail(result.error);
                        return;
                      }
                      setForm(result.order);
                      flash('Foto removida.');
                    }}
                  >
                    Remover
                  </button>
                ) : null}
              </figure>
            ))}
          </div>
        )}
      </article>

      <article className="admin-card">
        <h2>Checklist de inspeção</h2>
        <p>
          Marque o estado na entrada. {checkStats
            ? `${checkStats.ok} OK · ${checkStats.fail} falha · ${checkStats.pending} pendente`
            : null}
        </p>
        {!locked ? (
          <div className="admin-toolbar" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                const result = resetWorkOrderChecklist(form.id);
                if (!result.ok) {
                  fail(result.error);
                  return;
                }
                setForm(result.order);
                flash('Checklist reiniciado.');
              }}
            >
              Reiniciar checklist
            </button>
          </div>
        ) : null}
        <div className="os-checklist">
          {form.checklist.map((item) => (
            <div key={item.id} className="os-checklist__row">
              <strong>{item.label}</strong>
              <div className="os-checklist__marks">
                {(['ok', 'fail', 'na', 'unchecked'] as ChecklistMark[]).map((mark) => (
                  <button
                    key={mark}
                    type="button"
                    className={`os-checklist__mark os-checklist__mark--${mark} ${
                      item.mark === mark ? 'is-active' : ''
                    }`}
                    disabled={locked}
                    onClick={() => {
                      const result = setChecklistItem(form.id, item.id, { mark });
                      if (!result.ok) {
                        fail(result.error);
                        return;
                      }
                      setForm(result.order);
                    }}
                  >
                    {CHECKLIST_MARK_LABEL[mark]}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Obs. do item"
                value={item.note}
                disabled={locked}
                onChange={(event) => {
                  const note = event.target.value;
                  setForm({
                    ...form,
                    checklist: form.checklist.map((row) =>
                      row.id === item.id ? { ...row, note } : row,
                    ),
                  });
                }}
                onBlur={(event) => {
                  const result = setChecklistItem(form.id, item.id, {
                    note: event.target.value,
                  });
                  if (!result.ok) fail(result.error);
                  else setForm(result.order);
                }}
              />
            </div>
          ))}
        </div>
      </article>

      <article className="admin-card">
        <h2>Histórico</h2>
        <p>OS anteriores do mesmo IMEI/série ou do mesmo cliente.</p>
        {relatedByImei.length === 0 && relatedByCustomer.length === 0 ? (
          <p className="empty">Nenhum histórico local encontrado.</p>
        ) : (
          <div className="os-history">
            {relatedByImei.length > 0 ? (
              <div>
                <h3>Mesmo equipamento ({relatedByImei.length})</h3>
                <ul>
                  {relatedByImei.map((order) => (
                    <li key={order.id}>
                      <Link to={`/os/${order.id}`}>
                        {order.id} · {STATUS_LABEL[order.status]} ·{' '}
                        {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                      </Link>
                      <span>
                        {order.defect.slice(0, 80)}
                        {order.defect.length > 80 ? '…' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {relatedByCustomer.length > 0 ? (
              <div>
                <h3>Mesmo cliente ({relatedByCustomer.length})</h3>
                <ul>
                  {relatedByCustomer.map((order) => (
                    <li key={order.id}>
                      <Link to={`/os/${order.id}`}>
                        {order.id} · {order.itemName || 'sem equipamento'} ·{' '}
                        {STATUS_LABEL[order.status]}
                      </Link>
                      <span>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </article>

      <article className="admin-card">
        <h2>Assinatura do cliente</h2>
        <p>Assine no tablet ou mouse. A imagem entra no relatório impresso.</p>
        {form.customerSignature ? (
          <div className="os-sign__saved">
            <img src={form.customerSignature} alt="Assinatura do cliente" />
            <p className="empty">
              {form.customerSignedName || form.customerName}
              {form.customerSignedAt
                ? ` · ${new Date(form.customerSignedAt).toLocaleString('pt-BR')}`
                : ''}
            </p>
            {!locked ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  const result = clearCustomerSignature(form.id);
                  if (!result.ok) {
                    fail(result.error);
                    return;
                  }
                  setForm(result.order);
                  flash('Assinatura removida.');
                }}
              >
                Refazer assinatura
              </button>
            ) : null}
          </div>
        ) : (
          <SignaturePad
            disabled={locked}
            onSave={(dataUrl) => {
              const result = saveCustomerSignature(form.id, {
                dataUrl,
                signedName: form.customerName,
              });
              if (!result.ok) {
                fail(result.error);
                return;
              }
              setForm(result.order);
              flash('Assinatura salva.');
            }}
          />
        )}
      </article>

      <article className="admin-card admin-card--form">
        <h2>Dados da OS</h2>
        <form className="admin-form" onSubmit={submit}>
          <label>
            Cliente
            <input
              value={form.customerName}
              onChange={(event) => {
                setForm({ ...form, customerName: event.target.value });
                setSaved(false);
              }}
              required
            />
          </label>
          <label>
            Telefone
            <input
              value={form.customerPhone}
              onChange={(event) => {
                setForm({ ...form, customerPhone: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            CPF / CNPJ
            <input
              value={form.customerDocument}
              onChange={(event) => {
                setForm({ ...form, customerDocument: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            E-mail
            <input
              value={form.customerEmail}
              onChange={(event) => {
                setForm({ ...form, customerEmail: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Equipamento
            <input
              value={form.itemName}
              onChange={(event) => {
                setForm({ ...form, itemName: event.target.value });
                setSaved(false);
              }}
              required
            />
          </label>
          <label>
            Marca
            <input
              value={form.itemBrand}
              onChange={(event) => {
                setForm({ ...form, itemBrand: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Modelo
            <input
              value={form.itemModel}
              onChange={(event) => {
                setForm({ ...form, itemModel: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Cor
            <input
              value={form.itemColor}
              onChange={(event) => {
                setForm({ ...form, itemColor: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            IMEI / série
            <input
              value={form.itemRef}
              onChange={(event) => {
                setForm({ ...form, itemRef: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Senha / padrão / PIN
            <input
              value={form.devicePassword}
              onChange={(event) => {
                setForm({ ...form, devicePassword: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label className="span-2">
            Acessórios
            <input
              value={form.accessories}
              onChange={(event) => {
                setForm({ ...form, accessories: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label className="span-2">
            Estado na entrada
            <textarea
              value={form.conditionOnEntry}
              onChange={(event) => {
                setForm({ ...form, conditionOnEntry: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label className="span-2">
            Defeito relatado
            <textarea
              value={form.defect}
              onChange={(event) => {
                setForm({ ...form, defect: event.target.value });
                setSaved(false);
              }}
              required
            />
          </label>
          <label className="span-2">
            Diagnóstico
            <textarea
              value={form.diagnosis}
              onChange={(event) => {
                setForm({ ...form, diagnosis: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Técnico
            <input
              value={form.technician}
              onChange={(event) => {
                setForm({ ...form, technician: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <AdminPicker
            label="Vendedor"
            value={form.sellerId}
            placeholder="Sem vendedor"
            options={sellers.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => {
              setForm({ ...form, sellerId: value });
              setSaved(false);
            }}
          />
          <AdminPicker
            label="Prioridade"
            value={form.priority}
            options={[
              { value: 'low', label: PRIORITY_LABEL.low },
              { value: 'normal', label: PRIORITY_LABEL.normal },
              { value: 'high', label: PRIORITY_LABEL.high },
            ]}
            onChange={(value) => {
              setForm({ ...form, priority: value as WorkOrderPriority });
              setSaved(false);
            }}
          />
          <label>
            Previsão de pronto
            <input
              type="date"
              value={form.estimatedReadyAt}
              onChange={(event) => {
                setForm({ ...form, estimatedReadyAt: event.target.value });
                setSaved(false);
              }}
            />
            {form.estimatedReadyAt ? (
              <Link
                to={`/os/agenda?week=${form.estimatedReadyAt}`}
                className="empty"
                style={{ marginTop: 6, display: 'inline-block' }}
              >
                Abrir semana na agenda
              </Link>
            ) : null}
          </label>
          <label>
            Mão de obra (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.labor}
              disabled={locked || form.quoteStatus === 'approved' || form.quoteStatus === 'sent'}
              onChange={(event) => {
                setForm({ ...form, labor: Number(event.target.value) || 0 });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Peças ao cliente (R$)
            <input type="number" value={partsCharge} readOnly />
          </label>
          <label className="span-2">
            Observações internas
            <textarea
              value={form.notes}
              onChange={(event) => {
                setForm({ ...form, notes: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <div className="span-2 admin-toolbar">
            <button type="submit" className="btn btn--primary" disabled={locked}>
              Salvar OS
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={locked}
              onClick={() => setStatus('delivered')}
            >
              Entregar · lançar receita
            </button>
            {fiscalOn ? (
              fiscalDoc ? (
                <span className="badge badge--sold">
                  {FISCAL_KIND_LABEL[fiscalDoc.kind]} {fiscalDoc.number}
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={emitNfse}
                  title="Emitir NFS-e do serviço"
                >
                  <AdminIcon name="fiscal" />
                  Emitir NFS-e
                </button>
              )
            ) : (
              <Link to="/painel/plano" className="btn btn--ghost" title="Requer Emissor Fiscal">
                Plano fiscal
              </Link>
            )}
            <Link to={`/os/${form.id}/relatorio`} className="btn btn--ghost">
              Relatório
            </Link>
            <Link to="/os" className="btn btn--ghost">
              Voltar ao quadro
            </Link>
            {saved && !message ? <span className="empty">OS atualizada.</span> : null}
          </div>
        </form>
      </article>

      <article className="admin-card">
        <h2>Peças / materiais</h2>
        <p>Baixa do estoque lança o custo no financeiro na hora. O preço ao cliente entra na receita na entrega.</p>
        {!locked ? (
          <div className="admin-form">
            <label className="span-2">
              Buscar estoque
              <input
                value={stockQuery}
                onChange={(event) => {
                  setStockQuery(event.target.value);
                  setSelectedStock(null);
                }}
                placeholder="Nome, SKU, barras ou IMEI"
              />
            </label>
            {matches.length && !selectedStock ? (
              <div className="span-2 os-stock-matches">
                {matches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => pickStock(item)}
                  >
                    {item.name} · {item.sku} · qtd {item.qty} · custo {money(item.cost)}
                  </button>
                ))}
              </div>
            ) : null}
            <label>
              Quantidade
              <input
                type="number"
                min="1"
                value={consumeQty}
                onChange={(event) => setConsumeQty(Number(event.target.value) || 1)}
              />
            </label>
            <label>
              Preço ao cliente (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={sellPrice}
                onChange={(event) => setSellPrice(Number(event.target.value) || 0)}
              />
            </label>
            <div className="span-2 admin-toolbar">
              <button type="button" className="btn btn--primary" onClick={consumePart}>
                Baixar do estoque
              </button>
            </div>
          </div>
        ) : null}

        <table className="admin-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qtd</th>
              <th>Custo</th>
              <th>Cliente</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {form.lines.filter((line) => line.kind === 'part').length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Nenhuma peça baixada ainda.
                  {form.parts > 0 ? ` Valor legado de peças: ${money(form.parts)}.` : ''}
                </td>
              </tr>
            ) : (
              form.lines
                .filter((line) => line.kind === 'part')
                .map((line) => {
                  const thumb = stockItemImages(getStockItem(line.stockId))[0];
                  return (
                  <tr key={line.id}>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            width={40}
                            height={40}
                            style={{ objectFit: 'cover', borderRadius: 6 }}
                          />
                        ) : null}
                        <span>{line.name}</span>
                      </div>
                    </td>
                    <td>{line.qty}</td>
                    <td>{money(line.unitCost * line.qty)}</td>
                    <td className="price-red">{money(line.unitPrice * line.qty)}</td>
                    <td>
                      {!locked ? (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => removeLine(line.id)}
                        >
                          Estornar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  );
                })
            )}
          </tbody>
        </table>
        <p className="empty" style={{ marginTop: 8 }}>
          Total peças ao cliente {money(partsCharge)} · mão de obra {money(form.labor)} · cobrança{' '}
          {money(workOrderTotal(form))}
        </p>
      </article>

      <article className="admin-card">
        <h2>Equipamento na oficina</h2>
        <p>Destino do aparelho/item da OS — compra gera recondicionado no estoque e débito no caixa.</p>
        <div className="admin-form">
          <AdminPicker
            label="Destino"
            value={form.assetDisposition}
            disabled={locked || Boolean(form.purchaseStockId)}
            options={[
              { value: 'customer', label: DISPOSITION_LABEL.customer },
              { value: 'purchased', label: DISPOSITION_LABEL.purchased },
              { value: 'scrapped', label: DISPOSITION_LABEL.scrapped },
            ]}
            onChange={(value) => changeDisposition(value as AssetDisposition)}
          />
          {form.purchaseStockId ? (
            <label className="span-2">
              Estoque gerado
              <input
                readOnly
                value={`${form.purchaseStockId} · custo ${money(form.purchaseCost ?? 0)}`}
              />
            </label>
          ) : null}
        </div>

        {form.assetDisposition === 'purchased' && !form.purchaseStockId && !locked ? (
          <div className="admin-form" style={{ marginTop: 12 }}>
            <label>
              Custo pago (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={purchaseCost}
                onChange={(event) => {
                  const cost = Number(event.target.value) || 0;
                  setPurchaseCost(cost);
                  if (!purchasePrice) setPurchasePrice(Math.round(cost * 1.35 * 100) / 100);
                }}
              />
            </label>
            <label>
              Preço de venda sugerido (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(Number(event.target.value) || 0)}
              />
            </label>
            <label className="span-2">
              Preview SKU
              <input
                readOnly
                value={`REC · ${form.itemName} · ${STOCK_KIND_LABEL.device} · ${STOCK_CONDITION_LABEL.refurbished}`}
              />
            </label>
            <div className="span-2 admin-toolbar">
              <button type="button" className="btn btn--primary" onClick={buyAsset}>
                Comprar para estoque
              </button>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
}
