import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

const db = prisma as typeof prisma & {
  test: any;
  testParticipant: any;
  user: any;
};

export interface GeneratedQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export async function requireAuthUserId(req: NextRequest): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const headerToken =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
      null;

    const candidates: string[] = [];
    if (headerToken) candidates.push(headerToken);

    for (const name of ["token", "auth_token", "access_token", "session", "jwt", "auth"]) {
      const val = cookieStore.get(name)?.value;
      if (val && !candidates.includes(val)) candidates.push(val);
    }
    for (const c of allCookies) {
      if (c.value && !candidates.includes(c.value)) candidates.push(c.value);
    }

    for (const token of candidates) {
      if (typeof verifyToken === "function") {
        try {
          const payload = await Promise.resolve(verifyToken(token));
          if (payload && typeof payload === "object") {
            const record = payload as Record<string, unknown>;
            const nested =
              record.user && typeof record.user === "object"
                ? (record.user as Record<string, unknown>)
                : null;
            const rawId =
              record.userId ?? record.id ?? record.sub ?? nested?.userId ?? nested?.id;
            if (typeof rawId === "string" && rawId.trim().length > 0) {
              return rawId.trim();
            }
          }
        } catch {
          // Next candidate
        }
      }

      const parts = token.split(".");
      if (parts.length === 3) {
        try {
          const decoded = JSON.parse(
            Buffer.from(parts[1], "base64url").toString("utf8")
          ) as Record<string, unknown>;
          const rawId = decoded.userId ?? decoded.id ?? decoded.sub;
          if (typeof rawId === "string" && rawId.trim().length > 0) {
            return rawId.trim();
          }
        } catch {
          // Ignore malformed token
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function buildLocalQuestions(
  topic: string,
  level: string,
  count: number,
  customPrompt?: string
): GeneratedQuestion[] {
  const focusNote = customPrompt?.trim() ? ` [${customPrompt.trim()}]` : "";
  const templates = [
    {
      q: `In ${level} English (${topic})${focusNote}, which option best completes: "She ____ the task before the deadline."`,
      opts: ["had completed", "has complete", "was complete", "completing"],
      ans: 0,
      exp: "Past Perfect ('had completed') shows an action finished before another past event.",
    },
    {
      q: `Which connector fits ${topic} (${level})${focusNote} most naturally in formal English?`,
      opts: ["Nevertheless", "Although despite", "In spite", "Because of though"],
      ans: 0,
      exp: "'Nevertheless' introduces a contrasting idea smoothly.",
    },
    {
      q: `Choose the most accurate ${level} verb for ${topic}${focusNote}: "Could you ____ on your main point?"`,
      opts: ["elaborate", "make up", "put off", "give out"],
      ans: 0,
      exp: "'Elaborate on' means to explain in greater detail.",
    },
    {
      q: `Select the grammatically correct sentence for ${level} (${topic})${focusNote}: "Not only ____ on time, but he also led the review."`,
      opts: ["did he arrive", "he arrived", "did he arrived", "he did arrived"],
      ans: 0,
      exp: "Negative adverbials at the start of a sentence trigger inversion.",
    },
  ];

  return Array.from({ length: count }, (_, idx) => {
    const base = templates[idx % templates.length];
    return {
      id: idx + 1,
      question: count > templates.length ? `[#${idx + 1}] ${base.q}` : base.q,
      options: base.opts,
      correctIndex: base.ans,
      explanation: base.exp,
    };
  });
}

function normalizeQuestions(
  raw: unknown,
  topic: string,
  level: string,
  count: number,
  customPrompt?: string
): GeneratedQuestion[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return buildLocalQuestions(topic, level, count, customPrompt);
  }

  const parsed: GeneratedQuestion[] = [];
  for (let i = 0; i < raw.length && parsed.length < count; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const questionText =
      typeof obj.question === "string" && obj.question.trim()
        ? obj.question.trim()
        : null;
    const rawOptions = Array.isArray(obj.options)
      ? obj.options.filter(
          (o): o is string => typeof o === "string" && o.trim().length > 0
        )
      : [];

    if (!questionText || rawOptions.length < 2) continue;

    const options = rawOptions.slice(0, 4);
    while (options.length < 4) {
      options.push(`Option ${options.length + 1}`);
    }

    const correctIndex =
      typeof obj.correctIndex === "number" &&
      Number.isInteger(obj.correctIndex) &&
      obj.correctIndex >= 0 &&
      obj.correctIndex < options.length
        ? obj.correctIndex
        : 0;

    const explanation =
      typeof obj.explanation === "string" && obj.explanation.trim()
        ? obj.explanation.trim()
        : `Correct answer for ${topic} (${level}).`;

    parsed.push({
      id: parsed.length + 1,
      question: questionText,
      options,
      correctIndex,
      explanation,
    });
  }

  if (parsed.length < count) {
    const fallback = buildLocalQuestions(topic, level, count, customPrompt);
    while (parsed.length < count) {
      const nextItem = fallback[parsed.length];
      parsed.push({ ...nextItem, id: parsed.length + 1 });
    }
  }

  return parsed;
}

async function generateQuestionsWithGemini(
  topic: string,
  level: string,
  count: number,
  customPrompt?: string
): Promise<GeneratedQuestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildLocalQuestions(topic, level, count, customPrompt);
  }

  const extraInstructions = customPrompt?.trim()
    ? `Additional Custom Prompt Instructions: ${customPrompt.trim()}`
    : "";

  const prompt = `Generate exactly ${count} multiple-choice English practice questions.
Topic: ${topic}
Difficulty Level: ${level}
${extraInstructions}

Return ONLY a valid JSON array (no markdown fences, no extra text) where each element has this exact shape:
{
  "question": "string",
  "options": ["string", "string", "string", "string"],
  "correctIndex": 0,
  "explanation": "string"
}
Rules:
- "options" must contain 4 distinct choices.
- "correctIndex" must be an integer from 0 to 3.
- Make each question distinct and tailored to "${level}" on "${topic}".`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!res.ok) {
      return buildLocalQuestions(topic, level, count, customPrompt);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const rawText =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const jsonParsed: unknown = JSON.parse(cleaned);
    return normalizeQuestions(jsonParsed, topic, level, count, customPrompt);
  } catch {
    return buildLocalQuestions(topic, level, count, customPrompt);
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeAll = searchParams.get("all") === "1";

    const tests = await db.test.findMany({
      where: includeAll ? undefined : { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, userName: true },
        },
        participants: {
          orderBy: { joinedAt: "desc" },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, userName: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ tests });
  } catch (error) {
    console.error("GET /api/tests error:", error);
    return NextResponse.json(
      { error: "Testlarni yuklashda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const creatorId = await requireAuthUserId(req);
    if (!creatorId) {
      return NextResponse.json(
        { error: "JWTAuthGuard: Avval tizimga kiring (401 Unauthorized)." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      title?: unknown;
      topic?: unknown;
      level?: unknown;
      questionCount?: unknown;
      status?: unknown;
      maxParticipants?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
      designTheme?: unknown;
      mergeTestIds?: unknown;
      useAi?: unknown;
      allowParticipantAi?: unknown;
      customPrompt?: unknown;
    };

    const status: "OPEN" | "CLOSED" =
      body.status === "CLOSED" ? "CLOSED" : "OPEN";

    const useAi = true;
    // Default OFF (false) for participants taking the test
    const allowParticipantAi = body.allowParticipantAi === true;
    const customPrompt =
      typeof body.customPrompt === "string" ? body.customPrompt.trim() : "";

    let maxParticipants: number | null = null;
    if (
      body.maxParticipants !== undefined &&
      body.maxParticipants !== null &&
      body.maxParticipants !== ""
    ) {
      const parsedLimit = Number(body.maxParticipants);
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        maxParticipants = Math.round(parsedLimit);
      }
    }

    let startsAt: Date | null = null;
    if (typeof body.startsAt === "string" && body.startsAt.trim()) {
      const d = new Date(body.startsAt);
      if (!Number.isNaN(d.getTime())) startsAt = d;
    }

    let endsAt: Date | null = null;
    if (typeof body.endsAt === "string" && body.endsAt.trim()) {
      const d = new Date(body.endsAt);
      if (!Number.isNaN(d.getTime())) endsAt = d;
    }

    const allowedThemes = ["minimal", "card", "paper"];
    const designTheme =
      typeof body.designTheme === "string" && allowedThemes.includes(body.designTheme)
        ? body.designTheme
        : "minimal";

    const mergeIds = Array.isArray(body.mergeTestIds)
      ? body.mergeTestIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0
        )
      : [];

    let questions: GeneratedQuestion[] = [];
    let topic =
      typeof body.topic === "string" && body.topic.trim()
        ? body.topic.trim()
        : "General English & Grammar";
    let level =
      typeof body.level === "string" && body.level.trim()
        ? body.level.trim()
        : "B1";

    if (mergeIds.length >= 2) {
      const sourceTests = await db.test.findMany({
        where: { id: { in: mergeIds } },
      });

      const mergedList: GeneratedQuestion[] = [];
      const topicsSet = new Set<string>();
      const levelsSet = new Set<string>();

      for (const st of sourceTests) {
        if (st.topic) topicsSet.add(st.topic);
        if (st.level) levelsSet.add(st.level);
        if (Array.isArray(st.questionsJson)) {
          for (const q of st.questionsJson as GeneratedQuestion[]) {
            mergedList.push({ ...q, id: mergedList.length + 1 });
          }
        }
      }

      if (mergedList.length > 0) {
        questions = mergedList;
        topic =
          typeof body.topic === "string" && body.topic.trim()
            ? body.topic.trim()
            : Array.from(topicsSet).join(" + ") || "Combined Test";
        level =
          typeof body.level === "string" && body.level.trim()
            ? body.level.trim()
            : Array.from(levelsSet).join("/") || "Mixed";
      }
    }

    if (questions.length === 0) {
      const rawCount = Number(body.questionCount);
      const questionCount = Number.isFinite(rawCount)
        ? Math.min(100, Math.max(5, Math.round(rawCount)))
        : 10;

      questions = useAi
        ? await generateQuestionsWithGemini(topic, level, questionCount, customPrompt)
        : buildLocalQuestions(topic, level, questionCount, customPrompt);
    }

    const finalCount = questions.length;
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : `${level} · ${topic} (${finalCount} Qs)`;

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

    const payloadData = {
      title,
      topic,
      level,
      questionCount: finalCount,
      status,
      maxParticipants,
      startsAt,
      endsAt,
      designTheme,
      allowParticipantAi,
      blockedUserIds: [],
      questionsJson: JSON.parse(JSON.stringify(questions)),
    };

    const { allowParticipantAi: _ai, blockedUserIds: _bl, ...corePayload } =
      payloadData as Record<string, unknown>;

    async function createWithFallback(ownerId: string) {
      try {
        return await db.test.create({
          data: { ...payloadData, creatorId: ownerId },
          include: testInclude,
        });
      } catch (e: unknown) {
        const c =
          typeof e === "object" && e !== null && "code" in e
            ? (e as { code?: string }).code
            : undefined;
        if (c === "P2022") {
          return await db.test.create({
            data: { ...corePayload, creatorId: ownerId },
            include: testInclude,
          });
        }
        throw e;
      }
    }

    let created;
    try {
      created = await createWithFallback(creatorId);
    } catch (fkErr: unknown) {
      const code =
        typeof fkErr === "object" && fkErr !== null && "code" in fkErr
          ? (fkErr as { code?: string }).code
          : undefined;
      if (code === "P2003") {
        const existingUser = await db.user.findFirst({ select: { id: true } });
        if (!existingUser?.id) {
          return NextResponse.json(
            { error: "Bazadagi Users jadvalida foydalanuvchi topilmadi." },
            { status: 400 }
          );
        }
        created = await createWithFallback(existingUser.id);
      } else {
        throw fkErr;
      }
    }

    return NextResponse.json(
      { test: created, questions, usedAi: useAi, allowParticipantAi },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/tests error:", error);
    return NextResponse.json(
      { error: "Test yaratishda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
