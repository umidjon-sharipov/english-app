import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GameRoundQuestion } from "@/lib/games-ai";

const db = prisma as typeof prisma & { gameSet: any };

function escapePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (!words[0]) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const game = await db.gameSet.findUnique({ where: { id } });
    if (!game) {
      return NextResponse.json({ error: "O'yin topilmadi." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const bgType = searchParams.get("bg") || "stars";
    const blankLines = Math.min(
      3,
      Math.max(0, Number(searchParams.get("blanks") || "2"))
    );
    const headerNote = searchParams.get("header") || "";

    const rounds: GameRoundQuestion[] = Array.isArray(game.questionsJson)
      ? game.questionsJson
      : [];

    const pageWidth = 595;
    const pageHeight = 842;
    const marginX = 46;
    const topY = pageHeight - 48;
    const bottomY = 50;

    const pages: string[][] = [[]];
    let curPage = 0;
    let y = topY;

    const symbol =
      bgType === "stars"
        ? "*"
        : bgType === "books"
        ? "[G]"
        : bgType === "grid"
        ? "+"
        : bgType === "waves"
        ? "~"
        : "";

    const drawStamp = (arr: string[]) => {
      if (!symbol) return;
      const ops = ["q", "BT", "/F1 11 Tf", "0.88 0.88 0.88 rg"];
      for (let gx = 60; gx < pageWidth - 40; gx += 110) {
        for (let gy = 80; gy < pageHeight - 60; gy += 120) {
          ops.push(`1 0 0 1 ${gx} ${gy} Tm (${escapePdfText(symbol)}) Tj`);
        }
      }
      ops.push("ET", "Q");
      arr.push(...ops);
    };

    drawStamp(pages[0]);

    const newPage = () => {
      pages.push([]);
      curPage = pages.length - 1;
      y = topY;
      drawStamp(pages[curPage]);
    };

    const addLine = (
      text: string,
      size = 10,
      bold = false,
      gap = 14
    ) => {
      if (y - size < bottomY) newPage();
      const fk = bold ? "/F2" : "/F1";
      pages[curPage].push(
        `BT ${fk} ${size} Tf 0.1 0.1 0.1 rg 1 0 0 1 ${marginX} ${Math.round(
          y
        )} Tm (${escapePdfText(text)}) Tj ET`
      );
      y -= gap;
    };

    if (blankLines >= 1) {
      addLine("Name: _____________________________   Date: ______________", 9.5, false, 14);
    }
    if (blankLines >= 2) {
      addLine("Class: __________________________   Score: ______ / ______", 9.5, false, 14);
    }
    if (blankLines >= 3) {
      addLine("Notes: ____________________________________________________", 9.5, false, 16);
    }
    if (headerNote.trim()) {
      addLine(headerNote.trim(), 10, true, 14);
    }

    addLine(game.title, 15, true, 18);
    addLine(
      `Game Type: ${game.gameType} | Topic: ${game.topic} | Level: ${game.level}`,
      9.5,
      false,
      18
    );

    rounds.forEach((r, idx) => {
      for (const l of wrapLines(`Round ${idx + 1}: ${r.prompt}`, 86)) {
        addLine(l, 10, true, 13);
      }
      if (Array.isArray(r.chunks) && r.chunks.length > 0) {
        addLine(`Chunks: ${r.chunks.join(" / ")}`, 9.5, false, 13);
      }
      (r.options || []).forEach((opt, oIdx) => {
        const letter = String.fromCharCode(65 + oIdx);
        for (const ol of wrapLines(`   ${letter}) ${opt}`, 84)) {
          addLine(ol, 9.5, false, 12);
        }
      });
      y -= 6;
    });

    const objects: string[] = [];
    const pageObjIds: number[] = [];
    const contentObjIds: number[] = [];

    const catalogId = 1;
    const pagesId = 2;
    const f1Id = 3;
    const f2Id = 4;

    let nextId = 5;
    for (let i = 0; i < pages.length; i++) {
      contentObjIds.push(nextId++);
      pageObjIds.push(nextId++);
    }

    objects[catalogId] = `${catalogId} 0 obj << /Type /Catalog /Pages ${pagesId} 0 R >> endobj`;
    objects[pagesId] = `${pagesId} 0 obj << /Type /Pages /Kids [${pageObjIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] /Count ${pageObjIds.length} >> endobj`;
    objects[f1Id] = `${f1Id} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`;
    objects[f2Id] = `${f2Id} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj`;

    for (let i = 0; i < pages.length; i++) {
      const stream = pages[i].join("\n");
      const cId = contentObjIds[i];
      const pId = pageObjIds[i];
      objects[cId] = `${cId} 0 obj << /Length ${Buffer.byteLength(
        stream,
        "utf8"
      )} >> stream\n${stream}\nendstream endobj`;
      objects[pId] = `${pId} 0 obj << /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${f1Id} 0 R /F2 ${f2Id} 0 R >> >> /Contents ${cId} 0 R >> endobj`;
    }

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (let id = 1; id < nextId; id++) {
      offsets[id] = Buffer.byteLength(pdf, "utf8");
      pdf += objects[id] + "\n";
    }
    const xrefPos = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${nextId}\n`;
    pdf += "0000000000 65535 f \n";
    for (let id = 1; id < nextId; id++) {
      pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer << /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

    const buf = Buffer.from(pdf, "utf8");
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${(game.title || "game")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/games/[id]/pdf error:", error);
    return NextResponse.json({ error: "PDF yaratishda xato." }, { status: 500 });
  }
}
