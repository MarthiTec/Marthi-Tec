import { useState } from 'react';
import {
  SEGMENT_PRESETS,
  getStoreCustomization,
  saveStoreCustomization,
  type SegmentPreset,
  type StoreCustomization,
} from '../../data/storeSegment';
import { AdminIcon } from '../../components/AdminIcons';

export function StoreSegmentPage() {
  const [config, setConfig] = useState<StoreCustomization>(getStoreCustomization);
  const [toast, setToast] = useState('');

  function handleSelectPreset(preset: SegmentPreset) {
    const updated = saveStoreCustomization({
      segmentId: preset.id,
      segmentName: preset.name,
      ...preset.config,
    });
    setConfig(updated);
    showFeedback(`Ramo configurado para: ${preset.name}`);
  }

  function handleToggle(field: keyof Omit<StoreCustomization, 'segmentId' | 'segmentName' | 'updatedAt'>) {
    const nextVal = !config[field];
    const updated = saveStoreCustomization({
      segmentId: 'personalizado',
      segmentName: 'Personalizado',
      [field]: nextVal,
    });
    setConfig(updated);
    showFeedback('Configuração personalizada atualizada!');
  }

  function showFeedback(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  return (
    <div className="admin-page">
      {/* Toast flutuante */}
      {toast ? (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            background: '#0f766e',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(15, 118, 110, 0.35)',
            fontWeight: 600,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <span>✓</span>
          <span>{toast}</span>
        </div>
      ) : null}

      {/* Hero / Header da Página */}
      <header className="admin-hero" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(15, 118, 110, 0.1)',
              color: '#0f766e',
            }}
          >
            <AdminIcon name="settings" />
          </span>
          <div>
            <div className="admin-hero__kicker">Configurações do Negócio</div>
            <h1 className="admin-hero__title">Ramo da Loja & Personalização de Campos</h1>
          </div>
        </div>
        <p className="admin-hero__lead" style={{ marginTop: 8 }}>
          Personalize os campos e recursos visíveis no sistema de acordo com o segmento da sua empresa.
          Por exemplo: em restaurantes ou lojas de roupas, campos como IMEI e senhas de aparelhos são ocultados,
          e módulos desnecessários como mesas/cozinha não poluem o fluxo da loja de moda.
        </p>
      </header>

      {/* Grid de Ramos Pré-configurados */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
              1. Selecione o Ramo de Atividade Principal
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--mute)' }}>
              Ao selecionar um modelo, os campos da oficina, PDV e menus são ajustados automaticamente.
            </p>
          </div>
          <span
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: 20,
              background: 'rgba(15, 118, 110, 0.12)',
              color: '#0f766e',
            }}
          >
            Ativo agora: {config.segmentName}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {SEGMENT_PRESETS.map((preset) => {
            const isSelected = config.segmentId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                style={{
                  border: isSelected ? '2px solid #0f766e' : '1px solid var(--line)',
                  borderRadius: 12,
                  padding: '18px 20px',
                  background: isSelected ? '#f0fdfa' : '#fff',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: isSelected
                    ? '0 4px 16px rgba(15, 118, 110, 0.14)'
                    : '0 1px 3px rgba(0,0,0,0.04)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.6rem' }}>{preset.icon}</span>
                    <strong
                      style={{
                        fontSize: '0.96rem',
                        color: isSelected ? '#0f766e' : 'var(--ink)',
                      }}
                    >
                      {preset.name}
                    </strong>
                  </div>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: isSelected ? '6px solid #0f766e' : '2px solid #cbd5e1',
                      background: '#fff',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.84rem',
                    color: 'var(--mute)',
                    lineHeight: 1.45,
                  }}
                >
                  {preset.description}
                </p>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: preset.config.showImei ? '#e0f2fe' : '#f1f5f9',
                      color: preset.config.showImei ? '#0369a1' : '#64748b',
                    }}
                  >
                    IMEI: {preset.config.showImei ? 'Sim' : 'Não'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: preset.config.showTablesAndKitchen ? '#fce7f3' : '#f1f5f9',
                      color: preset.config.showTablesAndKitchen ? '#be185d' : '#64748b',
                    }}
                  >
                    Mesas/Cozinha: {preset.config.showTablesAndKitchen ? 'Sim' : 'Não'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: preset.config.showSizeColorGrid ? '#fef3c7' : '#f1f5f9',
                      color: preset.config.showSizeColorGrid ? '#b45309' : '#64748b',
                    }}
                  >
                    Grade Cores/Tam: {preset.config.showSizeColorGrid ? 'Sim' : 'Não'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Ajuste Fino dos Campos (Toggles Individuais) */}
      <section
        style={{
          background: '#fff',
          borderRadius: 14,
          border: '1px solid var(--line)',
          padding: '24px 28px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          marginBottom: 32,
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
            2. Ajuste Fino de Campos e Módulos Visíveis
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--mute)' }}>
            Ligue ou desligue qualquer recurso individualmente conforme a necessidade do seu fluxo de caixa ou atendimento.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Toggle 1: IMEI / Serial */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderRadius: 10,
              background: config.showImei ? 'rgba(15, 118, 110, 0.04)' : '#f8fafc',
              border: '1px solid var(--line)',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: '0.94rem', color: 'var(--ink)' }}>
                  Exibir IMEI e Nº de Série nas Ordens de Serviço e Impressões
                </strong>
                {config.showImei ? (
                  <span style={{ fontSize: '0.74rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    Visível
                  </span>
                ) : (
                  <span style={{ fontSize: '0.74rem', background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    Oculto
                  </span>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--mute)' }}>
                Relevante para assistências técnicas de celulares, notebooks e eletrônicos. Quando desativado, o campo é removido da abertura rápida, detalhes da OS e comprovantes de 1ª e 2ª via.
              </p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.showImei}
                onChange={() => handleToggle('showImei')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  inset: 0,
                  backgroundColor: config.showImei ? '#0f766e' : '#cbd5e1',
                  transition: '0.2s',
                  borderRadius: 26,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    content: '""',
                    height: 20,
                    width: 20,
                    left: config.showImei ? 24 : 4,
                    bottom: 3,
                    backgroundColor: '#fff',
                    transition: '0.2s',
                    borderRadius: '50%',
                  }}
                />
              </span>
            </label>
          </div>

          {/* Toggle 2: Senha do Aparelho */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderRadius: 10,
              background: config.showDevicePassword ? 'rgba(15, 118, 110, 0.04)' : '#f8fafc',
              border: '1px solid var(--line)',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: '0.94rem', color: 'var(--ink)' }}>
                  Exibir Senha / PIN de Desbloqueio do Aparelho
                </strong>
                {config.showDevicePassword ? (
                  <span style={{ fontSize: '0.74rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    Visível
                  </span>
                ) : (
                  <span style={{ fontSize: '0.74rem', background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    Oculto
                  </span>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--mute)' }}>
                Permite que a recepção anote o PIN de desbloqueio do cliente para os testes de bancada. Oculto para vestuário, restaurantes e prestadores de serviços gerais.
              </p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.showDevicePassword}
                onChange={() => handleToggle('showDevicePassword')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  inset: 0,
                  backgroundColor: config.showDevicePassword ? '#0f766e' : '#cbd5e1',
                  transition: '0.2s',
                  borderRadius: 26,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    content: '""',
                    height: 20,
                    width: 20,
                    left: config.showDevicePassword ? 24 : 4,
                    bottom: 3,
                    backgroundColor: '#fff',
                    transition: '0.2s',
                    borderRadius: '50%',
                  }}
                />
              </span>
            </label>
          </div>

          {/* Toggle 3: Mesas e Cozinha */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderRadius: 10,
              background: config.showTablesAndKitchen ? 'rgba(15, 118, 110, 0.04)' : '#f8fafc',
              border: '1px solid var(--line)',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: '0.94rem', color: 'var(--ink)' }}>
                  Módulo de Mesas, Comandas & Cozinha
                </strong>
                {config.showTablesAndKitchen ? (
                  <span style={{ fontSize: '0.74rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    Ativo no Ecossistema
                  </span>
                ) : (
                  <span style={{ fontSize: '0.74rem', background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    Desativado
                  </span>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--mute)' }}>
                Habilita o aplicativo de mesas e pedidos por comanda no menu Ecossistema. Em lojas de roupa, óticas ou assistências técnicas, mantenha desligado para não poluir o sistema.
              </p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.showTablesAndKitchen}
                onChange={() => handleToggle('showTablesAndKitchen')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  inset: 0,
                  backgroundColor: config.showTablesAndKitchen ? '#0f766e' : '#cbd5e1',
                  transition: '0.2s',
                  borderRadius: 26,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    content: '""',
                    height: 20,
                    width: 20,
                    left: config.showTablesAndKitchen ? 24 : 4,
                    bottom: 3,
                    backgroundColor: '#fff',
                    transition: '0.2s',
                    borderRadius: '50%',
                  }}
                />
              </span>
            </label>
          </div>

          {/* Toggle 4: Bancada Técnica */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderRadius: 10,
              background: config.showTechnicalBench ? 'rgba(15, 118, 110, 0.04)' : '#f8fafc',
              border: '1px solid var(--line)',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: '0.94rem', color: 'var(--ink)' }}>
                  Bancada Técnica e Diagnóstico Preliminar
                </strong>
                {config.showTechnicalBench ? (
                  <span style={{ fontSize: '0.74rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    Ativo
                  </span>
                ) : (
                  <span style={{ fontSize: '0.74rem', background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    Simplificado
                  </span>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--mute)' }}>
                Habilita notas de diagnóstico técnico, tempos de serviço e checklist de testes pré/pós reparo nas ordens de serviço.
              </p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.showTechnicalBench}
                onChange={() => handleToggle('showTechnicalBench')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  inset: 0,
                  backgroundColor: config.showTechnicalBench ? '#0f766e' : '#cbd5e1',
                  transition: '0.2s',
                  borderRadius: 26,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    content: '""',
                    height: 20,
                    width: 20,
                    left: config.showTechnicalBench ? 24 : 4,
                    bottom: 3,
                    backgroundColor: '#fff',
                    transition: '0.2s',
                    borderRadius: '50%',
                  }}
                />
              </span>
            </label>
          </div>

          {/* Toggle 5: Grade de Tamanho e Cor */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderRadius: 10,
              background: config.showSizeColorGrid ? 'rgba(15, 118, 110, 0.04)' : '#f8fafc',
              border: '1px solid var(--line)',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: '0.94rem', color: 'var(--ink)' }}>
                  Grade de Tamanho e Cor (Vestuário, Calçados & Moda)
                </strong>
                {config.showSizeColorGrid ? (
                  <span style={{ fontSize: '0.74rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    Ativo
                  </span>
                ) : (
                  <span style={{ fontSize: '0.74rem', background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    Desativado
                  </span>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--mute)' }}>
                Ativa suporte no catálogo de produtos e PDV para matriz de variação de tamanho (P, M, G, GG, 36 a 44) e cores para lojas do segmento de moda.
              </p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.showSizeColorGrid}
                onChange={() => handleToggle('showSizeColorGrid')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  inset: 0,
                  backgroundColor: config.showSizeColorGrid ? '#0f766e' : '#cbd5e1',
                  transition: '0.2s',
                  borderRadius: 26,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    content: '""',
                    height: 20,
                    width: 20,
                    left: config.showSizeColorGrid ? 24 : 4,
                    bottom: 3,
                    backgroundColor: '#fff',
                    transition: '0.2s',
                    borderRadius: '50%',
                  }}
                />
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* Card de Resumo e Aplicação Imediata */}
      <footer
        style={{
          background: '#f8fafc',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <strong style={{ fontSize: '0.94rem', color: 'var(--ink)' }}>
            Aplicação em tempo real
          </strong>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--mute)' }}>
            As configurações são salvas instantaneamente e sincronizadas com todas as abas e telas abertas da loja.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            className="btn"
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: '#fff',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => handleSelectPreset(SEGMENT_PRESETS[0])}
          >
            Restaurar Padrão (Assistência Técnica)
          </button>
          <button
            type="button"
            className="btn btn--primary"
            style={{
              padding: '10px 22px',
              borderRadius: 8,
              background: '#0f766e',
              color: '#fff',
              border: 'none',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => showFeedback('Configurações salvas e aplicadas com sucesso!')}
          >
            Confirmar e Salvar
          </button>
        </div>
      </footer>
    </div>
  );
}
