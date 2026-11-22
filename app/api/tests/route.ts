import { NextRequest, NextResponse } from "next/server";
import { setGenerationJob } from "@/app/api/tests/progress/route";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const db = prisma as typeof prisma & {
  test: any;
  user: any;
  session?: any;
};

export interface GeneratedTestQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export async function requireAuthUserId(req: NextRequest): Promise<string | null> {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const extractId = (val: unknown): string | null => {
    if (typeof val === "string" && uuidRegex.test(val.trim())) return val.trim();
    if (val && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      for (const k of ["userId", "id", "sub"]) {
        if (typeof obj[k] === "string" && uuidRegex.test(obj[k].trim())) return obj[k].trim();
      }
      if (obj.user && typeof obj.user === "object") {
        const u = obj.user as Record<string, unknown>;
        if (typeof u.id === "string" && uuidRegex.test(u.id.trim())) return u.id.trim();
      }
    }
    return null;
  };

  const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
    try {
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
      return JSON.parse(Buffer.from(b64 + pad, "base64").toString("utf8"));
    } catch {
      return null;
    }
  };

  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    const idFromJwt = extractId(decodeJwtPayload(token));
    if (idFromJwt) return idFromJwt;
  }

  for (const c of req.cookies.getAll()) {
    const raw = decodeURIComponent(c.value || "").trim();
    if (!raw) continue;
    const direct = extractId(raw);
    if (direct) return direct;

    const fromJwt = extractId(decodeJwtPayload(raw));
    if (fromJwt) return fromJwt;

    try {
      const fromJson = extractId(JSON.parse(raw));
      if (fromJson) return fromJson;
    } catch {
      // ignore non-JSON cookie
    }
  }

  return null;
}

const globalForAi = globalThis as unknown as {
  __workingGeminiModel?: string;
  __geminiModelsCache?: { models: string[]; fetchedAt: number };
};

async function getCandidateGeminiModels(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (
    globalForAi.__geminiModelsCache &&
    now - globalForAi.__geminiModelsCache.fetchedAt < 10 * 60 * 1000 &&
    globalForAi.__geminiModelsCache.models.length > 0
  ) {
    const cached = [...globalForAi.__geminiModelsCache.models];
    if (globalForAi.__workingGeminiModel && cached.includes(globalForAi.__workingGeminiModel)) {
      return [
        globalForAi.__workingGeminiModel,
        ...cached.filter((m) => m !== globalForAi.__workingGeminiModel),
      ];
    }
    return cached;
  }

  const list: string[] = [];
  if (globalForAi.__workingGeminiModel) {
    list.push(globalForAi.__workingGeminiModel);
  }
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel) {
    const cleanEnv = envModel.replace(/^models\//, "");
    if (!list.includes(cleanEnv)) list.push(cleanEnv);
  }

  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`,
      { method: "GET" }
    );
    if (listRes.ok) {
      const listData = (await listRes.json()) as {
        models?: Array<{
          name?: string;
          supportedGenerationMethods?: string[];
        }>;
      };
      const excluded = /(tts|audio|image|imagen|veo|embedding|robotics|computer-use|live)/i;
      const available = (listData.models || [])
        .filter(
          (m) =>
            typeof m.name === "string" &&
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes("generateContent") &&
            !excluded.test(String(m.name))
        )
        .map((m) => String(m.name).replace(/^models\//, ""));

      const flashFirst = available.filter((m) => /flash/i.test(m));
      const rest = available.filter((m) => !/flash/i.test(m));
      for (const m of [...flashFirst, ...rest]) {
        if (!list.includes(m)) list.push(m);
      }
    }
  } catch {
    // ignore list errors
  }

  const finalList = list.slice(0, 6);
  globalForAi.__geminiModelsCache = { models: finalList, fetchedAt: now };
  return finalList;
}

async function generateBatchWithModel(params: {
  apiKey: string;
  model: string;
  topic: string;
  level: string;
  count: number;
  customPrompt?: string;
  avoidQuestions: string[];
}): Promise<
  | {
      ok: true;
      items: Array<{
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }>;
    }
  | { ok: false; reason: string; status?: number }
> {
  const key = (params.apiKey || process.env.GEMINI_API_KEY || "").trim();
  if (!key) {
    return { ok: false, reason: `${params.model} -> GEMINI_API_KEY topilmadi` };
  }

  const avoidNote =
    params.avoidQuestions.length > 0
      ? `Avoid repeating: ${params.avoidQuestions
          .slice(-8)
          .map((q) => q.slice(0, 55))
          .join(" | ")}`
      : "";

  const prompt = `Generate EXACTLY ${params.count} distinct multiple-choice English questions.
Topic: ${params.topic} | Level: ${params.level}
${params.customPrompt?.trim() ? `Style/Focus: ${params.customPrompt.trim()}` : ""}
${avoidNote}

Keep explanations short (1 sentence). Return ONLY a JSON array:
[{"question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"..."}]`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${encodeURIComponent(
        key
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75 },
        }),
      }
    );

    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = j?.error?.message || "";
      } catch {
        detail = "";
      }
      return {
        ok: false,
        status: res.status,
        reason: `${params.model} -> HTTP ${res.status}${detail ? `: ${detail.slice(0, 65)}` : ""}`,
      };
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!rawText) {
      return { ok: false, reason: `${params.model} -> bo'sh javob` };
    }

    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : cleaned);

    if (!Array.isArray(parsed) || parsed.length < params.count) {
      return {
        ok: false,
        reason: `${params.model} -> ${Array.isArray(parsed) ? parsed.length : 0}/${params.count} savol`,
      };
    }

    const items: Array<{
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }> = [];

    for (let i = 0; i < params.count; i++) {
      const row = parsed[i];
      if (!row || typeof row !== "object") {
        return { ok: false, reason: `${params.model} -> noto'g'ri savol obyekti` };
      }
      const obj = row as Record<string, unknown>;
      const q = typeof obj.question === "string" ? obj.question.trim() : "";
      const opts = Array.isArray(obj.options)
        ? obj.options
            .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
            .map((o) => o.trim())
        : [];
      const corr =
        typeof obj.correctIndex === "number" &&
        Number.isInteger(obj.correctIndex) &&
        obj.correctIndex >= 0 &&
        obj.correctIndex < 4
          ? obj.correctIndex
          : 0;
      const expl =
        typeof obj.explanation === "string" && obj.explanation.trim()
          ? obj.explanation.trim()
          : "To'g'ri javob kontekst va qoidaga mos.";

      if (!q || opts.length < 4) {
        return { ok: false, reason: `${params.model} -> variantlar to'liq emas` };
      }
      items.push({ question: q, options: opts.slice(0, 4), correctIndex: corr, explanation: expl });
    }

    return { ok: true, items };
  } catch (err) {
    return {
      ok: false,
      reason: `${params.model} -> ${err instanceof Error ? err.message : "xato"}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateStrictAiQuestions(params: {
  topic: string;
  level: string;
  questionCount: number;
  customPrompt?: string;
  jobId?: string;
}): Promise<{ ok: true; questions: GeneratedTestQuestion[] } | { ok: false; error: string }> {
  const jobId = params.jobId || "";
  const report = (completed: number, statusText: string, done = false, error?: string) => {
    if (!jobId) return;
    const percent = Math.min(100, Math.round((completed / Math.max(1, params.questionCount)) * 100));
    setGenerationJob({
      id: jobId,
      total: params.questionCount,
      completed,
      percent,
      statusText,
      done,
      error,
      updatedAt: Date.now(),
    });
  };

  report(0, `Modellar tekshirilmoqda (0/${params.questionCount} · 0%)...`, false);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const msg = "AI test yarata olmadi: GEMINI_API_KEY sozlanmagan.";
    report(0, msg, true, msg);
    return { ok: false, error: msg };
  }

  let candidates = await getCandidateGeminiModels(apiKey);
  if (candidates.length === 0) {
    const msg = "AI test yarata olmadi: mos Gemini modeli topilmadi.";
    report(0, msg, true, msg);
    return { ok: false, error: msg };
  }

  const batchSize = 8;
  const collected: GeneratedTestQuestion[] = [];
  const allReasons: string[] = [];

  let remaining = params.questionCount;
  while (remaining > 0) {
    const currentBatchCount = Math.min(batchSize, remaining);
    let batchSuccess = false;

    for (let idx = 0; idx < candidates.length; idx++) {
      const model = candidates[idx];
      const pctNow = Math.round((collected.length / params.questionCount) * 100);
      report(
        collected.length,
        `[${model}] ${currentBatchCount} ta savol tuzmoqda (${collected.length}/${params.questionCount} · ${pctNow}%)...`,
        false
      );

      const res = await generateBatchWithModel({
        apiKey,
        model,
        topic: params.topic,
        level: params.level,
        count: currentBatchCount,
        customPrompt: params.customPrompt,
        avoidQuestions: collected.map((c) => c.question),
      });

      if (res.ok) {
        globalForAi.__workingGeminiModel = model;
        for (const item of res.items) {
          collected.push({
            id: collected.length + 1,
            question: item.question,
            options: item.options,
            correctIndex: item.correctIndex,
            explanation: item.explanation,
          });
        }
        remaining -= currentBatchCount;
        batchSuccess = true;
        const pctDone = Math.round((collected.length / params.questionCount) * 100);
        report(
          collected.length,
          `${collected.length}/${params.questionCount} savol tayyor (${pctDone}%)`,
          remaining === 0
        );
        break;
      } else {
        allReasons.push(res.reason);
        if (res.status === 404 || res.status === 429) {
          candidates = candidates.filter((m) => m !== model);
          idx--;
        }
        report(
          collected.length,
          `${model} javob bermadi, keyingisiga o'tilyapti (${collected.length}/${params.questionCount})...`,
          false
        );
      }
    }

    if (!batchSuccess) {
      const errMsg = `AI testni generatsiya qila olmadi (${collected.length}/${params.questionCount} tayyor): ${allReasons
        .slice(-5)
        .join(" | ")}`;
      report(collected.length, errMsg, true, errMsg);
      return { ok: false, error: errMsg };
    }
  }

  report(params.questionCount, `100% tayyor (${params.questionCount}/${params.questionCount})`, true);
  return { ok: true, questions: collected };
}

const testInclude = {
  creator: {
    select: { id: true, firstName: true, lastName: true, userName: true },
  },
  participants: {
    orderBy: { joinedAt: "desc" as const },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, userName: true },
      },
    },
  },
};

export async function GET(req: NextRequest) {
  try {
    if (!db.test || typeof db.test.findMany !== "function") {
      return NextResponse.json({ tests: [] });
    }
    const { searchParams } = new URL(req.url);
    const includeAll = searchParams.get("all") === "1";

    const viewerId = await requireAuthUserId(req);
    const tests = await db.test.findMany({
      where: includeAll ? undefined : { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      include: testInclude,
    });

    const sanitizedTests = tests.map((t: Record<string, unknown>) => {
      const isCreator = Boolean(viewerId && t.creatorId === viewerId);
      if (isCreator) return t;
      return {
        ...t,
        blockedUserIds: [],
        participants: [],
      };
    });

    return NextResponse.json({ tests: sanitizedTests });
  } catch (error) {
    console.error("GET /api/tests error:", error);
    return NextResponse.json(
      { error: "Testlarni yuklashda xatolik." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let creatorId = await requireAuthUserId(req);
    if (!creatorId && db.user && typeof db.user.findFirst === "function") {
      const first = await db.user.findFirst({ select: { id: true } });
      if (first?.id) creatorId = first.id;
    }
    if (!creatorId) {
      return NextResponse.json(
        { error: "Avval tizimga kiring (401)." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      title?: unknown;
      topic?: unknown;
      level?: unknown;
      questionCount?: unknown;
      customPrompt?: unknown;
      status?: unknown;
      maxParticipants?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
      allowParticipantAi?: unknown;
    };

    const topic =
      typeof body.topic === "string" && body.topic.trim()
        ? body.topic.trim()
        : "Grammar & Tenses";

    const level =
      typeof body.level === "string" && body.level.trim()
        ? body.level.trim().toUpperCase()
        : "B1";

    const rawCount = Number(body.questionCount);
    const questionCount = Number.isFinite(rawCount)
      ? Math.min(100, Math.max(5, Math.round(rawCount)))
      : 10;

    const customPrompt =
      typeof body.customPrompt === "string" ? body.customPrompt.trim() : "";

    const aiResult = await generateStrictAiQuestions({
      topic,
      level,
      questionCount,
      customPrompt,
    });

    if (!aiResult.ok) {
      return NextResponse.json({ error: aiResult.error }, { status: 422 });
    }

    const status: "OPEN" | "CLOSED" =
      body.status === "CLOSED" ? "CLOSED" : "OPEN";

    const maxParticipants =
      body.maxParticipants !== undefined &&
      body.maxParticipants !== null &&
      String(body.maxParticipants).trim() !== ""
        ? Math.max(1, Math.round(Number(body.maxParticipants)))
        : null;  const rawDesign = typeof body.designTheme === "string" ? body.designTheme.trim() : typeof body.designStyle === "string" ? body.designStyle.trim() : "";
  const designTheme = rawDesign || "Minimal";

    const startsAt =
      typeof body.startsAt === "string" && body.startsAt.trim()
        ? new Date(body.startsAt)
        : null;
    const endsAt =
      typeof body.endsAt === "string" && body.endsAt.trim()
        ? new Date(body.endsAt)
        : null;

    const allowParticipantAi = body.allowParticipantAi === true;

    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : `${level} · ${topic} (${questionCount} Qs)`;

    const created = await db.test.create({
      data: {
        title,
        topic,
        level,
        questionCount,
        status,
        maxParticipants,
        startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
        endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
        allowParticipantAi,
        blockedUserIds: [],
        questionsJson: JSON.parse(JSON.stringify(aiResult.questions)),
        creatorId,
        designTheme,
      },
      include: testInclude,
    });

    return NextResponse.json({ test: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tests error:", error);
    return NextResponse.json(
      { error: "Test yaratishda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
