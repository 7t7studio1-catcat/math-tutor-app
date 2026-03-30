/**
 * Contents/section0.xml — OWPML 섹션 XML 생성.
 *
 * 각 HwpxParagraph → <hp:p>, 각 HwpxRun → <hp:run> + charPr.
 * HwpxEquationRun → <hp:script> 수식 객체.
 * HwpxImageRun → <hp:pic> 이미지 객체.
 */

import type { HwpxSection, HwpxImage, HwpxSettings, HwpxRun } from "../types";

const NS =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function mmToHwp(mm: number): number {
  return Math.round(mm * 283.465);
}

function ptToHwp(pt: number): number {
  return Math.round(pt * 100);
}

function buildSecPr(settings: HwpxSettings): string {
  const w = mmToHwp(settings.pageWidth);
  const h = mmToHwp(settings.pageHeight);
  const ml = mmToHwp(settings.marginLeft);
  const mr = mmToHwp(settings.marginRight);
  const mt = mmToHwp(settings.marginTop);
  const mb = mmToHwp(settings.marginBottom);
  const hdr = mmToHwp(0);
  const ftr = mmToHwp(8);
  const colGap = mmToHwp(settings.columnGap);

  return `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="${colGap}" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">` +
    `<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>` +
    `<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>` +
    `<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>` +
    `<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>` +
    `<hp:pagePr landscape="WIDELY" width="${w}" height="${h}" gutterType="LEFT_ONLY">` +
    `<hp:margin header="${hdr}" footer="${ftr}" gutter="0" left="${ml}" right="${mr}" top="${mt}" bottom="${mb}"/>` +
    `</hp:pagePr>` +
    `<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>` +
    `<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>` +
    `<hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>` +
    `<hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>` +
    `<hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>` +
    `</hp:secPr>`;
}

function buildColPr(settings: HwpxSettings): string {
  const colCount = settings.columns;
  const gap = mmToHwp(settings.columnGap);
  return `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="${colCount}" sameSz="1" sameGap="${gap}"/></hp:ctrl>`;
}

function buildCharPr(run: HwpxRun & { type: "text" }): string {
  const fontFace = run.fontFace ?? "함초롬바탕";
  const fontSize = ptToHwp(run.fontSize ?? 8);
  const bold = run.bold ? '1' : '0';
  const italic = run.italic ? '1' : '0';
  const color = run.color ?? "#000000";
  const hexColor = color.startsWith("#") ? color.slice(1).toUpperCase() : "000000";

  let charPr = `<hp:charPr>`;
  for (let i = 0; i < 7; i++) {
    charPr += `<hp:fontRef hangul="${esc(fontFace)}" latin="${esc(fontFace)}" hanja="${esc(fontFace)}" japanese="${esc(fontFace)}" other="${esc(fontFace)}" symbol="${esc(fontFace)}" user="${esc(fontFace)}"/>`;
    break;
  }
  charPr += `<hp:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>`;
  charPr += `<hp:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>`;
  charPr += `<hp:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>`;
  charPr += `<hp:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>`;
  charPr += `<hp:height hangul="${fontSize}" latin="${fontSize}" hanja="${fontSize}" japanese="${fontSize}" other="${fontSize}" symbol="${fontSize}" user="${fontSize}"/>`;
  charPr += `<hp:bold hangulBold="${bold}" latinBold="${bold}" hanjaBold="${bold}" japaneseBold="${bold}" otherBold="${bold}" symbolBold="${bold}" userBold="${bold}"/>`;
  charPr += `<hp:italic hangulItalic="${italic}" latinItalic="${italic}" hanjaItalic="${italic}" japaneseItalic="${italic}" otherItalic="${italic}" symbolItalic="${italic}" userItalic="${italic}"/>`;
  charPr += `<hp:color value="#${hexColor}"/>`;
  charPr += `</hp:charPr>`;
  return charPr;
}

function buildEquationXml(hwpEqn: string, fontSize: number, isDisplay: boolean): string {
  const size = ptToHwp(fontSize);
  const width = isDisplay ? mmToHwp(140) : mmToHwp(20);
  const height = isDisplay ? mmToHwp(12) : mmToHwp(6);

  return `<hp:ctrl>` +
    `<hp:eqEdit version="Equation Version 60" baseLine="0" textColor="#000000" baseUnit="${size}" imeColor="#000000">` +
    `<hp:script>${esc(hwpEqn)}</hp:script>` +
    `</hp:eqEdit>` +
    `<hp:shapeObject id="" zOrder="0" numberingType="EQUATION" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" instid="" pageBreak="CELL" gripShapeFill="NONE">` +
    `<hp:sz width="${width}" height="${height}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="1" holdAnchorAndSO="0" pinPages="0"/>` +
    `<hp:offset x="0" y="0"/>` +
    `</hp:shapeObject>` +
    `</hp:ctrl>`;
}

function renderRun(run: HwpxRun, _images: HwpxImage[]): string {
  switch (run.type) {
    case "text": {
      const text = run.text || " ";
      const charPr = buildCharPr(run);
      return `<hp:run charPrIDRef="0">${charPr}<hp:t>${esc(text)}</hp:t></hp:run>`;
    }
    case "equation": {
      const size = run.fontSize ?? 8;
      return `<hp:run charPrIDRef="0">${buildEquationXml(run.hwpEqn, size, run.display ?? false)}</hp:run>`;
    }
    case "image": {
      const img = _images.find((im) => im.id === run.imageId);
      if (!img) return "";
      const w = mmToHwp(run.width);
      const h = mmToHwp(run.height);
      return `<hp:run charPrIDRef="0"><hp:ctrl>` +
        `<hp:pic>` +
        `<hp:shapeObject id="" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0">` +
        `<hp:sz width="${w}" height="${h}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE"/>` +
        `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="1" holdAnchorAndSO="0" pinPages="0"/>` +
        `<hp:offset x="0" y="0"/>` +
        `</hp:shapeObject>` +
        `<hp:imgRect x="0" y="0" x1="${w}" y1="0" x2="${w}" y2="${h}" x3="0" y3="${h}"/>` +
        `<hp:imgClip left="0" top="0" right="0" bottom="0"/>` +
        `<hp:inMargin left="0" right="0" top="0" bottom="0"/>` +
        `<hp:imgDim dimwidth="${w}" dimheight="${h}"/>` +
        `<hp:img bright="0" contrast="0" effect="REAL_PIC" binaryItemIDRef="${img.filename}"/>` +
        `</hp:pic>` +
        `</hp:ctrl></hp:run>`;
    }
    case "lineBreak":
      return "";
    default:
      return "";
  }
}

export function generateSectionXml(
  sections: HwpxSection[], images: HwpxImage[], settings: HwpxSettings,
): string {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ' + NS + '>';

  let paraIdx = 0;
  const lineSpacing = settings.lineSpacing ?? 160;

  for (const section of sections) {
    for (const para of section.paragraphs) {
      const align = para.align === "center" ? 1 : para.align === "right" ? 2 : 0;

      xml += `<hp:p id="${paraIdx}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`;

      if (paraIdx === 0) {
        xml += `<hp:run charPrIDRef="0">${buildSecPr(settings)}${buildColPr(settings)}</hp:run>`;
      }

      xml += `<hp:paraPr align="${align}">` +
        `<hp:spacing type="PERCENT" value="${lineSpacing}" unit="HWPUNIT"/>` +
        `</hp:paraPr>`;

      for (const run of para.runs) {
        xml += renderRun(run, images);
      }

      xml += `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${paraIdx * 1600}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>`;
      xml += `</hp:p>`;
      paraIdx++;
    }
  }

  xml += '</hs:sec>';
  return xml;
}
