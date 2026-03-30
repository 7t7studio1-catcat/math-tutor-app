"use client";

/**
 * 히스토리 모드 — 유튜브형 풀이 기록 카드 피드
 *
 * 기존 HistoryView 컴포넌트를 래핑.
 */

import HistoryView from "@/components/HistoryView";

export default function HistoryMode() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-24">
      <HistoryView />
    </div>
  );
}
