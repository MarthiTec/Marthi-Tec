import { StoreSegmentSettings } from '../../components/StoreSegmentSettings';

export function StoreSegmentPage() {
  return (
    <div className="admin-page">
      <article className="admin-card">
        <StoreSegmentSettings
          title="Ramo da Loja & Personalização de Campos"
          lead="Configure o segmento de atuação da loja para adequar automaticamente os campos e módulos da sua operação."
          showSaveButton={true}
        />
      </article>
    </div>
  );
}
