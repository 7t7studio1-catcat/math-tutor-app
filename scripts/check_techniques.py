import re
with open(r'src\lib\techniquesDB.ts', 'r', encoding='utf-8') as f:
    content = f.read()
ids = re.findall(r"id:\s*\"([^\"]+)\"", content)
e = content.count("essence:")
s = content.count("signal:")
c = content.count("connection:")
x = content.count("extension:")
print(f"Total entries: {len(ids)}")
print(f"essence: {e-1}/{len(ids)} (minus interface)")
print(f"signal: {s-1}/{len(ids)}")
print(f"connection: {c-1}/{len(ids)}")
print(f"extension: {x-1}/{len(ids)}")
