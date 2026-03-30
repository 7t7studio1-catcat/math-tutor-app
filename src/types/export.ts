/**
 * HWPX 내보내기 관련 공유 타입
 */

export type ExportFormat = "solution" | "solution-batch" | "workbook" | "workbook-multi";

export interface ExportProblem {
  num: number;
  sections: string[];
  cropImage?: string;
}

export interface ExportRequest {
  format: ExportFormat;
  sections?: string[];
  problems?: ExportProblem[];
  problemImage?: string;
  graphImages?: string[];
  includeOriginal?: boolean;
  subject?: string;
}
