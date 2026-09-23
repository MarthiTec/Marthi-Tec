#!/usr/bin/env bash
set -euo pipefail
git checkout 13b0ce893a9b9f2534055f5c797509a2c2519fbd -- apps/web/src/pages/caixa/CaixaPage.tsx
cat .restore/caixa-patch-*.txt > /tmp/caixa_restore.patch
git apply --verbose /tmp/caixa_restore.patch
python3 - <<'PY'
from pathlib import Path
t = Path('apps/web/src/pages/caixa/CaixaPage.tsx').read_text(encoding='utf-8')
need = [
    'Estoque r\u00e1pido',
    'caixa-app__ops-drawer',
    'F2 \u00b7 Confirmar venda',
    'CaixaPaymentSplit',
    'Alt+P',
    'enqueueKitchenOrder',
    'pdv__cart-table',
]
miss = [n.encode('utf-8').decode('unicode_escape') if '\\u' in n else n for n in need]
# need already has escaped sequences as real unicode from the source above if we decode:
need_real = [x.encode().decode('unicode_escape') if '\\u' in repr(x) else x for x in need]
need_real = [bytes(s, 'utf-8').decode('unicode_escape') if '\\u' in s else s for s in [
    'Estoque r\u00e1pido',
    'caixa-app__ops-drawer',
    'F2 \u00b7 Confirmar venda',
    'CaixaPaymentSplit',
    'Alt+P',
    'enqueueKitchenOrder',
    'pdv__cart-table',
]]
miss = [n for n in need_real if n not in t]
if miss:
    raise SystemExit('missing ' + str(miss))
print('ok', t.count(chr(10)), len(t.encode()))
PY
rm -rf .restore .github/workflows/restore-caixa-page.yml
git config user.name MarthiTec
git config user.email marthi.tecnologia@gmail.com
git add -A
git commit -m "Restore full CaixaPage with cart, ops drawer, and payment split"
git push
