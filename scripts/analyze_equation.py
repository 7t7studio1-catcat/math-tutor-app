"""Generate HWPX with HwpEqn equations via COM and analyze the XML structure."""
import win32com.client as win32
import time, os, zipfile, re

hwp = win32.gencache.EnsureDispatch("HWPFrame.HwpObject")
hwp.XHwpWindows.Item(0).Visible = False
time.sleep(0.3)
try: hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
except: pass
try: hwp.SetMessageBoxMode(0x10000)
except: pass
hwp.Run("FileNew")
time.sleep(0.2)

def it(text):
    act = hwp.CreateAction("InsertText")
    pset = act.CreateSet()
    act.GetDefault(pset)
    pset.SetItem("Text", text)
    act.Execute(pset)

def bp():
    hwp.HAction.Run("BreakPara")

def insert_eq(eq_str, base_size=10):
    """Insert HwpEqn equation."""
    act = hwp.CreateAction("EquationCreate")
    pset = act.CreateSet()
    act.GetDefault(pset)
    pset.SetItem("EqFontName", "HancomEQN")
    pset.SetItem("string", eq_str)
    pset.SetItem("BaseUnit", hwp.PointToHwpUnit(base_size))
    act.Execute(pset)

# Build document with text + equations
it("함수 ")
insert_eq("f LEFT ( x RIGHT ) = x ^{2} + 1")
it(" 에 대하여")
bp()
bp()
it("다음 등식이 성립한다:")
bp()
insert_eq("{a + b} over {2} = sqrt {c ^{2} + d ^{2}}")
bp()
bp()
it("[정답] 최종 답: 11")

output = os.path.join(os.environ["TEMP"], "test_equation.hwpx")
hwp.SaveAs(output, "HWPX")
hwp.Clear(1)
hwp.Quit()

# Analyze section0.xml
with zipfile.ZipFile(output, "r") as z:
    section = z.read("Contents/section0.xml").decode("utf-8")

# Find equation-related XML
eq_patterns = re.findall(r'<hp:eqEdit.*?</hp:eqEdit>', section, re.DOTALL)
if not eq_patterns:
    eq_patterns = re.findall(r'<hp:equation.*?</hp:equation>', section, re.DOTALL)
if not eq_patterns:
    # Search for any element containing "eq" or "Eq"
    eq_patterns = re.findall(r'<[^>]*[eE]q[^>]*>.*?</[^>]*[eE]q[^>]*>', section, re.DOTALL)

print(f"Equation elements found: {len(eq_patterns)}")
for i, eq in enumerate(eq_patterns):
    print(f"\n=== Equation {i} ===")
    print(eq[:500])

# Also search for the equation string content
eq_strings = re.findall(r'string="([^"]*)"', section)
print(f"\nEquation strings: {eq_strings}")

# Find all unique XML element names
elements = set(re.findall(r'<(hp:\w+)', section))
print(f"\nAll hp: elements: {sorted(elements)}")

# Print area around "함수" to see equation context
idx = section.find("함수")
if idx > 0:
    print(f"\n=== Context around '함수' ===")
    print(section[max(0,idx-100):idx+500])
