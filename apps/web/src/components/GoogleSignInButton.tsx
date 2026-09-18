import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';

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
  if (!clientId) {
    return (
      <button type="button" className="btn btn--google btn--block" disabled>
        Continuar com Google
      </button>
    );
  }

  return (
    <div className={`google-btn ${disabled ? 'google-btn--disabled' : ''}`}>
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
          width="352"
          text="continue_with"
          shape="pill"
          logo_alignment="left"
        />
      </GoogleOAuthProvider>
    </div>
  );
}
