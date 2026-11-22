import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUserId } from "@/app/api/tests/route";

const db = prisma as typeof prisma & {
  gameSet: any;
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

    if (currentUserId && blockedIds.includes(currentUserId) && !isFounder) {
      return NextResponse.json(
        { error: "Siz ushbu o'yindan bloklangansiz." },
        { status: 403 }
      );
    }

    let autoJoined = false;
    let active = existing;

    if (
      currentUserId &&
      existing.status === "OPEN" &&
      !blockedIds.includes(currentUserId)
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
          // Ignore duplicate
        }
      }
    }

    const sanitized = isFounder
      ? active
      : {
          ...active,
          blockedUserIds: [],
          participants: [],
        };

    return NextResponse.json({
      game: sanitized,
      autoJoined,
      isFounder,
      currentUserId,
    });
  } catch (error) {
    console.error("GET /api/games/[id] error:", error);
    return NextResponse.json(
      { error: "O'yinni yuklashda xatolik." },
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

    const existing = await db.gameSet.findUnique({ where: { id } });
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

    if (action === "kick") {
      if (participantId) {
        await db.gameParticipant.deleteMany({ where: { id: participantId } });
      } else if (resolvedUserId) {
        await db.gameParticipant.deleteMany({
          where: { gameId: id, userId: resolvedUserId },
        });
      }
      const updated = await db.gameSet.findUnique({
        where: { id },
        include: gameInclude,
      });
      return NextResponse.json({
        game: updated,
        message: "Qatnashuvchi o'yindan chiqarildi.",
      });
    }

    if (action === "block" && resolvedUserId) {
      await db.gameParticipant.deleteMany({
        where: { gameId: id, userId: resolvedUserId },
      });
      const prevBlocked: string[] = Array.isArray(existing.blockedUserIds)
        ? existing.blockedUserIds
        : [];
      const nextBlocked = Array.from(new Set([...prevBlocked, resolvedUserId]));
      const updated = await db.gameSet.update({
        where: { id },
        data: { blockedUserIds: nextBlocked },
        include: gameInclude,
      });
      return NextResponse.json({
        game: updated,
        message: "Foydalanuvchi bloklandi.",
      });
    }

    if (action === "unblock" && resolvedUserId) {
      const prevBlocked: string[] = Array.isArray(existing.blockedUserIds)
        ? existing.blockedUserIds
        : [];
      const nextBlocked = prevBlocked.filter((u) => u !== resolvedUserId);
      const updated = await db.gameSet.update({
        where: { id },
        data: { blockedUserIds: nextBlocked },
        include: gameInclude,
      });
      return NextResponse.json({
        game: updated,
        message: "Block olib tashlandi.",
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

    return NextResponse.json({ game: updated });
  } catch (error) {
    console.error("PATCH /api/games/[id] error:", error);
    return NextResponse.json(
      { error: "O'yinni yangilashda xatolik." },
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
      return NextResponse.json(
        { error: "Siz ushbu o'yindan bloklangansiz." },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      score?: unknown;
      total?: unknown;
      streak?: unknown;
    };
    const score =
      typeof body.score === "number" ? Math.max(0, Math.round(body.score)) : 0;
    const total =
      typeof body.total === "number" && body.total > 0
        ? Math.round(body.total)
        : existing.questionCount;
    const streak =
      typeof body.streak === "number" ? Math.max(0, Math.round(body.streak)) : 0;

    const existingPart = await db.gameParticipant.findFirst({
      where: { gameId: id, userId },
    });

    if (existingPart) {
      await db.gameParticipant.update({
        where: { id: existingPart.id },
        data: { score, total, streak, completedAt: new Date() },
      });
    } else {
      await db.gameParticipant.create({
        data: { gameId: id, userId, score, total, streak, completedAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true, score, total, streak });
  } catch (error) {
    console.error("POST /api/games/[id] error:", error);
    return NextResponse.json(
      { error: "Natijani saqlashda xatolik." },
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
    const existing = await db.gameSet.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "O'yin topilmadi." }, { status: 404 });
    }
    if (currentUserId && existing.creatorId !== currentUserId) {
      return NextResponse.json(
        { error: "Faqat Founder o'chira oladi." },
        { status: 403 }
      );
    }
    await db.gameSet.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/games/[id] error:", error);
    return NextResponse.json(
      { error: "O'yinni o'chirishda xatolik." },
      { status: 500 }
    );
  }
}
