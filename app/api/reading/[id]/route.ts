import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUserId } from "@/app/api/tests/route";

const db = prisma as typeof prisma & {
  readingSet: any;
  user: any;
  readingParticipant: any;
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

function extractReadingMeta(passagesJson: unknown): {
  basePassages: unknown[];
  blockedResults: Record<
    string,
    { score: number | null; total: number | null; completedAt: string | null; feedbackJson?: unknown }
  >;
  kickedUserIds: string[];
} {
  let basePassages: unknown[] = [];
  let blockedResults: Record<
    string,
    { score: number | null; total: number | null; completedAt: string | null; feedbackJson?: unknown }
  > = {};
  let kickedUserIds: string[] = [];

  if (Array.isArray(passagesJson)) {
    basePassages = passagesJson;
  } else if (passagesJson && typeof passagesJson === "object") {
    const obj = passagesJson as Record<string, unknown>;
    if (Array.isArray(obj.passages)) {
      basePassages = obj.passages;
    } else if (Array.isArray(obj.items)) {
      basePassages = obj.items;
    }
    if (obj.__blockedResults && typeof obj.__blockedResults === "object" && !Array.isArray(obj.__blockedResults)) {
      blockedResults = { ...(obj.__blockedResults as Record<string, { score: number | null; total: number | null; completedAt: string | null; feedbackJson?: unknown }>) };
    }
    if (Array.isArray(obj.__kickedUserIds)) {
      kickedUserIds = obj.__kickedUserIds.filter((k): k is string => typeof k === "string");
    }
  }

  return { basePassages, blockedResults, kickedUserIds };
}

function packReadingJson(
  basePassages: unknown[],
  blockedResults: Record<string, { score: number | null; total: number | null; completedAt: string | null; feedbackJson?: unknown }>,
  kickedUserIds: string[]
): Record<string, unknown> {
  return {
    passages: basePassages,
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

    const existing = await db.readingSet.findUnique({
      where: { id },
      include: readingInclude,
    });

    if (!existing) {
      return NextResponse.json({ error: "Reading to'plami topilmadi." }, { status: 404 });
    }

    const isFounder = Boolean(currentUserId && currentUserId === existing.creatorId);
    const blockedIds: string[] = Array.isArray(existing.blockedUserIds)
      ? existing.blockedUserIds
      : [];

    const { basePassages, kickedUserIds } = extractReadingMeta(existing.passagesJson);

    if (currentUserId && blockedIds.includes(currentUserId) && !isFounder) {
      return NextResponse.json(
        { error: "Siz ushbu Reading'dan bloklangansiz.", isBlocked: true },
        { status: 403 }
      );
    }

    if (currentUserId && kickedUserIds.includes(currentUserId) && !isFounder) {
      return NextResponse.json(
        { error: "Siz ushbu Reading'dan chiqarilgansiz (Kicked). Qayta qatnasha olmaysiz.", isKicked: true },
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
          await db.readingParticipant.create({
            data: { readingId: id, userId: currentUserId },
          });
          autoJoined = true;
          const refreshed = await db.readingSet.findUnique({
            where: { id },
            include: readingInclude,
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

    const clientPassages = basePassages.length > 0 ? basePassages : (Array.isArray(active.passagesJson) ? active.passagesJson : []);

    let currentUserParticipant: { score: number | null; total: number | null; feedbackJson?: unknown } | null = null;
    if (currentUserId && Array.isArray(active.participants)) {
      const found = active.participants.find((p: { userId: string }) => p.userId === currentUserId);
      if (found) {
        currentUserParticipant = { score: found.score, total: found.total, feedbackJson: found.feedbackJson };
      }
    }

    const sanitized = isFounder
      ? {
          ...active,
          passagesJson: clientPassages,
          blockedUsers,
          kickedUsers,
        }
      : {
          ...active,
          passagesJson: clientPassages,
          blockedUserIds: [],
          blockedUsers: [],
          kickedUsers: [],
          participants: [],
        };

    return NextResponse.json({
      reading: sanitized,
      autoJoined,
      isFounder,
      currentUserId,
      currentUserParticipant,
    });
  } catch (error) {
    console.error("GET /api/reading/[id] error:", error);
    return NextResponse.json(
      { error: "Reading'ni yuklashda xatolik yuz berdi." },
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

    const existing = await db.readingSet.findUnique({
      where: { id },
      include: readingInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Reading topilmadi." }, { status: 404 });
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
      const pRow = await db.readingParticipant.findUnique({
        where: { id: participantId },
      });
      if (pRow) resolvedUserId = pRow.userId;
    }

    const { basePassages, blockedResults, kickedUserIds } = extractReadingMeta(existing.passagesJson);
    const clientPassages = basePassages.length > 0 ? basePassages : (Array.isArray(existing.passagesJson) ? existing.passagesJson : []);

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
        return NextResponse.json(
          { error: "Founder reading to'plamidan chiqarila olmaydi." },
          { status: 400 }
        );
      }

      await db.readingParticipant.deleteMany({
        where: { readingId: id, userId: resolvedUserId },
      });

      const nextKicked = Array.from(new Set([...kickedUserIds, resolvedUserId]));
      const nextPassagesJson = packReadingJson(clientPassages, blockedResults, nextKicked);

      const updated = await db.readingSet.update({
        where: { id },
        data: { passagesJson: nextPassagesJson },
        include: readingInclude,
      });

      const { bUsers, kUsers } = await loadUsers(
        Array.isArray(updated.blockedUserIds) ? updated.blockedUserIds : [],
        nextKicked
      );

      return NextResponse.json({
        reading: {
          ...updated,
          passagesJson: clientPassages,
          blockedUsers: bUsers,
          kickedUsers: kUsers,
        },
        message: "Qatnashuvchi chiqarildi va qayta kirishi cheklandi.",
      });
    }

    if (action === "unkick" && resolvedUserId) {
      const nextKicked = kickedUserIds.filter((u) => u !== resolvedUserId);
      const nextPassagesJson = packReadingJson(clientPassages, blockedResults, nextKicked);

      const updated = await db.readingSet.update({
        where: { id },
        data: { passagesJson: nextPassagesJson },
        include: readingInclude,
      });

      const { bUsers, kUsers } = await loadUsers(
        Array.isArray(updated.blockedUserIds) ? updated.blockedUserIds : [],
        nextKicked
      );

      return NextResponse.json({
        reading: {
          ...updated,
          passagesJson: clientPassages,
          blockedUsers: bUsers,
          kickedUsers: kUsers,
        },
        message: "Foydalanuvchiga qayta kirishga ruxsat berildi.",
      });
    }

    if (action === "block" && resolvedUserId) {
      if (resolvedUserId === existing.creatorId) {
        return NextResponse.json(
          { error: "Founder o'zini blocklay olmaydi." },
          { status: 400 }
        );
      }

      const prevPart = await db.readingParticipant.findFirst({
        where: { readingId: id, userId: resolvedUserId },
      });
      await db.readingParticipant.deleteMany({
        where: { readingId: id, userId: resolvedUserId },
      });

      if (prevPart && typeof prevPart.score === "number") {
        blockedResults[resolvedUserId] = {
          score: prevPart.score,
          total: prevPart.total ?? 10,
          completedAt: prevPart.completedAt ? new Date(prevPart.completedAt).toISOString() : new Date().toISOString(),
          feedbackJson: prevPart.feedbackJson,
        };
      }

      const prevBlocked: string[] = Array.isArray(existing.blockedUserIds)
        ? existing.blockedUserIds
        : [];
      const nextBlocked = Array.from(new Set([...prevBlocked, resolvedUserId]));
      const nextKicked = kickedUserIds.filter((u) => u !== resolvedUserId);

      const nextPassagesJson = packReadingJson(clientPassages, blockedResults, nextKicked);

      const updated = await db.readingSet.update({
        where: { id },
        data: {
          blockedUserIds: nextBlocked,
          passagesJson: nextPassagesJson,
        },
        include: readingInclude,
      });

      const { bUsers, kUsers } = await loadUsers(nextBlocked, nextKicked);

      return NextResponse.json({
        reading: {
          ...updated,
          passagesJson: clientPassages,
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
        await db.readingParticipant.upsert({
          where: {
            readingId_userId: { readingId: id, userId: resolvedUserId },
          },
          update: {
            score: savedSnap.score,
            total: savedSnap.total,
            completedAt: savedSnap.completedAt ? new Date(savedSnap.completedAt) : new Date(),
            feedbackJson: savedSnap.feedbackJson,
          },
          create: {
            readingId: id,
            userId: resolvedUserId,
            score: savedSnap.score,
            total: savedSnap.total,
            completedAt: savedSnap.completedAt ? new Date(savedSnap.completedAt) : new Date(),
            feedbackJson: savedSnap.feedbackJson,
          },
        });
        delete blockedResults[resolvedUserId];
      }

      const nextPassagesJson = packReadingJson(clientPassages, blockedResults, kickedUserIds);

      const updated = await db.readingSet.update({
        where: { id },
        data: {
          blockedUserIds: nextBlocked,
          passagesJson: nextPassagesJson,
        },
        include: readingInclude,
      });

      const { bUsers, kUsers } = await loadUsers(nextBlocked, kickedUserIds);

      return NextResponse.json({
        reading: {
          ...updated,
          passagesJson: clientPassages,
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

    const updated = await db.readingSet.update({
      where: { id },
      data: updateData,
      include: readingInclude,
    });

    const { bUsers, kUsers } = await loadUsers(
      Array.isArray(updated.blockedUserIds) ? updated.blockedUserIds : [],
      kickedUserIds
    );

    return NextResponse.json({
      reading: {
        ...updated,
        passagesJson: clientPassages,
        blockedUsers: bUsers,
        kickedUsers: kUsers,
      },
    });
  } catch (error) {
    console.error("PATCH /api/reading/[id] error:", error);
    return NextResponse.json(
      { error: "Yangilashda xatolik yuz berdi." },
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
    const existing = await db.readingSet.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Topilmadi." }, { status: 404 });
    }
    if (currentUserId && existing.creatorId !== currentUserId) {
      return NextResponse.json(
        { error: "Faqat Founder o'chira oladi." },
        { status: 403 }
      );
    }
    await db.readingSet.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/reading/[id] error:", error);
    return NextResponse.json(
      { error: "O'chirishda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
