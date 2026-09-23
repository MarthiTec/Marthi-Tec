#!/usr/bin/env bash
set -euxo pipefail
git checkout 13b0ce893a9b9f2534055f5c797509a2c2519fbd -- apps/web/src/pages/caixa/CaixaPage.tsx
cat .restore/caixa-patch-00.txt .restore/caixa-patch-01.txt .restore/caixa-patch-02.txt .restore/caixa-patch-03.txt .restore/caixa-patch-04.txt > /tmp/caixa_restore.patch
wc -c /tmp/caixa_restore.patch
git apply --verbose /tmp/caixa_restore.patch
grep -F "caixa-app__ops-drawer" apps/web/src/pages/caixa/CaixaPage.tsx
grep -F "CaixaPaymentSplit" apps/web/src/pages/caixa/CaixaPage.tsx
grep -F "pdv__cart-table" apps/web/src/pages/caixa/CaixaPage.tsx
grep -F "enqueueKitchenOrder" apps/web/src/pages/caixa/CaixaPage.tsx
grep -F "Alt+P" apps/web/src/pages/caixa/CaixaPage.tsx
grep -F "Confirmar venda" apps/web/src/pages/caixa/CaixaPage.tsx
wc -l apps/web/src/pages/caixa/CaixaPage.tsx
rm -rf .restore .github/workflows/restore-caixa-page.yml
git config user.name MarthiTec
git config user.email marthi.tecnologia@gmail.com
git add -A
git status
git commit -m "Restore full CaixaPage with cart, ops drawer, and payment split"
git push
