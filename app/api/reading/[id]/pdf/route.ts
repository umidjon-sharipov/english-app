import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ReadingPassageItem, ReadingQuestionMode } from "@/lib/reading-ai";

const db = prisma as typeof prisma & { readingSet: any };

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
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildReadingPdf(params: {
  title: string;
  meta: string;
  headerNote: string;
  bgType: string;
  blankLines: number;
  questionType: ReadingQuestionMode;
  passages: ReadingPassageItem[];
}): Buffer {
  const { title, meta, headerNote, bgType, blankLines, questionType, passages } =
    params;
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 46;
  const topY = pageHeight - 48;
  const bottomY = 50;

  const pages: string[][] = [[]];
  let curPage = 0;
  let y = topY;

  const stampSymbol =
    bgType === "stars"
      ? "*"
      : bgType === "books"
      ? "[B]"
      : bgType === "grid"
      ? "+"
      : bgType === "waves"
      ? "~"
      : "";

  const drawBg = (pageArr: string[]) => {
    if (!stampSymbol) return;
    const ops: string[] = ["q", "BT", "/F1 11 Tf", "0.88 0.88 0.88 rg"];
    for (let gx = 60; gx < pageWidth - 40; gx += 110) {
      for (let gy = 80; gy < pageHeight - 60; gy += 120) {
        ops.push(`1 0 0 1 ${gx} ${gy} Tm (${escapePdfText(stampSymbol)}) Tj`);
      }
    }
    ops.push("ET", "Q");
    pageArr.push(...ops);
  };

  drawBg(pages[0]);

  const startNewPage = () => {
    pages.push([]);
    curPage = pages.length - 1;
    y = topY;
    drawBg(pages[curPage]);
  };

  const addLine = (text: string, fontSize = 10, bold = false, gapAfter = 14) => {
    if (y - fontSize < bottomY) {
      startNewPage();
    }
    const fontKey = bold ? "/F2" : "/F1";
    pages[curPage].push(
      `BT ${fontKey} ${fontSize} Tf 0.1 0.1 0.1 rg 1 0 0 1 ${marginX} ${Math.round(
        y
      )} Tm (${escapePdfText(text)}) Tj ET`
    );
    y -= gapAfter;
  };

  const answerLineCount = Math.max(1, blankLines);

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

  addLine(title, 15, true, 18);
  addLine(meta, 9.5, false, 18);

  passages.forEach((p, pIdx) => {
    addLine(`${pIdx + 1}. ${p.title || `Passage ${pIdx + 1}`}`, 12, true, 15);
    for (const line of wrapLines(p.text || "", 86)) {
      addLine(line, 10, false, 13);
    }
    y -= 6;

    (p.questions || []).forEach((q, qIdx) => {
      const qMode = q.type || questionType;
      for (const qLine of wrapLines(`Q${qIdx + 1}: ${q.question}`, 86)) {
        addLine(qLine, 10, true, 13);
      }

      if (qMode === "question") {
        for (let b = 0; b < answerLineCount; b++) {
          addLine(
            "________________________________________________________________________",
            9.5,
            false,
            14
          );
        }
      } else {
        (q.options || []).forEach((opt, oIdx) => {
          const letter = String.fromCharCode(65 + oIdx);
          for (const oLine of wrapLines(`   ${letter}) ${opt}`, 84)) {
            addLine(oLine, 9.5, false, 12);
          }
        });
      }
      y -= 5;
    });
    y -= 8;
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

  return Buffer.from(pdf, "utf8");
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const reading = await db.readingSet.findUnique({ where: { id } });
    if (!reading) {
      return NextResponse.json({ error: "Reading topilmadi." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const bgType = searchParams.get("bg") || "stars";
    const blankLines = Math.min(3, Math.max(0, Number(searchParams.get("blanks") || "2")));
    const headerNote = searchParams.get("header") || "";
    const questionType: ReadingQuestionMode =
      reading.questionType === "question" ? "question" : "test";

    const passages: ReadingPassageItem[] = Array.isArray(reading.passagesJson)
      ? reading.passagesJson
      : [];

    const pdfBuf = buildReadingPdf({
      title: reading.title,
      meta: `Topic: ${reading.topic} | Level: ${reading.level} | Type: ${questionType.toUpperCase()}`,
      headerNote,
      bgType,
      blankLines,
      questionType,
      passages,
    });

    return new NextResponse(new Uint8Array(pdfBuf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${(reading.title || "reading")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/reading/[id]/pdf error:", error);
    return NextResponse.json({ error: "PDF yaratishda xato." }, { status: 500 });
  }
}
