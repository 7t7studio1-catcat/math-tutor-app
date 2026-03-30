/**
 * HWPX Packager — combines all XML files and assets into a ZIP (.hwpx) file.
 * All strings are explicitly converted to UTF-8 Buffers before adding to ZIP.
 */

import archiver from "archiver";
import { Readable } from "stream";
import type { HwpxDocument } from "./types";
import {
  generateContainerXml,
  generateManifestXml,
  generateContainerRdf,
} from "./xml/container";
import { generateContentHpf } from "./xml/contentHpf";
import { generateHeaderXml } from "./xml/header";
import { generateSectionXml } from "./xml/section";

function utf8(str: string): Buffer {
  return Buffer.from(str, "utf-8");
}

export async function packageHwpx(doc: HwpxDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { store: true });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    archive.append(utf8("application/hwp+zip"), { name: "mimetype" });
    archive.append(utf8(generateVersionXml()), { name: "version.xml" });
    archive.append(utf8(generateSettingsXml()), { name: "settings.xml" });
    archive.append(utf8(generateContainerXml()), { name: "META-INF/container.xml" });
    archive.append(utf8(generateManifestXml()), { name: "META-INF/manifest.xml" });
    archive.append(utf8(generateContainerRdf()), { name: "META-INF/container.rdf" });
    archive.append(utf8(generateContentHpf(doc.images)), { name: "Contents/content.hpf" });
    archive.append(utf8(generateHeaderXml()), { name: "Contents/header.xml" });
    archive.append(utf8(generateSectionXml(doc.sections, doc.images, doc.settings)), { name: "Contents/section0.xml" });

    for (const img of doc.images) {
      const buf = img.data instanceof Buffer ? img.data : Buffer.from(img.data);
      archive.append(Readable.from(buf), { name: `Contents/BinData/${img.filename}` });
    }

    archive.append(utf8(extractPreviewText(doc)), { name: "Preview/PrvText.txt" });
    archive.finalize();
  });
}

function generateVersionXml(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
    '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version"' +
    ' tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0"' +
    ' os="1" xmlVersion="1.5" application="Hancom Office Hangul"' +
    ' appVersion="13, 0, 0, 1053 WIN32LEWindows_10"/>';
}

function generateSettingsXml(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
    '<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"' +
    ' xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">' +
    '<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>' +
    '</ha:HWPApplicationSetting>';
}

function extractPreviewText(doc: HwpxDocument): string {
  const texts: string[] = [];
  for (const section of doc.sections) {
    for (const para of section.paragraphs) {
      for (const run of para.runs) {
        if (run.type === "text" && run.text) texts.push(run.text);
      }
    }
  }
  return texts.join("\r\n").slice(0, 500) || "Math Tutor Document";
}
