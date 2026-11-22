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

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("avatar");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Please choose an image file" },
        { status: 400 }
      );
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PNG, JPG, WEBP, or GIF images are allowed" },
        { status: 400 }
      );
    }

    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: "Image size must be under 2MB" },
        { status: 400 }
      );
    }

    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[file.type] || "png";

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "avatars");
    await fs.mkdir(uploadsDir, { recursive: true });

    // Remove previous avatar files for this user
    const existingFiles = await fs.readdir(uploadsDir).catch(() => []);
    for (const f of existingFiles) {
      if (f.startsWith(`${userId}-`)) {
        await fs.unlink(path.join(uploadsDir, f)).catch(() => {});
      }
    }

    const fileName = `${userId}-${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const avatarUrl = `/uploads/avatars/${fileName}`;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userName: true,
        email: true,
        avatarUrl: true,
      },
    });

    return NextResponse.json({ avatarUrl, user: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to upload avatar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "avatars");
    const existingFiles = await fs.readdir(uploadsDir).catch(() => []);
    for (const f of existingFiles) {
      if (f.startsWith(`${userId}-`)) {
        await fs.unlink(path.join(uploadsDir, f)).catch(() => {});
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userName: true,
        email: true,
        avatarUrl: true,
      },
    });

    return NextResponse.json({ avatarUrl: null, user: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove avatar" },
      { status: 500 }
    );
  }
}
