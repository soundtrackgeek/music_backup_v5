"""Report-only catalog/filesystem inventory; Python standard library only."""
import argparse
import csv
import json
import os
from pathlib import Path
import sqlite3
import stat
import time

AUDIO = {'.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.aiff', '.aif', '.ape', '.wma', '.alac', '.dsf', '.dff', '.wv'}


def key(path):
    value = str(path).replace('/', '\\')
    if value.startswith('\\\\?\\'):
        value = value[4:]
    return value.rstrip('\\').lower()


def within(path, root):
    return path == root or path.startswith(root + '\\')


def run(database, roots, output, pause_ms=2):
    started = time.time()
    output = Path(output)
    roots = [os.path.abspath(r) for r in roots]
    root_keys = [key(r) for r in roots]
    if any(within(a, b) or within(b, a) for i, a in enumerate(root_keys) for b in root_keys[i+1:]):
        raise ValueError('Roots must be distinct and non-overlapping')
    if any(within(key(output.resolve()), r) for r in root_keys):
        raise ValueError('Report directory must be outside the scanned roots')
    output.mkdir(parents=True, exist_ok=False)
    db = sqlite3.connect(output / 'inventory.sqlite3')
    db.executescript('''PRAGMA cache_size=-8192;
        CREATE TABLE catalog(id INTEGER, path TEXT, k TEXT, root INTEGER);
        CREATE TABLE files(k TEXT PRIMARY KEY, path TEXT, root INTEGER, size INTEGER, modified_ns INTEGER, audio INTEGER);
        CREATE TABLE issues(path TEXT, reason TEXT);
    ''')
    source = sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
    source.execute('PRAGMA query_only=ON')
    source.execute('PRAGMA cache_size=-8192')
    source.execute('BEGIN')
    revision = source.execute('SELECT max(id) FROM import_runs WHERE status="completed"').fetchone()[0]
    def catalog_rows():
        for ident, folder, filename in source.execute('SELECT id,file_path,filename FROM tracks'):
            path = os.path.join(folder or '', filename or '')
            normalized = key(path or '')
            root = next((i for i, r in enumerate(root_keys) if within(normalized, r)), -1)
            yield ident, path, normalized, root
    db.executemany('INSERT INTO catalog VALUES(?,?,?,?)', catalog_rows())
    source.rollback()
    source.close()
    db.execute('CREATE INDEX catalog_key ON catalog(k)')
    db.commit()
    coverage = []
    for index, root in enumerate(roots):
        info = dict(root=root, files=0, directories=0, errors=0, complete=False)
        coverage.append(info)
        pending = [root]
        while pending:
            folder = pending.pop()
            try:
                if os.path.islink(folder) or (os.stat(folder, follow_symlinks=False).st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT if os.name == 'nt' else False):
                    raise OSError('Reparse point skipped')
                with os.scandir(folder) as entries:
                    info['directories'] += 1
                    for entry in entries:
                        try:
                            metadata = entry.stat(follow_symlinks=False)
                            if entry.is_symlink() or getattr(metadata, 'st_file_attributes', 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                                raise OSError('Reparse point skipped')
                            if entry.is_dir(follow_symlinks=False):
                                pending.append(entry.path)
                            elif entry.is_file(follow_symlinks=False):
                                db.execute('INSERT INTO files VALUES(?,?,?,?,?,?)', (key(entry.path), entry.path, index, metadata.st_size, metadata.st_mtime_ns, int(Path(entry.name).suffix.lower() in AUDIO)))
                                info['files'] += 1
                        except OSError as error:
                            db.execute('INSERT INTO issues VALUES(?,?)', (entry.path, str(error)))
                            info['errors'] += 1
            except OSError as error:
                db.execute('INSERT INTO issues VALUES(?,?)', (folder, str(error)))
                info['errors'] += 1
            if info['directories'] % 500 == 0:
                db.commit()
                print(f'{root}: {info["directories"]:,} directories, {info["files"]:,} files', flush=True)
            if pause_ms:
                time.sleep(pause_ms / 1000)
        info['complete'] = info['errors'] == 0
        db.commit()
    counts = export_findings(db, output)
    summary = dict(source=str(database), source_revision=revision, started_at=started,
                   elapsed_seconds=round(time.time()-started, 2), roots=coverage, findings=counts,
                   catalog_rows=db.execute('SELECT count(*) FROM catalog').fetchone()[0],
                   audio_files=db.execute('SELECT count(*) FROM files WHERE audio=1').fetchone()[0],
                   limitations=['Not observed is not confirmed deleted: consider coverage errors and concurrent edits.',
                                'Point-in-time catalog extraction; filesystem walk is not atomic.',
                                'No tags, hashes, audio decoding, or baseline timestamp comparison performed.',
                                'Audio extensions are classified; all regular files are inventoried.'])
    (output / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    write_report(output, summary)
    db.close()
    return summary


def export_findings(db, output):
    queries = {
        'catalog_not_observed': 'SELECT c.id,c.path,c.root FROM catalog c LEFT JOIN files f ON c.k=f.k WHERE f.k IS NULL',
        'uncataloged_audio': 'SELECT f.path,f.size,f.root FROM files f WHERE audio=1 AND NOT EXISTS(SELECT 1 FROM catalog c WHERE c.k=f.k)',
        'duplicate_catalog_paths': 'SELECT k,count(*) AS rows FROM catalog GROUP BY k HAVING count(*)>1',
        'outside_roots': 'SELECT id,path FROM catalog WHERE root=-1',
        'coverage_issues': 'SELECT * FROM issues',
    }
    counts = {}
    for name, query in queries.items():
        cursor = db.execute(query)
        with (output / (name + '.csv')).open('w', newline='', encoding='utf-8-sig') as handle:
            writer = csv.writer(handle)
            writer.writerow([d[0] for d in cursor.description])
            count = 0
            for row in cursor:
                writer.writerow(row)
                count += 1
            counts[name] = count
    return counts


def write_report(output, summary):
    lines = ['# Library baseline inventory', '',
             f'Catalog revision: {summary["source_revision"]}. Catalog rows: {summary["catalog_rows"]:,}.',
             f'Audio files observed: {summary["audio_files"]:,}. Elapsed: {summary["elapsed_seconds"]:,.1f} seconds.', '',
             '| Root | Files | Directories | Coverage |', '|---|---:|---:|---|']
    for root in summary['roots']:
        lines.append(f'| {root["root"]} | {root["files"]:,} | {root["directories"]:,} | {"Complete" if root["complete"] else "Incomplete"} ({root["errors"]} errors) |')
    lines += ['', '## Findings', '']
    for name, count in summary['findings'].items():
        lines.append(f'- [{name.replace("_", " ")}](./{name}.csv): **{count:,}**')
    lines += ['', '## Interpretation', '']
    lines += ['- ' + item for item in summary['limitations']]
    (Path(output) / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True)
    parser.add_argument('--root', action='append', required=True)
    parser.add_argument('--output', required=True, help='New directory outside media roots')
    parser.add_argument('--pause-ms', type=float, default=2)
    args = parser.parse_args()
    if args.pause_ms < 0:
        parser.error('--pause-ms must be nonnegative')
    print(json.dumps(run(args.database, args.root, args.output, args.pause_ms), indent=2))
