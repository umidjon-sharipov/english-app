import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUserId } from "@/app/api/tests/route";
import { generateReadingWithAi, ReadingQuestionMode } from "@/lib/reading-ai";

const db = prisma as typeof prisma & {
  readingSet: any;
  user: any;
};

const readingInclude = {
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
    if (!db.readingSet || typeof db.readingSet.findMany !== "function") {
      return NextResponse.json({ readings: [] });
    }

    const { searchParams } = new URL(req.url);
    const includeAll = searchParams.get("all") === "1";

    const readings = await db.readingSet.findMany({
      where: includeAll ? undefined : { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      include: readingInclude,
    });

    return NextResponse.json({ readings });
  } catch (error) {
    console.error("GET /api/reading error:", error);
    return NextResponse.json(
      { error: "Reading ro'yxatini yuklashda xatolik." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!db.readingSet || typeof db.readingSet.create !== "function") {
      return NextResponse.json(
        {
          error:
            "Prisma client yangilanmagan. Terminalda `npx prisma generate` qiling.",
        },
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
      topic?: unknown;
      level?: unknown;
      length?: unknown;
      passageCount?: unknown;
      questionsPerPassage?: unknown;
      questionType?: unknown;
      customPrompt?: unknown;
      status?: unknown;
      allowParticipantAi?: unknown;
    };

    const topic =
      typeof body.topic === "string" && body.topic.trim()
        ? body.topic.trim()
        : "General English Reading";

    const validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const level =
      typeof body.level === "string" && validLevels.includes(body.level.toUpperCase())
        ? body.level.toUpperCase()
        : "B1";

    const validLengths = ["short", "medium", "long"];
    const length =
      typeof body.length === "string" && validLengths.includes(body.length)
        ? body.length
        : "medium";

    const questionType: ReadingQuestionMode =
      body.questionType === "question" ? "question" : "test";

    const rawPassages = Number(body.passageCount);
    const passageCount = Number.isFinite(rawPassages)
      ? Math.min(10, Math.max(1, Math.round(rawPassages)))
      : 1;

    const rawQ = Number(body.questionsPerPassage);
    const questionsPerPassage = Number.isFinite(rawQ)
      ? Math.min(10, Math.max(4, Math.round(rawQ)))
      : 5;

    const customPrompt =
      typeof body.customPrompt === "string" ? body.customPrompt.trim() : "";

    const status: "OPEN" | "CLOSED" =
      body.status === "CLOSED" ? "CLOSED" : "OPEN";

    const allowParticipantAi = body.allowParticipantAi === true;

    const passagesJson = await generateReadingWithAi({
      topic,
      level,
      length,
      passageCount,
      questionsPerPassage,
      questionType,
      customPrompt,
    });

    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : `${level} Reading · ${topic} (${passageCount} matn)`;

    const dataPayload = {
      title,
      topic,
      level,
      length,
      passageCount,
      questionsPerPassage,
      questionType,
      status,
      allowParticipantAi,
      blockedUserIds: [],
      passagesJson: JSON.parse(JSON.stringify(passagesJson)),
    };

    const { questionType: _qt, ...corePayload } = dataPayload as Record<
      string,
      unknown
    >;

    async function createReadingRecord(ownerId: string) {
      try {
        return await db.readingSet.create({
          data: { ...dataPayload, creatorId: ownerId },
          include: readingInclude,
        });
      } catch (e: unknown) {
        const c =
          typeof e === "object" && e !== null && "code" in e
            ? (e as { code?: string }).code
            : undefined;
        if (c === "P2022") {
          return await db.readingSet.create({
            data: { ...corePayload, creatorId: ownerId },
            include: readingInclude,
          });
        }
        throw e;
      }
    }

    let created;
    try {
      created = await createReadingRecord(creatorId);
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
        created = await createReadingRecord(firstUser.id);
      } else {
        throw err;
      }
    }

    return NextResponse.json({ reading: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/reading error:", error);
    return NextResponse.json(
      { error: "Reading yaratishda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
