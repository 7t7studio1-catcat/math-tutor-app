"use client";

/**
 * IndexedDB 기반 풀이 저장소 v2
 * - 과목/단원/유형/정답률/난이도 메타데이터 지원
 * - 유튜브형 피드에 필요한 인덱스 제공
 */

import type { SubjectId, ProblemMeta } from "@/lib/subjects";
import { getDifficultyFromRate } from "@/lib/subjects";

export interface SavedSolution {
  id: string;
  createdAt: number;
  mode: "image" | "pdf";
  taskType?: "solve" | "variation";
  subject?: SubjectId;
  meta?: ProblemMeta;
  imagePreview?: string;
  pdfFileName?: string;
  problemNum?: number;
  sections: [string, string, string, string];
}

const DB_NAME = "smartpuli_v2";
const DB_VERSION = 1;
const STORE = "solutions";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("createdAt", "createdAt", { unique: false });
        s.createIndex("subject", "subject", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// STEP 2 콘텐츠에서 메타데이터 JSON 추출
export function extractMeta(content: string, subject?: SubjectId): ProblemMeta | undefined {
  const match = content.match(/```meta\s*\n\s*(\{[\s\S]*?\})\s*\n\s*```/);
  if (!match) return undefined;
  try {
    const raw = JSON.parse(match[1]) as {
      unit1?: string; unit2?: string; unit3?: string; unit4?: string;
      chapter?: string; section?: string; topic?: string;
      isMultipleChoice?: boolean; estimatedRate?: number;
    };
    const rate = typeof raw.estimatedRate === "number" ? raw.estimatedRate : 50;
    const isMC = raw.isMultipleChoice !== false;
    const u1 = raw.unit1 ?? raw.chapter ?? "";
    const u2 = raw.unit2 ?? raw.section ?? "";
    const u3 = raw.unit3 ?? raw.topic ?? "";
    const u4 = raw.unit4 ?? "";
    return {
      subject: subject ?? "common1",
      unit1: u1, unit2: u2, unit3: u3, unit4: u4,
      chapter: u1, section: u2, topic: u4 || u3,
      isMultipleChoice: isMC,
      estimatedRate: rate,
      difficulty: getDifficultyFromRate(rate, isMC),
    };
  } catch {
    return undefined;
  }
}

// STEP 2 콘텐츠에서 메타 JSON 블록을 제거 (화면 표시용)
export function stripMeta(content: string): string {
  return content.replace(/```meta\s*\n\s*\{[\s\S]*?\}\s*\n\s*```/g, "").trim();
}

export async function saveSolution(
  sol: Omit<SavedSolution, "id" | "createdAt">,
): Promise<string> {
  const db = await openDB();
  const id = genId();

  const record: SavedSolution = { ...sol, id, createdAt: Date.now() };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllSolutions(): Promise<SavedSolution[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("createdAt");
    const req = idx.openCursor(null, "prev");
    const results: SavedSolution[] = [];
    req.onsuccess = () => {
      const c = req.result;
      if (c) { results.push(c.value as SavedSolution); c.continue(); }
      else resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getSolution(id: string): Promise<SavedSolution | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as SavedSolution) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSolution(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllSolutions(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
