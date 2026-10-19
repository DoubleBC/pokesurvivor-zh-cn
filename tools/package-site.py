"""Package the translated static game for GitHub Pages or an ordinary web server.

The allowlist intentionally excludes Git metadata, development tools, caches,
local launchers, and the upstream CNAME. Existing output is never removed.
"""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
STATIC_DIRS = ('assets', 'css', 'js')
STATIC_FILES = ('index.html', 'sw.js', 'manifest.webmanifest', 'favicon.ico',
                'LICENSE', 'LICENSE-NONCOMMERCIAL.md', 'CREDITS.md', '.nojekyll', 'version.json', 'release.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', help='New staging directory; must not already exist.')
    parser.add_argument('--no-zip', action='store_true', help='Stage files only (for GitHub Pages).')
    args = parser.parse_args()
    subprocess.run(['node', str(ROOT / 'tools/build-local.js')], cwd=ROOT, check=True)
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    if args.output:
        output = Path(args.output).resolve()
        output.mkdir(parents=True, exist_ok=False)
    else:
        output = Path(tempfile.mkdtemp(prefix='web-', dir=dist))
    for directory in STATIC_DIRS:
        shutil.copytree(ROOT / directory, output / directory,
                        ignore=shutil.ignore_patterns('app.min.js', '*.map', '__pycache__'))
    for file in STATIC_FILES:
        shutil.copy2(ROOT / file, output / file)
    # site-config.js/local-config.js supply this edition's own cloud settings.
    (output / 'js/core/firebase-config.js').write_text('G.FIREBASE_CONFIG = null;\n', encoding='utf-8')
    if args.no_zip:
        print(f'Website: {output}')
        return
    archive = dist / 'pokesurvivor-zh-CN-web.zip'
    count = 0
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for file in sorted(output.rglob('*')):
            if file.is_file():
                bundle.write(file, file.relative_to(output).as_posix())
                count += 1
    print(f'Website: {output}')
    print(f'Archive: {archive}')
    print(f'{count} files; {archive.stat().st_size / 1024 / 1024:.1f} MiB compressed.')


if __name__ == '__main__':
    main()
