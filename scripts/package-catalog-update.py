from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
files = [root / name for name in ('index.js', 'package.json', 'package-lock.json', 'discloud.config')]
for directory in ('dist', 'apps/api/src', 'apps/web/src', 'apps/web/public'):
    files.extend(path for path in (root / directory).rglob('*') if path.is_file())
for app in ('api', 'web'):
    files.extend(path for path in (root / 'apps' / app).glob('tsconfig*.json'))
    files.append(root / 'apps' / app / 'package.json')
files.extend(root / 'apps/web' / name for name in ('index.html', 'vite.config.ts', 'package-lock.json'))
with ZipFile(root / 'marthi-catalog-update.zip', 'w', ZIP_DEFLATED) as archive:
    for path in sorted(set(files)):
        if path.is_file():
            archive.write(path, path.relative_to(root).as_posix())
print('Pacote preparado sem configurações privadas, backups ou arquivos de validação.')
