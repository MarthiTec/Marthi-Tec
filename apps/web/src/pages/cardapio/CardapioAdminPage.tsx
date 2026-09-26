import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getCardapioConfig,
  saveCardapioConfig,
  listCardapioItems,
  addCardapioItem,
  updateCardapioItem,
  removeCardapioItem,
  reorderCardapioItems,
  importFromStock,
  listCardapioCategories,
  listReservations,
  type CardapioConfig,
  type CardapioItem,
  CARDAPIO_EVENT,
} from '../../data/cardapioStore';
import { getAdminState } from '../../data/adminStore';
import { listRestaurantTables } from '../../data/kitchenOrderStore';
import { QrCodeView, generateQrDataUrl } from '../../components/QrCodeView';
import { AdminPicker } from '../../components/AdminPicker';
import { CardapioPublicPage } from './CardapioPublicPage';
import './cardapioAdmin.css';

const BANNER_PRESETS = [
  {
    label: 'Restaurante & Bistrô',
    url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Carnes & Grelhados',
    url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=1200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Pizzaria & Forno',
    url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Hamburgueria',
    url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=1200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Cafeteria & Padaria',
    url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Sushi & Japonês',
    url: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=1200&auto=format&fit=crop&q=80',
  },
];

export function CardapioAdminPage() {
  const [config, setConfig] = useState<CardapioConfig>(() => getCardapioConfig());
  const [items, setItems] = useState<CardapioItem[]>(() => listCardapioItems());
  const [categories, setCategories] = useState<string[]>(() => listCardapioCategories());
  const [reservations, setReservations] = useState(() => listReservations());
  const tables = listRestaurantTables();

  const [activeTab, setActiveTab] = useState<
    'dishes' | 'branding' | 'shares' | 'qrcodes' | 'reservations'
  >('dishes');

  // Modal para criar/editar prato
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<CardapioItem> | null>(null);

  // Modal para importar da Retaguarda
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedStockIds, setSelectedStockIds] = useState<string[]>([]);
  const [stockSearch, setStockSearch] = useState('');

  // Notificação / Toast
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      setConfig(getCardapioConfig());
      setItems(listCardapioItems());
      setCategories(listCardapioCategories());
      setReservations(listReservations());
    }
    window.addEventListener(CARDAPIO_EVENT, refresh);
    return () => window.removeEventListener(CARDAPIO_EVENT, refresh);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handleSaveConfig(patch: Partial<CardapioConfig>) {
    const updated = saveCardapioConfig(patch);
    setConfig(updated);
    showToast('Configurações salvas!');
  }

  function handleFileUpload(file: File, callback: (dataUrl: string) => void) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        callback(e.target.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleMoveDish(id: string, delta: number) {
    const currentIndex = items.findIndex((i) => i.id === id);
    if (currentIndex < 0) return;
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const copy = [...items];
    const [moved] = copy.splice(currentIndex, 1);
    copy.splice(targetIndex, 0, moved);
    reorderCardapioItems(copy.map((i) => i.id));
  }

  function handleSaveDish() {
    if (!editingItem?.name?.trim()) {
      alert('Informe o nome do prato.');
      return;
    }

    if (editingItem.id) {
      updateCardapioItem(editingItem.id, editingItem);
      showToast('Prato atualizado!');
    } else {
      addCardapioItem({
        stockId: editingItem.stockId,
        name: editingItem.name.trim(),
        description: editingItem.description || '',
        price: Number(editingItem.price) || 0,
        imageUrl:
          editingItem.imageUrl ||
          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80',
        category: editingItem.category || 'Pratos do Dia',
        available: editingItem.available ?? true,
        isPromotion: editingItem.isPromotion ?? false,
        badge: editingItem.badge || '',
      });
      showToast('Prato adicionado ao cardápio!');
    }
    setEditModalOpen(false);
    setEditingItem(null);
  }

  // Importar itens do estoque da Retaguarda
  const allStock = getAdminState().stock;
  const filteredStock = allStock.filter(
    (s) =>
      !stockSearch.trim() ||
      s.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
      s.sku.toLowerCase().includes(stockSearch.toLowerCase()),
  );

  function handleDoImport() {
    if (!selectedStockIds.length) return;
    const created = importFromStock(selectedStockIds);
    showToast(`${created.length} produtos importados para o Cardápio!`);
    setImportModalOpen(false);
    setSelectedStockIds([]);
  }

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/cardapio` : '';

  async function handleDownloadGeneralQr() {
    try {
      const dataUrl = await generateQrDataUrl(baseUrl, 600);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `qrcode-${config.restaurantName.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.click();
      showToast('Download do QR Code iniciado!');
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="cardapio-admin-wrap">
      {/* Toast */}
      {toast ? (
        <div className="cardapio-toast">
          ✓ {toast}
        </div>
      ) : null}

      {/* Header com ações rápidas */}
      <header className="cardapio-admin-header">
        <div className="cardapio-admin-header__titles">
          <h1>
            🍽️ Cardápio Digital do Dia{' '}
            <span
              className={`cardapio-status-badge ${config.published ? 'is-published' : 'is-draft'}`}
            >
              {config.published ? '● No ar' : '○ Rascunho'}
            </span>
          </h1>
          <p>
            Configure pratos, fotos, QR Codes para as mesas e acompanhe a prévia em tempo real para
            o celular do cliente.
          </p>
        </div>

        <div className="cardapio-admin-header-actions">
          <button
            type="button"
            className="cardapio-btn cardapio-btn--secondary"
            onClick={() => handleSaveConfig({ published: !config.published })}
          >
            {config.published ? 'Despublicar' : 'Publicar Cardápio'}
          </button>

          <Link
            to="/cardapio"
            target="_blank"
            rel="noreferrer"
            className="cardapio-btn cardapio-btn--secondary"
          >
            ↗ Ver Link Público
          </Link>

          <Link
            to="/painel/cardapio/imprimir"
            className="cardapio-btn cardapio-btn--primary"
          >
            🖨️ Display de Mesa (Acrílico)
          </Link>
        </div>
      </header>

      {/* Abas de Navegação */}
      <nav className="cardapio-admin-tabs">
        <button
          type="button"
          className={`cardapio-admin-tab-btn ${activeTab === 'dishes' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('dishes')}
        >
          🍛 Pratos do Cardápio ({items.length})
        </button>
        <button
          type="button"
          className={`cardapio-admin-tab-btn ${activeTab === 'branding' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('branding')}
        >
          🎨 Personalização & Marca
        </button>
        <button
          type="button"
          className={`cardapio-admin-tab-btn ${activeTab === 'shares' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('shares')}
        >
          🌐 Divulgação & Redes Sociais
        </button>
        <button
          type="button"
          className={`cardapio-admin-tab-btn ${activeTab === 'qrcodes' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('qrcodes')}
        >
          📱 Mesas & QR Codes ({tables.length})
        </button>
        <button
          type="button"
          className={`cardapio-admin-tab-btn ${activeTab === 'reservations' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('reservations')}
        >
          📅 Reservas ({reservations.length})
        </button>
      </nav>

      {/* Split view: Editor à esquerda, Mockup do celular à direita */}
      <div className="cardapio-split-layout">
        {/* Painel Esquerdo de Edição */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {activeTab === 'dishes' ? (
            <div className="cardapio-editor-card">
              <div className="cardapio-dishes-toolbar">
                <div>
                  <h2 className="cardapio-editor-title">
                    Cardápio de Hoje · {new Date().toLocaleDateString('pt-BR')}
                  </h2>
                  <p className="cardapio-editor-subtitle">
                    Os pratos marcados como disponíveis aparecem para o cliente no celular.
                  </p>
                </div>

                <div className="cardapio-dishes-toolbar__actions">
                  <button
                    type="button"
                    className="cardapio-btn cardapio-btn--secondary"
                    onClick={() => setImportModalOpen(true)}
                  >
                    📦 Importar da Retaguarda
                  </button>
                  <button
                    type="button"
                    className="cardapio-btn cardapio-btn--primary"
                    onClick={() => {
                      setEditingItem({
                        name: '',
                        description: '',
                        price: 0,
                        category: categories[0] || 'Pratos do Dia',
                        available: true,
                        isPromotion: false,
                        imageUrl: '',
                      });
                      setEditModalOpen(true);
                    }}
                  >
                    + Novo Prato
                  </button>
                </div>
              </div>

              {/* Lista de pratos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map((dish, index) => (
                  <div key={dish.id} className="cardapio-dish-row">
                    <img
                      src={dish.imageUrl}
                      alt={dish.name}
                      className="cardapio-dish-thumb"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />

                    <div className="cardapio-dish-main">
                      <div className="cardapio-dish-title">
                        <span>{dish.name}</span>
                        {dish.isPromotion ? (
                          <span className="cardapio-badge-promo">
                            Promoção
                          </span>
                        ) : null}
                        {dish.stockId ? (
                          <span className="cardapio-badge-retaguarda">
                            Retaguarda
                          </span>
                        ) : null}
                      </div>

                      <div className="cardapio-dish-desc">{dish.description}</div>

                      <div className="cardapio-dish-meta">
                        <span className="cardapio-dish-price">
                          {dish.price.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                        <span className="cardapio-dish-dot">·</span>
                        <span className="cardapio-dish-category">{dish.category}</span>
                        <span className="cardapio-dish-dot">·</span>
                        <label className="cardapio-dish-available">
                          <input
                            type="checkbox"
                            checked={dish.available}
                            onChange={(e) =>
                              updateCardapioItem(dish.id, { available: e.target.checked })
                            }
                          />
                          <span>
                            {dish.available ? 'Disponível' : 'Esgotado'}
                          </span>
                        </label>
                      </div>
                    </div>

                    <div className="cardapio-dish-actions">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMoveDish(dish.id, -1)}
                        className="cardapio-btn cardapio-btn--secondary"
                        style={{ padding: '6px 8px' }}
                        title="Subir na ordem"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={index === items.length - 1}
                        onClick={() => handleMoveDish(dish.id, 1)}
                        className="cardapio-btn cardapio-btn--secondary"
                        style={{ padding: '6px 8px' }}
                        title="Descer na ordem"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem({ ...dish });
                          setEditModalOpen(true);
                        }}
                        className="cardapio-btn cardapio-btn--secondary"
                        style={{ padding: '6px 10px' }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remover "${dish.name}" do cardápio?`)) {
                            removeCardapioItem(dish.id);
                          }
                        }}
                        className="cardapio-btn cardapio-btn--secondary cardapio-btn--danger"
                        style={{ padding: '6px 8px' }}
                        title="Remover"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Aba de Marca e Personalização */}
          {activeTab === 'branding' ? (
            <div className="cardapio-editor-card">
              <h2 className="cardapio-editor-title">Identidade Visual & Estabelecimento</h2>
              <p className="cardapio-editor-subtitle">
                Personalize 100% da marca para o seu restaurante, bar, cafeteria ou lanchonete.
              </p>

              <div className="cardapio-form-grid-2">
                <div className="cardapio-form-group">
                  <label>Nome do Estabelecimento / Loja *</label>
                  <input
                    type="text"
                    value={config.restaurantName}
                    placeholder="Ex: A Sua Loja, Pizzaria Bella, etc."
                    onChange={(e) => handleSaveConfig({ restaurantName: e.target.value })}
                  />
                </div>
                <div className="cardapio-form-group">
                  <label>Slogan / Subtítulo</label>
                  <input
                    type="text"
                    value={config.slogan}
                    placeholder="Ex: Restaurante, Bar & Gastronomia"
                    onChange={(e) => handleSaveConfig({ slogan: e.target.value })}
                  />
                </div>
              </div>

              {/* Upload de Logo */}
              <div className="cardapio-form-group">
                <label>Logo do Estabelecimento</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {config.logoUrl ? (
                    <img
                      src={config.logoUrl}
                      alt="Logo"
                      className="cardapio-logo-preview"
                    />
                  ) : (
                    <div className="cardapio-logo-placeholder">
                      Loja
                    </div>
                  )}

                  <label className="cardapio-btn cardapio-btn--secondary" style={{ cursor: 'pointer' }}>
                    📁 Carregar Arquivo de Logo
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, (dataUrl) => handleSaveConfig({ logoUrl: dataUrl }));
                      }}
                    />
                  </label>

                  {config.logoUrl ? (
                    <button
                      type="button"
                      className="cardapio-btn cardapio-btn--secondary"
                      onClick={() => handleSaveConfig({ logoUrl: null })}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
                <input
                  type="text"
                  placeholder="Ou cole uma URL da imagem da logo..."
                  value={config.logoUrl || ''}
                  onChange={(e) => handleSaveConfig({ logoUrl: e.target.value })}
                  style={{ marginTop: 6 }}
                />
              </div>

              {/* Upload de Banner de Capa */}
              <div className="cardapio-form-group">
                <label>Foto de Fundo / Banner de Capa</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {config.bannerUrl ? (
                    <img
                      src={config.bannerUrl}
                      alt="Capa"
                      className="cardapio-banner-preview"
                    />
                  ) : null}

                  <label className="cardapio-btn cardapio-btn--secondary" style={{ cursor: 'pointer' }}>
                    📁 Carregar Imagem de Fundo
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, (dataUrl) => handleSaveConfig({ bannerUrl: dataUrl }));
                      }}
                    />
                  </label>

                  {config.bannerUrl ? (
                    <button
                      type="button"
                      className="cardapio-btn cardapio-btn--secondary"
                      onClick={() => handleSaveConfig({ bannerUrl: null })}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
                <input
                  type="text"
                  placeholder="Ou cole a URL da imagem de fundo..."
                  value={config.bannerUrl || ''}
                  onChange={(e) => handleSaveConfig({ bannerUrl: e.target.value })}
                  style={{ marginTop: 6 }}
                />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <span className="cardapio-preset-label">
                    Temas sugeridos:
                  </span>
                  {BANNER_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="cardapio-preset-btn"
                      onClick={() => handleSaveConfig({ bannerUrl: p.url })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cores */}
              <div className="cardapio-form-grid-2">
                <div className="cardapio-form-group">
                  <label>Cor Primária (Fundo / Textos)</label>
                  <input
                    type="color"
                    value={config.primaryColor}
                    onChange={(e) => handleSaveConfig({ primaryColor: e.target.value })}
                    style={{ height: 42, padding: 4 }}
                  />
                </div>
                <div className="cardapio-form-group">
                  <label>Cor de Destaque (Botões / Badges)</label>
                  <input
                    type="color"
                    value={config.accentColor}
                    onChange={(e) => handleSaveConfig({ accentColor: e.target.value })}
                    style={{ height: 42, padding: 4 }}
                  />
                </div>
              </div>

              {/* Redes e Contato */}
              <div className="cardapio-form-grid-2">
                <div className="cardapio-form-group">
                  <label>Instagram Oficial (@ da loja)</label>
                  <input
                    type="text"
                    value={config.instagram}
                    placeholder="@asualoja"
                    onChange={(e) => handleSaveConfig({ instagram: e.target.value })}
                  />
                </div>
                <div className="cardapio-form-group">
                  <label>WhatsApp para Pedidos & Contato</label>
                  <input
                    type="tel"
                    value={config.whatsapp}
                    placeholder="5511999999999"
                    onChange={(e) => handleSaveConfig({ whatsapp: e.target.value })}
                  />
                </div>
              </div>

              <div className="cardapio-form-group">
                <label>Endereço Completo</label>
                <input
                  type="text"
                  value={config.address}
                  onChange={(e) => handleSaveConfig({ address: e.target.value })}
                />
              </div>

              {/* Modalidades */}
              <div className="cardapio-section-divider">
                <h3 className="cardapio-editor-title" style={{ fontSize: '1rem', margin: '0 0 10px' }}>
                  Modalidades de Atendimento
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.enableDineIn}
                      onChange={(e) => handleSaveConfig({ enableDineIn: e.target.checked })}
                    />
                    <span>Comer no local</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.enableDelivery}
                      onChange={(e) => handleSaveConfig({ enableDelivery: e.target.checked })}
                    />
                    <span>Entrega (Delivery)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.enableTakeout}
                      onChange={(e) => handleSaveConfig({ enableTakeout: e.target.checked })}
                    />
                    <span>Retirada no local</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.enableReservation}
                      onChange={(e) => handleSaveConfig({ enableReservation: e.target.checked })}
                    />
                    <span>Reservas de mesa</span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {/* Aba de Divulgação & Redes Sociais */}
          {activeTab === 'shares' ? (
            <div className="cardapio-editor-card">
              <div>
                <h2 className="cardapio-editor-title">
                  🌐 Disponibilize o Site do Seu Cardápio para Seus Clientes
                </h2>
                <p className="cardapio-editor-subtitle">
                  O cardápio digital funciona 100% no navegador do celular do cliente sem necessidade
                  de instalar nenhum app. Divulgue o link nas suas páginas e redes sociais.
                </p>
              </div>

              {/* Card 1: Link direto */}
              <div className="cardapio-subcard">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <strong style={{ fontSize: '1rem' }}>🔗 Link Oficial do Seu Cardápio</strong>
                  <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 700 }}>
                    ● Pronto para compartilhar
                  </span>
                </div>
                <div className="cardapio-code-box">
                  {baseUrl}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="cardapio-btn cardapio-btn--primary"
                    onClick={() => {
                      navigator.clipboard.writeText(baseUrl);
                      showToast('Link do cardápio copiado!');
                    }}
                  >
                    📋 Copiar Link do Cardápio
                  </button>
                  <a
                    href={baseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="cardapio-btn cardapio-btn--secondary"
                  >
                    ↗ Abrir Cardápio
                  </a>
                </div>
              </div>

              {/* Card 2: Compartilhar no WhatsApp */}
              <div className="cardapio-subcard">
                <strong style={{ fontSize: '1rem' }}>💬 Compartilhamento no WhatsApp</strong>
                <p className="cardapio-editor-subtitle">
                  Envie mensagens prontas para seus clientes ou listas de transmissão convidando-os a
                  conferir as novidades e promoções de hoje:
                </p>
                <div className="cardapio-quote-box">
                  &ldquo;Olá! Confira nosso cardápio online de hoje no {config.restaurantName} e faça seu
                  pedido ou reserve sua mesa direto pelo celular: {baseUrl}&rdquo;
                </div>
                <div>
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Olá! Confira nosso cardápio online de hoje no ${config.restaurantName} e faça seu pedido ou reserve sua mesa direto pelo celular: ${baseUrl}`,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="cardapio-btn"
                    style={{ background: '#25d366', color: '#fff', border: 'none' }}
                  >
                    💬 Compartilhar via WhatsApp
                  </a>
                </div>
              </div>

              {/* Card 3: Instagram e Facebook */}
              <div className="cardapio-subcard">
                <strong style={{ fontSize: '1rem' }}>📷 Instagram & Redes Sociais</strong>
                <p className="cardapio-editor-subtitle">
                  Coloque o link direto no campo <strong>&ldquo;Link na Bio&rdquo;</strong> do seu
                  Instagram ({config.instagram || '@asualoja'}) e nos botões de ação do Facebook para
                  que seus seguidores acessem com 1 toque.
                </p>
                <div>
                  <button
                    type="button"
                    className="cardapio-btn cardapio-btn--secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(baseUrl);
                      showToast('Link pronto para colar na Bio do Instagram!');
                    }}
                  >
                    📋 Copiar Link para a Bio do Instagram
                  </button>
                </div>
              </div>

              {/* Card 4: QR Code para Embalagens e Panfletos */}
              <div className="cardapio-subcard cardapio-subcard--qr">
                <div className="cardapio-qr-container">
                  <QrCodeView value={baseUrl} size={120} colorDark="#1f2937" />
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <strong style={{ fontSize: '1rem' }}>
                    📱 QR Code para Embalagens, Panfletos e Adesivos
                  </strong>
                  <p className="cardapio-editor-subtitle" style={{ margin: '4px 0 12px' }}>
                    Baixe o QR Code em alta definição para estampar em embalagens de delivery,
                    materiais impressos e fachadas.
                  </p>
                  <button
                    type="button"
                    className="cardapio-btn cardapio-btn--primary"
                    onClick={handleDownloadGeneralQr}
                  >
                    📥 Baixar QR Code (PNG em Alta Resolução)
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Aba de Mesas & QR Codes */}
          {activeTab === 'qrcodes' ? (
            <div className="cardapio-editor-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h2 className="cardapio-editor-title">QR Codes & Display de Mesas</h2>
                  <p className="cardapio-editor-subtitle">
                    Cada mesa tem seu próprio QR Code. Ao escanear, o cliente já entra com a mesa
                    identificada.
                  </p>
                </div>
                <Link to="/painel/cardapio/imprimir" className="cardapio-btn cardapio-btn--primary">
                  🖨️ Abrir Modo Impressão Display Acrílico
                </Link>
              </div>

              {/* QR Code Geral */}
              <div className="cardapio-subcard cardapio-subcard--qr">
                <div className="cardapio-qr-container">
                  <QrCodeView value={baseUrl} size={110} colorDark="#2c1d11" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h3 className="cardapio-editor-title" style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>
                    QR Code Geral (Cardápio / Delivery)
                  </h3>
                  <p className="cardapio-editor-subtitle" style={{ margin: '0 0 8px' }}>
                    Link público do restaurante: <code>{baseUrl}</code>
                  </p>
                  <button
                    type="button"
                    className="cardapio-btn cardapio-btn--secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(baseUrl);
                      showToast('Link copiado!');
                    }}
                  >
                    📋 Copiar Link
                  </button>
                </div>
              </div>

              {/* Tabela de QR Codes por Mesa */}
              <h3 className="cardapio-editor-title" style={{ fontSize: '1rem', margin: '14px 0 6px' }}>
                QR Codes Individuais por Mesa
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 12,
                }}
              >
                {tables.map((table) => {
                  const tableUrl = `${baseUrl}?mesa=${table.number}`;

                  return (
                    <div
                      key={table.id}
                      className="cardapio-table-card"
                    >
                      <div className="cardapio-qr-container">
                        <QrCodeView value={tableUrl} size={70} colorDark="#2c1d11" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: '0.94rem' }}>{table.label}</strong>
                        <div className="cardapio-editor-subtitle" style={{ fontSize: '0.78rem' }}>
                          {table.seats} lugares · Status: {table.status}
                        </div>
                        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="cardapio-btn cardapio-btn--secondary"
                            style={{ padding: '4px 8px', fontSize: '0.76rem' }}
                            onClick={() => {
                              navigator.clipboard.writeText(tableUrl);
                              showToast(`Link da ${table.label} copiado!`);
                            }}
                          >
                            Copiar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Aba de Reservas */}
          {activeTab === 'reservations' ? (
            <div className="cardapio-editor-card">
              <h2 className="cardapio-editor-title">Reservas de Mesas Realizadas</h2>
              <p className="cardapio-editor-subtitle">
                Clientes que solicitaram reserva de mesa pelo Cardápio Digital.
              </p>

              {reservations.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center' }} className="cardapio-editor-subtitle">
                  Nenhuma reserva registrada no momento.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {reservations.map((r) => (
                    <div
                      key={r.id}
                      className="cardapio-reservation-card"
                    >
                      <div>
                        <strong>{r.guestName}</strong> · 🍽️ {r.tableLabel} ({r.guests} pessoas)
                        <div className="cardapio-editor-subtitle" style={{ fontSize: '0.82rem', marginTop: 2 }}>
                          Data: <strong>{r.date}</strong> às <strong>{r.time}</strong> · Tel:{' '}
                          {r.guestPhone || 'Não informado'}
                        </div>
                      </div>
                      <span className="cardapio-badge-confirmed">
                        Confirmada
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Mockup do Celular à Direita (Live Preview) */}
        <aside className="cardapio-preview-aside">
          <div className="cardapio-phone-frame">
            <div className="cardapio-phone-notch" />
            <div className="cardapio-phone-screen">
              <CardapioPublicPage />
            </div>
          </div>
        </aside>
      </div>

      {/* Modal de Criação / Edição de Prato */}
      {editModalOpen && editingItem ? (
        <div className="cardapio-modal-backdrop" onClick={() => setEditModalOpen(false)}>
          <div className="cardapio-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cardapio-modal-head">
              <h2>{editingItem.id ? 'Editar Prato' : 'Adicionar Prato ao Cardápio'}</h2>
              <button
                type="button"
                className="cardapio-modal-close"
                onClick={() => setEditModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="cardapio-form-group">
              <label>Nome do Prato *</label>
              <input
                type="text"
                placeholder="Ex: Feijoada Especial"
                value={editingItem.name || ''}
                onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
              />
            </div>

            <div className="cardapio-form-group">
              <label>Descrição dos Ingredientes e Detalhes</label>
              <textarea
                rows={3}
                placeholder="Ex: Feijoada clássica com arroz, couve e farofa..."
                value={editingItem.description || ''}
                onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
              />
            </div>

            <div className="cardapio-form-grid-2">
              <div className="cardapio-form-group">
                <label>Preço de Venda (R$) *</label>
                <input
                  type="number"
                  step="0.10"
                  value={editingItem.price ?? ''}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="cardapio-form-group">
                <AdminPicker
                  label="Categoria"
                  value={editingItem.category || categories[0]}
                  options={categories.map((c) => ({ value: c, label: c }))}
                  onChange={(val) => setEditingItem({ ...editingItem, category: val })}
                />
              </div>
            </div>

            {/* Foto do prato com upload ou URL */}
            <div className="cardapio-form-group">
              <label>Foto do Prato</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {editingItem.imageUrl ? (
                  <img
                    src={editingItem.imageUrl}
                    alt="Prato"
                    style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }}
                  />
                ) : null}
                <label className="cardapio-btn cardapio-btn--secondary" style={{ cursor: 'pointer' }}>
                  📁 Carregar Foto do Prato
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, (dataUrl) => setEditingItem({ ...editingItem, imageUrl: dataUrl }));
                    }}
                  />
                </label>
              </div>
              <input
                type="text"
                placeholder="Ou cole a URL da foto do prato..."
                value={editingItem.imageUrl || ''}
                onChange={(e) => setEditingItem({ ...editingItem, imageUrl: e.target.value })}
                style={{ marginTop: 6 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={editingItem.available ?? true}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, available: e.target.checked })
                  }
                />
                <span>Disponível hoje</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={editingItem.isPromotion ?? false}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, isPromotion: e.target.checked })
                  }
                />
                <span>Destaque Promoção do Dia</span>
              </label>
            </div>

            <button
              type="button"
              className="cardapio-btn cardapio-btn--primary"
              style={{ justifyContent: 'center', padding: '12px' }}
              onClick={handleSaveDish}
            >
              Salvar Prato
            </button>
          </div>
        </div>
      ) : null}

      {/* Modal de Importação da Retaguarda */}
      {importModalOpen ? (
        <div className="cardapio-modal-backdrop" onClick={() => setImportModalOpen(false)}>
          <div className="cardapio-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cardapio-modal-head">
              <h2>Importar Produtos da Retaguarda</h2>
              <button
                type="button"
                className="cardapio-modal-close"
                onClick={() => setImportModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <p className="cardapio-editor-subtitle" style={{ margin: 0 }}>
              Selecione os produtos já cadastrados no estoque para adicioná-los diretamente ao
              cardápio de hoje.
            </p>

            <input
              type="text"
              className="cardapio-stock-search"
              placeholder="Buscar no estoque da Retaguarda..."
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
            />

            <div className="cardapio-modal-stock-list">
              {filteredStock.map((stock) => {
                const isSelected = selectedStockIds.includes(stock.id);

                return (
                  <div
                    key={stock.id}
                    className={`cardapio-stock-item-pick ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedStockIds(selectedStockIds.filter((id) => id !== stock.id));
                      } else {
                        setSelectedStockIds([...selectedStockIds, stock.id]);
                      }
                    }}
                  >
                    <div>
                      <strong>{stock.name}</strong>
                      <div className="cardapio-editor-subtitle" style={{ fontSize: '0.8rem' }}>
                        SKU: {stock.sku || '-'} · Saldo: {stock.qty} {stock.unit}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong className="cardapio-dish-price">
                        {stock.price.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </strong>
                      <div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ marginLeft: 8 }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredStock.length === 0 ? (
                <div className="cardapio-editor-subtitle" style={{ padding: 20, textAlign: 'center' }}>
                  Nenhum produto encontrado.
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{selectedStockIds.length} produtos selecionados</span>
              <button
                type="button"
                className="cardapio-btn cardapio-btn--primary"
                disabled={!selectedStockIds.length}
                onClick={handleDoImport}
              >
                Importar Selecionados
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
