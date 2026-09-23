#!/usr/bin/env bash
set -euo pipefail
git checkout 13b0ce893a9b9f2534055f5c797509a2c2519fbd -- apps/web/src/pages/caixa/CaixaPage.tsx
cat .restore/caixa-patch-00.txt .restore/caixa-patch-01.txt .restore/caixa-patch-02.txt .restore/caixa-patch-03.txt .restore/caixa-patch-04.txt > /tmp/caixa_restore.patch
git apply --verbose /tmp/caixa_restore.patch
python3 -c 'from pathlib import Path; t=Path("apps/web/src/pages/caixa/CaixaPage.tsx").read_text(encoding="utf-8"); need=["Estoque r\u00e1pido","caixa-app__ops-drawer","F2 \u00b7 Confirmar venda","CaixaPaymentSplit","Alt+P","enqueueKitchenOrder","pdv__cart-table"]; miss=[n for n in need if n not in t];
raise SystemExit("missing "+str(miss)) if miss else print("ok", t.count(chr(10)), len(t.encode()))'
rm -rf .restore .github/workflows/restore-caixa-page.yml
git config user.name MarthiTec
git config user.email marthi.tecnologia@gmail.com
git add -A
git commit -m "Restore full CaixaPage with cart, ops drawer, and payment split"
git push
