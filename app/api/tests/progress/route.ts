import { NextRequest, NextResponse } from "next/server";

export type GenerationJobState = {
  id: string;
  total: number;
  completed: number;
  percent: number;
  statusText: string;
  done: boolean;
  error?: string;
  updatedAt: number;
};

const g = globalThis as unknown as {
  __testGenerationJobs?: Map<string, GenerationJobState>;
};

if (!g.__testGenerationJobs) {
  g.__testGenerationJobs = new Map<string, GenerationJobState>();
}

export function setGenerationJob(job: GenerationJobState) {
  const map = g.__testGenerationJobs!;
  // Cleanup old finished jobs older than 10 minutes
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of map.entries()) {
    if (v.updatedAt < cutoff) map.delete(k);
  }
  map.set(job.id, { ...job, updatedAt: Date.now() });
}

export function getGenerationJob(id: string): GenerationJobState | null {
  return g.__testGenerationJobs?.get(id) ?? null;
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId")?.trim() || "";
  if (!jobId) {
    return NextResponse.json({ error: "jobId kerak" }, { status: 400 });
  }
  const job = getGenerationJob(jobId);
  if (!job) {
    return NextResponse.json(
      {
        id: jobId,
        total: 0,
        completed: 0,
        percent: 0,
        statusText: "Boshlanmoqda...",
        done: false,
      },
      { status: 200 }
    );
  }
  return NextResponse.json(job, { status: 200 });
}
