/**
 * HWPX Document Model — TypeScript representation of OWPML elements.
 */

export interface HwpxDocument {
  sections: HwpxSection[];
  images: HwpxImage[];
  settings: HwpxSettings;
}

export interface HwpxSettings {
  pageWidth: number;   // mm
  pageHeight: number;  // mm
  marginLeft: number;  // mm
  marginRight: number; // mm
  marginTop: number;   // mm
  marginBottom: number;// mm
  columns: number;
  columnGap: number;   // mm
  lineSpacing: number; // percent (e.g. 160)
}

export interface HwpxSection {
  paragraphs: HwpxParagraph[];
  pageBreakBefore?: boolean;
}

export interface HwpxParagraph {
  runs: HwpxRun[];
  align?: "left" | "center" | "right" | "justify";
  lineSpacing?: number;
  spaceBefore?: number;
  spaceAfter?: number;
}

export type HwpxRun =
  | HwpxTextRun
  | HwpxEquationRun
  | HwpxImageRun
  | HwpxLineBreakRun;

export interface HwpxTextRun {
  type: "text";
  text: string;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;     // pt (default 10)
  fontFace?: string;     // default "함초롬바탕"
  color?: string;        // hex "#RRGGBB"
}

export interface HwpxEquationRun {
  type: "equation";
  hwpEqn: string;        // HwpEqn format string
  display?: boolean;     // display equation (block) vs inline
  fontSize?: number;     // base size in pt
}

export interface HwpxImageRun {
  type: "image";
  imageId: string;       // references HwpxImage.id
  width: number;         // mm
  height: number;        // mm
}

export interface HwpxLineBreakRun {
  type: "lineBreak";
}

export interface HwpxImage {
  id: string;
  data: Buffer | Uint8Array;
  mimeType: string;
  filename: string;
}

export const DEFAULT_SETTINGS: HwpxSettings = {
  pageWidth: 210,
  pageHeight: 297,
  marginLeft: 15,
  marginRight: 15,
  marginTop: 15,
  marginBottom: 15,
  columns: 1,
  columnGap: 6,
  lineSpacing: 160,
};
