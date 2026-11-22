import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "english_app_token";
const JWT_SECRET = process.env.JWT_SECRET || "english-studio-secret-key-2026";

function getSecretKey() {
  return new TextEncoder().encode(JWT_SECRET);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawIdentifier =
      typeof body?.userName === "string"
        ? body.userName.trim()
        : typeof body?.username === "string"
          ? body.username.trim()
          : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const rememberDevice = Boolean(body?.rememberDevice);

    if (!rawIdentifier || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { userName: rawIdentifier },
          { email: rawIdentifier },
        ],
      },
    });

    const hash = user?.passwordHash ?? (user as Record<string, unknown> | null)?.password;
    if (!user || typeof hash !== "string" || !hash) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, hash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const maxAge = rememberDevice ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7;
    const token = await new SignJWT({
      userId: user.id,
      userName: user.userName,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(rememberDevice ? "30d" : "7d")
      .sign(getSecretKey());

    const safeUser = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      userName: user.userName,
      email: user.email,
    };

    const res = NextResponse.json({ user: safeUser, token });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });

    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authentication server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
