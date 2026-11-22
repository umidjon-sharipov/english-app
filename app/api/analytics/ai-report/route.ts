import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUserId } from "@/app/api/tests/route";

// export const dynamic = "force-dynamic";

const db = prisma as typeof prisma & {
  user: any;
  testParticipant: any;
  readingParticipant: any;
  gameParticipant: any;
};

const AI_ANALYTICS_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Avval tizimga kiring." }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userName: true,
        participatedTests: {
          select: { score: true, total: true, test: { select: { level: true, topic: true } } },
        },
        participatedReadingSets: {
          select: { score: true, total: true, reading: { select: { level: true, topic: true } } },
        },
        participatedGameSets: {
          select: { score: true, total: true, streak: true, game: { select: { level: true, gameType: true } } },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Foydalanuvchi topilmadi." }, { status: 404 });
    }

    const testCount = user.participatedTests?.length || 0;
    const readingCount = user.participatedReadingSets?.length || 0;
    const gameCount = user.participatedGameSets?.length || 0;

    let testSum = 0;
    let testMax = 0;
    user.participatedTests?.forEach((t: any) => {
      if (typeof t.score === "number" && typeof t.total === "number") {
        testSum += t.score;
        testMax += t.total;
      }
    });

    let readingSum = 0;
    let readingMax = 0;
    user.participatedReadingSets?.forEach((r: any) => {
      if (typeof r.score === "number" && typeof r.total === "number") {
        readingSum += r.score;
        readingMax += r.total;
      }
    });

    let gameScoreSum = 0;
    let highestStreak = 0;
    user.participatedGameSets?.forEach((g: any) => {
      if (typeof g.score === "number") gameScoreSum += g.score;
      if (typeof g.streak === "number" && g.streak > highestStreak) highestStreak = g.streak;
    });

    const testPct = testMax > 0 ? Math.round((testSum / testMax) * 100) : 75;
    const readingPct = readingMax > 0 ? Math.round((readingSum / readingMax) * 100) : 70;

    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (apiKey) {
      const summaryStats = {
        name: user.firstName,
        testsCompleted: testCount,
        testAccuracy: `${testPct}%`,
        readingsCompleted: readingCount,
        readingAccuracy: `${readingPct}%`,
        gamesPlayed: gameCount,
        gameStreak: highestStreak,
      };

      const prompt = `You are an elite CEFR English learning advisor.
Analyze the user's comprehensive English platform profile:
${JSON.stringify(summaryStats, null, 2)}

Provide a deeply personalized, motivating learning diagnostic:
1. Estimated CEFR Level (e.g. B1, B2, or C1)
2. Proficiency Index (0-100)
3. Breakdown scores across 4 competencies (Grammar & Tests, Reading Comprehension, Vocabulary & Fluency, Cognitive Reflexes)
4. Key strengths (2 bullet points)
5. Areas for growth (2 bullet points)
6. 3-step action roadmap for the next 14 days.

Output ONLY a JSON object (no markdown):
{
  "estimatedLevel": "B2",
  "overallIndex": 78,
  "competencies": {
    "grammar": 80,
    "reading": 75,
    "vocabulary": 82,
    "speed": 74
  },
  "strengths": ["...", "..."],
  "growthAreas": ["...", "..."],
  "roadmap": ["...", "...", "..."],
  "motivationalQuote": "..."
}`;

      for (const m of AI_ANALYTICS_MODELS) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 18000);
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
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
            const firstBrace = cleaned.indexOf("{");
            const lastBrace = cleaned.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
              return NextResponse.json({ ok: true, report: parsed, stats: summaryStats });
            }
          }
        } catch {
          // try next
        }
      }
    }

    // High quality fallback report
    const fallbackReport = {
      estimatedLevel: testPct >= 85 ? "C1" : testPct >= 70 ? "B2" : "B1",
      overallIndex: Math.round((testPct + readingPct) / 2),
      competencies: {
        grammar: testPct,
        reading: readingPct,
        vocabulary: Math.max(65, testPct - 5),
        speed: Math.min(95, 60 + highestStreak * 4),
      },
      strengths: [
        `Grammatika va testlarda ${testPct}% aniqlik ko'rsatkichi`,
        `O'yinlarda ketma-ket ${highestStreak} ta to'g'ri javob streak rekordi`,
      ],
      growthAreas: [
        "Akademik matnlarni chuqur tahlil qilish va murakkab sintaksisni o'zlashtirish",
        "Speaking modulida faolroq qatnashib nutq tezligini oshirish",
      ],
      roadmap: [
        "1-5 kun: Har kuni kamida 2 ta Reading to'plamini yeching",
        "6-10 kun: Vocabulary modulida yangi 30 ta C1 so'zni yodlang",
        "11-14 kun: Speaking Studio da Read Aloud va IELTS Cue kartalarini mashq qiling",
      ],
      motivationalQuote: "Consistent effort is the ultimate key to language mastery.",
    };

    return NextResponse.json({
      ok: true,
      report: fallbackReport,
      stats: {
        testsCompleted: testCount,
        readingsCompleted: readingCount,
        gamesPlayed: gameCount,
      },
    });
  } catch (error) {
    console.error("GET /api/analytics/ai-report error:", error);
    return NextResponse.json(
      { error: "AI hisobotini yaratishda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
