import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUserId } from "@/app/api/tests/route";
import {
  gradeReadingAnswersWithAi,
  ReadingPassageItem,
  ReadingQuestionMode,
} from "@/lib/reading-ai";

const db = prisma as typeof prisma & {
  readingSet: any;
  readingParticipant: any;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const existing = await db.readingSet.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Reading topilmadi." }, { status: 404 });
    }

    const userId = await requireAuthUserId(req);
    const blockedIds: string[] = Array.isArray(existing.blockedUserIds)
      ? existing.blockedUserIds
      : [];
    if (userId && blockedIds.includes(userId) && existing.creatorId !== userId) {
      return NextResponse.json(
        { error: "Siz ushbu Reading'dan bloklangansiz." },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      answers?: unknown;
      textAnswers?: unknown;
    };
    const answers: Record<string, number> =
      body.answers && typeof body.answers === "object"
        ? (body.answers as Record<string, number>)
        : {};
    const textAnswers: Record<string, string> =
      body.textAnswers && typeof body.textAnswers === "object"
        ? (body.textAnswers as Record<string, string>)
        : {};

    const passages: ReadingPassageItem[] = Array.isArray(existing.passagesJson)
      ? existing.passagesJson
      : [];

    const questionType: ReadingQuestionMode =
      existing.questionType === "question" ? "question" : "test";

    const graded = await gradeReadingAnswersWithAi({
      questionType,
      passages,
      answers,
      textAnswers,
    });

    if (userId) {
      const existingPart = await db.readingParticipant.findFirst({
        where: { readingId: id, userId },
      });
      if (existingPart) {
        await db.readingParticipant.update({
          where: { id: existingPart.id },
          data: {
            score: graded.score,
            total: graded.total,
            feedbackJson: JSON.parse(JSON.stringify(graded.results)),
            completedAt: new Date(),
          },
        });
      } else {
        await db.readingParticipant.create({
          data: {
            readingId: id,
            userId,
            score: graded.score,
            total: graded.total,
            feedbackJson: JSON.parse(JSON.stringify(graded.results)),
            completedAt: new Date(),
          },
        });
      }
    }

    return NextResponse.json(graded);
  } catch (error) {
    console.error("POST /api/reading/[id]/grade error:", error);
    return NextResponse.json(
      { error: "AI tekshiruvida xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
