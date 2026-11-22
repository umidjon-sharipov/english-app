import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { COOKIE_NAME, signToken } from "@/lib/auth";

export async function POST(req: Request) {
    try {
        const { firstName, lastName, userName, password, email } = await req.json();

        if (!firstName || !userName || !password) {
            return NextResponse.json(
                { error: "Ism, username va parol kiritilishi shart" },
                { status: 400 }
            );
        }

        const existing = await prisma.user.findUnique({
            where: { userName: userName.trim() },
        });

        if (existing) {
            return NextResponse.json(
                { error: "Bu username allaqachon band" },
                { status: 409 }
            );
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                firstName: firstName.trim(),
                lastName: lastName?.trim() || null,
                userName: userName.trim(),
                passwordHash,
                email: email?.trim() || null,
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                userName: true,
                email: true,
            },
        });

        const token = await signToken({ userId: user.id, userName: user.userName });
        const res = NextResponse.json({ user }, { status: 201 });

        res.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7,
        });

        return res;
    } catch (err) {
        console.error("Register error:", err);
        return NextResponse.json({ error: "Server xatosi" }, { status: 500 });
    }
}
