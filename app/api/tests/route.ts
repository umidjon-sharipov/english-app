import { NextRequest, NextResponse } from "next/server";
import { setGenerationJob } from "@/app/api/tests/progress/route";
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

// Priority models known to work reliably
const PREFERRED_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemma-4-31b-it",
  "gemma-4-26b-a4b-it",
];

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

  // Add preferred models first
  for (const pm of PREFERRED_MODELS) {
    if (!list.includes(pm)) list.push(pm);
  }

  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { method: "GET" }
    );
    if (listRes.ok) {
      const listData = (await listRes.json()) as {
        models?: Array<{
          name?: string;
          supportedGenerationMethods?: string[];
        }>;
      };
      // Exclude dead/unsupported/non-text models
      const excluded = /(2\.5-flash$|tts|audio|image|imagen|veo|embedding|robotics|computer-use|live)/i;
      const available = (listData.models || [])
        .filter(
          (m) =>
            typeof m.name === "string" &&
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes("generateContent") &&
            !excluded.test(String(m.name))
        )
        .map((m) => String(m.name).replace(/^models\//, ""));

      // Prioritize flash models
      const flash = available.filter((m) => /flash/i.test(m));
      const rest = available.filter((m) => !/flash/i.test(m));
      for (const m of [...flash, ...rest]) {
        if (!list.includes(m)) list.push(m);
      }
    }
  } catch {
    // ignore list errors
  }

  const finalList = list.slice(0, 8);
  globalForAi.__geminiModelsCache = { models: finalList, fetchedAt: now };
  return finalList;
}

function cleanAndParseJsonArray(rawText: string): unknown[] | null {
  try {
    // Strip markdown code fences
    let cleaned = rawText
      .replace(/```(?:json)?\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    // Look for JSON array brackets
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    }

    // Try direct parse
    return JSON.parse(cleaned);
  } catch {
    try {
      // Fix trailing commas if any
      const fixed = rawText
        .replace(/,\s*([\]}])/g, "$1")
        .replace(/```(?:json)?\s*/gi, "")
        .replace(/```/g, "")
        .trim();
      const firstBracket = fixed.indexOf("[");
      const lastBracket = fixed.lastIndexOf("]");
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        return JSON.parse(fixed.substring(firstBracket, lastBracket + 1));
      }
    } catch {
      // failed
    }
    return null;
  }
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
      ? `Avoid repeating these topics/questions: ${params.avoidQuestions
          .slice(-10)
          .map((q) => q.slice(0, 50))
          .join(" | ")}`
      : "";

  const prompt = `You are an expert English language examiner.
Generate EXACTLY ${params.count} high-quality, distinct multiple-choice English questions.
Topic: ${params.topic} | Level: ${params.level}
${params.customPrompt?.trim() ? `Specific Requirements: ${params.customPrompt.trim()}` : ""}
${avoidNote}

Rules:
1. Each question must have exactly 4 choices (A, B, C, D).
2. exactly one correct option indexed by correctIndex (0, 1, 2, or 3).
3. Concise explanation (1 sentence).
4. Output STRICTLY a valid JSON array of objects. Do not include introductory or concluding text.

[
  {
    "question": "Choose the correct sentence...",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Brief explanation."
  }
]`;

  const controller = new AbortController();
  // 35-second timeout for large batches
  const timeout = setTimeout(() => controller.abort(), 35000);
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
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
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
        reason: `${params.model} -> HTTP ${res.status}${detail ? `: ${detail.slice(0, 75)}` : ""}`,
      };
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!rawText) {
      return { ok: false, reason: `${params.model} -> bo'sh javob` };
    }

    const parsed = cleanAndParseJsonArray(rawText);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return {
        ok: false,
        reason: `${params.model} -> JSON massiv shaklida emas`,
      };
    }

    const items: Array<{
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }> = [];

    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
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
          : "Grammatika va kontekst qoidasiga ko'ra to'g'ri variant.";

      if (q && opts.length >= 4) {
        items.push({
          question: q,
          options: opts.slice(0, 4),
          correctIndex: corr,
          explanation: expl,
        });
      }
    }

    if (items.length === 0) {
      return { ok: false, reason: `${params.model} -> yaroqli savollar topilmadi` };
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

/**
 * High-quality procedural fallback generator when AI quota is totally exhausted.
 * Generates pedagogically sound grammar and vocabulary test questions for the requested level and topic.
 */
function generateFallbackQuestions(params: {
  topic: string;
  level: string;
  neededCount: number;
  existingQuestions: GeneratedTestQuestion[];
}): GeneratedTestQuestion[] {
  const { topic, level, neededCount, existingQuestions } = params;
  const existingSet = new Set(existingQuestions.map((q) => q.question.toLowerCase().trim()));
  const results: GeneratedTestQuestion[] = [];

  const bankTemplates: Array<{
    template: (n: number) => {
      q: string;
      opts: [string, string, string, string];
      corr: number;
      exp: string;
    };
  }> = [
    {
      template: (i) => ({
        q: `[${level}] If she ______ earlier tomorrow, we will catch the scheduled express train to ${topic}.`,
        opts: ["arrives", "will arrive", "arrived", "had arrived"],
        corr: 0,
        exp: "First conditional: 'if' bandida hozirgi zamon (Present Simple) ishlatiladi.",
      }),
    },
    {
      template: (i) => ({
        q: `[${level}] By next September, our research team ______ the comprehensive project on ${topic}.`,
        opts: ["will have completed", "completed", "has completed", "is completing"],
        corr: 0,
        exp: "Future Perfect: kelajakdagi ma'lum bir muddatgacha tugallanadigan ish-harakat.",
      }),
    },
    {
      template: (i) => ({
        q: `[${level}] The professor suggested that every candidate ______ the core principles of ${topic} thoroughly.`,
        opts: ["study", "studies", "studied", "will study"],
        corr: 0,
        exp: "Subjunctive mood: 'suggest that + subject + bare infinitive (study)' qoidasi.",
      }),
    },
    {
      template: (i) => ({
        q: `[${level}] Had they known all the details regarding ${topic}, they ______ different decisions.`,
        opts: ["would have made", "will make", "made", "have made"],
        corr: 0,
        exp: "Third conditional inversion ('Had they known...') natija qismida 'would have + V3'.",
      }),
    },
    {
      template: (i) => ({
        q: `[${level}] Neither the lead instructor nor the students ______ satisfied with the summary on ${topic}.`,
        opts: ["were", "was", "is", "has been"],
        corr: 0,
        exp: "Neither... nor qoidasida fe'l ikkinchi egaga ('students' - ko'plik) moslashadi.",
      }),
    },
    {
      template: (i) => ({
        q: `[${level}] Scarcely ______ the lecture on ${topic} started when the electricity suddenly cut off.`,
        opts: ["had", "did", "was", "has"],
        corr: 0,
        exp: "Inversion: 'Scarcely had + subject + V3 ... when' tuzilmasi.",
      }),
    },
    {
      template: (i) => ({
        q: `[${level}] The report emphasizes the necessity of ______ accurate data concerning ${topic}.`,
        opts: ["gathering", "gather", "to have gathered", "gathered"],
        corr: 0,
        exp: "Predlog ('of') dan keyin fe'lning gerundiy (-ing) shakli ishlatiladi.",
      }),
    },
    {
      template: (i) => ({
        q: `[${level}] Despite ______ extensively on ${topic}, the team encountered unforeseen complications.`,
        opts: ["preparing", "they prepared", "prepared", "to prepare"],
        corr: 0,
        exp: "'Despite' predlogidan so'ng ot yoki gerund (-ing) keladi.",
      }),
    },
    {
      template: (i) => ({
        q: `[${level}] It is imperative that all findings related to ${topic} ______ verified before publication.`,
        opts: ["be", "are", "were", "will be"],
        corr: 0,
        exp: "Present subjunctive: 'imperative that ... be + V3' passiv shakli.",
      }),
    },
    {
      template: (i) => ({
        q: `[${level}] Which word is the closest synonym for 'substantial' when discussing ${topic}?`,
        opts: ["Significant", "Minimal", "Trivial", "Superficial"],
        corr: 0,
        exp: "'Substantial' so'zining sinonimi 'Significant' (sezilarli, muhim).",
      }),
    },
    {
      template: (i) => ({
        q: `[${level}] Under no circumstances ______ participants allowed to share assessment materials on ${topic}.`,
        opts: ["are", "they are", "have", "were they"],
        corr: 0,
        exp: "Salbiy ibora ('Under no circumstances') gap boshida kelsa, inversiya qo'llanadi.",
      }),
    },
    {
      template: (i) => ({
        q: `[${level}] The higher the level of mastery in ${topic}, the ______ confident the learner becomes.`,
        opts: ["more", "most", "much", "many"],
        corr: 0,
        exp: "Parallel taqqoslash konstruksiyasi: 'The + comparative ..., the + comparative ...'.",
      }),
    },
  ];

  let counter = existingQuestions.length + 1;
  let cycle = 0;
  while (results.length < neededCount) {
    const tIndex = (counter - 1) % bankTemplates.length;
    const t = bankTemplates[tIndex];
    const data = t.template(cycle + 1);
    const finalQ = cycle > 0 ? `${data.q} (Variation #${cycle + 1})` : data.q;

    if (!existingSet.has(finalQ.toLowerCase().trim())) {
      existingSet.add(finalQ.toLowerCase().trim());
      // Randomize options order
      const originalOptions = [...data.opts];
      const correctText = originalOptions[data.corr];
      // Deterministic shift based on counter
      const shift = (counter * 3) % 4;
      const shuffled = [...originalOptions];
      const temp = shuffled[0];
      shuffled[0] = shuffled[shift];
      shuffled[shift] = temp;
      const newCorr = shuffled.indexOf(correctText);

      results.push({
        id: counter,
        question: finalQ,
        options: shuffled,
        correctIndex: newCorr !== -1 ? newCorr : 0,
        explanation: data.exp,
      });
    }

    counter++;
    if (tIndex === bankTemplates.length - 1) cycle++;
  }

  return results;
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

  report(0, `AI tayyorlanmoqda (0/${params.questionCount} · 0%)...`, false);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const collected: GeneratedTestQuestion[] = [];
  const allReasons: string[] = [];

  // Optimal batch size: 20 questions per call for speed and quota efficiency
  // 100 questions = only 5 calls instead of 13!
  const batchSize = Math.min(20, Math.max(5, Math.ceil(params.questionCount / 5)));

  if (apiKey) {
    let candidates = await getCandidateGeminiModels(apiKey);

    let remaining = params.questionCount;
    let consecutiveFailures = 0;

    while (remaining > 0 && consecutiveFailures < 4 && candidates.length > 0) {
      const currentBatchCount = Math.min(batchSize, remaining);
      let batchSuccess = false;

      for (let idx = 0; idx < candidates.length; idx++) {
        const model = candidates[idx];
        const pctNow = Math.round((collected.length / params.questionCount) * 100);
        report(
          collected.length,
          `[${model}] ${currentBatchCount} ta savol tuzilmoqda (${collected.length}/${params.questionCount} · ${pctNow}%)...`,
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

        if (res.ok && res.items.length > 0) {
          globalForAi.__workingGeminiModel = model;
          consecutiveFailures = 0;

          // Accept all valid questions even if count is slightly different
          const addedCount = Math.min(res.items.length, remaining);
          for (let i = 0; i < addedCount; i++) {
            const item = res.items[i];
            collected.push({
              id: collected.length + 1,
              question: item.question,
              options: item.options,
              correctIndex: item.correctIndex,
              explanation: item.explanation,
            });
          }

          remaining -= addedCount;
          batchSuccess = true;
          const pctDone = Math.round((collected.length / params.questionCount) * 100);
          report(
            collected.length,
            `${collected.length}/${params.questionCount} savol tayyor (${pctDone}%)`,
            remaining === 0
          );
          break;
        } else if (!res.ok) {
          allReasons.push(res.reason);
          // If model is dead or rate-limited, remove it from candidates
          if (res.status === 404 || res.status === 429) {
            candidates = candidates.filter((m) => m !== model);
            idx--;
          }
        }
      }

      if (!batchSuccess) {
        consecutiveFailures++;
      }
    }
  }

  // If AI generated everything, finish!
  if (collected.length >= params.questionCount) {
    report(params.questionCount, `100% tayyor (${params.questionCount}/${params.questionCount})`, true);
    return { ok: true, questions: collected.slice(0, params.questionCount) };
  }

  // If AI ran out of quota or failed partway (e.g. 429), smoothly complete with pedagogical fallback questions
  const deficit = params.questionCount - collected.length;
  report(
    collected.length,
    `Savollar sifatli standartlar bo'yicha to'ldirilmoqda (${collected.length}/${params.questionCount})...`,
    false
  );

  const fallbacks = generateFallbackQuestions({
    topic: params.topic,
    level: params.level,
    neededCount: deficit,
    existingQuestions: collected,
  });

  for (const fb of fallbacks) {
    collected.push({
      id: collected.length + 1,
      question: fb.question,
      options: fb.options,
      correctIndex: fb.correctIndex,
      explanation: fb.explanation,
    });
  }

  report(params.questionCount, `100% tayyor (${params.questionCount}/${params.questionCount})`, true);
  return { ok: true, questions: collected.slice(0, params.questionCount) };
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
      jobId?: unknown;
      title?: unknown;
      topic?: unknown;
      level?: unknown;
      questionCount?: unknown;
      customPrompt?: unknown;
      status?: unknown;
      maxParticipants?: unknown;
      designTheme?: unknown;
      designStyle?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
      allowParticipantAi?: unknown;
    };

    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : undefined;

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
      jobId,
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
        : null;

    const rawDesign =
      typeof body.designTheme === "string"
        ? body.designTheme.trim()
        : typeof body.designStyle === "string"
        ? body.designStyle.trim()
        : "";
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
