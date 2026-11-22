import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUserId } from "@/app/api/tests/route";

const db = prisma as typeof prisma & {
  readingSet: any;
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
      return NextResponse.json({ error: "Reading topilmadi." }, { status: 404 });
    }

    const isFounder = Boolean(currentUserId && currentUserId === existing.creatorId);
    const blockedIds: string[] = Array.isArray(existing.blockedUserIds)
      ? existing.blockedUserIds
      : [];

    if (currentUserId && blockedIds.includes(currentUserId) && !isFounder) {
      return NextResponse.json(
        { error: "Siz ushbu Reading'dan bloklangansiz." },
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
      reading: sanitized,
      autoJoined,
      isFounder,
      currentUserId,
    });
  } catch (error) {
    console.error("GET /api/reading/[id] error:", error);
    return NextResponse.json(
      { error: "Reading'ni yuklashda xatolik." },
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

    const existing = await db.readingSet.findUnique({ where: { id } });
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

    if (action === "kick") {
      if (participantId) {
        await db.readingParticipant.deleteMany({ where: { id: participantId } });
      } else if (resolvedUserId) {
        await db.readingParticipant.deleteMany({
          where: { readingId: id, userId: resolvedUserId },
        });
      }
      const updated = await db.readingSet.findUnique({
        where: { id },
        include: readingInclude,
      });
      return NextResponse.json({
        reading: updated,
        message: "Qatnashuvchi Reading'dan chiqarildi.",
      });
    }

    if (action === "block" && resolvedUserId) {
      await db.readingParticipant.deleteMany({
        where: { readingId: id, userId: resolvedUserId },
      });
      const prevBlocked: string[] = Array.isArray(existing.blockedUserIds)
        ? existing.blockedUserIds
        : [];
      const nextBlocked = Array.from(new Set([...prevBlocked, resolvedUserId]));
      const updated = await db.readingSet.update({
        where: { id },
        data: { blockedUserIds: nextBlocked },
        include: readingInclude,
      });
      return NextResponse.json({
        reading: updated,
        message: "Foydalanuvchi bloklandi.",
      });
    }

    if (action === "unblock" && resolvedUserId) {
      const prevBlocked: string[] = Array.isArray(existing.blockedUserIds)
        ? existing.blockedUserIds
        : [];
      const nextBlocked = prevBlocked.filter((u) => u !== resolvedUserId);
      const updated = await db.readingSet.update({
        where: { id },
        data: { blockedUserIds: nextBlocked },
        include: readingInclude,
      });
      return NextResponse.json({
        reading: updated,
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

    const updated = await db.readingSet.update({
      where: { id },
      data: updateData,
      include: readingInclude,
    });

    return NextResponse.json({ reading: updated });
  } catch (error) {
    console.error("PATCH /api/reading/[id] error:", error);
    return NextResponse.json(
      { error: "Reading'ni yangilashda xatolik." },
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
      return NextResponse.json({ error: "Reading topilmadi." }, { status: 404 });
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
      { error: "Reading'ni o'chirishda xatolik." },
      { status: 500 }
    );
  }
}
