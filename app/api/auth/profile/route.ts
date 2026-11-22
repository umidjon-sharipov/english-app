import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "english_app_token";
const JWT_SECRET = process.env.JWT_SECRET || "english-studio-secret-key-2026";

function getSecretKey() {
  return typeof JWT_SECRET === "string"
    ? new TextEncoder().encode(JWT_SECRET)
    : JWT_SECRET;
}

async function getCurrentUserId() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return String(payload.userId || payload.id || payload.sub || "") || null;
  } catch {
    return null;
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
    const userName = typeof body?.userName === "string" ? body.userName.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    if (!firstName) {
      return NextResponse.json(
        { error: "First name is required", field: "firstName" },
        { status: 400 }
      );
    }

    if (!userName || userName.length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters", field: "userName" },
        { status: 400 }
      );
    }

    if (/\\s/.test(userName)) {
      return NextResponse.json(
        { error: "Username cannot contain spaces", field: "userName" },
        { status: 400 }
      );
    }

    const existingUsername = await prisma.user.findFirst({
      where: {
        userName,
        NOT: { id: userId },
      },
      select: { id: true },
    });

    if (existingUsername) {
      return NextResponse.json(
        { error: "This username is already taken", field: "userName" },
        { status: 409 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName: lastName || null,
        userName,
        email: email || null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userName: true,
        email: true,
        avatarUrl: true,
      },
    });

    const token = await new SignJWT({
      userId: updated.id,
      userName: updated.userName,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(getSecretKey());

    const res = NextResponse.json({ user: updated, token });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
