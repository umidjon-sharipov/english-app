
async function handleParticipantModeration(
  id: string,
  body: Record<string, unknown>
) {
  const action = typeof body.action === "string" ? body.action : "";
  const targetUserId =
    typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  const participantId =
    typeof body.participantId === "string" ? body.participantId.trim() : "";

  if (!action || (!targetUserId && !participantId)) return null;

  const dbAny = prisma as typeof prisma & {
    test: any;
    testParticipant: any;
  };

  const currentTest = await dbAny.test.findUnique({ where: { id } });
  if (!currentTest) return { error: "Test topilmadi.", status: 404 };

  let resolvedUserId = targetUserId;
  if (!resolvedUserId && participantId) {
    const pRow = await dbAny.testParticipant.findUnique({
      where: { id: participantId },
    });
    if (pRow) resolvedUserId = pRow.userId;
  }

  if (action === "kick") {
    if (participantId) {
      await dbAny.testParticipant.deleteMany({ where: { id: participantId } });
    } else if (resolvedUserId) {
      await dbAny.testParticipant.deleteMany({
        where: { testId: id, userId: resolvedUserId },
      });
    }
    return { ok: true, message: "Qatnashuvchi testdan chiqarildi." };
  }

  if (action === "block" && resolvedUserId) {
    await dbAny.testParticipant.deleteMany({
      where: { testId: id, userId: resolvedUserId },
    });
    const existingBlocked: string[] = Array.isArray(currentTest.blockedUserIds)
      ? currentTest.blockedUserIds
      : [];
    const nextBlocked = Array.from(new Set([...existingBlocked, resolvedUserId]));
    try {
      await dbAny.test.update({
        where: { id },
        data: { blockedUserIds: nextBlocked },
      });
    } catch {
      // Fallback if column not migrated yet
    }
    return { ok: true, message: "Foydalanuvchi testdan bloklandi." };
  }

  if (action === "unblock" && resolvedUserId) {
    const existingBlocked: string[] = Array.isArray(currentTest.blockedUserIds)
      ? currentTest.blockedUserIds
      : [];
    const nextBlocked = existingBlocked.filter((u) => u !== resolvedUserId);
    try {
      await dbAny.test.update({
        where: { id },
        data: { blockedUserIds: nextBlocked },
      });
    } catch {
      // Fallback if column not migrated yet
    }
    return { ok: true, message: "Block olib tashlandi." };
  }

  return null;
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUserId } from "@/app/api/tests/route";

const db = prisma as typeof prisma & {
  test: any;
  testParticipant: any;
  user: any;
};

const testInclude = {
  creator: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userName: true,
    },
  },
  participants: {
    orderBy: { joinedAt: "desc" as const },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userName: true,
        },
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
    const authUserId = await requireAuthUserId(req);

    const test = await db.test.findUnique({
      where: { id },
      include: testInclude,
    });

    if (!test) {
      return NextResponse.json({ error: "Test topilmadi." }, { status: 404 });
    }

    let autoJoined = false;
    if (authUserId) {
      const alreadyIn = (test.participants || []).some(
        (p: { userId: string }) => p.userId === authUserId
      );

      if (!alreadyIn) {
        if (
          test.maxParticipants !== null &&
          test.maxParticipants !== undefined &&
          (test.participants?.length ?? 0) >= test.maxParticipants
        ) {
          return NextResponse.json(
            {
              test,
              error: `Qatnashuvchilar limiti (${test.maxParticipants} ta) to'lgan.`,
            },
            { status: 403 }
          );
        }

        try {
          await db.testParticipant.create({
            data: {
              testId: id,
              userId: authUserId,
            },
          });
          autoJoined = true;
        } catch (err: unknown) {
          const code =
            typeof err === "object" && err !== null && "code" in err
              ? (err as { code?: string }).code
              : undefined;
          if (code === "P2003") {
            const firstUser = await db.user.findFirst({ select: { id: true } });
            if (firstUser?.id) {
              const existsFirst = (test.participants || []).some(
                (p: { userId: string }) => p.userId === firstUser.id
              );
              if (!existsFirst) {
                await db.testParticipant.create({
                  data: { testId: id, userId: firstUser.id },
                });
                autoJoined = true;
              }
            }
          }
        }
      }
    }

    const refreshed = autoJoined
      ? await db.test.findUnique({ where: { id }, include: testInclude })
      : test;

    return NextResponse.json({
      test: refreshed,
      currentUserId: authUserId,
      autoJoined,
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
    const rawBody = await req.json();
    const body = (
      rawBody && typeof rawBody === "object" ? rawBody : {}
    ) as Record<string, unknown>;

    const modRes = await handleParticipantModeration(id, body);
    if (modRes) {
      if ("error" in modRes) {
        return NextResponse.json(
          { error: modRes.error },
          { status: modRes.status || 400 }
        );
      }
      return NextResponse.json(modRes);
    }


    const data: Record<string, unknown> = {};

    if (body.status === "OPEN" || body.status === "CLOSED") {
      data.status = body.status;
    }

    if (body.maxParticipants !== undefined) {
      if (body.maxParticipants === null || body.maxParticipants === "") {
        data.maxParticipants = null;
      } else {
        const parsed = Number(body.maxParticipants);
        data.maxParticipants =
          Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
      }
    }

    if (body.startsAt !== undefined) {
      if (!body.startsAt) {
        data.startsAt = null;
      } else {
        const d = new Date(String(body.startsAt));
        data.startsAt = Number.isNaN(d.getTime()) ? null : d;
      }
    }

    if (body.endsAt !== undefined) {
      if (!body.endsAt) {
        data.endsAt = null;
      } else {
        const d = new Date(String(body.endsAt));
        data.endsAt = Number.isNaN(d.getTime()) ? null : d;
      }
    }

    if (
      typeof body.designTheme === "string" &&
      ["minimal", "card", "paper"].includes(body.designTheme)
    ) {
      data.designTheme = body.designTheme;
    }

    const updated = await db.test.update({
      where: { id },
      data,
      include: testInclude,
    });

    return NextResponse.json({ test: updated });
  } catch (error) {
    console.error("PATCH /api/tests/[id] error:", error);
    return NextResponse.json(
      { error: "Test sozlamalarini yangilashda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authUserId = await requireAuthUserId(req);
    if (!authUserId) {
      return NextResponse.json(
        { error: "JWTAuthGuard: Avval tizimga kiring (401 Unauthorized)." },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const test = await db.test.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!test) {
      return NextResponse.json({ error: "Test topilmadi." }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      score?: unknown;
      total?: unknown;
    };

    const isSubmittingScore =
      typeof body.score === "number" && Number.isFinite(body.score);

    const now = new Date();
    if (isSubmittingScore) {
      if (test.startsAt && now < new Date(test.startsAt)) {
        return NextResponse.json(
          { error: "Test hali boshlanmagan." },
          { status: 403 }
        );
      }
      if (test.endsAt && now > new Date(test.endsAt)) {
        return NextResponse.json(
          { error: "Test vaqti tugagan." },
          { status: 403 }
        );
      }
    }

    const existingParticipant = (test.participants || []).find(
      (p: { userId: string }) => p.userId === authUserId
    );

    if (
      !existingParticipant &&
      test.maxParticipants !== null &&
      test.maxParticipants !== undefined &&
      (test.participants?.length ?? 0) >= test.maxParticipants
    ) {
      return NextResponse.json(
        { error: `Qatnashuvchilar limiti (${test.maxParticipants} ta) to'lgan.` },
        { status: 403 }
      );
    }

    const score = isSubmittingScore
      ? Math.max(0, Math.round(Number(body.score)))
      : existingParticipant?.score ?? null;

    const total =
      typeof body.total === "number" && Number.isFinite(body.total)
        ? Math.max(1, Math.round(body.total))
        : existingParticipant?.total ?? test.questionCount;

    const participant = await db.testParticipant.upsert({
      where: {
        testId_userId: { testId: id, userId: authUserId },
      },
      update: {
        ...(isSubmittingScore
          ? { score, total, completedAt: new Date() }
          : {}),
      },
      create: {
        testId: id,
        userId: authUserId,
        ...(isSubmittingScore
          ? { score, total, completedAt: new Date() }
          : {}),
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, userName: true },
        },
      },
    });

    return NextResponse.json({ participant });
  } catch (error) {
    console.error("POST /api/tests/[id] error:", error);
    return NextResponse.json(
      { error: "Testda qatnashishda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authUserId = await requireAuthUserId(req);
    if (!authUserId) {
      return NextResponse.json(
        { error: "JWTAuthGuard: Avval tizimga kiring (401 Unauthorized)." },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const existing = await db.test.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Test topilmadi." }, { status: 404 });
    }

    if (existing.creatorId !== authUserId) {
      return NextResponse.json(
        { error: "Faqat test yaratuvchisi (founder) testni o'chira oladi." },
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
