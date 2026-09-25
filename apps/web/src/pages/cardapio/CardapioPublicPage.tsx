import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getCardapioConfig,
  listCardapioItems,
  submitCardapioOrder,
  createReservation,
  type CardapioItem,
  type CardapioOrderType,
  type CardapioClientOrder,
  CARDAPIO_EVENT,
} from '../../data/cardapioStore';
import {
  listRestaurantTables,
  KITCHEN_EVENT,
} from '../../data/kitchenOrderStore';
import './cardapioPublic.css';

type CartEntry = {
  item: CardapioItem;
  qty: number;
  note?: string;
};

export function CardapioPublicPage() {
  const [searchParams] = useSearchParams();
  const urlTableParam = searchParams.get('mesa') || searchParams.get('table');

  const [config, setConfig] = useState(() => getCardapioConfig());
  const [items, setItems] = useState(() => listCardapioItems());
  const [tables, setTables] = useState(() => listRestaurantTables());

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // Carrinho
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Modalidade de consumo
  const [modality, setModality] = useState<CardapioOrderType>('local');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Dados do formulário
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // Reserva de mesa
  const [reserveDate, setReserveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reserveTime, setReserveTime] = useState('19:30');
  const [reserveParty, setReserveParty] = useState(2);
  const [reserveSuccess, setReserveSuccess] = useState<string | null>(null);

  // Pedido finalizado
  const [lastOrder, setLastOrder] = useState<CardapioClientOrder | null>(null);

  useEffect(() => {
    function refresh() {
      setConfig(getCardapioConfig());
      setItems(listCardapioItems());
      setTables(listRestaurantTables());
    }
    window.addEventListener(CARDAPIO_EVENT, refresh);
    window.addEventListener(KITCHEN_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CARDAPIO_EVENT, refresh);
      window.removeEventListener(KITCHEN_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Mesa pré-selecionada via URL (?mesa=1)
  useEffect(() => {
    if (urlTableParam && tables.length) {
      const match = tables.find(
        (t) => String(t.number) === urlTableParam || t.id.toLowerCase() === urlTableParam.toLowerCase(),
      );
      if (match) {
        setSelectedTableId(match.id);
      }
    }
  }, [urlTableParam, tables]);

  const selectedTableObj = tables.find((t) => t.id === selectedTableId);

  // Categorias disponíveis
  const categories = useMemo(() => {
    const list: string[] = [];
    items.forEach((item) => {
      if (item.category && !list.includes(item.category)) {
        list.push(item.category);
      }
    });
    return list;
  }, [items]);

  // Itens filtrados por busca
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  // Itens agrupados por categoria
  const groupedByCategory = useMemo(() => {
    const map = new Map<string, CardapioItem[]>();
    filteredItems.forEach((item) => {
      const cat = item.category || 'Outros';
      const arr = map.get(cat) || [];
      arr.push(item);
      map.set(cat, arr);
    });
    return map;
  }, [filteredItems]);

  // Funções do carrinho
  function handleAddToCart(item: CardapioItem) {
    setCart((current) => {
      const existing = current.find((entry) => entry.item.id === item.id);
      if (existing) {
        return current.map((entry) =>
          entry.item.id === item.id ? { ...entry, qty: entry.qty + 1 } : entry,
        );
      }
      return [...current, { item, qty: 1 }];
    });
  }

  function handleUpdateQty(itemId: string, delta: number) {
    setCart((current) =>
      current
        .map((entry) => (entry.item.id === itemId ? { ...entry, qty: entry.qty + delta } : entry))
        .filter((entry) => entry.qty > 0),
    );
  }

  const cartTotalQty = cart.reduce((acc, cur) => acc + cur.qty, 0);
  const cartSubtotal = cart.reduce((acc, cur) => acc + cur.item.price * cur.qty, 0);
  const deliveryFee = modality === 'delivery' ? config.deliveryFee : 0;
  const cartGrandTotal = cartSubtotal + deliveryFee;

  function scrollToCategory(cat: string) {
    setActiveCategory(cat);
    const element = document.getElementById(`cat-section-${cat}`);
    if (element) {
      const offset = 110;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  }

  function handleConfirmOrder() {
    if (!customerName.trim()) {
      alert('Por favor, informe seu nome.');
      return;
    }

    if (modality === 'local' && !selectedTableId) {
      alert('Por favor, selecione em qual mesa você está.');
      return;
    }

    if (modality === 'delivery' && !deliveryAddress.trim()) {
      alert('Por favor, informe o endereço completo de entrega.');
      return;
    }

    const { clientOrder } = submitCardapioOrder({
      orderType: modality,
      tableId: selectedTableId,
      tableLabel: selectedTableObj?.label,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress: deliveryAddress.trim(),
      notes: orderNotes.trim(),
      items: cart,
    });

    setLastOrder(clientOrder);
    setCart([]);
  }

  function handleConfirmReservation() {
    if (!customerName.trim()) {
      alert('Por favor, informe seu nome para a reserva.');
      return;
    }
    if (!selectedTableId) {
      alert('Por favor, escolha uma mesa disponível no mapa.');
      return;
    }

    createReservation({
      tableId: selectedTableId,
      tableLabel: selectedTableObj?.label || 'Mesa',
      guestName: customerName.trim(),
      guestPhone: customerPhone.trim(),
      date: reserveDate,
      time: reserveTime,
      guests: reserveParty,
      notes: orderNotes.trim(),
    });

    setReserveSuccess(
      `Reserva confirmada com sucesso na ${selectedTableObj?.label || 'Mesa'} para ${reserveDate} às ${reserveTime} (${reserveParty} pessoas)!`,
    );
  }

  return (
    <div className="cardapio-page">
      {/* 1. Barra de Busca Superior */}
      <header className="cardapio-search-bar">
        <div className="cardapio-search-box">
          <span style={{ fontSize: '1.1rem' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar no cardápio..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
            >
              ✕
            </button>
          ) : null}
        </div>
      </header>

      {/* 2. Banner de Capa & Avatar da Logo */}
      <section
        className="cardapio-hero"
        style={{
          backgroundImage: config.bannerUrl ? `url(${config.bannerUrl})` : undefined,
          backgroundColor: config.primaryColor,
        }}
      >
        <div className="cardapio-hero__overlay" />
        <div className="cardapio-avatar-wrap">
          {config.logoUrl ? (
            <img
              src={config.logoUrl}
              alt={config.restaurantName}
              className="cardapio-avatar"
            />
          ) : (
            <div className="cardapio-avatar">☕</div>
          )}
        </div>
      </section>

      {/* 3. Informações do Restaurante */}
      <section className="cardapio-brand-info">
        <div className="cardapio-brand-title-row">
          <h1 className="cardapio-brand-name">{config.restaurantName}</h1>
          {selectedTableObj ? (
            <span
              className="cardapio-table-pill cardapio-table-pill--clickable"
              onClick={() => setCheckoutOpen(true)}
              title="Clique para ver ou alterar mesa"
            >
              🍽️ {selectedTableObj.label}
            </span>
          ) : null}
        </div>
        {config.slogan ? (
          <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
            {config.slogan}
          </p>
        ) : null}

        <button
          type="button"
          className="cardapio-payment-link"
          onClick={() => setPaymentModalOpen(true)}
        >
          💳 Ver formas de pagamento
        </button>
      </section>

      {/* 4. Categorias deslizáveis */}
      {!searchQuery && categories.length > 0 ? (
        <nav className="cardapio-cats-strip" aria-label="Categorias do cardápio">
          <button
            type="button"
            className={`cardapio-cat-chip ${activeCategory === 'all' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveCategory('all');
              window.scrollTo({ top: 180, behavior: 'smooth' });
            }}
          >
            <span>≡</span> Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`cardapio-cat-chip ${activeCategory === cat ? 'is-active' : ''}`}
              onClick={() => scrollToCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </nav>
      ) : null}

      {/* 5. Lista de Produtos */}
      <main className="cardapio-content">
        {Array.from(groupedByCategory.entries()).map(([catName, catItems]) => (
          <section key={catName} id={`cat-section-${catName}`}>
            <h2 className="cardapio-section-title">{catName}</h2>
            <div className="cardapio-items-grid">
              {catItems.map((item) => {
                const inCart = cart.find((c) => c.item.id === item.id);

                return (
                  <article key={item.id} className="cardapio-item-card">
                    <div className="cardapio-item-info">
                      {item.badge ? (
                        <span className="cardapio-item-badge">{item.badge}</span>
                      ) : item.isPromotion ? (
                        <span className="cardapio-item-badge">Promoção do Dia</span>
                      ) : null}
                      <h3 className="cardapio-item-name">{item.name}</h3>
                      <p className="cardapio-item-desc">{item.description}</p>
                      <div className="cardapio-item-bottom">
                        <span className="cardapio-item-price">
                          {item.price.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>

                        {inCart ? (
                          <div className="cardapio-stepper">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.id, -1)}
                            >
                              -
                            </button>
                            <span>{inCart.qty}</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.id, 1)}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="cardapio-add-btn"
                            onClick={() => handleAddToCart(item)}
                          >
                            + Adicionar
                          </button>
                        )}
                      </div>
                    </div>

                    {item.imageUrl ? (
                      <div className="cardapio-item-img-wrap">
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="cardapio-item-img"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
            <p style={{ fontSize: '1.8rem', margin: '0 0 8px' }}>🍽️</p>
            <p>Nenhum prato encontrado para &quot;{searchQuery}&quot;.</p>
          </div>
        ) : null}
      </main>

      {/* 6. Barra Flutuante de Carrinho */}
      {cartTotalQty > 0 && !checkoutOpen ? (
        <div
          className="cardapio-float-bar"
          onClick={() => setCheckoutOpen(true)}
          role="button"
          tabIndex={0}
        >
          <div className="cardapio-float-bar__left">
            <span className="cardapio-float-bar__qty">
              🛒 Seu pedido ({cartTotalQty} {cartTotalQty === 1 ? 'item' : 'itens'})
            </span>
            <span className="cardapio-float-bar__total">
              {cartGrandTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <div className="cardapio-float-bar__action">Continuar →</div>
        </div>
      ) : null}

      {/* 7. Modal / Drawer de Carrinho & Checkout */}
      {checkoutOpen ? (
        <div className="cardapio-modal-backdrop" onClick={() => setCheckoutOpen(false)}>
          <div className="cardapio-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cardapio-modal-head">
              <h2>{lastOrder ? 'Status do Pedido' : 'Seu Pedido'}</h2>
              <button
                type="button"
                className="cardapio-modal-close"
                onClick={() => {
                  setCheckoutOpen(false);
                  if (lastOrder) setLastOrder(null);
                  if (reserveSuccess) setReserveSuccess(null);
                }}
              >
                ✕
              </button>
            </div>

            {/* Tela de Sucesso de Pedido */}
            {lastOrder ? (
              <div className="cardapio-success-box">
                <div className="cardapio-success-icon">✓</div>
                <h3 style={{ margin: 0, fontSize: '1.3rem' }}>Pedido {lastOrder.orderNumber}</h3>
                <p style={{ margin: 0, color: '#4b5563', fontSize: '0.92rem' }}>
                  Recebido e enviado à cozinha com sucesso!
                </p>

                <div className="cardapio-status-tracker">
                  <div className="cardapio-status-step is-done">
                    <span>✓</span>
                    <span>Recebido</span>
                  </div>
                  <div className="cardapio-status-step is-current">
                    <span>👨‍🍳</span>
                    <span>Na Cozinha</span>
                  </div>
                  <div className="cardapio-status-step">
                    <span>🍽️</span>
                    <span>Pronto</span>
                  </div>
                </div>

                <div
                  style={{
                    background: '#f9fafb',
                    padding: 12,
                    borderRadius: 8,
                    width: '100%',
                    textAlign: 'left',
                    fontSize: '0.88rem',
                  }}
                >
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>Modalidade:</strong>{' '}
                    {lastOrder.orderType === 'local'
                      ? `Comer no Local (${lastOrder.tableLabel || 'Mesa'})`
                      : lastOrder.orderType === 'delivery'
                      ? `Entrega (${lastOrder.deliveryAddress})`
                      : 'Retirada no Balcão'}
                  </p>
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>Cliente:</strong> {lastOrder.customerName}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Total:</strong>{' '}
                    {lastOrder.total.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </p>
                </div>

                {config.whatsapp ? (
                  <a
                    href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                      `Olá! Acabei de fazer o pedido ${lastOrder.orderNumber} pelo Cardápio Digital (${lastOrder.customerName} - Total: ${lastOrder.total.toLocaleString(
                        'pt-BR',
                        { style: 'currency', currency: 'BRL' },
                      )}).`,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="cardapio-btn cardapio-btn--primary"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                  >
                    💬 Enviar no WhatsApp do Restaurante
                  </a>
                ) : null}

                <button
                  type="button"
                  className="cardapio-btn cardapio-btn--secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    setLastOrder(null);
                    setCheckoutOpen(false);
                  }}
                >
                  Fazer outro pedido
                </button>
              </div>
            ) : reserveSuccess ? (
              <div className="cardapio-success-box">
                <div className="cardapio-success-icon">📅</div>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Reserva Confirmada!</h3>
                <p style={{ margin: 0, color: '#4b5563', fontSize: '0.94rem' }}>{reserveSuccess}</p>
                <button
                  type="button"
                  className="cardapio-btn cardapio-btn--primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                  onClick={() => {
                    setReserveSuccess(null);
                    setCheckoutOpen(false);
                  }}
                >
                  Concluir
                </button>
              </div>
            ) : (
              <>
                {/* 1. Escolha de modalidade */}
                <div>
                  <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#374151' }}>
                    Como deseja consumir?
                  </label>
                  <div className="cardapio-modality-picker" style={{ marginTop: 8 }}>
                    {config.enableDineIn ? (
                      <button
                        type="button"
                        className={`cardapio-modality-card ${modality === 'local' ? 'is-active' : ''}`}
                        onClick={() => setModality('local')}
                      >
                        <span style={{ fontSize: '1.4rem' }}>🍽️</span>
                        <strong>Comer no local</strong>
                        <span>Mesa ou comanda</span>
                      </button>
                    ) : null}

                    {config.enableDelivery ? (
                      <button
                        type="button"
                        className={`cardapio-modality-card ${modality === 'delivery' ? 'is-active' : ''}`}
                        onClick={() => setModality('delivery')}
                      >
                        <span style={{ fontSize: '1.4rem' }}>🛵</span>
                        <strong>Entrega</strong>
                        <span>Receba em casa</span>
                      </button>
                    ) : null}

                    {config.enableTakeout ? (
                      <button
                        type="button"
                        className={`cardapio-modality-card ${modality === 'retirada' ? 'is-active' : ''}`}
                        onClick={() => setModality('retirada')}
                      >
                        <span style={{ fontSize: '1.4rem' }}>🥡</span>
                        <strong>Retirar no local</strong>
                        <span>Pega no balcão</span>
                      </button>
                    ) : null}

                    {config.enableReservation ? (
                      <button
                        type="button"
                        className={`cardapio-modality-card ${modality === 'reserva' ? 'is-active' : ''}`}
                        onClick={() => setModality('reserva')}
                      >
                        <span style={{ fontSize: '1.4rem' }}>📅</span>
                        <strong>Reservar mesa</strong>
                        <span>Ver mesas livres</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Seção especial para reserva de mesa */}
                {modality === 'reserva' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="cardapio-form-group">
                        <label>Data</label>
                        <input
                          type="date"
                          value={reserveDate}
                          onChange={(e) => setReserveDate(e.target.value)}
                        />
                      </div>
                      <div className="cardapio-form-group">
                        <label>Horário</label>
                        <input
                          type="time"
                          value={reserveTime}
                          onChange={(e) => setReserveTime(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="cardapio-form-group">
                      <label>Quantidade de pessoas: {reserveParty}</label>
                      <input
                        type="range"
                        min="1"
                        max="12"
                        value={reserveParty}
                        onChange={(e) => setReserveParty(Number(e.target.value))}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        Mesas do Salão (Selecione uma mesa verde/livre):
                      </label>
                      <div className="cardapio-tables-grid">
                        {tables.map((t) => {
                          const isSelected = selectedTableId === t.id;
                          const isBusy = t.status === 'occupied';
                          const isRes = t.status === 'reserved';
                          const isFree = t.status === 'free';

                          return (
                            <button
                              key={t.id}
                              type="button"
                              disabled={isBusy || isRes}
                              className={`cardapio-table-btn ${
                                isSelected
                                  ? 'is-selected'
                                  : isFree
                                  ? 'is-free'
                                  : isBusy
                                  ? 'is-busy'
                                  : 'is-reserved'
                              }`}
                              onClick={() => setSelectedTableId(t.id)}
                            >
                              <strong>{t.label}</strong>
                              <small>
                                {isBusy
                                  ? 'Ocupada'
                                  : isRes
                                  ? 'Reservada'
                                  : `${t.seats} lugares`}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="cardapio-form-group">
                      <label>Seu Nome</label>
                      <input
                        type="text"
                        placeholder="Nome completo"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                      />
                    </div>

                    <div className="cardapio-form-group">
                      <label>WhatsApp / Telefone</label>
                      <input
                        type="tel"
                        placeholder="(DDD) 99999-9999"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                      />
                    </div>

                    <button
                      type="button"
                      className="cardapio-btn cardapio-btn--primary"
                      style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
                      onClick={handleConfirmReservation}
                    >
                      Confirmar Reserva
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Lista de itens no carrinho */}
                    <div>
                      <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#374151' }}>
                        Itens Selecionados ({cart.length})
                      </label>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          marginTop: 8,
                        }}
                      >
                        {cart.map((entry) => (
                          <div
                            key={entry.item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: '#f9fafb',
                              padding: '10px 12px',
                              borderRadius: 8,
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <strong style={{ fontSize: '0.92rem', color: '#111827' }}>
                                {entry.item.name}
                              </strong>
                              <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                                {(entry.item.price * entry.qty).toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </div>
                            </div>
                            <div className="cardapio-stepper">
                              <button
                                type="button"
                                onClick={() => handleUpdateQty(entry.item.id, -1)}
                              >
                                -
                              </button>
                              <span>{entry.qty}</span>
                              <button
                                type="button"
                                onClick={() => handleUpdateQty(entry.item.id, 1)}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Identificação de Mesa quando Comer no Local */}
                    {modality === 'local' ? (
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                          Mesa onde está sentado:
                        </label>
                        <div className="cardapio-tables-grid">
                          {tables.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              className={`cardapio-table-btn ${
                                selectedTableId === t.id ? 'is-selected' : 'is-free'
                              }`}
                              onClick={() => setSelectedTableId(t.id)}
                            >
                              <strong>{t.label}</strong>
                              <small>{t.seats} lug.</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Endereço quando Delivery */}
                    {modality === 'delivery' ? (
                      <div className="cardapio-form-group">
                        <label>Endereço de Entrega Completo</label>
                        <input
                          type="text"
                          placeholder="Rua, número, complemento, bairro"
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                        />
                      </div>
                    ) : null}

                    {/* Dados do cliente */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="cardapio-form-group">
                        <label>Seu Nome</label>
                        <input
                          type="text"
                          placeholder="Como te chamamos?"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                        />
                      </div>
                      <div className="cardapio-form-group">
                        <label>Telefone / WhatsApp</label>
                        <input
                          type="tel"
                          placeholder="(99) 99999-9999"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="cardapio-form-group">
                      <label>Observações do Pedido (opcional)</label>
                      <input
                        type="text"
                        placeholder="Ex: Ponto da carne, sem cebola, etc."
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                      />
                    </div>

                    {/* Totais */}
                    <div
                      style={{
                        background: '#f9fafb',
                        padding: 12,
                        borderRadius: 8,
                        fontSize: '0.9rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Subtotal:</span>
                        <span>
                          {cartSubtotal.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      {modality === 'delivery' ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Taxa de Entrega:</span>
                          <span>
                            {deliveryFee.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>
                      ) : null}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontWeight: 800,
                          fontSize: '1.05rem',
                          borderTop: '1px solid #e5e7eb',
                          paddingTop: 6,
                        }}
                      >
                        <span>Total:</span>
                        <span>
                          {cartGrandTotal.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="cardapio-btn cardapio-btn--primary"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        padding: '14px',
                        fontSize: '1rem',
                      }}
                      onClick={handleConfirmOrder}
                    >
                      Enviar Pedido para a Cozinha 🚀
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Modal de Formas de Pagamento */}
      {paymentModalOpen ? (
        <div className="cardapio-modal-backdrop" onClick={() => setPaymentModalOpen(false)}>
          <div className="cardapio-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cardapio-modal-head">
              <h2>Formas de Pagamento Aceitas</h2>
              <button
                type="button"
                className="cardapio-modal-close"
                onClick={() => setPaymentModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#4b5563' }}>
              O pagamento é realizado diretamente no restaurante (mesa ou balcão) ou na entrega.
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {config.paymentMethods.map((method) => (
                <li key={method} style={{ fontSize: '0.94rem', fontWeight: 600 }}>
                  {method}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="cardapio-btn cardapio-btn--primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setPaymentModalOpen(false)}
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
