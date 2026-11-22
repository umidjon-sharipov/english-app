import { NextRequest, NextResponse } from "next/server";
import { requireAuthUserId } from "@/app/api/tests/route";

const GAME_ANALYSIS_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Avval tizimga kiring." }, { status: 401 });
    }

    const body = (await req.json()) as {
      gameType?: string;
      level?: string;
      score?: number;
      total?: number;
      maxStreak?: number;
      mistakes?: Array<{ round: number; prompt: string; userAction?: string; correct?: string }>;
    };

    const score = body.score ?? 0;
    const total = body.total ?? 10;
    const streak = body.maxStreak ?? 0;
    const gameType = body.gameType || "English Learning Game";
    const level = body.level || "B1";
    const mistakes = body.mistakes || [];

    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (apiKey) {
      const prompt = `You are a gamified English language pedagogy expert.
Analyze the user's game session performance:
Game Type: ${gameType}
Target CEFR: ${level}
Final Score: ${score}/${total} (${Math.round((score / Math.max(1, total)) * 100)}%)
Highest Streak: ${streak}
Mistakes recorded: ${JSON.stringify(mistakes.slice(0, 5))}

Provide a motivational, highly tactical pedagogical analysis:
1. Overall performance review
2. Cognitive linguistic strengths demonstrated
3. Specific grammar/vocabulary weaknesses shown by the mistakes
4. 2 Actionable drills to master these gaps.

Output ONLY a JSON object (no markdown):
{
  "performanceLevel": "Exceptional | Proficient | Developing",
  "accuracyPercent": ${Math.round((score / Math.max(1, total)) * 100)},
  "insights": "Detailed encouraging feedback paragraph",
  "strengths": ["strength 1", "strength 2"],
  "focusAreas": ["focus area 1", "focus area 2"],
  "recommendedDrill": "Specific exercise recommendation"
}`;

      for (const m of GAME_ANALYSIS_MODELS) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);
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
                generationConfig: { temperature: 0.6 },
              }),
            }
          );
          clearTimeout(timer);

          if (res.ok) {
            const data = (await res.json()) as any;
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
            const firstBrace = cleaned.indexOf("{");
            const lastBrace = cleaned.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
              return NextResponse.json({ ok: true, report: parsed });
            }
          }
        } catch {
          // try next
        }
      }
    }

    const pct = Math.round((score / Math.max(1, total)) * 100);
    const fallbackReport = {
      performanceLevel: pct >= 80 ? "Exceptional" : pct >= 55 ? "Proficient" : "Developing",
      accuracyPercent: pct,
      insights: `O'yinda ajoyib ishtirok! Siz ${score}/${total} ball to'pladingiz, maksimal combo streakingiz esa ${streak} taga yetdi.`,
      strengths: [
        "Tezkor qaror qabul qilish va vizual so'z kartalarini tez ilg'ash",
        streak > 2 ? `Ketma-ket ${streak} ta to'g'ri combo bilan yuqori konsentratsiya` : "Doimiy urinish va qat'iyat",
      ],
      focusAreas: [
        mistakes.length > 0 ? "Adashilgan jumlalardagi so'z tartibini qayta mashq qilish" : "Keyingi bosqichda vaqt tezligini oshirish",
        "Murakkab frazaviy fe'llar va birikmalarni yodda saqlash",
      ],
      recommendedDrill: "Vocabulary Flashcards moduliga o'tib, qiyin so'zlarni 3D flip cardlar orqali takrorlang.",
    };

    return NextResponse.json({ ok: true, report: fallbackReport });
  } catch (error) {
    console.error("POST /api/games/[id]/analyze error:", error);
    return NextResponse.json(
      { error: "O'yin tahlilida server xatoligi yuz berdi." },
      { status: 500 }
    );
  }
}
