import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Erro capturado na árvore React:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearCacheAndReload = () => {
    try {
      localStorage.removeItem('marthi.attributes.v1');
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '50vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--ink, #1e293b)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              marginBottom: 16,
            }}
          >
            ⚠️
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: 8 }}>
            {this.props.fallbackTitle ?? 'Ops! Ocorreu um problema ao carregar este conteúdo.'}
          </h2>
          <p
            style={{
              color: 'var(--mute, #64748b)',
              fontSize: '0.95rem',
              maxWidth: 460,
              lineHeight: 1.5,
              marginBottom: 24,
            }}
          >
            {this.state.error?.message ??
              'Ocorreu uma falha inesperada durante a exibição. Clique no botão abaixo para tentar recarregar.'}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={this.handleReload}
              style={{ minWidth: 140 }}
            >
              Recarregar página
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={this.handleClearCacheAndReload}
              style={{ minWidth: 140 }}
            >
              Limpar cache e restaurar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
