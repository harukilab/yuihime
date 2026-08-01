import os
import argparse

def main():
    parser = argparse.ArgumentParser(
        description="Scan repo untuk semua panggilan db.prepare() (audit titik akses DB)"
    )
    parser.add_argument("--root", default=".", help="Direktori proyek yang dipindai (default: direktori saat ini)")
    parser.add_argument("--ext", default=".ts", help="Ekstensi file yang dipindai (default: .ts)")
    args = parser.parse_args()

    ROOT = os.path.abspath(args.root)
    EXTS = tuple(e.strip() for e in args.ext.split(',') if e.strip())

    findings = []

    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in ('node_modules', 'dist', '.git', 'web/dist')]
        for fn in filenames:
            if fn.endswith(EXTS):
                path = os.path.join(dirpath, fn)
                try:
                    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                        for lineno, line in enumerate(f, 1):
                            if 'db.prepare(' in line:
                                findings.append((path[len(ROOT)+1:], lineno, line.rstrip()))
                except Exception as e:
                    findings.append((path[len(ROOT)+1:], 0, f'ERROR: {e}'))

    if findings:
        print(f'FOUND {len(findings)} db.prepare() occurrences:\n')
        for relpath, lineno, text in findings:
            print(f'  {relpath}\n    Line {lineno}: {text}\n')
    else:
        print('No more db.prepare() calls found.')

if __name__ == '__main__':
    main()
