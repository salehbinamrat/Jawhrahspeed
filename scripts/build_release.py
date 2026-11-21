#!/usr/bin/env python3
"""Validate and reproducibly package MikroTik Hotspot files (stdlib only)."""
import argparse
import hashlib
import re
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
DATE = '2026-11-21'
VERSION = 'r8'
HTML = ('index.html', 'login.html', 'flogin.html', 'alogin.html',
        'logout.html', 'flogout.html', 'status.html', 'fstatus.html',
        'error.html', 'redirect.html')
ASSETS = ('css/style.css', 'css/legacy.css', 'js/portal.core.js',
          'font/Almarai.woff2', 'font/fontello-used.woff')
DEPLOY = tuple(sorted(HTML + ASSETS))
EXTRA = ('README.md', '.github/workflows/hotspot-checks.yml',
         'scripts/build_release.py', 'scripts/browser_smoke.py')


def validate():
    expected = DEPLOY + EXTRA
    for item in expected:
        path = ROOT / item
        if not path.is_file() or path.is_symlink() or path.stat().st_size == 0:
            raise ValueError(f'Required non-empty regular file missing: {item}')
    for folder in ('tests',):
        if not list((ROOT / folder).glob('*.test.js')):
            raise ValueError(f'Missing Node regression tests: {folder}')
    index = (ROOT / 'index.html').read_text(encoding='utf-8')
    links = re.findall(r'(?:src|href)="((?:css|js|font)/[^"?]+)', index)
    for link in links:
        if link not in DEPLOY:
            raise ValueError(f'Unpackaged asset in index.html: {link}')
    if index.index('css/legacy.css') > index.index('css/style.css'):
        raise ValueError('Legacy CSS must load before the modern stylesheet')
    for name in HTML:
        text = (ROOT / name).read_text(encoding='utf-8')
        if '\ufeff' in text:
            raise ValueError(f'Unexpected BOM in Hotspot file: {name}')
    if '$(link-login-only)' not in index:
        raise ValueError('Native RouterOS login form has been removed')
    if not all(f'{port}' in index for port in ('62021', '62022', '62024')):
        raise ValueError('Existing speed selectors or ports have changed')
    print(f'VALIDATED {len(DEPLOY)} router files, all original HTML endpoints and speed ports')


def write_zip(output: Path, paths):
    with ZipFile(output, 'w', compression=ZIP_DEFLATED, compresslevel=9) as z:
        for name in sorted(paths):
            data = (ROOT / name).read_bytes()
            info = ZipInfo(name, (2026, 11, 21, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data, compress_type=ZIP_DEFLATED, compresslevel=9)
    with ZipFile(output) as z:
        if z.testzip() is not None or set(z.namelist()) != set(paths):
            raise ValueError(f'Built archive verification failed: {output}')


def build(outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)
    source = sorted(set(DEPLOY + EXTRA + tuple(
        f'tests/{p.name}' for p in (ROOT / 'tests').glob('*.test.js'))))
    names = {
        f'Jawhrahspeed_Hotspot_{VERSION}_{DATE}.zip': DEPLOY,
        f'Jawhrahspeed_Source_{VERSION}_{DATE}.zip': source,
    }
    hashes = []
    for name, files in names.items():
        output = outdir / name
        write_zip(output, files)
        sha256 = hashlib.sha256(output.read_bytes()).hexdigest()
        hashes.append(f'{sha256}  {name}')
        print(f'BUILT {name} ({len(files)} files; {output.stat().st_size} bytes) SHA256 {sha256}')
    (outdir / 'SHA256SUMS').write_text('\n'.join(hashes) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only', action='store_true')
    parser.add_argument('--out-dir', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    validate()
    if not args.check_only:
        build(args.out_dir)


if __name__ == '__main__':
    main()
