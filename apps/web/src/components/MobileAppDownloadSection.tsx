import { useEffect, useState } from 'react';
import { AdminIcon } from './AdminIcons';
import { nestGet } from '../services/nestClient';
import {
  androidInstallCtaLabel,
  androidInstallLead,
  detectMobileInstallChannel,
  iosInstallCtaLabel,
  iosInstallLead,
  type MobileInstallChannel,
} from '../lib/mobileInstallChannel';
import './mobileAppDownload.css';

type MobileDownloadConfig = {
  androidApkUrl: string | null;
  iosInstallUrl: string | null;
  distributionGuideUrl: string;
  androidChannel?: MobileInstallChannel;
  iosChannel?: MobileInstallChannel;
};

const FALLBACK_GUIDE =
  'https://github.com/MarthiTec/Marthi-Tec/blob/main/apps/mobile/DISTRIBUTION.md';

/** Download do app lojista (Android APK / iOS / Expo Go) — URLs via env da API, sem mocks. */
export function MobileAppDownloadSection() {
  const [config, setConfig] = useState<MobileDownloadConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    nestGet<MobileDownloadConfig>('/mobile/download')
      .then((data) => {
        if (!alive) return;
        const androidApkUrl = data.androidApkUrl?.trim() || null;
        const iosInstallUrl = data.iosInstallUrl?.trim() || null;
        setConfig({
          androidApkUrl,
          iosInstallUrl,
          distributionGuideUrl: data.distributionGuideUrl?.trim() || FALLBACK_GUIDE,
          androidChannel: data.androidChannel || detectMobileInstallChannel(androidApkUrl),
          iosChannel: data.iosChannel || detectMobileInstallChannel(iosInstallUrl),
        });
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os links do app.');
        setConfig({
          androidApkUrl: null,
          iosInstallUrl: null,
          distributionGuideUrl: FALLBACK_GUIDE,
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  const guideUrl = config?.distributionGuideUrl || FALLBACK_GUIDE;
  const loading = config === null && !error;
  const androidChannel = config?.androidChannel || detectMobileInstallChannel(config?.androidApkUrl);
  const iosChannel = config?.iosChannel || detectMobileInstallChannel(config?.iosInstallUrl);

  return (
    <article className="admin-card mobile-app-dl">
      <header className="mobile-app-dl__head">
        <div className="mobile-app-dl__title-row">
          <span className="mobile-app-dl__icon" aria-hidden>
            <AdminIcon name="smartphone" />
          </span>
          <div>
            <h2>Download do App</h2>
            <p>
              App Marthi Lojista para a equipe no celular. Instalação interna (sem Play Store /
              App Store nesta fase).
            </p>
          </div>
        </div>
      </header>

      {loading ? <p className="mobile-app-dl__status">Carregando links de instalação…</p> : null}
      {error ? <p className="mobile-app-dl__status mobile-app-dl__status--warn">{error}</p> : null}

      <div className="mobile-app-dl__grid">
        <section className="mobile-app-dl__platform" aria-labelledby="mobile-app-android">
          <h3 id="mobile-app-android">Android</h3>
          <p className="mobile-app-dl__lead">{androidInstallLead(androidChannel)}</p>
          {config?.androidApkUrl ? (
            <a
              className="btn btn--primary mobile-app-dl__cta"
              href={config.androidApkUrl}
              target="_blank"
              rel="noreferrer"
            >
              <AdminIcon name="download" />
              {androidInstallCtaLabel(androidChannel)}
            </a>
          ) : (
            <div className="mobile-app-dl__empty" role="status">
              <strong>APK ainda não publicado — configure a URL</strong>
              <p>
                Defina a variável <code>MOBILE_ANDROID_APK_URL</code> no Site Discloud (ou no{' '}
                <code>.env</code> local) com o link HTTPS do APK (EAS) ou, enquanto isso, a página{' '}
                <code>/app-lojista?platform=android</code> (Expo Go). Reinicie o app após salvar.
              </p>
              <a className="btn btn--ghost" href={guideUrl} target="_blank" rel="noreferrer">
                Ver passos em DISTRIBUTION.md
              </a>
            </div>
          )}
        </section>

        <section className="mobile-app-dl__platform" aria-labelledby="mobile-app-ios">
          <h3 id="mobile-app-ios">iOS</h3>
          <p className="mobile-app-dl__lead">{iosInstallLead(iosChannel)}</p>
          {config?.iosInstallUrl ? (
            <a
              className="btn btn--primary mobile-app-dl__cta"
              href={config.iosInstallUrl}
              target="_blank"
              rel="noreferrer"
            >
              <AdminIcon name="download" />
              {iosInstallCtaLabel(iosChannel)}
            </a>
          ) : (
            <div className="mobile-app-dl__empty" role="status">
              <strong>Link iOS ainda não configurado</strong>
              <p>
                Quando houver build Ad Hoc / TestFlight, defina{' '}
                <code>MOBILE_IOS_INSTALL_URL</code> no Site Discloud. Até lá, use{' '}
                <code>/app-lojista?platform=ios</code> (Expo Go) ou o guia de distribuição.
              </p>
              <a className="btn btn--ghost" href={guideUrl} target="_blank" rel="noreferrer">
                Ver passos em DISTRIBUTION.md
              </a>
            </div>
          )}
        </section>
      </div>

      <footer className="mobile-app-dl__foot">
        <p>
          Variáveis: <code>MOBILE_ANDROID_APK_URL</code>, <code>MOBILE_IOS_INSTALL_URL</code>. Não
          é necessário rebuild do front — reinicie o Site na Discloud após alterar. Rótulos
          distinguem APK real vs “Abrir no Expo Go”.
        </p>
      </footer>
    </article>
  );
}
