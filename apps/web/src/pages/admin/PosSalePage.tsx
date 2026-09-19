import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  applyPriceTable,
  closePosSale,
  findStockByCode,
  getAdminState,
  stockItemImages,
  type Customer,
  type PaymentMethod,
  type PriceTable,
  type StockItem,
} from '../../data/adminStore';
import { listSellers } from '../../data/erpRegistry';

type CartLine = {
  key: string;
  stockId: string;
  name: string;
  sku: string;
  imei: string;
  qty: number;
  basePrice: number;
  unitPrice: number;
};

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function lineKey(item: StockItem, scannedImei: boolean) {
  return scannedImei && item.imei ? `imei:${item.imei}` : `stk:${item.id}`;
}

export function PosSalePage() {
  const initial = getAdminState();
  const [customers, setCustomers] = useState(initial.customers);
  const [stock, setStock] = useState(initial.stock);
  const tables = initial.priceTables.filter((item) => item.active);
  const payments = initial.payments.filter((item) => item.active);
  const [code, setCode] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const defaultPayment = payments[0];
  const [paymentId, setPaymentId] = useState(defaultPayment?.id ?? '');
  const [tableId, setTableId] = useState(
    defaultPayment?.priceTableId && tables.some((item) => item.id === defaultPayment.priceTableId)
      ? defaultPayment.priceTableId
      : (tables[0]?.id ?? ''),
  );
  const [installments, setInstallments] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [surcharge, setSurcharge] = useState(0);
  const [sellerId, setSellerId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sellers = useMemo(() => listSellers(true), []);

  const table = tables.find((item) => item.id === tableId);
  const payment = payments.find((item) => item.id === paymentId);
  const seller = sellers.find((item) => item.id === sellerId);

  const pricedLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        unitPrice: applyPriceTable(line.basePrice, table),
      })),
    [lines, table],
  );

  const subtotal = pricedLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const total = Math.max(0, subtotal - discount + surcharge);

  function pickCustomer(customer: Customer | undefined) {
    setCustomerId(customer?.id ?? '');
    setCustomerName(customer?.name ?? '');
    setCustomerPhone(customer?.phone ?? '');
  }

  function addItem(item: StockItem, scannedImei: boolean) {
    const available = item.qty;
    if (available <= 0) {
      setError(`${item.name} sem estoque.`);
      return;
    }
    const key = lineKey(item, scannedImei);
    const existing = lines.find((line) => line.key === key);
    const nextQty = (existing?.qty ?? 0) + 1;
    if (nextQty > available) {
      setError(`Estoque insuficiente para ${item.name} (${available} un.).`);
      return;
    }
    const unitPrice = applyPriceTable(item.price, table);
    const nextLine: CartLine = {
      key,
      stockId: item.id,
      name: item.name,
      sku: item.sku,
      imei: scannedImei ? item.imei : existing?.imei || item.imei,
      qty: nextQty,
      basePrice: item.price,
      unitPrice,
    };
    setLines(existing ? lines.map((line) => (line.key === key ? nextLine : line)) : [...lines, nextLine]);
    setError(null);
    setMessage(`${item.name} adicionado.`);
  }

  function scan(event: FormEvent) {
    event.preventDefault();
    const needle = code.trim();
    if (!needle) return;
    const item = findStockByCode(needle);
    if (!item) {
      setError('Produto não encontrado. Use SKU, código de barras ou IMEI.');
      setMessage(null);
      return;
    }
    const compact = needle.toLowerCase().replace(/\s+/g, '');
    const scannedImei = item.imei.toLowerCase().replace(/\s+/g, '') === compact;
    addItem(item, scannedImei);
    setCode('');
  }

  function changeQty(key: string, qty: number) {
    const line = lines.find((item) => item.key === key);
    if (!line) return;
    const item = stock.find((entry) => entry.id === line.stockId);
    const max = item?.qty ?? 1;
    const nextQty = Math.max(1, Math.min(max, qty));
    setLines(lines.map((entry) => (entry.key === key ? { ...entry, qty: nextQty } : entry)));
  }

  function removeLine(key: string) {
    setLines(lines.filter((line) => line.key !== key));
  }

  function onPaymentChange(id: string) {
    setPaymentId(id);
    const method = payments.find((item) => item.id === id);
    if (method?.priceTableId && tables.some((item) => item.id === method.priceTableId)) {
      setTableId(method.priceTableId);
    }
    setInstallments(1);
  }

  function finish() {
    if (!pricedLines.length) {
      setError('Informe ao menos um produto.');
      return;
    }
    if (!payment || !table) {
      setError('Cadastre tabela de preço e forma de pagamento no ERP antes de vender.');
      return;
    }
    const installmentLabel =
      payment.maxInstallments > 1 && installments > 1 ? ` ${installments}x` : '';
    closePosSale({
      ticketId: null,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      paymentName: `${payment.name}${installmentLabel}`,
      priceTableName: table.name,
      discount,
      surcharge,
      sellerId: seller?.id,
      sellerName: seller?.name,
      lines: pricedLines.map((line) => ({
        stockId: line.stockId,
        name: line.name,
        qty: line.qty,
        unitPrice: line.unitPrice,
        imei: line.imei,
      })),
    });
    const next = getAdminState();
    setStock(next.stock);
    setCustomers(next.customers);
    setLines([]);
    setDiscount(0);
    setSurcharge(0);
    setSellerId('');
    setInstallments(1);
    pickCustomer(undefined);
    setPaymentId(payments[0]?.id ?? '');
    setTableId(
      payments[0]?.priceTableId && tables.some((item) => item.id === payments[0].priceTableId)
        ? payments[0].priceTableId
        : (tables[0]?.id ?? ''),
    );
    setError(null);
    setMessage(`Venda lançada · ${money(total)}`);
  }

  return (
    <section className="admin-page pdv">
      <article className="admin-card pdv__scan">
        <h2>Lançar venda</h2>
        <p>
          Informe o produto pelo SKU, código de barras ou IMEI. Tabelas de preço e formas de
          pagamento vêm do cadastro do ERP.
        </p>
        <form className="pdv__code" onSubmit={scan}>
          <label className="span-2">
            Código do produto
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="SKU, código de barras ou IMEI"
            />
          </label>
          <button type="submit" className="btn btn--primary">
            Incluir
          </button>
        </form>
        {error ? <p className="pdv__alert">{error}</p> : null}
        {message ? <p className="pdv__ok">{message}</p> : null}
        {!tables.length || !payments.length ? (
          <p className="empty">
            Cadastre{' '}
            <Link to="/painel/tabelas">tabelas de preço</Link> e{' '}
            <Link to="/painel/pagamentos">formas de pagamento</Link> no ERP para vincular ao PDV.
          </p>
        ) : null}
      </article>

      <div className="pdv__grid">
        <article className="admin-card">
          <h2>Itens</h2>
          {pricedLines.length === 0 ? (
            <p className="empty">Nenhum item. Use o campo de código acima ou escolha no estoque.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Unitário</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pricedLines.map((line) => (
                  <tr key={line.key}>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {stockItemImages(stock.find((item) => item.id === line.stockId))[0] ? (
                          <img
                            src={stockItemImages(stock.find((item) => item.id === line.stockId))[0]}
                            alt=""
                            width={40}
                            height={40}
                            style={{ objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                          />
                        ) : null}
                        <div>
                          <strong className="pdv__item">{line.name}</strong>
                          <small>
                            {line.sku}
                            {line.imei ? ` · IMEI ${line.imei}` : ''}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <input
                        className="pdv__qty"
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) => changeQty(line.key, Number(e.target.value))}
                      />
                    </td>
                    <td>{money(line.unitPrice)}</td>
                    <td className="price-red">{money(line.unitPrice * line.qty)}</td>
                    <td>
                      <button type="button" className="btn btn--ghost" onClick={() => removeLine(line.key)}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="pdv__quick">
            <h3>Estoque rápido</h3>
            <div className="pdv__chips">
              {stock.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="pdv__chip"
                  disabled={item.qty <= 0}
                  onClick={() => addItem(item, false)}
                >
                  {stockItemImages(item)[0] ? (
                    <img
                      src={stockItemImages(item)[0]}
                      alt=""
                      width={28}
                      height={28}
                      style={{ objectFit: 'cover', borderRadius: 4 }}
                    />
                  ) : null}
                  {item.name}
                  <span>{item.qty} un.</span>
                </button>
              ))}
            </div>
          </div>
        </article>

        <article className="admin-card pdv__side">
          <h2>Cliente, tabela e pagamento</h2>
          <div className="admin-form">
            <AdminPicker
              className="span-2"
              label="Cliente cadastrado"
              value={customerId}
              placeholder="Consumidor / informar abaixo"
              options={customers.map((customer) => ({
                value: customer.id,
                label: `${customer.name} · ${customer.phone}`,
              }))}
              onChange={(value) => pickCustomer(customers.find((item) => item.id === value))}
            />
            <label>
              Nome
              <input
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setCustomerId('');
                }}
              />
            </label>
            <label>
              Telefone
              <input
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value);
                  setCustomerId('');
                }}
              />
            </label>
            <AdminPicker
              className="span-2"
              label="Tabela de preço"
              value={tableId}
              options={tables.map((item) => ({
                value: item.id,
                label: `${item.name} (${item.percent > 0 ? '+' : ''}${item.percent}%)`,
              }))}
              onChange={setTableId}
            />
            <AdminPicker
              className="span-2"
              label="Forma de pagamento"
              value={paymentId}
              options={payments.map((item) => ({
                value: item.id,
                label: `${item.name}${linkedTableName(item, tables)}`,
              }))}
              onChange={onPaymentChange}
            />
            <AdminPicker
              className="span-2"
              label="Vendedor"
              value={sellerId}
              placeholder="Sem vendedor"
              options={sellers.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setSellerId}
            />
            {payment && payment.maxInstallments > 1 && pricedLines.length > 0 ? (
              <AdminPicker
                className="span-2"
                label="Parcelas"
                value={String(installments)}
                options={Array.from({ length: payment.maxInstallments }, (_, index) => {
                  const count = index + 1;
                  return {
                    value: String(count),
                    label: `${count}x de ${money(total / count)}`,
                  };
                })}
                onChange={(value) => setInstallments(Number(value))}
              />
            ) : null}
            <label>
              Desconto
              <input
                type="number"
                min={0}
                value={discount || ''}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Acréscimo
              <input
                type="number"
                min={0}
                value={surcharge || ''}
                onChange={(e) => setSurcharge(Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <dl className="pdv__totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{money(subtotal)}</dd>
            </div>
            <div>
              <dt>Desconto</dt>
              <dd>− {money(discount)}</dd>
            </div>
            <div>
              <dt>Acréscimo</dt>
              <dd>+ {money(surcharge)}</dd>
            </div>
            <div className="pdv__total">
              <dt>Total</dt>
              <dd className="price-red">{money(total)}</dd>
            </div>
          </dl>

          <div className="admin-toolbar admin-toolbar--stack">
            <button type="button" className="btn btn--primary" onClick={finish}>
              Confirmar venda
            </button>
            <Link to="/painel/tabelas" className="btn btn--ghost">
              Tabelas
            </Link>
            <Link to="/painel/pagamentos" className="btn btn--ghost">
              Pagamentos
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}

function linkedTableName(method: PaymentMethod, tables: PriceTable[]) {
  const table = tables.find((item) => item.id === method.priceTableId);
  return table ? ` · ${table.name}` : '';
}
