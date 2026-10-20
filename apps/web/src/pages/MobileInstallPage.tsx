import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import './mobileInstall.css';

const GUIDE =
  'https://github.com/MarthiTec/Marthi-Tec/blob/main/apps/mobile/DISTRIBUTION.md';
const EXPO_GO_ANDROID =
  'https://play.google.com/store/apps/details?id=host.exp.exponent';
const EXPO_GO_IOS = 'https://apps.apple.com/app/expo-go/id982107779';
const API = 'https://marthi-totem.discloud.dev';

/**
 * Página pública de acesso ao app lojista enquanto não há APK/TestFlight EAS.
 * Operações aponta MOBILE_*_URL para cá — rótulos honestos “Abrir no Expo Go”.
 */
export function MobileInstallPage() {
  const [params] = useSearchParams();
  const platform = (params.get('platform') || '').toLowerCase();
  const focus = platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'both';

  const title = useMemo(() => {
    if (focus === 'android') return 'Marthi Lojista · Android (Expo Go)';
    if (focus === 'ios') return 'Marthi Lojista · iPhone (Expo Go)';
    return 'Marthi Lojista · acesso de teste';
  }, [focus]);

  return (
    <main className="mobile-install">
      <div className="mobile-install__panel">
        <p className="mobile-install__eyebrow">Marthi · testes internos</p>
        <h1>{title}</h1>
        <p className="mobile-install__lead">
          Ainda <strong>não há APK EAS</strong> nem build iOS Ad Hoc nesta conta Expo. O caminho
          honesto para testar é o <strong>Expo Go</strong> apontando a API{' '}
          <code>{API}</code>.
        </p>

        <ol className="mobile-install__steps">
          <li>
            Instale o Expo Go
            {focus !== 'ios' ? (
              <>
                {' '}
                ·{' '}
                <a href={EXPO_GO_ANDROID} target="_blank" rel="noreferrer">
                  Android
                </a>
              </>
            ) : null}
            {focus !== 'android' ? (
              <>
                {' '}
                ·{' '}
                <a href={EXPO_GO_IOS} target="_blank" rel="noreferrer">
                  iPhone
                </a>
              </>
            ) : null}
          </li>
          <li>
            Na máquina do time: <code>cd apps/mobile && npm install</code>
          </li>
          <li>
            Exporte a API e suba o bundler:
            <pre>
              {`export EXPO_PUBLIC_API_URL=${API}
npx expo start`}
            </pre>
          </li>
          <li>Escaneie o QR do terminal com o Expo Go (câmera do app, não a do sistema no Android).</li>
          <li>Login com a mesma conta MarthiDB do painel web · loja correta · testar Estoque / Entrada / Venda externa / IMEI.</li>
        </ol>

        <div className="mobile-install__cta-row">
          {focus !== 'ios' ? (
            <a className="mobile-install__cta" href={EXPO_GO_ANDROID} target="_blank" rel="noreferrer">
              Abrir Expo Go na Play Store
            </a>
          ) : null}
          {focus !== 'android' ? (
            <a className="mobile-install__cta mobile-install__cta--ghost" href={EXPO_GO_IOS} target="_blank" rel="noreferrer">
              Abrir Expo Go na App Store
            </a>
          ) : null}
          <a className="mobile-install__cta mobile-install__cta--ghost" href={GUIDE} target="_blank" rel="noreferrer">
            Guia EAS / APK (DISTRIBUTION.md)
          </a>
        </div>

        <p className="mobile-install__note">
          Quando existir build <code>eas build --profile preview</code>, troque{' '}
          <code>MOBILE_ANDROID_APK_URL</code> / <code>MOBILE_IOS_INSTALL_URL</code> pelos links EAS
          reais e reinicie o Site — o painel passa a mostrar “Baixar APK” / TestFlight.
        </p>
      </div>
    </main>
  );
}
