/**
 * Publisher-specific style presets for publication-quality HWPX output.
 *
 * Each publisher has different layout, font, and formatting requirements.
 */

import type { HwpxSettings } from "./types";

export interface PublisherStyle {
  id: string;
  name: string;
  nameKo: string;
  settings: HwpxSettings;
  fonts: {
    heading: string;
    body: string;
    math: string;
  };
  colors: {
    heading: string;
    sectionTitle: string;
    body: string;
    accent: string;
  };
  layout: {
    sectionHeaderStyle: "numbered" | "boxed" | "underlined";
    choiceLayout: "grid" | "vertical";
    graphMaxWidthMm: number;
    graphMaxHeightMm: number;
  };
}

export const PUBLISHER_STYLES: Record<string, PublisherStyle> = {
  default: {
    id: "default",
    name: "Default",
    nameKo: "기본",
    settings: {
      pageWidth: 210,
      pageHeight: 297,
      marginLeft: 15,
      marginRight: 15,
      marginTop: 15,
      marginBottom: 15,
      columns: 1,
      columnGap: 6,
      lineSpacing: 160,
    },
    fonts: { heading: "함초롬돋움", body: "함초롬바탕", math: "HancomEQN" },
    colors: { heading: "#1a1a1a", sectionTitle: "#2D5BFF", body: "#1a1a1a", accent: "#0569ED" },
    layout: {
      sectionHeaderStyle: "numbered",
      choiceLayout: "grid",
      graphMaxWidthMm: 70,
      graphMaxHeightMm: 70,
    },
  },

  megastudy: {
    id: "megastudy",
    name: "Megastudy",
    nameKo: "메가스터디",
    settings: {
      pageWidth: 210,
      pageHeight: 297,
      marginLeft: 18,
      marginRight: 18,
      marginTop: 20,
      marginBottom: 18,
      columns: 2,
      columnGap: 8,
      lineSpacing: 170,
    },
    fonts: { heading: "함초롬돋움", body: "함초롬바탕", math: "HancomEQN" },
    colors: { heading: "#1B3A6B", sectionTitle: "#1B3A6B", body: "#222222", accent: "#2E6BD6" },
    layout: {
      sectionHeaderStyle: "boxed",
      choiceLayout: "grid",
      graphMaxWidthMm: 65,
      graphMaxHeightMm: 65,
    },
  },

  daesung: {
    id: "daesung",
    name: "Daesung",
    nameKo: "대성",
    settings: {
      pageWidth: 210,
      pageHeight: 297,
      marginLeft: 16,
      marginRight: 16,
      marginTop: 18,
      marginBottom: 16,
      columns: 2,
      columnGap: 7,
      lineSpacing: 165,
    },
    fonts: { heading: "함초롬돋움", body: "함초롬바탕", math: "HancomEQN" },
    colors: { heading: "#2C2C2C", sectionTitle: "#0B5394", body: "#1a1a1a", accent: "#0B5394" },
    layout: {
      sectionHeaderStyle: "underlined",
      choiceLayout: "vertical",
      graphMaxWidthMm: 68,
      graphMaxHeightMm: 68,
    },
  },

  sidaein: {
    id: "sidaein",
    name: "SidaeIn",
    nameKo: "시대인재",
    settings: {
      pageWidth: 210,
      pageHeight: 297,
      marginLeft: 17,
      marginRight: 17,
      marginTop: 19,
      marginBottom: 17,
      columns: 2,
      columnGap: 7,
      lineSpacing: 165,
    },
    fonts: { heading: "함초롬돋움", body: "함초롬바탕", math: "HancomEQN" },
    colors: { heading: "#1a1a1a", sectionTitle: "#7B2D8E", body: "#1a1a1a", accent: "#7B2D8E" },
    layout: {
      sectionHeaderStyle: "numbered",
      choiceLayout: "grid",
      graphMaxWidthMm: 66,
      graphMaxHeightMm: 66,
    },
  },

  ebs: {
    id: "ebs",
    name: "EBS",
    nameKo: "EBS",
    settings: {
      pageWidth: 188,
      pageHeight: 257,
      marginLeft: 14,
      marginRight: 14,
      marginTop: 16,
      marginBottom: 14,
      columns: 2,
      columnGap: 6,
      lineSpacing: 160,
    },
    fonts: { heading: "함초롬돋움", body: "함초롬바탕", math: "HancomEQN" },
    colors: { heading: "#1a1a1a", sectionTitle: "#00598A", body: "#1a1a1a", accent: "#00598A" },
    layout: {
      sectionHeaderStyle: "boxed",
      choiceLayout: "grid",
      graphMaxWidthMm: 60,
      graphMaxHeightMm: 60,
    },
  },
};

export function getPublisherStyle(id: string): PublisherStyle {
  return PUBLISHER_STYLES[id] ?? PUBLISHER_STYLES.default;
}

export function listPublisherStyles(): Array<{ id: string; nameKo: string }> {
  return Object.values(PUBLISHER_STYLES).map((s) => ({ id: s.id, nameKo: s.nameKo }));
}
