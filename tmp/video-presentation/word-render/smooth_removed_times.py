from pathlib import Path
from docx import Document

root = Path(__file__).resolve().parents[3]
file = root / 'artifacts' / 'video-learning-report.docx'
source_file = root / 'tmp' / 'video-presentation' / 'report-revised.md'
source = source_file.read_text(encoding='utf-8')
doc = Document(file)
changes = {
    30: [('โครงสร้างข้อมูลและการขยาย', 'โครงสร้างข้อมูล และการขยาย')],
    33: [('จำนวนคงเหลือและปัญหา', 'จำนวนคงเหลือ และปัญหา'), ('พร้อมกันจากนั้น', 'พร้อมกัน จากนั้น')],
    36: [('ออนไลน์การกระจาย', 'ออนไลน์ การกระจาย'), ('เหตุการณ์ต่อด้วย', 'เหตุการณ์ ต่อด้วย')],
}
for index, replacements in changes.items():
    p = doc.paragraphs[index]
    old = p.text
    new = old
    for a, b in replacements:
        assert new.count(a) == 1
        new = new.replace(a, b)
    assert source.count(old) == 1
    source = source.replace(old, new)
    runs = [r for r in p.runs if r.text]
    assert len(runs) == 1
    runs[0].text = new
doc.save(file)
source_file.write_text(source, encoding='utf-8')
print('Adjusted clause spacing after timestamp removal')
