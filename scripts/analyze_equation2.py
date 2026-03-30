"""Print the full equation XML element."""
import os, zipfile, re

with zipfile.ZipFile(os.path.join(os.environ["TEMP"], "test_equation.hwpx"), "r") as z:
    section = z.read("Contents/section0.xml").decode("utf-8")

# Find first equation element (full)
idx = section.find("<hp:equation")
if idx >= 0:
    # Find the closing tag
    end = section.find("</hp:equation>", idx)
    if end >= 0:
        eq_xml = section[idx:end + len("</hp:equation>")]
        print("=== Full Equation 1 XML ===")
        print(eq_xml)
        print()
        
        # Find the script element (contains the HwpEqn string)
        scripts = re.findall(r'<hp:script>(.*?)</hp:script>', eq_xml, re.DOTALL)
        print(f"Script content: {scripts}")

# Find second equation
idx2 = section.find("<hp:equation", end + 1)
if idx2 >= 0:
    end2 = section.find("</hp:equation>", idx2)
    eq_xml2 = section[idx2:end2 + len("</hp:equation>")]
    print("\n=== Full Equation 2 XML ===")
    print(eq_xml2)
    scripts2 = re.findall(r'<hp:script>(.*?)</hp:script>', eq_xml2, re.DOTALL)
    print(f"Script content: {scripts2}")

# Print the first paragraph to see how text + equation are mixed
first_p = re.search(r'<hp:p .*?</hp:p>', section, re.DOTALL)
if first_p:
    print("\n=== First paragraph (full) ===")
    p = first_p.group()
    # Print just the text/equation structure (skip secPr)
    # Find after </hp:secPr>
    secpr_end = p.find("</hp:secPr>")
    if secpr_end > 0:
        after = p[secpr_end:]
        print(after[:2000])
