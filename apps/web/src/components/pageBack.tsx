import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type PageBackCtxValue = {
  handler: (() => void) | null;
  setHandler: (handler: (() => void) | null) => void;
};

const PageBackCtx = createContext<PageBackCtxValue>({
  handler: null,
  setHandler: () => undefined,
});

/** Envolve layout (header + outlet) para o Voltar do shell fechar fichas abertas. */
export function PageBackProvider({ children }: { children: ReactNode }) {
  const [handler, setHandler] = useState<(() => void) | null>(null);
  const value = useMemo(() => ({ handler, setHandler }), [handler]);
  return <PageBackCtx.Provider value={value}>{children}</PageBackCtx.Provider>;
}

export function usePageBackHandlerState() {
  return useContext(PageBackCtx).handler;
}

/**
 * Quando a ficha está aberta, o Voltar do shell chama `onBack` em vez do histórico —
 * evita o segundo ← ao lado de Editar.
 */
export function usePageBackHandler(onBack: (() => void) | null) {
  const { setHandler } = useContext(PageBackCtx);
  const ref = useRef(onBack);
  ref.current = onBack;
  const active = onBack != null;

  useEffect(() => {
    if (!active) {
      setHandler(null);
      return;
    }
    const wrap = () => {
      ref.current?.();
    };
    setHandler(() => wrap);
    return () => setHandler(null);
  }, [active, setHandler]);
}

/** Atalho JSX: registra o handler sem renderizar botão (Voltar fica só no shell). */
export function RegisterPageBack({
  active,
  onBack,
}: {
  active: boolean;
  onBack: () => void;
}) {
  usePageBackHandler(active ? onBack : null);
  return null;
}
