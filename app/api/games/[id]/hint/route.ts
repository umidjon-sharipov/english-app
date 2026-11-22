import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GameRoundQuestion } from "@/lib/games-ai";

const db = prisma as typeof prisma & { gameSet: any };

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const game = await db.gameSet.findUnique({ where: { id } });
    if (!game) {
      return NextResponse.json({ error: "O'yin topilmadi." }, { status: 404 });
    }

    if (!game.allowParticipantAi) {
      return NextResponse.json(
        { error: "Bu o'yinda AI yordamchi OFF holatda." },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      roundIndex?: unknown;
      doubt?: unknown;
    };

    const rounds: GameRoundQuestion[] = Array.isArray(game.questionsJson)
      ? game.questionsJson
      : [];
    const idx =
      typeof body.roundIndex === "number" &&
      body.roundIndex >= 0 &&
      body.roundIndex < rounds.length
        ? body.roundIndex
        : 0;
    const round = rounds[idx];
    if (!round) {
      return NextResponse.json({ error: "Round topilmadi." }, { status: 404 });
    }

    const doubt = typeof body.doubt === "string" ? body.doubt.trim() : "";
    const fallback = `O'yin turi (${game.gameType}) va daraja (${game.level}) qoidasiga tayaning: variantlardagi ma'no va so'z birikishini solishtiring. Tayyor javob aytilmaydi${
      doubt ? ` ("${doubt}")` : ""
    }.`;

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ hint: fallback });
    }

    const prompt = `You are an English game tutor helping a player understand a round.
STRICT RULE: NEVER reveal the correct answer or option letter. Give a 2-sentence helpful clue in Uzbek.
Game: ${game.gameType} (${game.level})
Round: ${round.prompt}
Options: ${(round.options || [])
      .map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`)
      .join(" | ")}
Player doubt: ${doubt || "Need a hint"}`;

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
      if (!res.ok) return NextResponse.json({ hint: fallback });
      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      let hintText =
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || fallback;
      for (const opt of round.options || []) {
        if (opt && opt.trim().length > 3) {
          const esc = opt.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          hintText = hintText.replace(new RegExp(esc, "gi"), "[variant]");
        }
      }
      return NextResponse.json({ hint: hintText });
    } catch {
      return NextResponse.json({ hint: fallback });
    }
  } catch (error) {
    console.error("POST /api/games/[id]/hint error:", error);
    return NextResponse.json({ error: "Xatolik." }, { status: 500 });
  }
}
