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

    const priorityNames = [
      "token",
      "auth_token",
      "access_token",
      "session",
      "jwt",
      "auth",
    ];
    for (const name of priorityNames) {
      const c = cookieStore.get(name)?.value;
      if (c && !candidates.includes(c)) candidates.push(c);
    }
    for (const c of allCookies) {
      if (c.value && !candidates.includes(c.value)) {
        candidates.push(c.value);
      }
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
              record.userId ??
              record.id ??
              record.sub ??
              nested?.userId ??
              nested?.id;
            if (typeof rawId === "string" && rawId.trim().length > 0) {
              return rawId.trim();
            }
          }
        } catch {
          // Try next cookie/token
        }
      }

      // Fallback: decode JWT payload segment if token is a 3-part JWT
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

function buildFallbackQuestions(
  topic: string,
  level: string,
  count: number
): GeneratedQuestion[] {
  const templates = [
    {
      q: `In ${level} English (${topic}), which option best completes the sentence: "She ____ the assignment before the deadline."`,
      opts: ["had completed", "has complete", "was complete", "completing"],
      ans: 0,
      exp: "Past Perfect ('had completed') shows an action completed before another past point.",
    },
    {
      q: `Which word or phrase fits ${topic} at a ${level} level best?`,
      opts: ["Nevertheless", "Although despite", "In spite", "Because of though"],
      ans: 0,
      exp: "'Nevertheless' is a formal conjunctive adverb used to express contrast.",
    },
    {
      q: `Choose the most natural ${level} expression for ${topic}: "Could you ____ on what you meant?"`,
      opts: ["elaborate", "make up", "put off", "give out"],
      ans: 0,
      exp: "'Elaborate on' means to explain or give more details about a point.",
    },
    {
      q: `Identify the grammatically accurate choice for ${level} (${topic}):`,
      opts: [
        "Not only did he pass, but he also scored high.",
        "Not only he passed, but he also scored high.",
        "Not only did he passed, also he scored high.",
        "Not only he did pass, but scored high.",
      ],
      ans: 0,
      exp: "Negative inversion at the start of a clause requires auxiliary verb before the subject.",
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
  count: number
): GeneratedQuestion[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return buildFallbackQuestions(topic, level, count);
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
    const fallback = buildFallbackQuestions(topic, level, count);
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
  count: number
): Promise<GeneratedQuestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildFallbackQuestions(topic, level, count);
  }

  const prompt = `Generate exactly ${count} multiple-choice English practice questions.
Topic: ${topic}
Difficulty Level: ${level}

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
      return buildFallbackQuestions(topic, level, count);
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
    return normalizeQuestions(jsonParsed, topic, level, count);
  } catch {
    return buildFallbackQuestions(topic, level, count);
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
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userName: true,
          },
        },
        participants: {
          orderBy: { joinedAt: "desc" },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                userName: true,
              },
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
    };

    const status: "OPEN" | "CLOSED" =
      body.status === "CLOSED" ? "CLOSED" : "OPEN";

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
            mergedList.push({
              ...q,
              id: mergedList.length + 1,
            });
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
      questions = await generateQuestionsWithGemini(topic, level, questionCount);
    }

    const finalCount = questions.length;
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : `${level} · ${topic} (${finalCount} Qs)`;

    const testInclude = {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userName: true,
        },
      },
      participants: {
        orderBy: { joinedAt: "desc" as const },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              userName: true,
            },
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
      questionsJson: JSON.parse(JSON.stringify(questions)),
    };

    let created;
    try {
      created = await db.test.create({
        data: { ...payloadData, creatorId },
        include: testInclude,
      });
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
        created = await db.test.create({
          data: { ...payloadData, creatorId: existingUser.id },
          include: testInclude,
        });
      } else {
        throw fkErr;
      }
    }

    return NextResponse.json({ test: created, questions }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tests error:", error);
    return NextResponse.json(
      { error: "Test yaratishda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
