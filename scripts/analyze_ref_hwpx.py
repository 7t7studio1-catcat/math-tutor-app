"""Reference HWPX 분석 스크립트"""
import zipfile, re, sys

path = r'c:\Users\7t7st\Downloads\변형문제 (29).hwpx'
z = zipfile.ZipFile(path, 'r')
section = z.read('Contents/section0.xml').decode('utf-8')

# Page layout
margin = re.search(r'<hp:margin[^/]*/>', section)
print('=== Page Margin ===')
print(margin.group(0) if margin else 'None')

pagePr = re.search(r'<hp:pagePr[^>]*>', section)
print('\n=== Page Props ===')
print(pagePr.group(0) if pagePr else 'None')

# Column defs
colpr = re.findall(r'<hp:colPr[^>]*/>', section)
print(f'\n=== Column Defs: {len(colpr)} ===')
for c in colpr[:3]:
    print(c)

# Fonts from header
header = z.read('Contents/header.xml').decode('utf-8')
fonts = re.findall(r'<hh:font face="([^"]*)"', header)
print(f'\n=== Fonts: {sorted(set(fonts))} ===')

# Paragraph count and breaks
paras = re.findall(r'<hp:p\s+id="(\d+)"[^>]*pageBreak="(\d)"[^>]*columnBreak="(\d)"', section)
print(f'\n=== Paragraphs: {len(paras)} ===')
page_breaks = [p for p in paras if p[1]=='1']
col_breaks = [p for p in paras if p[2]=='1']
print(f'Page breaks: {len(page_breaks)}')
print(f'Column breaks: {len(col_breaks)}')

# Section defs
secprs = re.findall(r'<hp:secPr', section)
print(f'Section definitions: {len(secprs)}')

# CharShape IDs used
char_refs = re.findall(r'charPrIDRef="(\d+)"', section)
print(f'\n=== CharPr IDs used: {sorted(set(int(x) for x in char_refs))} ===')

# ParaPr IDs
para_refs = re.findall(r'paraPrIDRef="(\d+)"', section)
print(f'ParaPr IDs used: {sorted(set(int(x) for x in para_refs))} ===')

# Equations & images
eqs = re.findall(r'<hp:equation', section)
imgs = re.findall(r'<hp:img\s', section)
bindata = re.findall(r'binItem', section)
print(f'\nEquations: {len(eqs)}')
print(f'Images: {len(imgs)}')
print(f'BinData refs: {len(bindata)}')

# Content structure summary
texts = re.findall(r'<hp:t[^>]*>(.*?)</hp:t>', section)
print(f'\n=== Content Summary ({len(texts)} text segments) ===')
for i, t in enumerate(texts):
    t_clean = t.strip()
    if t_clean and len(t_clean) > 0:
        prefix = t_clean[:80]
        if '원본' in prefix or '변형' in prefix or '정답' in prefix or '---' in prefix or '문제' in prefix or '풀이' in prefix:
            print(f'  [{i:3d}] ** {prefix} **')
