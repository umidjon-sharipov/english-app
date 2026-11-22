import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const db = prisma as typeof prisma & { test: any };

interface StoredQuestion {
  id?: number;
  question: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
}

function stripDirectAnswer(text: string, options: string[]): string {
  let out = text.trim();
  out = out.replace(
    /\b(correct\s+answer|answer\s+is|the\s+right\s+choice\s+is|javob\s*[:\-]?\s*[A-Da-d1-4])\b[^.\n]*[.\n]?/gi,
    " "
  );
  for (const opt of options) {
    if (opt && opt.trim().length > 3) {
      const escaped = opt.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(escaped, "gi"), "[variant]");
    }
  }
  return (
    out.replace(/\s{2,}/g, " ").trim() ||
    "Gapning zamon ishorasi, bog'lovchilari va gap bo'laklari bog'lanishiga e'tibor bering."
  );
}

function buildLocalTutorHint(
  q: StoredQuestion,
  userDoubt: string,
  level: string,
  topic: string
): string {
  const doubtPart = userDoubt.trim()
    ? ` Siz so'ragan joy ("${userDoubt.trim()}") bo'yicha:`
    : "";
  return (
    `AI Yordamchi (${level} · ${topic}):${doubtPart} Gapdagi zamon/shart ko'rsatkichlarini, ` +
    `so'z turkumini va kontekst mantiqini tekshiring. Tayyor javob aytilmaydi — ` +
    `variantlarning gap tuzilishiga qanday tushishini solishtirib ko'ring.`
  );
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as {
      questionIndex?: unknown;
      doubt?: unknown;
      participantAiEnabled?: unknown;
    };

    const test = await db.test.findUnique({ where: { id } });
    if (!test) {
      return NextResponse.json({ error: "Test topilmadi." }, { status: 404 });
    }

    const enabled =
      body.participantAiEnabled === true || Boolean(test.allowParticipantAi);
    if (!enabled) {
      return NextResponse.json(
        { error: "Bu testda qatnashuvchilar uchun AI OFF holatda." },
        { status: 403 }
      );
    }

    const questions: StoredQuestion[] = Array.isArray(test.questionsJson)
      ? test.questionsJson
      : [];
    const qIdx =
      typeof body.questionIndex === "number" &&
      Number.isInteger(body.questionIndex) &&
      body.questionIndex >= 0 &&
      body.questionIndex < questions.length
        ? body.questionIndex
        : 0;

    const q = questions[qIdx];
    if (!q) {
      return NextResponse.json({ error: "Savol topilmadi." }, { status: 404 });
    }

    const doubt = typeof body.doubt === "string" ? body.doubt.trim() : "";
    const options = Array.isArray(q.options) ? q.options : [];
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        hint: buildLocalTutorHint(
          q,
          doubt,
          test.level || "B1",
          test.topic || "English"
        ),
      });
    }

    const prompt = `You are an English study tutor helping a student understand a test question.
STRICT RULE: NEVER reveal the correct option letter (A/B/C/D) or exact answer text. Do NOT give the final answer.
Explain the grammar rule, clue, or concept in 2-3 clear sentences so the student can solve it themselves.

Level: ${test.level || "B1"}
Topic: ${test.topic || "English"}
Question: ${q.question}
Options: ${options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join(" | ")}
Student's question: ${doubt || "I don't understand this question."}
`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
          apiKey
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.5 },
          }),
        }
      );

      if (!res.ok) {
        return NextResponse.json({
          hint: buildLocalTutorHint(
            q,
            doubt,
            test.level || "B1",
            test.topic || "English"
          ),
        });
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const rawHint =
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      return NextResponse.json({ hint: stripDirectAnswer(rawHint, options) });
    } catch {
      return NextResponse.json({
        hint: buildLocalTutorHint(
          q,
          doubt,
          test.level || "B1",
          test.topic || "English"
        ),
      });
    }
  } catch (error) {
    console.error("POST /api/tests/[id]/hint error:", error);
    return NextResponse.json(
      { error: "AI tushuntirish olishda xato." },
      { status: 500 }
    );
  }
}
