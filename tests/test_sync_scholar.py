import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from sync_scholar import SyncError, fetch_profile, merge_metrics, parse_profile, sync

AUTHOR = 'm5u8VlIAAAAJ'
NOW = datetime(2026, 10, 9, tzinfo=timezone.utc)
CONFIG = {'author_id': AUTHOR, 'author_name': 'Zhong Li', 'minimum_matches': 1}


def article(title='A Model', count=51, suffix='abc'):
    return {'title': title, 'citation_id': AUTHOR + ':' + suffix, 'count': count}


def profile():
    return {'total': 900, 'articles': [article()]}


def html(count='51', name='Zhong Li', author_id=AUTHOR):
    return f'''<html><div id="gsc_prf_in">{name}</div>
    <table id="gsc_rsb_st"><tr><td class="gsc_rsb_sc1"><a>Citations</a></td><td class="gsc_rsb_std">1,234</td><td class="gsc_rsb_std">999</td></tr>
    <tr><td class="gsc_rsb_sc1">h-index</td><td class="gsc_rsb_std">12</td></tr></table>
    <table><tr class="gsc_a_tr"><td><a class="gsc_a_at" href="/citations?view_op=view_citation&amp;citation_for_view={author_id}:abc">A Model</a></td>
    <td><a class="gsc_a_ac gs_ibl">{count}</a></td></tr></table></html>'''


class CitationSyncTests(unittest.TestCase):
    def setUp(self):
        self.papers = [{'id': 'p1', 'title': 'A Model', 'status': 'published', 'authors': 'Zhong Li',
                        'summary': 'Preserve the editorial summary.',
                        'citations': {'count': 50, 'snapshot': '2026-10-08'}},
                       {'id': 'p2', 'title': 'Another Paper', 'citations': {'count': 7, 'snapshot': '2026-10-08'}}]

    def test_realistic_html_metrics_and_empty_zero_citation_anchor(self):
        p = parse_profile(html(), CONFIG)
        self.assertEqual(p['total'], 1234)
        self.assertEqual(p['articles'][0]['count'], 51)
        self.assertEqual(parse_profile(html(count=''), CONFIG)['articles'][0]['count'], 0)
        self.assertEqual(parse_profile(html(count='51*'), CONFIG)['articles'][0]['count'], 51)

    def test_challenge_wrong_profile_missing_metrics_or_anchor_rejected(self):
        for markup in ['<html>Captcha</html>', html(name='Another Author'), html(author_id='another'),
                       html().replace('gsc_rsb_st', 'changed'), html().replace('gsc_a_ac', 'changed')]:
            with self.subTest(markup=markup), self.assertRaises(SyncError):
                parse_profile(markup, CONFIG)

    def test_updates_exact_match_and_preserves_unmatched_content(self):
        original = copy.deepcopy(self.papers)
        updated, stats, unmatched = merge_metrics(self.papers, {'total': 900, 'articles': [article('A—Model')]}, CONFIG, NOW)
        self.assertEqual(updated[0]['citations']['count'], 51)
        self.assertEqual(updated[0]['summary'], original[0]['summary'])
        self.assertEqual(updated[1], original[1])
        self.assertEqual(self.papers, original)
        self.assertEqual(stats['totalCitations'], 900)
        self.assertFalse(stats['isLowerBound'])
        self.assertEqual(unmatched, ['p2'])

    def test_stored_id_survives_changed_title_and_counts_can_fall(self):
        self.papers[0]['citations']['scholarId'] = AUTHOR + ':abc'
        updated, _, _ = merge_metrics(self.papers, {'total': 900, 'articles': [article('Entirely New Title', 0)]}, CONFIG, NOW)
        self.assertEqual(updated[0]['citations']['count'], 0)

    def test_ambiguous_titles_are_not_guessed(self):
        with self.assertRaises(SyncError):
            merge_metrics(self.papers, {'total': 900, 'articles': [article(), article(suffix='other')]}, CONFIG, NOW)

    def test_missing_and_invalid_counts_do_not_become_zero(self):
        for count in [None, True, -1, '51']:
            with self.subTest(count=count), self.assertRaises(SyncError):
                merge_metrics(self.papers, {'total': 900, 'articles': [article(count=count)]}, CONFIG, NOW)

    def test_explicit_alias_and_duplicate_normalization(self):
        config = {**CONFIG, 'title_aliases': {'p1': ['A New Title']}}
        updated, _, _ = merge_metrics(self.papers, {'total': 900, 'articles': [article('A New Title')]}, config, NOW)
        self.assertEqual(updated[0]['citations']['count'], 51)
        config['title_aliases']['p1'] = ['A-Model']
        updated, _, _ = merge_metrics(self.papers, profile(), config, NOW)
        self.assertEqual(updated[0]['citations']['count'], 51)

    def test_duplicate_local_records_do_not_receive_the_same_count(self):
        self.papers[1]['title'] = 'A Model'
        with self.assertRaises(SyncError):
            merge_metrics(self.papers, profile(), CONFIG, NOW)

    def test_failure_retains_both_files_then_success_updates_together(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'docs').mkdir()
            (root / 'scholar-config.json').write_text(json.dumps(CONFIG))
            pub = root / 'docs/publications.json'
            stats = root / 'docs/scholar-stats.json'
            pub.write_text(json.dumps(self.papers))
            stats.write_text('{"totalCitations":620}')
            before = (pub.read_bytes(), stats.read_bytes())
            def failure(_):
                raise SyncError('Service unavailable')
            with self.assertRaises(SyncError):
                sync(root, fetch=failure, now=NOW)
            self.assertEqual((pub.read_bytes(), stats.read_bytes()), before)
            sync(root, fetch=lambda _: profile(), now=NOW)
            self.assertEqual(json.loads(stats.read_text())['totalCitations'], 900)
            self.assertEqual(json.loads(pub.read_text())[0]['citations']['snapshot'], '2026-10-09')

    def test_http_restrictions_stop_without_retry(self):
        with patch('sync_scholar.urlopen', side_effect=HTTPError('https://scholar.google.com/', 429, 'Limited', {}, None)) as request:
            with self.assertRaisesRegex(SyncError, 'HTTP 429'):
                fetch_profile(CONFIG)
            self.assertEqual(request.call_count, 1)
            url = request.call_args.args[0].full_url
            self.assertIn('citations?user=', url)
            self.assertNotIn('cstart', url)
            self.assertNotIn('api_key', url)


if __name__ == '__main__':
    unittest.main()
