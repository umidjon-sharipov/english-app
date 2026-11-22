import { NextRequest, NextResponse } from "next/server";
import { requireAuthUserId } from "@/app/api/tests/route";

const SPEAKING_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Avval tizimga kiring." }, { status: 401 });
    }

    const body = (await req.json()) as {
      topic?: string;
      level?: string;
      mode?: "read" | "topic" | "free";
      targetText?: string;
      transcript?: string;
      durationSeconds?: number;
    };

    const transcript = (body.transcript || "").trim();
    if (!transcript) {
      return NextResponse.json(
        { error: "Ovozdan matn aniqlanmadi. Iltimos, mikrofonga aniqroq gapiring." },
        { status: 400 }
      );
    }

    const topic = body.topic?.trim() || "General Conversation";
    const level = body.level?.trim().toUpperCase() || "B1";
    const mode = body.mode || "topic";
    const targetText = body.targetText?.trim() || "";

    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (apiKey) {
      const prompt = `You are a certified IELTS and Cambridge English Speaking examiner.
Analyze the candidate's spoken English response:
Mode: ${mode}
Assessed Topic: ${topic}
Target CEFR Level: ${level}
${targetText ? `Target text to read aloud: "${targetText}"` : ""}
Candidate transcript: "${transcript}"

Evaluate strictly on:
1. Fluency & Coherence (score 0-100)
2. Lexical Resource / Vocabulary (score 0-100)
3. Grammatical Range & Accuracy (score 0-100)
4. Pronunciation clarity / Word match (score 0-100)
5. Estimated CEFR Level (A1, A2, B1, B2, C1, or C2)
6. Overall Score (score 0-100)
7. Specific feedback with 2 strengths and 2 areas to improve
8. A more natural native speaker alternative phrasing for their response.

Output ONLY a JSON object in this format (no markdown):
{
  "overallScore": 82,
  "estimatedLevel": "B2",
  "metrics": {
    "fluency": 80,
    "vocabulary": 85,
    "grammar": 80,
    "pronunciation": 83
  },
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "nativePhrasing": "...",
  "summary": "..."
}`;

      for (const m of SPEAKING_MODELS) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20000);
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(
              apiKey
            )}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.5 },
              }),
            }
          );
          clearTimeout(timer);

          if (res.ok) {
            const data = (await res.json()) as any;
            const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            const cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
            const firstBrace = cleaned.indexOf("{");
            const lastBrace = cleaned.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
              return NextResponse.json({ ok: true, analysis: parsed });
            }
          }
        } catch {
          // try next
        }
      }
    }

    // Algorithmic fallback
    const words = transcript.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    let score = Math.min(95, Math.max(50, 60 + Math.round(wordCount * 1.5)));

    if (mode === "read" && targetText) {
      const targetWords = targetText.toLowerCase().split(/\s+/);
      const spokenWords = transcript.toLowerCase().split(/\s+/);
      let match = 0;
      for (const tw of targetWords) {
        if (spokenWords.includes(tw)) match++;
      }
      score = Math.round((match / Math.max(1, targetWords.length)) * 100);
    }

    const fallbackAnalysis = {
      overallScore: score,
      estimatedLevel: score >= 85 ? "C1" : score >= 75 ? "B2" : score >= 60 ? "B1" : "A2",
      metrics: {
        fluency: score,
        vocabulary: Math.max(50, score - 5),
        grammar: Math.max(50, score - 3),
        pronunciation: score,
      },
      strengths: [
        "Fikrni ifodalashga intilish va mikrofonda dadil so'zlashuv",
        `Umumiy ${wordCount} ta so'zdan iborat ravon nutq ifodasi`,
      ],
      improvements: [
        "Gap tuzilishida murakkab bog'lovchilardan (moreover, whereas, consequently) ko'proq foydalanish",
        "Talaffuz aniqligi uchun urg'u va intonatsiyani doimiy mashq qilish",
      ],
      nativePhrasing: `Regarding ${topic}, I believe that practicing regularly significantly enhances communicative fluency.`,
      summary: `Nutqingiz tahlil qilindi: ${wordCount} ta so'z talaffuz qilindi, umumiy ball ${score}%.`,
    };

    return NextResponse.json({ ok: true, analysis: fallbackAnalysis });
  } catch (error) {
    console.error("POST /api/speaking/analyze error:", error);
    return NextResponse.json(
      { error: "Speaking tahlilida server xatoligi yuz berdi." },
      { status: 500 }
    );
  }
}
