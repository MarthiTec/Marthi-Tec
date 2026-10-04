import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { useEffect, useRef, useState } from 'react';

type GoogleSignInButtonProps = {
  clientId: string;
  disabled?: boolean;
  onSuccess: (idToken: string) => void;
  onError: (message: string) => void;
};

export function GoogleSignInButton({
  clientId,
  disabled,
  onSuccess,
  onError,
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(240);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(Math.min(352, entry.contentRect.width)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [clientId]);

  if (!clientId) {
    return (
      <button type="button" className="btn btn--google btn--block" disabled>
        Continuar com Google
      </button>
    );
  }

  return (
    <div ref={containerRef} className={`google-btn ${disabled ? 'google-btn--disabled' : ''}`}>
      <GoogleOAuthProvider clientId={clientId}>
        <GoogleLogin
          onSuccess={(response) => {
            if (!response.credential) {
              onError('Google não retornou credencial.');
              return;
            }
            onSuccess(response.credential);
          }}
          onError={() => onError('Falha ao autenticar com Google.')}
          theme="outline"
          size="large"
          width={String(width)}
          text="continue_with"
          shape="pill"
          logo_alignment="left"
        />
      </GoogleOAuthProvider>
    </div>
  );
}
