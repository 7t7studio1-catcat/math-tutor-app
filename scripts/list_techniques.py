import re

with open(r'src\lib\techniquesDB.ts', 'r', encoding='utf-8') as f:
    content = f.read()

techniques = re.findall(
    r'id:\s*"([^"]+)".*?category:\s*"([^"]+)".*?name:\s*"([^"]+)".*?difficulty:\s*"([^"]+)"',
    content, re.DOTALL
)

current_cat = ''
for tid, cat, name, diff in techniques:
    if cat != current_cat:
        current_cat = cat
        print(f'\n[{cat}]')
    print(f'  {tid} | {name} ({diff})')

print(f'\n=== Total: {len(techniques)} techniques ===')
