import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ReadingPassageItem } from "@/lib/reading-ai";

const db = prisma as typeof prisma & { readingSet: any };

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const reading = await db.readingSet.findUnique({ where: { id } });
    if (!reading) {
      return NextResponse.json({ error: "Reading topilmadi." }, { status: 404 });
    }

    if (!reading.allowParticipantAi) {
      return NextResponse.json(
        { error: "Bu Reading'da qatnashuvchilar uchun AI OFF holatda." },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      passageIndex?: unknown;
      questionIndex?: unknown;
      doubt?: unknown;
    };

    const passages: ReadingPassageItem[] = Array.isArray(reading.passagesJson)
      ? reading.passagesJson
      : [];
    const pIdx =
      typeof body.passageIndex === "number" &&
      pIdxValid(body.passageIndex, passages.length)
        ? body.passageIndex
        : 0;
    const qIdx =
      typeof body.questionIndex === "number" && body.questionIndex >= 0
        ? body.questionIndex
        : 0;
    const doubt = typeof body.doubt === "string" ? body.doubt.trim() : "";

    const passage = passages[pIdx];
    const question = passage?.questions?.[qIdx];

    const fallbackHint = `Matndagi asosiy fikrni va savoldagi kalit so'zlarni solishtiring. Tayyor javob aytilmaydi — qaysi jumla ushbu g'oyani qo'llab-quvvatlashini matndan toping${
      doubt ? ` ("${doubt}")` : ""
    }.`;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !passage || !question) {
      return NextResponse.json({ hint: fallbackHint });
    }

    const prompt = `You are an English reading coach helping a student understand a confusing question.
STRICT RULE: NEVER reveal which option (A/B/C/D) or exact answer choice is correct. Do NOT give the final answer.
Point out where in the passage to look and explain the reasoning clue in 2-3 clear sentences.

Passage: ${passage.text}
Question: ${question.question}
Options: ${(question.options || [])
      .map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`)
      .join(" | ")}
Student question: ${doubt || "I don't understand this question."}
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
      if (!res.ok) return NextResponse.json({ hint: fallbackHint });
      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      let text =
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || fallbackHint;
      for (const opt of question.options || []) {
        if (opt && opt.trim().length > 4) {
          const esc = opt.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          text = text.replace(new RegExp(esc, "gi"), "[variant]");
        }
      }
      return NextResponse.json({ hint: text });
    } catch {
      return NextResponse.json({ hint: fallbackHint });
    }
  } catch (error) {
    console.error("POST /api/reading/[id]/hint error:", error);
    return NextResponse.json({ error: "Xatolik yuz berdi." }, { status: 500 });
  }
}

function pIdxValid(idx: number, len: number): boolean {
  return Number.isInteger(idx) && idx >= 0 && idx < len;
}
