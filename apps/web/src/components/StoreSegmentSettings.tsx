import { useState } from 'react';
import {
  SEGMENT_PRESETS,
  applySegmentPreset,
  getStoreCustomization,
  saveStoreCustomization,
  type SegmentPreset,
  type StoreCustomization,
  type StoreSegmentId,
} from '../data/storeSegment';
import { AdminIcon } from './AdminIcons';
import { usePanelTheme } from '../hooks/usePanelTheme';

type Props = {
  title?: string;
  lead?: string;
  showSaveButton?: boolean;
  onSegmentChange?: (segment: StoreSegmentId) => void;
};

export function StoreSegmentSettings({
  title = 'Ramo de Atividade & Personalização da Loja',
  lead = 'Defina o segmento da sua empresa para adequar os campos e fluxos do sistema. Por exemplo: moda ativa grade de tamanhos e cores e oculta IMEI; oficinas e assistência técnica ativam IMEI e senhas de aparelhos.',
  showSaveButton = true,
  onSegmentChange,
}: Props) {
  const { isDark } = usePanelTheme();
  const [config, setConfig] = useState<StoreCustomization>(getStoreCustomization);
  const [toast, setToast] = useState('');

  function handleSelectPreset(preset: SegmentPreset) {
    const updated = applySegmentPreset(preset.id);
    setConfig(updated);
    if (onSegmentChange) onSegmentChange(preset.id);
    showFeedback(`Ramo definido para: ${preset.name}`);
  }

  function handleToggle(field: keyof Omit<StoreCustomization, 'segmentId' | 'segmentName' | 'updatedAt'>) {
    const nextVal = !config[field];
    const updated = saveStoreCustomization({
      segmentId: 'personalizado',
      segmentName: 'Personalizado',
      [field]: nextVal,
    });
    setConfig(updated);
    if (onSegmentChange) onSegmentChange('personalizado');
    showFeedback('Configuração personalizada atualizada!');
  }

  function showFeedback(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  return (
    <div className="store-segment-settings" style={{ display: 'grid', gap: 24 }}>
      {toast ? (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            background: isDark ? '#14b8a6' : '#0f766e',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(15, 118, 110, 0.35)',
            fontWeight: 600,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>✓</span>
          <span>{toast}</span>
        </div>
      ) : null}

      <header style={{ borderBottom: '1px solid var(--line)', paddingBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 38,
                height: 38,
                borderRadius: 10,
                background: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(15, 118, 110, 0.1)',
                color: isDark ? '#2dd4bf' : '#0f766e',
              }}
            >
              <AdminIcon name="settings" />
            </span>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>{title}</h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--mute)' }}>{lead}</p>
            </div>
          </div>

          <span
            style={{
              fontSize: '0.82rem',
              fontWeight: 700,
              padding: '6px 14px',
              borderRadius: 20,
              background: isDark ? 'rgba(45, 212, 191, 0.18)' : 'rgba(15, 118, 110, 0.12)',
              color: isDark ? '#2dd4bf' : '#0f766e',
            }}
          >
            Perfil Ativo: {config.segmentName}
          </span>
        </div>
      </header>

      {/* Grid de Modelos Pré-definidos */}
      <section>
        <div style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: '0.96rem', color: 'var(--ink)' }}>
            1. Selecione o Ramo de Atividade
          </strong>
          <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--mute)' }}>
            Clique no segmento do seu negócio para preencher instantaneamente as opções ideais:
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: 14,
          }}
        >
          {SEGMENT_PRESETS.map((preset) => {
            const isSelected = config.segmentId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                style={{
                  border: isSelected
                    ? isDark
                      ? '2px solid #2dd4bf'
                      : '2px solid #0f766e'
                    : isDark
                    ? '1px solid rgba(255, 255, 255, 0.1)'
                    : '1px solid var(--line)',
                  borderRadius: 12,
                  padding: '16px 18px',
                  background: isSelected
                    ? isDark
                      ? 'rgba(15, 118, 110, 0.24)'
                      : '#f0fdfa'
                    : isDark
                    ? '#1a222d'
                    : '#fff',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: isSelected
                    ? isDark
                      ? '0 4px 16px rgba(45, 212, 191, 0.18)'
                      : '0 4px 14px rgba(15, 118, 110, 0.12)'
                    : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1.4rem' }}>{preset.icon}</span>
                    <strong
                      style={{
                        fontSize: '0.92rem',
                        color: isSelected ? (isDark ? '#2dd4bf' : '#0f766e') : 'var(--ink)',
                      }}
                    >
                      {preset.name}
                    </strong>
                  </div>
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: isSelected
                        ? isDark
                          ? '5px solid #2dd4bf'
                          : '5px solid #0f766e'
                        : isDark
                        ? '2px solid #475569'
                        : '2px solid #cbd5e1',
                      background: isDark ? '#0f141a' : '#fff',
                      boxSizing: 'border-box',
                      flexShrink: 0,
                    }}
                  />
                </div>

                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--mute)', lineHeight: 1.4 }}>
                  {preset.description}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: preset.config.showImei
                        ? isDark
                          ? 'rgba(56, 189, 248, 0.2)'
                          : '#e0f2fe'
                        : isDark
                        ? 'rgba(255, 255, 255, 0.06)'
                        : '#f1f5f9',
                      color: preset.config.showImei
                        ? isDark
                          ? '#38bdf8'
                          : '#0369a1'
                        : isDark
                        ? '#94a3b8'
                        : '#64748b',
                      fontWeight: 600,
                    }}
                  >
                    IMEI/Série: {preset.config.showImei ? 'Ativo' : 'Oculto'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: preset.config.showTablesAndKitchen
                        ? isDark
                          ? 'rgba(244, 114, 182, 0.2)'
                          : '#fce7f3'
                        : isDark
                        ? 'rgba(255, 255, 255, 0.06)'
                        : '#f1f5f9',
                      color: preset.config.showTablesAndKitchen
                        ? isDark
                          ? '#f472b6'
                          : '#be185d'
                        : isDark
                        ? '#94a3b8'
                        : '#64748b',
                      fontWeight: 600,
                    }}
                  >
                    Mesas/Cozinha: {preset.config.showTablesAndKitchen ? 'Ativo' : 'Oculto'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: preset.config.showSizeColorGrid
                        ? isDark
                          ? 'rgba(251, 191, 36, 0.2)'
                          : '#fef3c7'
                        : isDark
                        ? 'rgba(255, 255, 255, 0.06)'
                        : '#f1f5f9',
                      color: preset.config.showSizeColorGrid
                        ? isDark
                          ? '#fbbf24'
                          : '#b45309'
                        : isDark
                        ? '#94a3b8'
                        : '#64748b',
                      fontWeight: 600,
                    }}
                  >
                    Grade Cores/Tam: {preset.config.showSizeColorGrid ? 'Ativo' : 'Oculto'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Ajuste fino dos campos (Toggles manuais) */}
      <section
        style={{
          background: isDark ? '#171e27' : '#fff',
          borderRadius: 12,
          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid var(--line)',
          padding: '20px 24px',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: '0.96rem', color: 'var(--ink)' }}>
            2. Ajuste Fino Individual dos Campos e Módulos
          </strong>
          <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--mute)' }}>
            Personalize qualquer interruptor para o seu fluxo diário de atendimento e vendas:
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Toggle 1: IMEI */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              borderRadius: 10,
              background: config.showImei
                ? isDark
                  ? 'rgba(15, 118, 110, 0.16)'
                  : 'rgba(15, 118, 110, 0.04)'
                : isDark
                ? '#121820'
                : '#f8fafc',
              border: config.showImei
                ? isDark
                  ? '1px solid rgba(45, 212, 191, 0.35)'
                  : '1px solid var(--line)'
                : isDark
                ? '1px solid rgba(255, 255, 255, 0.06)'
                : '1px solid var(--line)',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
                  Campos de IMEI e Nº de Série nas OS e Impressões
                </strong>
                <span
                  style={{
                    fontSize: '0.72rem',
                    background: config.showImei
                      ? isDark
                        ? 'rgba(34, 197, 94, 0.2)'
                        : '#dcfce7'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.06)'
                      : '#f1f5f9',
                    color: config.showImei
                      ? isDark
                        ? '#4ade80'
                        : '#15803d'
                      : isDark
                      ? '#94a3b8'
                      : '#64748b',
                    padding: '2px 8px',
                    borderRadius: 8,
                    fontWeight: 600,
                  }}
                >
                  {config.showImei ? 'Visível (Oficina)' : 'Oculto (Restaurante/Moda)'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--mute)' }}>
                Relevante para assistências técnicas e eletrônicos. Quando desativado, remove o campo de IMEI da abertura rápida, detalhes da OS e comprovantes de 1ª e 2ª via.
              </p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0, cursor: 'pointer', touchAction: 'manipulation' }}>
              <input
                type="checkbox"
                checked={config.showImei}
                onChange={() => handleToggle('showImei')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: config.showImei ? (isDark ? '#14b8a6' : '#0f766e') : (isDark ? '#334155' : '#cbd5e1'),
                  transition: '0.2s',
                  borderRadius: 24,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: 18,
                    width: 18,
                    left: config.showImei ? 22 : 3,
                    bottom: 3,
                    backgroundColor: '#fff',
                    transition: '0.2s',
                    borderRadius: '50%',
                  }}
                />
              </span>
            </label>
          </div>

          {/* Toggle 2: Senha */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              borderRadius: 10,
              background: config.showDevicePassword
                ? isDark
                  ? 'rgba(15, 118, 110, 0.16)'
                  : 'rgba(15, 118, 110, 0.04)'
                : isDark
                ? '#121820'
                : '#f8fafc',
              border: config.showDevicePassword
                ? isDark
                  ? '1px solid rgba(45, 212, 191, 0.35)'
                  : '1px solid var(--line)'
                : isDark
                ? '1px solid rgba(255, 255, 255, 0.06)'
                : '1px solid var(--line)',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
                  Senha / PIN de Desbloqueio do Aparelho
                </strong>
                <span
                  style={{
                    fontSize: '0.72rem',
                    background: config.showDevicePassword
                      ? isDark
                        ? 'rgba(34, 197, 94, 0.2)'
                        : '#dcfce7'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.06)'
                      : '#f1f5f9',
                    color: config.showDevicePassword
                      ? isDark
                        ? '#4ade80'
                        : '#15803d'
                      : isDark
                      ? '#94a3b8'
                      : '#64748b',
                    padding: '2px 8px',
                    borderRadius: 8,
                    fontWeight: 600,
                  }}
                >
                  {config.showDevicePassword ? 'Visível' : 'Oculto'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--mute)' }}>
                Permite registrar senhas de teste do cliente na recepção da oficina. Inútil para restaurantes e vestuário.
              </p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0, cursor: 'pointer', touchAction: 'manipulation' }}>
              <input
                type="checkbox"
                checked={config.showDevicePassword}
                onChange={() => handleToggle('showDevicePassword')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: config.showDevicePassword ? (isDark ? '#14b8a6' : '#0f766e') : (isDark ? '#334155' : '#cbd5e1'),
                  transition: '0.2s',
                  borderRadius: 24,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: 18,
                    width: 18,
                    left: config.showDevicePassword ? 22 : 3,
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
              padding: '14px 18px',
              borderRadius: 10,
              background: config.showTablesAndKitchen
                ? isDark
                  ? 'rgba(15, 118, 110, 0.16)'
                  : 'rgba(15, 118, 110, 0.04)'
                : isDark
                ? '#121820'
                : '#f8fafc',
              border: config.showTablesAndKitchen
                ? isDark
                  ? '1px solid rgba(45, 212, 191, 0.35)'
                  : '1px solid var(--line)'
                : isDark
                ? '1px solid rgba(255, 255, 255, 0.06)'
                : '1px solid var(--line)',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
                  Módulo de Mesas, Comandas & Cozinha
                </strong>
                <span
                  style={{
                    fontSize: '0.72rem',
                    background: config.showTablesAndKitchen
                      ? isDark
                        ? 'rgba(34, 197, 94, 0.2)'
                        : '#dcfce7'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.06)'
                      : '#f1f5f9',
                    color: config.showTablesAndKitchen
                      ? isDark
                        ? '#4ade80'
                        : '#15803d'
                      : isDark
                      ? '#94a3b8'
                      : '#64748b',
                    padding: '2px 8px',
                    borderRadius: 8,
                    fontWeight: 600,
                  }}
                >
                  {config.showTablesAndKitchen ? 'Ativo no Ecossistema' : 'Oculto'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--mute)' }}>
                Ativa o sistema de mesas e TV da cozinha. Em lojas de roupa, óticas ou oficinas, mantenha desligado para não poluir os menus.
              </p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0, cursor: 'pointer', touchAction: 'manipulation' }}>
              <input
                type="checkbox"
                checked={config.showTablesAndKitchen}
                onChange={() => handleToggle('showTablesAndKitchen')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: config.showTablesAndKitchen ? (isDark ? '#14b8a6' : '#0f766e') : (isDark ? '#334155' : '#cbd5e1'),
                  transition: '0.2s',
                  borderRadius: 24,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: 18,
                    width: 18,
                    left: config.showTablesAndKitchen ? 22 : 3,
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
              padding: '14px 18px',
              borderRadius: 10,
              background: config.showTechnicalBench
                ? isDark
                  ? 'rgba(15, 118, 110, 0.16)'
                  : 'rgba(15, 118, 110, 0.04)'
                : isDark
                ? '#121820'
                : '#f8fafc',
              border: config.showTechnicalBench
                ? isDark
                  ? '1px solid rgba(45, 212, 191, 0.35)'
                  : '1px solid var(--line)'
                : isDark
                ? '1px solid rgba(255, 255, 255, 0.06)'
                : '1px solid var(--line)',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
                  Bancada Técnica e Diagnóstico Preliminar
                </strong>
                <span
                  style={{
                    fontSize: '0.72rem',
                    background: config.showTechnicalBench
                      ? isDark
                        ? 'rgba(34, 197, 94, 0.2)'
                        : '#dcfce7'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.06)'
                      : '#f1f5f9',
                    color: config.showTechnicalBench
                      ? isDark
                        ? '#4ade80'
                        : '#15803d'
                      : isDark
                      ? '#94a3b8'
                      : '#64748b',
                    padding: '2px 8px',
                    borderRadius: 8,
                    fontWeight: 600,
                  }}
                >
                  {config.showTechnicalBench ? 'Ativo' : 'Simplificado'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--mute)' }}>
                Habilita notas de diagnóstico técnico, tempos de serviço e checklist de testes pré/pós reparo nas ordens de serviço.
              </p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0, cursor: 'pointer', touchAction: 'manipulation' }}>
              <input
                type="checkbox"
                checked={config.showTechnicalBench}
                onChange={() => handleToggle('showTechnicalBench')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: config.showTechnicalBench ? (isDark ? '#14b8a6' : '#0f766e') : (isDark ? '#334155' : '#cbd5e1'),
                  transition: '0.2s',
                  borderRadius: 24,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: 18,
                    width: 18,
                    left: config.showTechnicalBench ? 22 : 3,
                    bottom: 3,
                    backgroundColor: '#fff',
                    transition: '0.2s',
                    borderRadius: '50%',
                  }}
                />
              </span>
            </label>
          </div>

          {/* Toggle 5: Grade de Moda */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              borderRadius: 10,
              background: config.showSizeColorGrid
                ? isDark
                  ? 'rgba(15, 118, 110, 0.16)'
                  : 'rgba(15, 118, 110, 0.04)'
                : isDark
                ? '#121820'
                : '#f8fafc',
              border: config.showSizeColorGrid
                ? isDark
                  ? '1px solid rgba(45, 212, 191, 0.35)'
                  : '1px solid var(--line)'
                : isDark
                ? '1px solid rgba(255, 255, 255, 0.06)'
                : '1px solid var(--line)',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
                  Grade de Tamanho e Cor (Vestuário, Calçados & Moda)
                </strong>
                <span
                  style={{
                    fontSize: '0.72rem',
                    background: config.showSizeColorGrid
                      ? isDark
                        ? 'rgba(34, 197, 94, 0.2)'
                        : '#dcfce7'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.06)'
                      : '#f1f5f9',
                    color: config.showSizeColorGrid
                      ? isDark
                        ? '#4ade80'
                        : '#15803d'
                      : isDark
                      ? '#94a3b8'
                      : '#64748b',
                    padding: '2px 8px',
                    borderRadius: 8,
                    fontWeight: 600,
                  }}
                >
                  {config.showSizeColorGrid ? 'Ativo (Moda)' : 'Desativado'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--mute)' }}>
                Ativa suporte no catálogo de produtos e PDV para matriz de variação de tamanho (P, M, G, GG, 36 a 44) e cores para o segmento de vestuário.
              </p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0, cursor: 'pointer', touchAction: 'manipulation' }}>
              <input
                type="checkbox"
                checked={config.showSizeColorGrid}
                onChange={() => handleToggle('showSizeColorGrid')}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: config.showSizeColorGrid ? (isDark ? '#14b8a6' : '#0f766e') : (isDark ? '#334155' : '#cbd5e1'),
                  transition: '0.2s',
                  borderRadius: 24,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: 18,
                    width: 18,
                    left: config.showSizeColorGrid ? 22 : 3,
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

      {showSaveButton ? (
        <footer
          style={{
            background: isDark ? '#131922' : '#f8fafc',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid var(--line)',
            borderRadius: 10,
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <span style={{ fontSize: '0.84rem', color: 'var(--mute)' }}>
            ⚡ As alterações são aplicadas e sincronizadas em tempo real em todas as telas abertas da loja.
          </span>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => showFeedback('Configurações salvas e aplicadas com sucesso!')}
          >
            Confirmar e Salvar
          </button>
        </footer>
      ) : null}
    </div>
  );
}
