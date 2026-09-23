import { useEffect, useId } from 'react';
import { MARTHI_COMPANY } from '../../data/companyContact';

type TotemFooterProps = {
  hint: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Rodapé do totem — um botão Contato abre painel central com texto sobre a Marthi
 * e contatos (sem links, para o quiosque não abrir navegador externo).
 */
export function TotemFooter({ hint, open, onOpenChange }: TotemFooterProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <>
      <footer className="totem-foot">
        <p className="totem-foot__hint">{hint}</p>
        <div className="totem-foot__actions">
          <button
            type="button"
            className={`totem-foot__btn${open ? ' is-active' : ''}`}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => onOpenChange(!open)}
          >
            Contato
          </button>
        </div>
      </footer>

      {open ? (
        <div className="totem-foot-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <button
            type="button"
            className="totem-foot-sheet__backdrop"
            aria-label="Fechar"
            onClick={() => onOpenChange(false)}
          />
          <div className="totem-foot-sheet__card">
            <header className="totem-foot-sheet__head">
              <h2 id={titleId}>Contato</h2>
              <button type="button" className="totem-foot-sheet__close" onClick={() => onOpenChange(false)}>
                Fechar
              </button>
            </header>

            <div className="totem-foot-sheet__body">
              <p className="totem-foot-sheet__lead">
                A <strong>{MARTHI_COMPANY.legalName}</strong> desenvolve soluções de atendimento,
                PDV e totem para lojas — para o cliente explorar produtos com autonomia e a equipe
                concluir a venda com agilidade.
              </p>
              <p>
                Estamos em <strong>{MARTHI_COMPANY.addressLine}</strong>. Se precisar de suporte
                sobre este totem ou sobre a plataforma, anote um dos canais abaixo e fale com a
                nossa equipe.
              </p>

              <div className="totem-foot-sheet__block">
                <span>WhatsApp</span>
                <strong>{MARTHI_COMPANY.whatsappDisplay}</strong>
              </div>
              <div className="totem-foot-sheet__block">
                <span>E-mail</span>
                <strong>{MARTHI_COMPANY.email}</strong>
              </div>
              <div className="totem-foot-sheet__block">
                <span>Instagram</span>
                <strong>@{MARTHI_COMPANY.instagramHandle}</strong>
              </div>
              <div className="totem-foot-sheet__block">
                <span>Endereço</span>
                <strong>{MARTHI_COMPANY.addressLine}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
