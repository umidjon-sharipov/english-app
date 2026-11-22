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
  return out.replace(/\s{2,}/g, " ").trim();
}

function buildSmartTutorExplanation(
  q: StoredQuestion,
  userDoubt: string,
  level: string,
  topic: string
): string {
  const qLower = (q.question || "").toLowerCase();
  const doubtText = userDoubt.trim();

  const clues: string[] = [];
  if (qLower.includes("before") || qLower.includes("after") || qLower.includes("by the time")) {
    clues.push("Gapda vaqt ketma-ketligi ('before', 'after', 'by the time') bor — voqealarning qaysi biri oldinroq sodir bo'lganini solishtiring.");
  }
  if (qLower.includes("not only") || qLower.includes("never") || qLower.includes("rarely") || qLower.includes("seldom")) {
    clues.push("Inversiya (so'z tartibi o'zgarishi) qoidasiga e'tibor bering: gap boshida salbiy/cheklovchi ifoda kelsa, yordamchi fe'l egadan oldin keladi.");
  }
  if (qLower.includes("____") || qLower.includes("blank") || qLower.includes("completes")) {
    clues.push("Bo'sh joyga qo'yiladigan so'zning zamoni, shaxs/son mosligi va gapdagi vazifasi (fe'l, bog'lovchi yoki frazaviy fe'l) mos kelishini tekshiring.");
  }
  if (clues.length === 0) {
    clues.push(
      `Mavzu (${topic}) va daraja (${level}) doirasida gapning grammatik skeletini (ega + kesim) aniqlang va har bir variant o'sha o'rinda qanday ma'no berishini tekshiring.`
    );
  }

  const doubtNote = doubtText
    ? `Siz yozgan savol ("${doubtText}") bo'yicha: `
    : "";

  return `${doubtNote}${clues.join(" ")} (Eslatma: tayyor javob berilmaydi, o'zingiz xulosa chiqaring.)`;
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
    };

    const test = await db.test.findUnique({ where: { id } });
    if (!test) {
      return NextResponse.json({ error: "Test topilmadi." }, { status: 404 });
    }

    if (!test.allowParticipantAi) {
      return NextResponse.json(
        { error: "Bu testda AI yordamchi yoqilmagan (OFF)." },
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
    const fallbackExplanation = buildSmartTutorExplanation(
      q,
      doubt,
      test.level || "B1",
      test.topic || "English"
    );

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ hint: fallbackExplanation });
    }

    const prompt = `You are an English tutor helping a student understand a confusing question.
STRICT RULE: NEVER state the correct option letter (A/B/C/D) or exact answer choice. Do NOT give the final answer.
Explain the grammar rule, sentence clue, or concept clearly in 2-3 sentences so the student can solve it themselves.

Level: ${test.level || "B1"}
Topic: ${test.topic || "English"}
Question: ${q.question}
Options: ${options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join(" | ")}
Student's question: ${doubt || "I don't understand this question."}
`;

    try {
      const res = await fetch(
        `[https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$){encodeURIComponent(
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
        return NextResponse.json({ hint: fallbackExplanation });
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const rawHint =
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      const cleaned = stripDirectAnswer(rawHint, options);

      return NextResponse.json({
        hint: cleaned || fallbackExplanation,
      });
    } catch {
      return NextResponse.json({ hint: fallbackExplanation });
    }
  } catch (error) {
    console.error("POST /api/tests/[id]/hint error:", error);
    return NextResponse.json(
      { error: "AI tushuntirish olishda xato." },
      { status: 500 }
    );
  }
}
