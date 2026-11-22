import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "english_app_token";
const JWT_SECRET = process.env.JWT_SECRET || "english-studio-secret-key-2026";

function getSecretKey() {
  return typeof JWT_SECRET === "string"
    ? new TextEncoder().encode(JWT_SECRET)
    : JWT_SECRET;
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const tokenFromBody = typeof body?.token === "string" ? body.token.trim() : "";
    const targetUserIdFromBody =
      typeof body?.userId === "string" ? body.userId.trim() : "";

    const cookieStore = await cookies();
    const activeCookieToken = cookieStore.get(COOKIE_NAME)?.value || "";

    let verifiedUserId = "";
    const candidateToken = tokenFromBody || activeCookieToken;

    if (candidateToken) {
      try {
        const { payload } = await jwtVerify(candidateToken, getSecretKey());
        verifiedUserId = String(payload.userId || payload.id || payload.sub || "");
      } catch {
        // ignore invalid candidate token if targetUserId provided
      }
    }

    const userIdToDelete = verifiedUserId || targetUserIdFromBody;
    if (!userIdToDelete) {
      return NextResponse.json(
        { error: "Account identity could not be verified" },
        { status: 400 }
      );
    }

    // Delete avatar file if present
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "avatars");
    const files = await fs.readdir(uploadsDir).catch(() => []);
    for (const f of files) {
      if (f.startsWith(`${userIdToDelete}-`)) {
        await fs.unlink(path.join(uploadsDir, f)).catch(() => {});
      }
    }

    await prisma.user.delete({
      where: { id: userIdToDelete },
    }).catch(() => null);

    let activeUserId = "";
    if (activeCookieToken) {
      try {
        const { payload } = await jwtVerify(activeCookieToken, getSecretKey());
        activeUserId = String(payload.userId || payload.id || payload.sub || "");
      } catch {
        activeUserId = "";
      }
    }

    const wasActiveSession = !activeUserId || activeUserId === userIdToDelete;
    const res = NextResponse.json({
      deleted: true,
      userId: userIdToDelete,
      wasActiveSession,
    });

    if (wasActiveSession) {
      res.cookies.set(COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }

    return res;
  } catch {
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
