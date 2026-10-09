#!/usr/bin/env python3
"""Refresh citation metrics from the public Scholar profile. No API or API key.

One public profile request per run; no login, proxy, CAPTCHA solving, or retries.
Only existing public papers are updated. Failed requests retain the last snapshot.
"""
import argparse
import copy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen


class SyncError(Exception):
    pass


@dataclass
class Element:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)

    def text(self):
        return ''.join(child.text() if isinstance(child, Element) else child for child in self.children)

    def find(self, *, tag=None, id=None, cls=None):
        found = []
        if (tag is None or self.tag == tag) and (id is None or self.attrs.get('id') == id) and (cls is None or cls in self.attrs.get('class', '').split()):
            found.append(self)
        for child in self.children:
            if isinstance(child, Element):
                found.extend(child.find(tag=tag, id=id, cls=cls))
        return found


class ProfileHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Element('document')
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Element(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def normalized_title(value):
    return ''.join(c for c in unicodedata.normalize('NFKC', value).casefold() if c.isalnum())


def is_count(value):
    return type(value) is int and 0 <= value <= 2**53 - 1


def numeric_text(value):
    value = value.strip().replace(',', '').replace('\u00a0', '').replace(' ', '')
    if re.fullmatch(r'\d+\*?', value):
        count = int(value.rstrip('*'))
        if is_count(count):
            return count
    return None


def parse_profile(html, config):
    parser = ProfileHTML()
    parser.feed(html)
    doc = parser.root
    names = doc.find(id='gsc_prf_in')
    if len(names) != 1 or normalized_title(names[0].text()) != normalized_title(config['author_name']):
        raise SyncError('Scholar did not return the expected public author profile; previous data retained.')
    tables = doc.find(id='gsc_rsb_st')
    total = None
    if len(tables) == 1:
        for row in tables[0].find(tag='tr'):
            labels = row.find(cls='gsc_rsb_sc1')
            values = row.find(cls='gsc_rsb_std')
            if labels and labels[0].text().strip().casefold() == 'citations' and values:
                total = numeric_text(values[0].text())
    if not is_count(total):
        raise SyncError('Scholar citation metrics were missing or changed format; previous data retained.')
    author_id = config['author_id']
    articles = []
    for row in doc.find(tag='tr', cls='gsc_a_tr'):
        titles = row.find(tag='a', cls='gsc_a_at')
        counts = row.find(tag='a', cls='gsc_a_ac')
        if len(titles) != 1 or len(counts) != 1:
            continue
        citation_id = parse_qs(urlparse(titles[0].attrs.get('href', '')).query).get('citation_for_view', [''])[0]
        if not re.fullmatch(re.escape(author_id) + r':[A-Za-z0-9_-]+', citation_id):
            continue
        value = counts[0].text().strip()
        # Scholar renders a present, empty citation anchor for zero citations.
        # A missing anchor is unknown and is never converted to zero.
        count = 0 if not value else numeric_text(value)
        if is_count(count):
            articles.append({'title': titles[0].text().strip(), 'citation_id': citation_id, 'count': count})
    if not articles:
        raise SyncError('Scholar article rows were missing or changed format; previous data retained.')
    return {'total': total, 'articles': articles}


def fetch_profile(config):
    # /citations?user= is public and permitted by Scholar's robots.txt.
    # Do not use cstart pagination (disallowed), proxies, or challenge workarounds.
    url = 'https://scholar.google.com/citations?' + urlencode({'user': config['author_id'], 'hl': 'en', 'pagesize': 100})
    try:
        request = Request(url, headers={'User-Agent': 'AcademicHomepageCitationSync/1.0 (+https://zhonglifr.github.io/)', 'Accept-Language': 'en-US,en;q=0.9'})
        with urlopen(request, timeout=30) as response:
            raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise SyncError('Scholar response exceeded the size limit; previous data retained.')
        html = raw.decode('utf-8', errors='replace')
    except HTTPError as exc:
        raise SyncError(f'Scholar returned HTTP {exc.code}; previous data retained. The next scheduled run will try again.') from None
    except (URLError, TimeoutError, OSError, UnicodeError):
        raise SyncError('Scholar could not be read; previous data retained. The next scheduled run will try again.') from None
    return parse_profile(html, config)


def merge_metrics(papers, profile, config, now):
    """Match a stored Scholar ID, otherwise an unambiguous normalized title.

    No fuzzy matching and no new papers are added. Missing or ambiguous records
    keep their old counts and dates; a renamed paper can use an explicit alias.
    """
    author_id = config['author_id']
    if not is_count(profile.get('total')):
        raise SyncError('Invalid total citation count.')
    by_id, by_title = {}, {}
    for article in profile['articles']:
        if not isinstance(article, dict):
            continue
        citation_id, title, count = article.get('citation_id', ''), article.get('title', ''), article.get('count')
        if not isinstance(citation_id, str) or not re.fullmatch(re.escape(author_id) + r':[A-Za-z0-9_-]+', citation_id):
            continue
        if not isinstance(title, str) or not normalized_title(title) or not is_count(count):
            continue
        by_id.setdefault(citation_id, []).append(article)
        by_title.setdefault(normalized_title(title), []).append(article)
    proposals, unmatched = {}, []
    for paper in papers:
        old = paper.get('citations') or {}
        candidates = by_id.get(old.get('scholarId'), [])
        if not candidates:
            titles = {normalized_title(title) for title in [paper['title'], *config.get('title_aliases', {}).get(paper['id'], [])]}
            candidates = [article for title in titles for article in by_title.get(title, [])]
        if len(candidates) == 1:
            proposals[paper['id']] = candidates[0]
        else:
            unmatched.append(paper['id'])
    usage = {}
    for pid, article in proposals.items():
        usage.setdefault(article['citation_id'], []).append(pid)
    for duplicates in usage.values():
        if len(duplicates) > 1:
            for pid in duplicates:
                proposals.pop(pid)
                unmatched.append(pid)
    if len(proposals) < config.get('minimum_matches', 3):
        raise SyncError('Too few unambiguous paper matches; previous data retained.')
    snapshot = now.date().isoformat()
    updated = copy.deepcopy(papers)
    for paper in updated:
        article = proposals.get(paper['id'])
        if article:
            if article['count'] > profile['total']:
                raise SyncError('A paper citation count exceeds the profile total.')
            paper['citations'] = {'count': article['count'], 'source': 'Google Scholar',
                                  'snapshot': snapshot, 'scholarId': article['citation_id']}
    stats = {'authorId': author_id, 'totalCitations': profile['total'], 'isLowerBound': False,
             'snapshot': snapshot, 'source': 'Google Scholar',
             'lastSuccessfulSync': now.isoformat(timespec='seconds')}
    return updated, stats, sorted(unmatched)


def sync(root, fetch=fetch_profile, now=None):
    config = json.loads((root / 'scholar-config.json').read_text())
    publications = root / 'docs/publications.json'
    papers = json.loads(publications.read_text())
    profile = fetch(config)
    updated, stats, unmatched = merge_metrics(papers, profile, config, now or datetime.now(timezone.utc))
    # Prepare both files before replacing either. The workflow commits and deploys
    # only after validation; a rejected response cannot overwrite either snapshot.
    prepared = []
    for path, value in ((publications, updated), (root / 'docs/scholar-stats.json', stats)):
        temporary = path.with_suffix(path.suffix + '.tmp')
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
        prepared.append((temporary, path))
    for temporary, path in prepared:
        temporary.replace(path)
    return len(papers) - len(unmatched), unmatched


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        matched, unmatched = sync(args.root)
    except (SyncError, ValueError, KeyError, TypeError, OSError) as exc:
        message = str(exc) if isinstance(exc, SyncError) else 'Citation update failed validation or could not be saved.'
        print(f'::error::{message}', file=sys.stderr)
        return 1
    print(f'Updated the Scholar total and {matched} existing publication counts.')
    if unmatched:
        print('::warning::Kept previous data for unmatched/ambiguous paper IDs: ' + ', '.join(unmatched))
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as out:
            out.write(f'Updated Scholar total and **{matched}** publication counts.\n\n')
            if unmatched:
                out.write('Previous snapshots retained for: ' + ', '.join(unmatched) + '.\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
