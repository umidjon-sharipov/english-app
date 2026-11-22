import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUserId } from "@/app/api/tests/route";

const db = prisma as typeof prisma & {
  gameSet: any;
  user: any;
  gameParticipant: any;
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

function extractGameMeta(questionsJson: unknown): {
  baseRounds: unknown[];
  blockedResults: Record<
    string,
    { score: number | null; total: number | null; streak: number | null; completedAt: string | null }
  >;
  kickedUserIds: string[];
} {
  let baseRounds: unknown[] = [];
  let blockedResults: Record<
    string,
    { score: number | null; total: number | null; streak: number | null; completedAt: string | null }
  > = {};
  let kickedUserIds: string[] = [];

  if (Array.isArray(questionsJson)) {
    baseRounds = questionsJson;
  } else if (questionsJson && typeof questionsJson === "object") {
    const obj = questionsJson as Record<string, unknown>;
    if (Array.isArray(obj.rounds)) {
      baseRounds = obj.rounds;
    } else if (Array.isArray(obj.questions)) {
      baseRounds = obj.questions;
    }
    if (obj.__blockedResults && typeof obj.__blockedResults === "object" && !Array.isArray(obj.__blockedResults)) {
      blockedResults = { ...(obj.__blockedResults as Record<string, { score: number | null; total: number | null; streak: number | null; completedAt: string | null }>) };
    }
    if (Array.isArray(obj.__kickedUserIds)) {
      kickedUserIds = obj.__kickedUserIds.filter((k): k is string => typeof k === "string");
    }
  }

  return { baseRounds, blockedResults, kickedUserIds };
}

function packGameJson(
  baseRounds: unknown[],
  blockedResults: Record<string, { score: number | null; total: number | null; streak: number | null; completedAt: string | null }>,
  kickedUserIds: string[]
): Record<string, unknown> {
  return {
    rounds: baseRounds,
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

    const existing = await db.gameSet.findUnique({
      where: { id },
      include: gameInclude,
    });

    if (!existing) {
      return NextResponse.json({ error: "O'yin topilmadi." }, { status: 404 });
    }

    const isFounder = Boolean(currentUserId && currentUserId === existing.creatorId);
    const blockedIds: string[] = Array.isArray(existing.blockedUserIds)
      ? existing.blockedUserIds
      : [];

    const { baseRounds, kickedUserIds } = extractGameMeta(existing.questionsJson);

    if (currentUserId && blockedIds.includes(currentUserId) && !isFounder) {
      return NextResponse.json(
        { error: "Siz ushbu o'yindan bloklangansiz.", isBlocked: true },
        { status: 403 }
      );
    }

    if (currentUserId && kickedUserIds.includes(currentUserId) && !isFounder) {
      return NextResponse.json(
        { error: "Siz ushbu o'yindan chiqarilgansiz (Kicked).", isKicked: true },
        { status: 403 }
      );
    }

    let autoJoined = false;
    let active = existing;

    if (
      currentUserId &&
      existing.status === "OPEN" &&
      !blockedIds.includes(currentUserId) &&
      !kickedUserIds.includes(currentUserId)
    ) {
      const alreadyJoined = Array.isArray(existing.participants)
        ? existing.participants.some((p: { userId: string }) => p.userId === currentUserId)
        : false;

      if (!alreadyJoined) {
        try {
          await db.gameParticipant.create({
            data: { gameId: id, userId: currentUserId },
          });
          autoJoined = true;
          const refreshed = await db.gameSet.findUnique({
            where: { id },
            include: gameInclude,
          });
          if (refreshed) active = refreshed;
        } catch {
          // ignore duplicate race
        }
      }
    }

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

    const clientRounds = baseRounds.length > 0 ? baseRounds : (Array.isArray(active.questionsJson) ? active.questionsJson : []);

    let currentUserParticipant: { score: number | null; total: number | null; streak: number | null } | null = null;
    if (currentUserId && Array.isArray(active.participants)) {
      const found = active.participants.find((p: { userId: string }) => p.userId === currentUserId);
      if (found) {
        currentUserParticipant = { score: found.score, total: found.total, streak: found.streak };
      }
    }

    const sanitized = isFounder
      ? {
          ...active,
          questionsJson: clientRounds,
          blockedUsers,
          kickedUsers,
        }
      : {
          ...active,
          questionsJson: clientRounds,
          blockedUserIds: [],
          blockedUsers: [],
          kickedUsers: [],
          participants: [],
        };

    return NextResponse.json({
      game: sanitized,
      autoJoined,
      isFounder,
      currentUserId,
      currentUserParticipant,
    });
  } catch (error) {
    console.error("GET /api/games/[id] error:", error);
    return NextResponse.json(
      { error: "O'yinni yuklashda xatolik yuz berdi." },
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

    const existing = await db.gameSet.findUnique({
      where: { id },
      include: gameInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "O'yin topilmadi." }, { status: 404 });
    }

    if (currentUserId && existing.creatorId !== currentUserId) {
      return NextResponse.json(
        { error: "Faqat Founder bu amalni bajara oladi." },
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
      const pRow = await db.gameParticipant.findUnique({
        where: { id: participantId },
      });
      if (pRow) resolvedUserId = pRow.userId;
    }

    const { baseRounds, blockedResults, kickedUserIds } = extractGameMeta(existing.questionsJson);
    const clientRounds = baseRounds.length > 0 ? baseRounds : (Array.isArray(existing.questionsJson) ? existing.questionsJson : []);

    const loadUsers = async (bIds: string[], kIds: string[]) => {
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

    if (action === "kick" && resolvedUserId) {
      if (resolvedUserId === existing.creatorId) {
        return NextResponse.json({ error: "Founder o'yindan chiqarila olmaydi." }, { status: 400 });
      }

      await db.gameParticipant.deleteMany({
        where: { gameId: id, userId: resolvedUserId },
      });

      const nextKicked = Array.from(new Set([...kickedUserIds, resolvedUserId]));
      const nextJson = packGameJson(clientRounds, blockedResults, nextKicked);

      const updated = await db.gameSet.update({
        where: { id },
        data: { questionsJson: nextJson },
        include: gameInclude,
      });

      const { bUsers, kUsers } = await loadUsers(
        Array.isArray(updated.blockedUserIds) ? updated.blockedUserIds : [],
        nextKicked
      );

      return NextResponse.json({
        game: {
          ...updated,
          questionsJson: clientRounds,
          blockedUsers: bUsers,
          kickedUsers: kUsers,
        },
        message: "Ishtirokchi chiqarildi va qayta kirishi bloklandi.",
      });
    }

    if (action === "unkick" && resolvedUserId) {
      const nextKicked = kickedUserIds.filter((u) => u !== resolvedUserId);
      const nextJson = packGameJson(clientRounds, blockedResults, nextKicked);

      const updated = await db.gameSet.update({
        where: { id },
        data: { questionsJson: nextJson },
        include: gameInclude,
      });

      const { bUsers, kUsers } = await loadUsers(
        Array.isArray(updated.blockedUserIds) ? updated.blockedUserIds : [],
        nextKicked
      );

      return NextResponse.json({
        game: {
          ...updated,
          questionsJson: clientRounds,
          blockedUsers: bUsers,
          kickedUsers: kUsers,
        },
        message: "Foydalanuvchiga qayta kirishga ruxsat berildi.",
      });
    }

    if (action === "block" && resolvedUserId) {
      if (resolvedUserId === existing.creatorId) {
        return NextResponse.json({ error: "Founder o'zini blocklay olmaydi." }, { status: 400 });
      }

      const prevPart = await db.gameParticipant.findFirst({
        where: { gameId: id, userId: resolvedUserId },
      });
      await db.gameParticipant.deleteMany({
        where: { gameId: id, userId: resolvedUserId },
      });

      if (prevPart && typeof prevPart.score === "number") {
        blockedResults[resolvedUserId] = {
          score: prevPart.score,
          total: prevPart.total ?? existing.questionCount,
          streak: prevPart.streak,
          completedAt: prevPart.completedAt ? new Date(prevPart.completedAt).toISOString() : new Date().toISOString(),
        };
      }

      const prevBlocked: string[] = Array.isArray(existing.blockedUserIds)
        ? existing.blockedUserIds
        : [];
      const nextBlocked = Array.from(new Set([...prevBlocked, resolvedUserId]));
      const nextKicked = kickedUserIds.filter((u) => u !== resolvedUserId);

      const nextJson = packGameJson(clientRounds, blockedResults, nextKicked);

      const updated = await db.gameSet.update({
        where: { id },
        data: {
          blockedUserIds: nextBlocked,
          questionsJson: nextJson,
        },
        include: gameInclude,
      });

      const { bUsers, kUsers } = await loadUsers(nextBlocked, nextKicked);

      return NextResponse.json({
        game: {
          ...updated,
          questionsJson: clientRounds,
          blockedUsers: bUsers,
          kickedUsers: kUsers,
        },
        message: "Foydalanuvchi bloklandi va natijalari saqlandi.",
      });
    }

    if (action === "unblock" && resolvedUserId) {
      const prevBlocked: string[] = Array.isArray(existing.blockedUserIds)
        ? existing.blockedUserIds
        : [];
      const nextBlocked = prevBlocked.filter((u) => u !== resolvedUserId);

      const savedSnap = blockedResults[resolvedUserId];
      if (savedSnap && typeof savedSnap.score === "number") {
        await db.gameParticipant.upsert({
          where: {
            gameId_userId: { gameId: id, userId: resolvedUserId },
          },
          update: {
            score: savedSnap.score,
            total: savedSnap.total,
            streak: savedSnap.streak,
            completedAt: savedSnap.completedAt ? new Date(savedSnap.completedAt) : new Date(),
          },
          create: {
            gameId: id,
            userId: resolvedUserId,
            score: savedSnap.score,
            total: savedSnap.total,
            streak: savedSnap.streak,
            completedAt: savedSnap.completedAt ? new Date(savedSnap.completedAt) : new Date(),
          },
        });
        delete blockedResults[resolvedUserId];
      }

      const nextJson = packGameJson(clientRounds, blockedResults, kickedUserIds);

      const updated = await db.gameSet.update({
        where: { id },
        data: {
          blockedUserIds: nextBlocked,
          questionsJson: nextJson,
        },
        include: gameInclude,
      });

      const { bUsers, kUsers } = await loadUsers(nextBlocked, kickedUserIds);

      return NextResponse.json({
        game: {
          ...updated,
          questionsJson: clientRounds,
          blockedUsers: bUsers,
          kickedUsers: kUsers,
        },
        message: "Blokdan chiqarildi va avvalgi natijalar tiklandi.",
      });
    }

    const updateData: Record<string, unknown> = {};
    if (body.status === "OPEN" || body.status === "CLOSED") {
      updateData.status = body.status;
    }
    if (typeof body.allowParticipantAi === "boolean") {
      updateData.allowParticipantAi = body.allowParticipantAi;
    }

    const updated = await db.gameSet.update({
      where: { id },
      data: updateData,
      include: gameInclude,
    });

    const { bUsers, kUsers } = await loadUsers(
      Array.isArray(updated.blockedUserIds) ? updated.blockedUserIds : [],
      kickedUserIds
    );

    return NextResponse.json({
      game: {
        ...updated,
        questionsJson: clientRounds,
        blockedUsers: bUsers,
        kickedUsers: kUsers,
      },
    });
  } catch (error) {
    console.error("PATCH /api/games/[id] error:", error);
    return NextResponse.json(
      { error: "Yangilashda xatolik yuz berdi." },
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

    const existing = await db.gameSet.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "O'yin topilmadi." }, { status: 404 });
    }

    const blockedIds: string[] = Array.isArray(existing.blockedUserIds)
      ? existing.blockedUserIds
      : [];
    if (blockedIds.includes(userId) && existing.creatorId !== userId) {
      return NextResponse.json({ error: "Siz ushbu o'yindan bloklangansiz." }, { status: 403 });
    }

    const { kickedUserIds } = extractGameMeta(existing.questionsJson);
    if (kickedUserIds.includes(userId) && existing.creatorId !== userId) {
      return NextResponse.json({ error: "Siz ushbu o'yindan chiqarilgansiz (Kicked)." }, { status: 403 });
    }

    const body = (await req.json()) as { score?: unknown; total?: unknown; streak?: unknown };
    const score = typeof body.score === "number" ? Math.max(0, Math.round(body.score)) : 0;
    const total =
      typeof body.total === "number" && body.total > 0
        ? Math.round(body.total)
        : existing.questionCount;
    const streak = typeof body.streak === "number" ? Math.max(0, Math.round(body.streak)) : 0;

    await db.gameParticipant.upsert({
      where: {
        gameId_userId: { gameId: id, userId },
      },
      update: { score, total, streak, completedAt: new Date() },
      create: { gameId: id, userId, score, total, streak, completedAt: new Date() },
    });

    return NextResponse.json({ ok: true, score, total, streak });
  } catch (error) {
    console.error("POST /api/games/[id] error:", error);
    return NextResponse.json({ error: "Natijani saqlashda xatolik." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const currentUserId = await requireAuthUserId(req);
    const existing = await db.gameSet.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Topilmadi." }, { status: 404 });
    }
    if (currentUserId && existing.creatorId !== currentUserId) {
      return NextResponse.json({ error: "Faqat Founder o'chira oladi." }, { status: 403 });
    }
    await db.gameSet.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/games/[id] error:", error);
    return NextResponse.json({ error: "O'chirishda xatolik." }, { status: 500 });
  }
}
