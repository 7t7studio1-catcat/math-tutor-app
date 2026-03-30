/**
 * PDF 렌더링 전용 Worker
 * 파싱은 메인 스레드에서 완료, 여기서는 이미 파싱된 블록을 jsPDF로 그리기만 함
 */

importScripts("https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js");

const W = 210, H = 297, M = 18, CW = W - M * 2;
const PT = 0.3528;
const FS = { h1: 14, h2: 12, h3: 10.5, body: 10, sm: 8.5 };
const LH = (pt) => pt * PT * 1.55;

function hex(h) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

class Eng {
  constructor(d) {
    this.d = d;
    this.y = M + 9;
    this.pg = 1;
    this.hdr();
  }

  sf() { try { this.d.setFont("NG", "normal"); } catch {} }

  hdr() {
    this.d.setFillColor(15, 20, 55); this.d.rect(0, 0, W, 8, "F");
    this.d.setFillColor(79, 70, 229); this.d.rect(0, 0, 3, 8, "F");
    this.d.setTextColor(255, 255, 255); this.d.setFontSize(7); this.sf();
    this.d.text("스마트풀이 · Before · During · After", 6, 5.5);
    this.d.text(String(this.pg), W - M, 5.5, { align: "right" });
    this.d.setTextColor(0, 0, 0);
  }

  np() { this.d.addPage(); this.pg++; this.y = M + 9; this.hdr(); }
  g(n) { if (this.y + n > H - M) this.np(); }

  wr(t, pt, indent, color) {
    indent = indent || 0;
    if (!t || !t.trim()) return;
    this.d.setFontSize(pt); this.sf();
    if (color) { const [r, g, b] = hex(color); this.d.setTextColor(r, g, b); }
    const ls = this.d.splitTextToSize(t, CW - indent);
    const lh = LH(pt);
    for (const l of ls) { this.g(lh); this.d.text(l, M + indent, this.y + lh * 0.82); this.y += lh; }
    if (color) this.d.setTextColor(0, 0, 0);
  }

  draw(b) {
    switch (b.k) {
      case "hr":
        this.y += 2; this.g(4);
        this.d.setDrawColor(200, 193, 180); this.d.setLineWidth(0.3);
        this.d.line(M, this.y, M + CW, this.y); this.y += 4;
        break;

      case "h": {
        const pt = b.lv === 1 ? FS.h1 : b.lv === 2 ? FS.h2 : FS.h3;
        this.g(LH(pt) + 5); this.y += b.lv === 1 ? 5 : 3;
        this.wr(b.t, pt);
        if (b.lv <= 2) {
          this.d.setDrawColor(37, 99, 235); this.d.setLineWidth(0.4);
          this.d.line(M, this.y + 0.5, M + CW, this.y + 0.5); this.y += 2.5;
        }
        this.y += 1.5;
        break;
      }

      case "p":
        this.g(LH(FS.body) * 2);
        this.wr(b.t, FS.body);
        this.y += 1.5;
        break;

      case "m": {
        this.d.setFontSize(FS.body); this.sf();
        const ls = this.d.splitTextToSize(b.t, CW - 8);
        const bh = ls.length * LH(FS.body) + 8;
        this.g(bh + 4); this.y += 2;
        this.d.setFillColor(238, 244, 255); this.d.roundedRect(M, this.y, CW, bh, 2, 2, "F");
        this.d.setFillColor(37, 99, 235); this.d.rect(M, this.y, 2.5, bh, "F");
        this.d.setTextColor(30, 58, 138); this.d.setFontSize(FS.body);
        let ly = this.y + 4;
        for (const l of ls) { this.d.text(l, M + 5, ly + LH(FS.body) * 0.82); ly += LH(FS.body); }
        this.d.setTextColor(0, 0, 0); this.y += bh + 3;
        break;
      }

      case "li":
        for (let j = 0; j < b.items.length; j++) {
          this.g(LH(FS.body) * 2);
          const bul = b.ord ? `${j + 1}.` : "•";
          this.d.setFontSize(FS.body); this.sf();
          this.d.setTextColor(120, 113, 108); this.d.text(bul, M + 1, this.y + LH(FS.body) * 0.82);
          this.d.setTextColor(0, 0, 0); this.wr(b.items[j], FS.body, 6);
        }
        this.y += 1;
        break;

      case "label": {
        const [r, g, b2] = hex(b.color);
        this.g(LH(FS.body) + 14);
        this.d.setFillColor(r, g, b2); this.d.roundedRect(M, this.y, CW, 7, 1.5, 1.5, "F");
        this.d.setTextColor(255, 255, 255); this.d.setFontSize(FS.sm); this.sf();
        this.d.text(b.label, M + 4, this.y + 5);
        this.d.setTextColor(0, 0, 0); this.y += 7;
        if (b.t) { this.y += 2; this.wr(b.t, FS.body, 3); this.y += 2; }
        this.y += 3;
        break;
      }

      case "step": {
        this.g(LH(FS.body) * 2); this.y += 1;
        const full = b.t ? `[${b.label}]  ${b.t}` : `[${b.label}]`;
        this.wr(full, FS.body, 0, "#1d4ed8"); this.y += 0.5;
        break;
      }
    }
  }

  sec(num, title, color) {
    const h = 16; this.g(h + 15); const y = this.y;
    const [r, g, b] = color;
    this.d.setFillColor(r, g, b); this.d.roundedRect(M, y, CW, h, 2, 2, "F");
    this.d.setTextColor(255, 255, 255); this.d.setFontSize(7); this.sf();
    this.d.text(`SECTION ${num}`, M + 5, y + 6.5);
    this.d.setFontSize(11); this.d.text(title, M + 5, y + 13);
    this.d.setTextColor(0, 0, 0); this.y = y + h + 4;
  }

  prob(num) {
    this.g(13); const y = this.y;
    this.d.setFillColor(27, 22, 14); this.d.roundedRect(M, y, CW, 10, 2, 2, "F");
    this.d.setTextColor(255, 255, 255); this.d.setFontSize(11); this.sf();
    this.d.text(`문제 ${num}번`, M + 6, y + 7);
    this.d.setTextColor(0, 0, 0); this.y = y + 10 + 4;
  }
}

// ── Worker 메시지 핸들러 ─────────────────────────────────────────────────────

let fontB64 = null;

self.onmessage = function(e) {
  const { type, sections, problems, fontData } = e.data;

  try {
    if (fontData) fontB64 = fontData;

    const { jsPDF } = jspdf;
    const d = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    if (fontB64) {
      d.addFileToVFS("NG.ttf", fontB64);
      d.addFont("NG.ttf", "NG", "normal");
      try { d.setFont("NG", "normal"); } catch {}
    }

    const eng = new Eng(d);

    if (type === "single") {
      // sections = [{num, title, color, blocks: [...]}]
      for (const s of sections) {
        if (!s.blocks || s.blocks.length === 0) continue;
        eng.sec(s.num, s.title, s.color);
        for (const b of s.blocks) eng.draw(b);
        eng.y += 5;
      }
    } else if (type === "batch") {
      // problems = [{num, sections: [{num, title, color, blocks}]}]
      for (const p of problems) {
        eng.prob(p.num);
        for (const s of p.sections) {
          if (!s.blocks || s.blocks.length === 0) continue;
          eng.sec(s.num, s.title, s.color);
          for (const b of s.blocks) eng.draw(b);
          eng.y += 4;
        }
        eng.y += 5;
      }
    }

    const buf = d.output("arraybuffer");
    self.postMessage({ ok: true, buffer: buf }, [buf]);
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || "PDF 렌더링 오류" });
  }
};
