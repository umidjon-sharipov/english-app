import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUserId } from "@/app/api/tests/route";

const db = prisma as typeof prisma & {
  test: any;
  user: any;
  testParticipant: any;
};

const testInclude = {
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

function extractSpecialMeta(questionsJson: unknown): {
  baseQuestions: unknown[];
  blockedResults: Record<
    string,
    { score: number | null; total: number | null; completedAt: string | null }
  >;
  kickedUserIds: string[];
} {
  let baseQuestions: unknown[] = [];
  let blockedResults: Record<
    string,
    { score: number | null; total: number | null; completedAt: string | null }
  > = {};
  let kickedUserIds: string[] = [];

  if (Array.isArray(questionsJson)) {
    baseQuestions = questionsJson;
  } else if (questionsJson && typeof questionsJson === "object") {
    const obj = questionsJson as Record<string, unknown>;
    if (Array.isArray(obj.questions)) {
      baseQuestions = obj.questions;
    } else if (Array.isArray(obj.items)) {
      baseQuestions = obj.items;
    }
    if (obj.__blockedResults && typeof obj.__blockedResults === "object" && !Array.isArray(obj.__blockedResults)) {
      blockedResults = { ...(obj.__blockedResults as Record<string, { score: number | null; total: number | null; completedAt: string | null }>) };
    }
    if (Array.isArray(obj.__kickedUserIds)) {
      kickedUserIds = obj.__kickedUserIds.filter((k): k is string => typeof k === "string");
    }
  }

  return { baseQuestions, blockedResults, kickedUserIds };
}

function packQuestionsJson(
  baseQuestions: unknown[],
  blockedResults: Record<string, { score: number | null; total: number | null; completedAt: string | null }>,
  kickedUserIds: string[]
): Record<string, unknown> {
  return {
    questions: baseQuestions,
    __blockedResults: blockedResults,
    __kickedUserIds: kickedUserIds,
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const currentUserId = await requireAuthUserId(req);

    const existing = await db.test.findUnique({
      where: { id },
      include: testInclude,
    });

    if (!existing) {
      return NextResponse.json({ error: "Test topilmadi." }, { status: 404 });
    }

    const isFounder = Boolean(currentUserId && currentUserId === existing.creatorId);
    const blockedIds: string[] = Array.isArray(existing.blockedUserIds)
      ? existing.blockedUserIds
      : [];

    const { baseQuestions, kickedUserIds } = extractSpecialMeta(existing.questionsJson);

    // If viewer is blocked
    if (currentUserId && blockedIds.includes(currentUserId) && !isFounder) {
      return NextResponse.json(
        { error: "Siz ushbu testdan bloklangansiz (Blocked).", isBlocked: true },
        { status: 403 }
      );
    }

    // If viewer was kicked from test
    if (currentUserId && kickedUserIds.includes(currentUserId) && !isFounder) {
      return NextResponse.json(
        { error: "Siz ushbu testdan chiqarilgansiz (Kicked). Qayta qatnasha olmaysiz.", isKicked: true },
        { status: 403 }
      );
    }

    let autoJoined = false;
    let activeTest = existing;

    // Auto-join only if open, within capacity, and not blocked or kicked
    if (
      currentUserId &&
      existing.status === "OPEN" &&
      !blockedIds.includes(currentUserId) &&
      !kickedUserIds.includes(currentUserId)
    ) {
      const alreadyJoined = Array.isArray(existing.participants)
        ? existing.participants.some((p: { userId: string }) => p.userId === currentUserId)
        : false;

      const currentCount = Array.isArray(existing.participants)
        ? existing.participants.length
        : 0;
      const withinCapacity =
        existing.maxParticipants === null ||
        existing.maxParticipants === undefined ||
        currentCount < existing.maxParticipants;

      if (!alreadyJoined && withinCapacity) {
        try {
          await db.testParticipant.create({
            data: { testId: id, userId: currentUserId },
          });
          autoJoined = true;
          const refreshed = await db.test.findUnique({
            where: { id },
            include: testInclude,
          });
          if (refreshed) activeTest = refreshed;
        } catch {
          // Ignore duplicate join race
        }
      }
    }

    // Lookup user details for blocked and kicked lists so founder sees names, not raw UUIDs
    let blockedUsers: Array<{ id: string; firstName: string; lastName: string | null; userName: string }> = [];
    let kickedUsers: Array<{ id: string; firstName: string; lastName: string | null; userName: string }> = [];

    if (isFounder) {
      if (blockedIds.length > 0 && db.user && typeof db.user.findMany === "function") {
        blockedUsers = await db.user.findMany({
          where: { id: { in: blockedIds } },
          select: { id: true, firstName: true, lastName: true, userName: true },
        });
      }
      if (kickedUserIds.length > 0 && db.user && typeof db.user.findMany === "function") {
        kickedUsers = await db.user.findMany({
          where: { id: { in: kickedUserIds } },
          select: { id: true, firstName: true, lastName: true, userName: true },
        });
      }
    }

    // Always normalize questionsJson for client
    const clientQuestions = baseQuestions.length > 0 ? baseQuestions : (Array.isArray(activeTest.questionsJson) ? activeTest.questionsJson : []);

    // Current viewer's score if exists
    let currentUserParticipant: { score: number | null; total: number | null } | null = null;
    if (currentUserId && Array.isArray(activeTest.participants)) {
      const found = activeTest.participants.find((p: { userId: string }) => p.userId === currentUserId);
      if (found) {
        currentUserParticipant = { score: found.score, total: found.total };
      }
    }

    // Founder receives full participants, blockedUsers, and kickedUsers; participants receive sanitized view
    const sanitizedTest = isFounder
      ? {
          ...activeTest,
          questionsJson: clientQuestions,
          blockedUsers,
          kickedUsers,
        }
      : {
          ...activeTest,
          questionsJson: clientQuestions,
          blockedUserIds: [],
          blockedUsers: [],
          kickedUsers: [],
          participants: [],
        };

    return NextResponse.json({
      test: sanitizedTest,
      autoJoined,
      isFounder,
      currentUserId,
      currentUserParticipant,
    });
  } catch (error) {
    console.error("GET /api/tests/[id] error:", error);
    return NextResponse.json(
      { error: "Testni yuklashda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const currentUserId = await requireAuthUserId(req);

    const existing = await db.test.findUnique({
      where: { id },
      include: testInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Test topilmadi." }, { status: 404 });
    }

    if (currentUserId && existing.creatorId !== currentUserId) {
      return NextResponse.json(
        { error: "Faqat test yaratuvchisi (Founder) bu amalni bajara oladi." },
        { status: 403 }
      );
    }

    const rawBody = await req.json();
    const body = (
      rawBody && typeof rawBody === "object" ? rawBody : {}
    ) as Record<string, unknown>;

    const action = typeof body.action === "string" ? body.action : "";
    const targetUserId =
      typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
    const participantId =
      typeof body.participantId === "string" ? body.participantId.trim() : "";

    let resolvedUserId = targetUserId;
    if (!resolvedUserId && participantId) {
      const pRow = await db.testParticipant.findUnique({
        where: { id: participantId },
      });
      if (pRow) resolvedUserId = pRow.userId;
    }

    const { baseQuestions, blockedResults, kickedUserIds } = extractSpecialMeta(existing.questionsJson);
    const clientQuestions = baseQuestions.length > 0 ? baseQuestions : (Array.isArray(existing.questionsJson) ? existing.questionsJson : []);

    // Helper to fetch blockedUsers and kickedUsers
    const loadModeratedUsers = async (bIds: string[], kIds: string[]) => {
      let bUsers: Array<{ id: string; firstName: string; lastName: string | null; userName: string }> = [];
      let kUsers: Array<{ id: string; firstName: string; lastName: string | null; userName: string }> = [];
      if (bIds.length > 0 && db.user && typeof db.user.findMany === "function") {
        bUsers = await db.user.findMany({
          where: { id: { in: bIds } },
          select: { id: true, firstName: true, lastName: true, userName: true },
        });
      }
      if (kIds.length > 0 && db.user && typeof db.user.findMany === "function") {
        kUsers = await db.user.findMany({
          where: { id: { in: kIds } },
          select: { id: true, firstName: true, lastName: true, userName: true },
        });
      }
      return { bUsers, kUsers };
    };

    // ACTION: KICK
    if (action === "kick" && resolvedUserId) {
      if (resolvedUserId === existing.creatorId) {
        return NextResponse.json(
          { error: "Founder testdan chiqarila olmaydi." },
          { status: 400 }
        );
      }

      await db.testParticipant.deleteMany({
        where: { testId: id, userId: resolvedUserId },
      });

      const nextKicked = Array.from(new Set([...kickedUserIds, resolvedUserId]));
      const nextQuestionsJson = packQuestionsJson(clientQuestions, blockedResults, nextKicked);

      const updated = await db.test.update({
        where: { id },
        data: { questionsJson: nextQuestionsJson },
        include: testInclude,
      });

      const { bUsers, kUsers } = await loadModeratedUsers(
        Array.isArray(updated.blockedUserIds) ? updated.blockedUserIds : [],
        nextKicked
      );

      return NextResponse.json({
        test: {
          ...updated,
          questionsJson: clientQuestions,
          blockedUsers: bUsers,
          kickedUsers: kUsers,
        },
        message: "Qatnashuvchi testdan chiqarildi va qayta kirishi bloklandi.",
      });
    }

    // ACTION: UNKICK (Allow again)
    if (action === "unkick" && resolvedUserId) {
      const nextKicked = kickedUserIds.filter((u) => u !== resolvedUserId);
      const nextQuestionsJson = packQuestionsJson(clientQuestions, blockedResults, nextKicked);

      const updated = await db.test.update({
        where: { id },
        data: { questionsJson: nextQuestionsJson },
        include: testInclude,
      });

      const { bUsers, kUsers } = await loadModeratedUsers(
        Array.isArray(updated.blockedUserIds) ? updated.blockedUserIds : [],
        nextKicked
      );

      return NextResponse.json({
        test: {
          ...updated,
          questionsJson: clientQuestions,
          blockedUsers: bUsers,
          kickedUsers: kUsers,
        },
        message: "Foydalanuvchiga qayta testga kirishga ruxsat berildi.",
      });
    }

    // ACTION: BLOCK
    if (action === "block" && resolvedUserId) {
      if (resolvedUserId === existing.creatorId) {
        return NextResponse.json(
          { error: "Founder o'zini o'zi blocklay olmaydi." },
          { status: 400 }
        );
      }

      const prevPart = await db.testParticipant.findFirst({
        where: { testId: id, userId: resolvedUserId },
      });
      await db.testParticipant.deleteMany({
        where: { testId: id, userId: resolvedUserId },
      });

      if (prevPart && typeof prevPart.score === "number") {
        blockedResults[resolvedUserId] = {
          score: prevPart.score,
          total: typeof prevPart.total === "number" ? prevPart.total : existing.questionCount,
          completedAt: prevPart.completedAt ? new Date(prevPart.completedAt).toISOString() : new Date().toISOString(),
        };
      }

      const prevBlocked: string[] = Array.isArray(existing.blockedUserIds)
        ? existing.blockedUserIds
        : [];
      const nextBlocked = Array.from(new Set([...prevBlocked, resolvedUserId]));
      const nextKicked = kickedUserIds.filter((u) => u !== resolvedUserId);

      const nextQuestionsJson = packQuestionsJson(clientQuestions, blockedResults, nextKicked);

      const updated = await db.test.update({
        where: { id },
        data: {
          blockedUserIds: nextBlocked,
          questionsJson: nextQuestionsJson,
        },
        include: testInclude,
      });

      const { bUsers, kUsers } = await loadModeratedUsers(nextBlocked, nextKicked);

      return NextResponse.json({
        test: {
          ...updated,
          questionsJson: clientQuestions,
          blockedUsers: bUsers,
          kickedUsers: kUsers,
        },
        message: "Foydalanuvchi bloklandi va natijalari saqlandi.",
      });
    }

    // ACTION: UNBLOCK
    if (action === "unblock" && resolvedUserId) {
      const prevBlocked: string[] = Array.isArray(existing.blockedUserIds)
        ? existing.blockedUserIds
        : [];
      const nextBlocked = prevBlocked.filter((u) => u !== resolvedUserId);

      const savedSnap = blockedResults[resolvedUserId];
      if (savedSnap && typeof savedSnap.score === "number") {
        await db.testParticipant.upsert({
          where: {
            testId_userId: { testId: id, userId: resolvedUserId },
          },
          update: {
            score: savedSnap.score,
            total: typeof savedSnap.total === "number" ? savedSnap.total : existing.questionCount,
            completedAt: savedSnap.completedAt ? new Date(savedSnap.completedAt) : new Date(),
          },
          create: {
            testId: id,
            userId: resolvedUserId,
            score: savedSnap.score,
            total: typeof savedSnap.total === "number" ? savedSnap.total : existing.questionCount,
            completedAt: savedSnap.completedAt ? new Date(savedSnap.completedAt) : new Date(),
          },
        });
        delete blockedResults[resolvedUserId];
      }

      const nextQuestionsJson = packQuestionsJson(clientQuestions, blockedResults, kickedUserIds);

      const updated = await db.test.update({
        where: { id },
        data: {
          blockedUserIds: nextBlocked,
          questionsJson: nextQuestionsJson,
        },
        include: testInclude,
      });

      const { bUsers, kUsers } = await loadModeratedUsers(nextBlocked, kickedUserIds);

      return NextResponse.json({
        test: {
          ...updated,
          questionsJson: clientQuestions,
          blockedUsers: bUsers,
          kickedUsers: kUsers,
        },
        message: "Block olib tashlandi va oldingi natijalar tiklandi.",
      });
    }

    // Toggle status or AI
    const updateData: Record<string, unknown> = {};
    if (body.status === "OPEN" || body.status === "CLOSED") {
      updateData.status = body.status;
    }
    if (typeof body.allowParticipantAi === "boolean") {
      updateData.allowParticipantAi = body.allowParticipantAi;
    }

    const updated = await db.test.update({
      where: { id },
      data: updateData,
      include: testInclude,
    });

    const { bUsers, kUsers } = await loadModeratedUsers(
      Array.isArray(updated.blockedUserIds) ? updated.blockedUserIds : [],
      kickedUserIds
    );

    return NextResponse.json({
      test: {
        ...updated,
        questionsJson: clientQuestions,
        blockedUsers: bUsers,
        kickedUsers: kUsers,
      },
    });
  } catch (error) {
    console.error("PATCH /api/tests/[id] error:", error);
    return NextResponse.json(
      { error: "Testni yangilashda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const userId = await requireAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Avval tizimga kiring." }, { status: 401 });
    }

    const existing = await db.test.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Test topilmadi." }, { status: 404 });
    }

    const blockedIds: string[] = Array.isArray(existing.blockedUserIds)
      ? existing.blockedUserIds
      : [];
    if (blockedIds.includes(userId) && existing.creatorId !== userId) {
      return NextResponse.json(
        { error: "Siz ushbu testdan bloklangansiz." },
        { status: 403 }
      );
    }

    const { kickedUserIds } = extractSpecialMeta(existing.questionsJson);
    if (kickedUserIds.includes(userId) && existing.creatorId !== userId) {
      return NextResponse.json(
        { error: "Siz ushbu testdan chiqarilgansiz (Kicked)." },
        { status: 403 }
      );
    }

    const body = (await req.json()) as { score?: unknown; total?: unknown };
    const score = typeof body.score === "number" ? Math.max(0, Math.round(body.score)) : 0;
    const total =
      typeof body.total === "number" && body.total > 0
        ? Math.round(body.total)
        : existing.questionCount;

    await db.testParticipant.upsert({
      where: {
        testId_userId: { testId: id, userId },
      },
      update: { score, total, completedAt: new Date() },
      create: { testId: id, userId, score, total, completedAt: new Date() },
    });

    return NextResponse.json({ ok: true, score, total });
  } catch (error) {
    console.error("POST /api/tests/[id] error:", error);
    return NextResponse.json(
      { error: "Natijani saqlashda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const currentUserId = await requireAuthUserId(req);
    const existing = await db.test.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Test topilmadi." }, { status: 404 });
    }
    if (currentUserId && existing.creatorId !== currentUserId) {
      return NextResponse.json(
        { error: "Faqat Founder testni o'chira oladi." },
        { status: 403 }
      );
    }
    await db.test.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/tests/[id] error:", error);
    return NextResponse.json(
      { error: "Testni o'chirishda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
