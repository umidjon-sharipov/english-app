import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const db = prisma as typeof prisma & { test: any };

interface PdfQuestion {
  id?: number;
  question: string;
  options: string[];
}

function pdfSafeText(input: string): string {
  const ascii = input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E]/g, " ");
  return ascii
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapLine(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildPdfBinary(params: {
  title: string;
  subtitle: string;
  headerLines: string[];
  bgIconStyle: string;
  questions: PdfQuestion[];
}): Buffer {
  const { title, subtitle, headerLines, bgIconStyle, questions } = params;
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 48;
  const topY = 790;
  const bottomY = 56;

  const pages: string[][] = [];
  let ops: string[] = [];

  const drawBackgroundPattern = (targetOps: string[]) => {
    if (!bgIconStyle || bgIconStyle === "none") return;
    targetOps.push("q");
    targetOps.push("0.88 0.90 0.93 RG");
    targetOps.push("0.7 w");

    if (bgIconStyle === "grid") {
      for (let x = 40; x < pageWidth - 30; x += 44) {
        targetOps.push(`${x} 40 m ${x} ${pageHeight - 40} l S`);
      }
      for (let y = 40; y < pageHeight - 30; y += 44) {
        targetOps.push(`40 ${y} m ${pageWidth - 40} ${y} l S`);
      }
    } else if (bgIconStyle === "stars") {
      for (let y = 90; y < pageHeight - 60; y += 95) {
        for (let x = 75; x < pageWidth - 60; x += 110) {
          targetOps.push(`${x - 6} ${y} m ${x + 6} ${y} l S`);
          targetOps.push(`${x} ${y - 6} m ${x} ${y + 6} l S`);
          targetOps.push(`${x - 4} ${y - 4} m ${x + 4} ${y + 4} l S`);
          targetOps.push(`${x - 4} ${y + 4} m ${x + 4} ${y - 4} l S`);
        }
      }
    } else if (bgIconStyle === "books") {
      for (let y = 100; y < pageHeight - 70; y += 110) {
        for (let x = 80; x < pageWidth - 70; x += 120) {
          targetOps.push(`${x - 10} ${y - 7} 20 14 re S`);
          targetOps.push(`${x} ${y - 7} m ${x} ${y + 7} l S`);
        }
      }
    } else if (bgIconStyle === "waves") {
      for (let y = 85; y < pageHeight - 50; y += 85) {
        targetOps.push(`40 ${y} m 190 ${y + 8} 340 ${y - 8} 555 ${y} c S`);
      }
    }

    targetOps.push("Q");
  };

  let cursorY = topY;

  const startNewPage = () => {
    ops = [];
    drawBackgroundPattern(ops);
    cursorY = topY;
  };

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < bottomY) {
      pages.push(ops);
      startNewPage();
    }
  };

  startNewPage();

  ops.push("BT");
  ops.push("/F2 18 Tf");
  ops.push(`1 0 0 1 ${marginX} ${cursorY} Tm`);
  ops.push(`(${pdfSafeText(title)}) Tj`);
  ops.push("ET");
  cursorY -= 22;

  ops.push("BT");
  ops.push("/F1 10 Tf");
  ops.push(`1 0 0 1 ${marginX} ${cursorY} Tm`);
  ops.push(`(${pdfSafeText(subtitle)}) Tj`);
  ops.push("ET");
  cursorY -= 22;

  for (const hLine of headerLines) {
    ensureSpace(20);
    ops.push("BT");
    ops.push("/F1 10 Tf");
    ops.push(`1 0 0 1 ${marginX} ${cursorY} Tm`);
    ops.push(`(${pdfSafeText(hLine)}) Tj`);
    ops.push("ET");
    cursorY -= 18;
  }

  cursorY -= 8;
  ops.push(`${marginX} ${cursorY} m ${pageWidth - marginX} ${cursorY} l S`);
  cursorY -= 22;

  questions.forEach((q, idx) => {
    const qLines = wrapLine(`${idx + 1}. ${q.question}`, 84);
    ensureSpace(qLines.length * 14 + (q.options?.length || 4) * 14 + 14);

    for (const ql of qLines) {
      ops.push("BT");
      ops.push("/F2 11 Tf");
      ops.push(`1 0 0 1 ${marginX} ${cursorY} Tm`);
      ops.push(`(${pdfSafeText(ql)}) Tj`);
      ops.push("ET");
      cursorY -= 14;
    }

    const opts = Array.isArray(q.options) ? q.options : [];
    opts.forEach((opt, oIdx) => {
      const letter = String.fromCharCode(65 + oIdx);
      const optLines = wrapLine(`   ${letter}) ${opt}`, 88);
      for (const ol of optLines) {
        ops.push("BT");
        ops.push("/F1 10 Tf");
        ops.push(`1 0 0 1 ${marginX + 8} ${cursorY} Tm`);
        ops.push(`(${pdfSafeText(ol)}) Tj`);
        ops.push("ET");
        cursorY -= 13;
      }
    });

    cursorY -= 10;
  });

  pages.push(ops);

  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  const pageObjStart = 5;
  const kidsRefs: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const pageObjNum = pageObjStart + i * 2;
    kidsRefs.push(`${pageObjNum} 0 R`);
  }

  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${kidsRefs.join(" ")}] /Count ${pages.length} >>\nendobj\n`
  );
  objects.push(
    "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
  );
  objects.push(
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n"
  );

  for (let i = 0; i < pages.length; i++) {
    const pageObjNum = pageObjStart + i * 2;
    const contentObjNum = pageObjNum + 1;
    const streamData = pages[i].join("\n") + "\n";
    const byteLen = Buffer.byteLength(streamData, "latin1");

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${byteLen} >>\nstream\n${streamData}endstream\nendobj\n`
    );
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += obj;
  }

  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const bgIconStyle = searchParams.get("bg") || "none";
    const blankLinesCount = Math.min(
      5,
      Math.max(0, Number(searchParams.get("blanks") || "2") || 0)
    );
    const customHeader = (searchParams.get("header") || "").trim();

    const test = await db.test.findUnique({ where: { id } });
    if (!test) {
      return NextResponse.json({ error: "Test topilmadi." }, { status: 404 });
    }

    const questions: PdfQuestion[] = Array.isArray(test.questionsJson)
      ? test.questionsJson
      : [];

    const headerLines: string[] = [];
    if (customHeader) {
      headerLines.push(customHeader);
    }
    for (let i = 0; i < blankLinesCount; i++) {
      if (i === 0) {
        headerLines.push(
          "Student Name: ______________________________     Date: _______________"
        );
      } else if (i === 1) {
        headerLines.push(
          "Class / Group: ___________________________     Score: ______ / ______"
        );
      } else {
        headerLines.push(
          "Notes: _________________________________________________________________"
        );
      }
    }

    const pdfBuffer = buildPdfBinary({
      title: test.title || "English Test",
      subtitle: `Topic: ${test.topic} | Level: ${test.level} | Questions: ${questions.length} | ID: ${test.id}`,
      headerLines,
      bgIconStyle,
      questions,
    });

    const safeFileName = `${(test.title || "english-test")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "test"}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/tests/[id]/pdf error:", error);
    return NextResponse.json(
      { error: "PDF yaratishda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
