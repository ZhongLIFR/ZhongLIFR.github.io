#!/usr/bin/env python3
"""Validate deployable assets and publication data, without network access."""
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'


def local_reference(source, url):
    parsed = urlsplit(url)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return
    path = (DOCS / unquote(parsed.path).lstrip('/') if parsed.path.startswith('/') else source.parent / unquote(parsed.path)).resolve()
    assert path.is_relative_to(DOCS.resolve()), f'Asset escapes public directory: {source.name}: {url}'
    if path.is_dir():
        path /= 'index.html'
    assert path.is_file(), f'Missing local asset: {source.name}: {url}'


class Links(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.source = source

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for name in ('href', 'src'):
            if attrs.get(name):
                local_reference(self.source, attrs[name])


def main():
    assert (DOCS / '.nojekyll').is_file()
    for path in DOCS.rglob('*'):
        assert not path.is_symlink(), f'Symlink in public output: {path}'
        assert path.name not in {'__pycache__', '.DS_Store', '.env'}, f'Local-only file: {path}'
        assert path.suffix not in {'.py', '.pyc', '.sqlite3', '.tex', '.zip'}, f'Local-only file: {path}'
        if not path.is_file():
            continue
        if path.suffix == '.html':
            Links(path).feed(path.read_text())
        elif path.suffix == '.js':
            text = path.read_text()
            for url in re.findall(r'''(?:from\s*|import\s*\(\s*|fetch\s*\(\s*)['"]([^'"]+)['"]''', text):
                local_reference(path, url)
        elif path.suffix == '.css':
            for url in re.findall(r'''url\(['"]?([^)'"\s]+)''', path.read_text()):
                local_reference(path, url)
    papers = json.loads((DOCS / 'publications.json').read_text())
    assert papers and len({p['id'] for p in papers}) == len(papers)
    for paper in papers:
        assert paper['status'] in {'published', 'review'}
        if paper['status'] == 'review':
            assert re.fullmatch(r'https://arxiv\.org/abs/\d{4}\.\d{4,5}(?:v\d+)?', paper['url'])
            assert paper['venue'] == 'Preprint' and not paper.get('ranks') and not paper.get('presentation')
        citation = paper.get('citations')
        if citation:
            assert type(citation['count']) is int and citation['count'] >= 0
            assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', citation['snapshot'])
    stats = json.loads((DOCS / 'scholar-stats.json').read_text())
    assert stats['authorId'] == 'm5u8VlIAAAAJ'
    assert type(stats['totalCitations']) is int and stats['totalCitations'] >= 0
    print(f'Public assets resolved; {len(papers)} public publications validated.')


if __name__ == '__main__':
    main()
