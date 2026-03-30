"""Generate multi-paragraph HWPX via COM and analyze the XML structure."""
import win32com.client as win32
import time, os, zipfile, re, sys

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
    try:
        hwp.HAction.Run("BreakPara")
    except:
        act = hwp.CreateAction("BreakPara")
        act.Run()

it("[핵심 통찰]")
bp()
it("이 문제의 핵심은 주어진 조건에서 대칭성을 이용하여 이등변삼각형을 찾는 것입니다.")
bp()
bp()
it("[빠른 풀이]")
bp()
it("점 P, Q는 중점이므로 중점연결정리에 의해 PQ // AC입니다.")
bp()
it("따라서 angle PQC = 180 - (180 - 2alpha) = 2alpha가 됩니다.")
bp()
bp()
it("정리하면 3x^2 - nx - (2n+1)^2 = 0입니다.")
bp()
bp()
it("[정답] 최종 답: 11")

output = os.path.join(os.environ["TEMP"], "test_multi_para.hwpx")
hwp.SaveAs(output, "HWPX")
hwp.Clear(1)
hwp.Quit()

with zipfile.ZipFile(output, "r") as z:
    section = z.read("Contents/section0.xml").decode("utf-8")

# Extract each <hp:p>...</hp:p> block
paras = re.findall(r"<hp:p .*?</hp:p>", section, re.DOTALL)
print(f"Total paragraphs: {len(paras)}")

for i, p in enumerate(paras):
    has_secpr = "secPr" in p
    texts = re.findall(r"<hp:t>(.*?)</hp:t>", p)
    linesegs = re.findall(r'<hp:lineseg ([^/]+)/>', p)
    print(f"\n--- Para {i} ---")
    print(f"  secPr: {has_secpr}")
    print(f"  linesegs: {len(linesegs)}")
    if linesegs:
        print(f"  lineseg: {linesegs[0][:100]}")

# Print para 4 (a normal text paragraph, no secPr) in full
if len(paras) > 4:
    print("\n\n=== Full XML of Para 4 ===")
    print(paras[4])
