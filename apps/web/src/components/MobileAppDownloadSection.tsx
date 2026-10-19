import { useEffect, useState } from 'react';
import { AdminIcon } from './AdminIcons';
import { nestGet } from '../services/nestClient';
import './mobileAppDownload.css';

type MobileDownloadConfig = {
  androidApkUrl: string | null;
  iosInstallUrl: string | null;
  distributionGuideUrl: string;
};

const FALLBACK_GUIDE =
  'https://github.com/MarthiTec/Marthi-Tec/blob/main/apps/mobile/DISTRIBUTION.md';

/** Download do app lojista (Android APK / iOS) — URLs via env da API, sem mocks. */
export function MobileAppDownloadSection() {
  const [config, setConfig] = useState<MobileDownloadConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    nestGet<MobileDownloadConfig>('/mobile/download')
      .then((data) => {
        if (!alive) return;
        setConfig({
          androidApkUrl: data.androidApkUrl?.trim() || null,
          iosInstallUrl: data.iosInstallUrl?.trim() || null,
          distributionGuideUrl: data.distributionGuideUrl?.trim() || FALLBACK_GUIDE,
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
          <p className="mobile-app-dl__lead">APK para sideload em dispositivos de teste da loja.</p>
          {config?.androidApkUrl ? (
            <a
              className="btn btn--primary mobile-app-dl__cta"
              href={config.androidApkUrl}
              target="_blank"
              rel="noreferrer"
            >
              <AdminIcon name="download" />
              Baixar APK Android
            </a>
          ) : (
            <div className="mobile-app-dl__empty" role="status">
              <strong>APK ainda não publicado — configure a URL</strong>
              <p>
                Defina a variável <code>MOBILE_ANDROID_APK_URL</code> no Site Discloud (ou no{' '}
                <code>.env</code> local) com o link HTTPS do APK gerado no EAS. Reinicie o app após
                salvar.
              </p>
              <a className="btn btn--ghost" href={guideUrl} target="_blank" rel="noreferrer">
                Ver passos em DISTRIBUTION.md
              </a>
            </div>
          )}
        </section>

        <section className="mobile-app-dl__platform" aria-labelledby="mobile-app-ios">
          <h3 id="mobile-app-ios">iOS</h3>
          <p className="mobile-app-dl__lead">
            TestFlight interno, Ad Hoc ou link de instalação do EAS — quando disponível.
          </p>
          {config?.iosInstallUrl ? (
            <a
              className="btn btn--primary mobile-app-dl__cta"
              href={config.iosInstallUrl}
              target="_blank"
              rel="noreferrer"
            >
              <AdminIcon name="download" />
              Instalar no iPhone / iPad
            </a>
          ) : (
            <div className="mobile-app-dl__empty" role="status">
              <strong>Link iOS ainda não configurado</strong>
              <p>
                Quando houver build Ad Hoc / TestFlight, defina{' '}
                <code>MOBILE_IOS_INSTALL_URL</code> no Site Discloud. Até lá, use o guia de
                distribuição.
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
          é necessário rebuild do front — reinicie o Site na Discloud após alterar.
        </p>
      </footer>
    </article>
  );
}
