import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type StackEntry = { id: number; handler: () => void };

type PageBackCtxValue = {
  handler: (() => void) | null;
  push: (id: number, handler: () => void) => void;
  pop: (id: number) => void;
};

const PageBackCtx = createContext<PageBackCtxValue>({
  handler: null,
  push: () => undefined,
  pop: () => undefined,
});

/** Envolve layout (header + outlet) para o Voltar do shell fechar fichas abertas. */
export function PageBackProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<StackEntry[]>([]);
  const [handler, setHandler] = useState<(() => void) | null>(null);

  const sync = useCallback(() => {
    const top = stackRef.current[stackRef.current.length - 1];
    setHandler(() => (top ? top.handler : null));
  }, []);

  const push = useCallback(
    (id: number, next: () => void) => {
      stackRef.current = [...stackRef.current.filter((entry) => entry.id !== id), { id, handler: next }];
      sync();
    },
    [sync],
  );

  const pop = useCallback(
    (id: number) => {
      stackRef.current = stackRef.current.filter((entry) => entry.id !== id);
      sync();
    },
    [sync],
  );

  const value = useMemo(() => ({ handler, push, pop }), [handler, push, pop]);
  return <PageBackCtx.Provider value={value}>{children}</PageBackCtx.Provider>;
}

export function usePageBackHandlerState() {
  return useContext(PageBackCtx).handler;
}

let nextBackId = 1;

/**
 * Quando a ficha está aberta, o Voltar do shell chama `onBack` em vez do histórico.
 * Usa pilha: drawers aninhados não apagam o handler da ficha-pai.
 * Inativo (`null`) não mexe na pilha.
 */
export function usePageBackHandler(onBack: (() => void) | null) {
  const { push, pop } = useContext(PageBackCtx);
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = nextBackId++;
  const ref = useRef(onBack);
  ref.current = onBack;
  const active = onBack != null;

  useEffect(() => {
    if (!active) return;
    const id = idRef.current;
    const wrap = () => {
      ref.current?.();
    };
    push(id, wrap);
    return () => pop(id);
  }, [active, push, pop]);
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
