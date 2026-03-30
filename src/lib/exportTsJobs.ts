/**
 * In-memory HWPX async export jobs (dev / 단일 Node 프로세스).
 * Cloudflare Tunnel 등 프록시 100s 제한을 피하려면 POST는 즉시 202, 결과는 폴링.
 */

export type ExportTsJobState =
  | { status: "pending"; created: number }
  | { status: "ready"; created: number; buffer: Buffer; filename: string }
  | { status: "error"; created: number; error: string };

const jobs = new Map<string, ExportTsJobState>();
const TTL_MS = 30 * 60_000;

function pruneOld() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.created > TTL_MS) jobs.delete(id);
  }
}

export function createPendingJob(id: string) {
  pruneOld();
  jobs.set(id, { status: "pending", created: Date.now() });
}

export function resolveExportJob(
  id: string,
  buffer: Buffer,
  filename: string,
) {
  jobs.set(id, { status: "ready", created: Date.now(), buffer, filename });
}

export function rejectExportJob(id: string, error: string) {
  jobs.set(id, { status: "error", created: Date.now(), error });
}

export function getExportJob(id: string): ExportTsJobState | undefined {
  return jobs.get(id);
}

export function deleteExportJob(id: string) {
  jobs.delete(id);
}
