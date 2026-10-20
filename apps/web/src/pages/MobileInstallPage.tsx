import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import './mobileInstall.css';

const GUIDE =
  'https://github.com/MarthiTec/Marthi-Tec/blob/main/apps/mobile/DISTRIBUTION.md';
const EXPO_GO_ANDROID =
  'https://play.google.com/store/apps/details?id=host.exp.exponent';
const EXPO_GO_IOS = 'https://apps.apple.com/app/expo-go/id982107779';
const API = 'https://marthi-totem.discloud.dev';

/**
 * Live Expo Go deep link (tunnel / EAS Update).
 * Prefer build-time `VITE_EXPO_DEV_CLIENT_URL` (Discloud Site env at BUILD).
 * Fallback keeps Operações → /app-lojista usable while the agent tunnel is up.
 */
const BUILD_TIME_EXPO =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_EXPO_DEV_CLIENT_URL) ||
  '';

const FALLBACK_LIVE_EXPO =
  'https://expo.dev/go?url=exp%3A%2F%2Fr2kxexq-anonymous-8081.exp.direct%3A80';

function isSelfAppLojista(url: string | null | undefined): boolean {
  return String(url || '').includes('/app-lojista');
}

function isLiveExpoUrl(url: string | null | undefined): boolean {
  const u = String(url || '').trim().toLowerCase();
  if (!u || isSelfAppLojista(u)) return false;
  return (
    u.startsWith('exp://') ||
    u.startsWith('exps://') ||
    u.includes('expo.dev/go') ||
    u.includes('.exp.direct')
  );
}

type DownloadPayload = {
  androidApkUrl?: string | null;
  iosInstallUrl?: string | null;
  expoDevClientUrl?: string | null;
};

/**
 * Página pública de acesso ao app lojista enquanto não há APK/TestFlight EAS.
 * Preferência: deep link vivo no Expo Go (tunnel / EXPO_DEV_CLIENT_URL).
 */
export function MobileInstallPage() {
  const [params] = useSearchParams();
  const platform = (params.get('platform') || '').toLowerCase();
  const focus = platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'both';
  const [remote, setRemote] = useState<DownloadPayload | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/mobile/download')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!alive || !body?.data) return;
        setRemote({
          androidApkUrl: body.data.androidApkUrl ?? null,
          iosInstallUrl: body.data.iosInstallUrl ?? null,
          expoDevClientUrl: body.data.expoDevClientUrl ?? null,
        });
      })
      .catch(() => {
        /* página pública ainda funciona com fallback de tunnel */
      });
    return () => {
      alive = false;
    };
  }, []);

  const liveUrl = useMemo(() => {
    const candidates = [
      BUILD_TIME_EXPO.trim(),
      String(remote?.expoDevClientUrl || '').trim(),
      focus === 'ios'
        ? String(remote?.iosInstallUrl || '').trim()
        : String(remote?.androidApkUrl || '').trim(),
      String(remote?.androidApkUrl || '').trim(),
      String(remote?.iosInstallUrl || '').trim(),
      FALLBACK_LIVE_EXPO,
    ];
    return candidates.find((u) => isLiveExpoUrl(u)) || FALLBACK_LIVE_EXPO;
  }, [focus, remote]);

  const title = useMemo(() => {
    if (focus === 'android') return 'Marthi Lojista · Android (Expo Go)';
    if (focus === 'ios') return 'Marthi Lojista · iPhone (Expo Go)';
    return 'Marthi Lojista · abrir no Expo Go';
  }, [focus]);

  return (
    <main className="mobile-install">
      <div className="mobile-install__panel">
        <p className="mobile-install__eyebrow">Marthi · testes internos</p>
        <h1>{title}</h1>
        <p className="mobile-install__lead">
          Abra o app no <strong>Expo Go</strong> no celular (API{' '}
          <code>{API}</code>). Login com a mesma conta MarthiDB do painel web.
        </p>

        <div className="mobile-install__cta-row">
          <a className="mobile-install__cta" href={liveUrl}>
            Abrir no Expo Go
          </a>
          {focus !== 'ios' ? (
            <a className="mobile-install__cta mobile-install__cta--ghost" href={EXPO_GO_ANDROID} target="_blank" rel="noreferrer">
              Instalar Expo Go (Android)
            </a>
          ) : null}
          {focus !== 'android' ? (
            <a className="mobile-install__cta mobile-install__cta--ghost" href={EXPO_GO_IOS} target="_blank" rel="noreferrer">
              Instalar Expo Go (iPhone)
            </a>
          ) : null}
        </div>

        <p className="mobile-install__lead">
          No celular, toque em <strong>Abrir no Expo Go</strong> (ou escaneie o QR do tunnel). No
          Android, use a câmera do Expo Go se o navegador não abrir o deep link.
        </p>

        <details className="mobile-install__details">
          <summary>Deep link / URL do bundler</summary>
          <pre className="mobile-install__pre-link">{liveUrl}</pre>
          <p className="mobile-install__note">
            Tunnel Expo (ngrok/exp.direct) fica ativo enquanto a VM do agente estiver ligada. Se o
            link morrer, o próximo passo estável é <strong>EAS Update</strong> / build preview.
          </p>
        </details>

        <details className="mobile-install__details">
          <summary>Desenvolvimento local (time)</summary>
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
              Exporte a API e suba com tunnel público:
              <pre>
                {`export EXPO_PUBLIC_API_URL=${API}
npx expo start --tunnel`}
              </pre>
            </li>
            <li>Escaneie o QR do terminal com o Expo Go.</li>
            <li>Login MarthiDB · loja correta · Estoque / Entrada / Venda externa / IMEI.</li>
          </ol>
          <a className="mobile-install__cta mobile-install__cta--ghost" href={GUIDE} target="_blank" rel="noreferrer">
            Guia EAS / APK (DISTRIBUTION.md)
          </a>
        </details>

        <p className="mobile-install__note">
          Variáveis Site: <code>EXPO_DEV_CLIENT_URL</code>, <code>VITE_EXPO_DEV_CLIENT_URL</code>,{' '}
          <code>MOBILE_ANDROID_APK_URL</code>, <code>MOBILE_IOS_INSTALL_URL</code>. Quando existir
          APK EAS, troque os <code>MOBILE_*</code> pelos artefatos reais.
        </p>
      </div>
    </main>
  );
}
