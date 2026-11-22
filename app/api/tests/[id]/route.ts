import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUserId } from "@/app/api/tests/route";

const db = prisma as typeof prisma & {
  test: any;
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

    if (currentUserId && blockedIds.includes(currentUserId) && !isFounder) {
      return NextResponse.json(
        { error: "Siz ushbu testdan bloklangansiz (Blocked)." },
        { status: 403 }
      );
    }

    let autoJoined = false;
    let activeTest = existing;

    if (
      currentUserId &&
      existing.status === "OPEN" &&
      !blockedIds.includes(currentUserId)
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

    // Only founder receives full participants list & blockedUserIds
    const sanitizedTest = isFounder
      ? activeTest
      : {
          ...activeTest,
          blockedUserIds: [],
          participants: [],
        };

    return NextResponse.json({
      test: sanitizedTest,
      autoJoined,
      isFounder,
      currentUserId,
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

    const existing = await db.test.findUnique({ where: { id } });
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

    if (action === "kick") {
      if (participantId) {
        await db.testParticipant.deleteMany({ where: { id: participantId } });
      } else if (resolvedUserId) {
        await db.testParticipant.deleteMany({
          where: { testId: id, userId: resolvedUserId },
        });
      }
      const updated = await db.test.findUnique({ where: { id }, include: testInclude });
      return NextResponse.json({
        test: updated,
        message: "Qatnashuvchi testdan chiqarildi.",
      });
    }

    if (action === "block" && resolvedUserId) {
      await db.testParticipant.deleteMany({
        where: { testId: id, userId: resolvedUserId },
      });
      const prevBlocked: string[] = Array.isArray(existing.blockedUserIds)
        ? existing.blockedUserIds
        : [];
      const nextBlocked = Array.from(new Set([...prevBlocked, resolvedUserId]));
      const updated = await db.test.update({
        where: { id },
        data: { blockedUserIds: nextBlocked },
        include: testInclude,
      });
      return NextResponse.json({
        test: updated,
        message: "Foydalanuvchi bloklandi va testdan chiqarildi.",
      });
    }

    if (action === "unblock" && resolvedUserId) {
      const prevBlocked: string[] = Array.isArray(existing.blockedUserIds)
        ? existing.blockedUserIds
        : [];
      const nextBlocked = prevBlocked.filter((u) => u !== resolvedUserId);
      const updated = await db.test.update({
        where: { id },
        data: { blockedUserIds: nextBlocked },
        include: testInclude,
      });
      return NextResponse.json({
        test: updated,
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

    const updated = await db.test.update({
      where: { id },
      data: updateData,
      include: testInclude,
    });

    return NextResponse.json({ test: updated });
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
