"""Extract publisher links from the archived 360 Search results page."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import json
import sys


class ReportSearchResults(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_heading = False
        self.url = ''
        self.title = []
        self.results = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'h3':
            self.in_heading = 'res-title' in (attributes.get('class') or '').split()
        elif tag == 'a' and (self.in_heading or attributes.get('data-md') == '{"b":"title"}'):
            self.url = attributes.get('data-mdurl') or attributes.get('href') or ''
            self.title = []

    def handle_data(self, data):
        if self.url:
            self.title.append(data)

    def handle_endtag(self, tag):
        if tag == 'a' and self.url:
            try:
                link = urlsplit(self.url)
                if link.hostname == 'm.so.com' and link.path == '/jump':
                    self.url = parse_qs(link.query).get('u', [''])[0]
                    link = urlsplit(self.url)
                if link.scheme == 'https' and link.hostname not in {'www.so.com', 'm.so.com', 'ai.so.com'}:
                    self.results.append({'title': ''.join(self.title).strip(), 'url': self.url})
            except ValueError:
                pass
            self.url = ''
        elif tag == 'h3':
            self.in_heading = False


parser = ReportSearchResults()
parser.feed(Path(sys.argv[1]).read_text(encoding='utf-8', errors='replace'))
print(json.dumps(parser.results[:8]))
