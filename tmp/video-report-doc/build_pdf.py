from __future__ import annotations

import os
import re
import sys
import unicodedata
from pathlib import Path
from dataclasses import dataclass
from functools import lru_cache

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE / 'deps'))
os.environ['PYTHAINLP_DATA'] = str(HERE / 'thai-data')
os.environ['PYTHAINLP_OFFLINE'] = '1'
os.environ['PYTHAINLP_READ_ONLY'] = '1'

from pythainlp.tokenize import word_tokenize
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont, shapeStr
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Flowable, SimpleDocTemplate, Spacer, Table, TableStyle

pdfmetrics.registerFont(TTFont('Thai', 'C:/Windows/Fonts/LeelawUI.ttf', shapable=True))
pdfmetrics.registerFont(TTFont('ThaiBold', 'C:/Windows/Fonts/LeelaUIb.ttf', shapable=True))

SOURCE = ROOT / 'tmp/video-report-2026-10-19.md'
OUTPUT = ROOT / 'output/pdf/video-report-2026-10-19.pdf'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
BLUE = colors.HexColor('#194F78')


@dataclass(frozen=True)
class Run:
    text: str
    bold: bool = False
    url: str | None = None


@lru_cache(maxsize=24000)
def measured(text: str, bold: bool, size: float):
    font = 'ThaiBold' if bold else 'Thai'
    shaped = shapeStr(text, font, size, force=True)
    width = sum(item.x_advance for item in shaped.__shapeData__) * size / 1000
    return shaped, width


def inline(text: str, bold: bool = False) -> list[Run]:
    text = text.replace('–', '-').replace('—', '-').replace('\u2011', '-')
    pattern = re.compile(r'(\*\*.*?\*\*|\[[^\]]+\]\(https?://[^)]+\)|https?://[^\s<>]+|`[^`]+`)')
    parts = pattern.split(text)
    out = []
    for part in parts:
        if not part:
            continue
        if part.startswith('**') and part.endswith('**'):
            out.extend(inline(part[2:-2], True))
        elif part.startswith('[') and '](' in part and part.endswith(')'):
            label, url = part[1:-1].split('](', 1)
            out.append(Run(label, bold, url))
        elif part.startswith('http://') or part.startswith('https://'):
            label = 'เปิดวิดีโอต้นฉบับ' if 'youtube.com/' in part or 'youtu.be/' in part else 'เปิดบทความต้นฉบับ'
            out.append(Run(label, bold, part))
        elif part.startswith('`') and part.endswith('`'):
            out.append(Run(part[1:-1], bold))
        else:
            out.append(Run(part, bold))
    return out


def coalesce(runs):
    result = []
    for run in runs:
        if not run.text:
            continue
        if result and (result[-1].bold, result[-1].url) == (run.bold, run.url):
            old = result.pop()
            result.append(Run(old.text + run.text, run.bold, run.url))
        else:
            result.append(run)
    return result


class ThaiText(Flowable):
    def __init__(self, text='', *, runs=None, size=12, leading=20, bold=False,
                 marker=None, after=7, before=0, keep=False, lines=None, indent=None):
        super().__init__()
        self.runs = inline(text, bold) if runs is None else runs
        self.size = size
        self.leading = leading
        self.bold = bold
        self.marker = marker
        self.indent = (22 if marker else 0) if indent is None else indent
        self.spaceAfter = after
        self.spaceBefore = before
        self.keepWithNext = keep
        self._fixed_lines = lines
        self._lines = []

    def wrap(self, availableWidth, availableHeight):
        self.width = availableWidth
        lineWidth = availableWidth - self.indent
        if self._fixed_lines is not None:
            self._lines = self._fixed_lines
        else:
            line = []
            used = 0
            result = []
            for run in self.runs:
                tokens = word_tokenize(run.text, engine='newmm', keep_whitespace=True)
                for token in tokens:
                    if token == '\n':
                        result.append(coalesce(line))
                        line, used = [], 0
                        continue
                    width = measured(token, run.bold, self.size)[1]
                    if used + width > lineWidth + 0.05 and line:
                        result.append(coalesce(line))
                        line, used = [], 0
                        if token.isspace():
                            continue
                    if width <= lineWidth:
                        line.append(Run(token, run.bold, run.url))
                        used += width
                    else:
                        # Emergency wrapping is used only for long unbroken Latin tokens.
                        clusters = []
                        for char in token:
                            if clusters and unicodedata.combining(char):
                                clusters[-1] += char
                            else:
                                clusters.append(char)
                        for cluster in clusters:
                            cw = measured(cluster, run.bold, self.size)[1]
                            if used + cw > lineWidth and line:
                                result.append(coalesce(line))
                                line, used = [], 0
                            line.append(Run(cluster, run.bold, run.url))
                            used += cw
            if line:
                result.append(coalesce(line))
            self._lines = result or [[]]
        self.height = self.leading * len(self._lines)
        return self.width, self.height

    def split(self, availableWidth, availableHeight):
        if not self._lines:
            self.wrap(availableWidth, availableHeight)
        count = int(availableHeight // self.leading)
        if count < 2 or len(self._lines) - count < 1:
            return []
        if len(self._lines) - count == 1 and count > 2:
            count -= 1
        first = ThaiText(runs=self.runs, size=self.size, leading=self.leading,
                        marker=self.marker, after=0, lines=self._lines[:count], indent=self.indent)
        second = ThaiText(runs=self.runs, size=self.size, leading=self.leading,
                         after=self.spaceAfter, lines=self._lines[count:], indent=self.indent)
        return [first, second]

    def draw(self):
        c = self.canv
        if self.marker:
            c.setFont('Thai', self.size)
            c.setFillColor(colors.black)
            c.drawString(0, self.height - self.size - 2, measured(self.marker, False, self.size)[0])
        for lineIndex, line in enumerate(self._lines):
            x = self.indent
            y = self.height - self.size - 2 - lineIndex * self.leading
            for run in line:
                c.setFont('ThaiBold' if run.bold else 'Thai', self.size)
                c.setFillColor(BLUE if run.url else colors.black)
                shaped, width = measured(run.text, run.bold, self.size)
                c.drawString(x, y, shaped)
                if run.url:
                    c.linkURL(run.url, (x, y - 3, x + width, y + self.size + 2), relative=1, thickness=0)
                x += width


def table_from_lines(lines):
    records = []
    for line in lines:
        records.append([part.strip() for part in line.strip().strip('|').split('|')])
    records = [record for record in records if not all(re.fullmatch(r':?-{2,}:?', x or '') for x in record)]
    ncols = len(records[0])
    width = A4[0] - 2 * 46
    if ncols == 3 and records[0][0] == 'โครงการ':
        fractions = [0.24, 0.48, 0.28]
    elif ncols == 3:
        fractions = [0.20, 0.40, 0.40]
    else:
        fractions = [1 / ncols] * ncols
    data = []
    for rowIndex, record in enumerate(records):
        data.append([ThaiText(cell, size=11, leading=18, bold=rowIndex == 0, after=0) for cell in record])
    table = Table(data, colWidths=[width * f for f in fractions], repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('GRID', (0,0), (-1,-1), .5, colors.HexColor('#D9D9D9')),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#E7EEF5')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F8FAFC')]),
    ]))
    table.spaceBefore = 6
    table.spaceAfter = 12
    return table


def make_story(source):
    lines = source.splitlines()
    story = []
    i = 0
    while i < len(lines):
        text = lines[i].strip()
        if not text:
            i += 1
            continue
        if text.startswith('|'):
            collected = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                collected.append(lines[i])
                i += 1
            story.append(table_from_lines(collected))
            continue
        heading = re.match(r'^(#{1,6})\s+(.+)$', text)
        if heading:
            level = len(heading.group(1))
            if level == 1:
                story.append(ThaiText(heading.group(2), size=21, leading=31, bold=True, after=14, keep=True))
            elif level == 2:
                story.append(ThaiText(heading.group(2), size=16, leading=25, bold=True, before=12, after=9, keep=True))
            else:
                story.append(ThaiText(heading.group(2), size=13, leading=22, bold=True, before=9, after=6, keep=True))
            i += 1
            continue
        if re.fullmatch(r'[-*_]{3,}', text):
            story.append(Spacer(1, 7))
            i += 1
            continue
        numbered = re.match(r'^(\d+[.)])\s+(.+)$', text)
        bullet = re.match(r'^[-*]\s+(.+)$', text)
        if numbered:
            story.append(ThaiText(numbered.group(2), marker=numbered.group(1), after=8))
        elif bullet:
            story.append(ThaiText(bullet.group(1), marker='•', after=8))
        elif text.startswith('จัดทำวันที่'):
            story.append(ThaiText(text, size=10.5, leading=17, after=13))
        else:
            # Markdown hard-wrapped prose is kept as one paragraph.
            parts = [text]
            while i+1 < len(lines) and lines[i+1].strip() and not re.match(r'^(#|\||[-*]\s|\d+[.)]\s)', lines[i+1].strip()):
                i += 1
                parts.append(lines[i].strip())
            story.append(ThaiText(' '.join(parts)))
        i += 1
    return story


def page_decoration(canvas, doc):
    canvas.saveState()
    canvas.setFont('Thai', 9)
    canvas.setFillColor(colors.HexColor('#666666'))
    text = f'หน้า {doc.page}'
    shaped, width = measured(text, False, 9)
    canvas.drawString(A4[0] - 46 - width, 25, shaped)
    canvas.restoreState()


if __name__ == '__main__':
    source = SOURCE.read_text(encoding='utf-8-sig')
    (HERE / 'source-used.md').write_text(source, encoding='utf-8')
    document = SimpleDocTemplate(str(OUTPUT), pagesize=A4,
        rightMargin=46, leftMargin=46, topMargin=42, bottomMargin=44,
        title='รายงานสรุปวิดีโอเรื่องระบบอัตโนมัติและการออกแบบซอฟต์แวร์',
        author='')
    document.build(make_story(source), onFirstPage=page_decoration, onLaterPages=page_decoration)
    print(OUTPUT)
