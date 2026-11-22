import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUserId } from "@/app/api/tests/route";
import { GAME_TYPES, generateGameWithAi } from "@/lib/games-ai";

const db = prisma as typeof prisma & {
  gameSet: any;
  user: any;
};

const gameInclude = {
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
    if (!db.gameSet || typeof db.gameSet.findMany !== "function") {
      return NextResponse.json({ games: [] });
    }
    const { searchParams } = new URL(req.url);
    const includeAll = searchParams.get("all") === "1";

    const games = await db.gameSet.findMany({
      where: includeAll ? undefined : { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      include: gameInclude,
    });

    return NextResponse.json({ games });
  } catch (error) {
    console.error("GET /api/games error:", error);
    return NextResponse.json(
      { error: "O'yinlarni yuklashda xatolik." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!db.gameSet || typeof db.gameSet.create !== "function") {
      return NextResponse.json(
        { error: "Prisma client yangilanmagan. `npx prisma generate` qiling." },
        { status: 500 }
      );
    }

    const creatorId = await requireAuthUserId(req);
    if (!creatorId) {
      return NextResponse.json(
        { error: "Avval tizimga kiring (401)." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      title?: unknown;
      gameType?: unknown;
      topic?: unknown;
      level?: unknown;
      questionCount?: unknown;
      customPrompt?: unknown;
      status?: unknown;
      allowParticipantAi?: unknown;
    };

    const validTypes = GAME_TYPES.map((g) => g.id);
    const gameType =
      typeof body.gameType === "string" && validTypes.includes(body.gameType)
        ? body.gameType
        : GAME_TYPES[0].id;

    const topic =
      typeof body.topic === "string" && body.topic.trim()
        ? body.topic.trim()
        : "General English";

    const validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const level =
      typeof body.level === "string" && validLevels.includes(body.level.toUpperCase())
        ? body.level.toUpperCase()
        : "B1";

    const rawCount = Number(body.questionCount);
    const questionCount = Number.isFinite(rawCount)
      ? Math.min(30, Math.max(4, Math.round(rawCount)))
      : 10;

    const customPrompt =
      typeof body.customPrompt === "string" ? body.customPrompt.trim() : "";

    const status: "OPEN" | "CLOSED" =
      body.status === "CLOSED" ? "CLOSED" : "OPEN";

    const allowParticipantAi = body.allowParticipantAi === true;

    const aiGen = await generateGameWithAi({
      gameType,
      topic,
      level,
      questionCount,
      customPrompt,
    });

    const gMeta = GAME_TYPES.find((g) => g.id === gameType) || GAME_TYPES[0];
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : `${gMeta.name} · ${level} (${questionCount} cards)`;

    const payload = {
      title,
      gameType,
      topic,
      level,
      questionCount,
      status,
      allowParticipantAi,
      blockedUserIds: [],
      questionsJson: JSON.parse(JSON.stringify(aiGen.rounds)),
    };

    let created;
    try {
      created = await db.gameSet.create({
        data: { ...payload, creatorId },
        include: gameInclude,
      });
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      if (code === "P2003") {
        const firstUser = await db.user.findFirst({ select: { id: true } });
        if (!firstUser?.id) {
          return NextResponse.json(
            { error: "Users jadvalida foydalanuvchi topilmadi." },
            { status: 400 }
          );
        }
        created = await db.gameSet.create({
          data: { ...payload, creatorId: firstUser.id },
          include: gameInclude,
        });
      } else {
        throw err;
      }
    }

    return NextResponse.json(
      { game: created, usedAi: aiGen.usedAi, aiNote: aiGen.aiNote },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/games error:", error);
    return NextResponse.json(
      { error: "O'yin yaratishda xatolik." },
      { status: 500 }
    );
  }
}
