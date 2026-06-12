#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
StashView build script.

Prerequisites:
  - sass CLI: npm install -g sass   (or: npm install --save-dev sass and use npx sass)
  - Python 3.8+

Usage:
  python build.py               # build both targets
  python build.py --target chrome
  python build.py --target firefox
  python build.py --watch       # watch mode (polls every 1s)

Icon regeneration (from icons/icon.svg):
  Option A — cairosvg (requires Cairo native DLL; works on macOS/Linux out of the box):
    pip install cairosvg
    python -c "
    import cairosvg
    for sz in [16, 32, 48, 128]:
        cairosvg.svg2png(url='icons/icon.svg', write_to=f'icons/icon{sz}.png', output_width=sz, output_height=sz)
    "
  Option B — Inkscape CLI (cross-platform):
    inkscape icons/icon.svg --export-type=png --export-width=128 --export-filename=icons/icon128.png
  Option C — any other SVG-to-PNG tool (rsvg-convert, sharp-cli, etc.)
  Option D — Pillow Pythonic redraw (no native deps, already committed as source):
"""

import argparse
import json
import shutil
import subprocess
import sys
# Force UTF-8 output on Windows so build messages with unicode symbols render correctly.
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
import time
import zipfile
from pathlib import Path

ROOT    = Path(__file__).parent
SRC_JS  = ROOT / 'src' / 'js'
SRC_CSS = ROOT / 'src' / 'styles'
DIST    = ROOT / 'dist'
RELEASE = ROOT / 'release'

SCSS_ENTRIES = [
    (SRC_CSS / 'main.scss',  ROOT / 'src' / 'styles' / 'styles.css'),
    (SRC_CSS / 'popup.scss', ROOT / 'src' / 'styles' / 'popup.css'),
]
# Keep single alias for watch mtime scanning
SCSS_ENTRY = SRC_CSS / 'main.scss'
CSS_OUT    = ROOT / 'src' / 'styles' / 'styles.css'

COPY_FILES = [
    'panel.html',
    'popup.html',
    'devtools.html',
    'devtools.js',
    'background.js',
    'src/styles/styles.css',
    'src/styles/popup.css',
    'src/js/panel.js',
    'src/js/popup.js',
    'src/js/tabs/local.js',
    'src/js/tabs/session.js',
    'src/js/tabs/cookies.js',
    'src/js/tabs/indexeddb.js',
    'src/js/components/json-tree.js',
    'src/js/lib/inspected-page.js',
    'src/js/lib/active-tab.js',
    'src/js/lib/format.js',
    'src/js/lib/browser-polyfill.js',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png',
    'icons/icon16-light.png',
    'icons/icon32-light.png',
    'icons/icon48-light.png',
    'icons/icon128-light.png',
]


def compile_scss():
    for entry, out in SCSS_ENTRIES:
        result = subprocess.run(
            f'sass "{entry}" "{out}" --no-source-map --style=compressed',
            capture_output=True, text=True, shell=True
        )
        if result.returncode != 0:
            print(f'SCSS error ({entry.name}):\n{result.stderr}', file=sys.stderr)
            return False
    print('  ✓ SCSS compiled')
    return True


def load_manifest(target: str) -> dict:
    base = json.loads((ROOT / 'manifest.base.json').read_text(encoding='utf-8'))
    # Remove internal comment key before merging
    base.pop('_permission_notes', None)
    override_path = ROOT / f'manifest.{target}.json'
    override = json.loads(override_path.read_text(encoding='utf-8'))
    merged = {**base, **override}
    return merged


def build_target(target: str):
    print(f'\n[{target}] Building…')
    out_dir = DIST / target
    out_dir.mkdir(parents=True, exist_ok=True)

    # Copy files
    for rel in COPY_FILES:
        src = ROOT / rel
        dst = out_dir / rel
        if not src.exists():
            print(f'  ⚠  Missing: {rel}')
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    print(f'  ✓ Files copied ({len(COPY_FILES)} entries)')

    # Write manifest
    manifest = load_manifest(target)
    (out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'  ✓ manifest.json written (v{manifest["version"]})')

    # Zip
    RELEASE.mkdir(exist_ok=True)
    version = manifest['version']
    zip_path = RELEASE / f'stashview-{target}-v{version}.zip'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file in out_dir.rglob('*'):
            if file.is_file():
                zf.write(file, file.relative_to(out_dir))
    print(f'  ✓ Zipped → {zip_path.relative_to(ROOT)}')


def build(targets):
    if not compile_scss():
        sys.exit(1)
    for t in targets:
        build_target(t)
    print('\nDone.')


def watch(targets):
    print('Watch mode — polling every 1s. Ctrl+C to stop.')
    scss_mtime = 0
    js_mtime   = 0
    while True:
        try:
            new_scss = max((f.stat().st_mtime for f in SRC_CSS.rglob('*.scss')), default=0)
            new_js   = max((f.stat().st_mtime for f in SRC_JS.rglob('*.js')),   default=0)
            if new_scss != scss_mtime or new_js != js_mtime:
                scss_mtime, js_mtime = new_scss, new_js
                print(f'\n[{time.strftime("%H:%M:%S")}] Change detected, rebuilding…')
                build(targets)
            time.sleep(1)
        except KeyboardInterrupt:
            print('\nWatch stopped.')
            break


def main():
    parser = argparse.ArgumentParser(description='Build StashView extension')
    parser.add_argument('--target', choices=['chrome', 'firefox', 'all'], default='all')
    parser.add_argument('--watch', action='store_true', help='Watch for changes')
    args = parser.parse_args()

    targets = ['chrome', 'firefox'] if args.target == 'all' else [args.target]

    if args.watch:
        watch(targets)
    else:
        build(targets)


if __name__ == '__main__':
    main()
