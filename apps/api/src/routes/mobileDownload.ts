import { Router } from 'express';
import { env } from '../config/env.js';

/** Links públicos de instalação do app lojista (env Discloud / local). */
export const mobileDownloadRouter = Router();

const DISTRIBUTION_GUIDE_URL =
  'https://github.com/MarthiTec/Marthi-Tec/blob/main/apps/mobile/DISTRIBUTION.md';

mobileDownloadRouter.get('/api/v1/mobile/download', (_req, res) => {
  res.json({
    success: true,
    data: {
      androidApkUrl: env.MOBILE_ANDROID_APK_URL ?? null,
      iosInstallUrl: env.MOBILE_IOS_INSTALL_URL ?? null,
      distributionGuideUrl: DISTRIBUTION_GUIDE_URL,
    },
  });
});
