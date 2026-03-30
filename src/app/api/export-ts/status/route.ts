import { NextRequest } from "next/server";
import {
  deleteExportJob,
  getExportJob,
} from "@/lib/exportTsJobs";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return Response.json({ error: "jobId 필요" }, { status: 400 });
  }

  const job = getExportJob(jobId);
  if (!job) {
    return Response.json({ error: "작업을 찾을 수 없습니다" }, { status: 404 });
  }

  if (job.status === "pending") {
    return Response.json({ status: "pending" }, { status: 202 });
  }

  if (job.status === "error") {
    deleteExportJob(jobId);
    return Response.json({ error: job.error }, { status: 500 });
  }

  deleteExportJob(jobId);
  return new Response(new Uint8Array(job.buffer), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${job.filename}"`,
    },
  });
}
