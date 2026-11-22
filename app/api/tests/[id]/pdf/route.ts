import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const db = prisma as typeof prisma & { test: any };

function escapePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, " ")
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
    if (!current) {
      current = w;
    } else if ((current + " " + w).length <= maxChars) {
      current += " " + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildAcademicPdfBytes(params: {
  title: string;
  subtitle: string;
  customHeader: string;
  blankLines: number;
  bgStyle: string;
  questions: Array<{
    question?: string;
    options?: string[];
  }>;
}): Uint8Array {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 46;
  const topY = 796;
  const bottomY = 56;

  const pages: string[][] = [];
  let curOps: string[] = [];
  let y = topY;

  function drawBackground(ops: string[]) {
    // Clean subtle border frame
    ops.push("0.78 0.80 0.84 RG");
    ops.push("0.8 w");
    ops.push(`${marginX - 10} 36 ${pageWidth - (marginX - 10) * 2} ${pageHeight - 72} re S`);

    if (params.bgStyle === "grid") {
      ops.push("0.92 0.93 0.95 RG");
      ops.push("0.4 w");
      for (let gx = marginX; gx <= pageWidth - marginX; gx += 32) {
        ops.push(`${gx} 44 m ${gx} ${pageHeight - 44} l S`);
      }
      for (let gy = 48; gy <= pageHeight - 48; gy += 32) {
        ops.push(`${marginX} ${gy} m ${pageWidth - marginX} ${gy} l S`);
      }
    } else if (params.bgStyle === "lines") {
      ops.push("0.91 0.92 0.95 RG");
      ops.push("0.45 w");
      for (let ly = 80; ly <= pageHeight - 120; ly += 24) {
        ops.push(`${marginX} ${ly} m ${pageWidth - marginX} ${ly} l S`);
      }
    } else if (params.bgStyle === "watermark") {
      ops.push("BT /F1 38 Tf 0.93 0.94 0.96 rg");
      ops.push(`160 390 Td (${escapePdfText("ASSESSMENT SHEET")}) Tj ET`);
    }
  }

  function startNewPage(isFirst: boolean) {
    if (curOps.length > 0) {
      pages.push(curOps);
    }
    curOps = [];
    drawBackground(curOps);
    y = topY;

    if (isFirst) {
      if (params.customHeader) {
        curOps.push("BT /F2 9 Tf 0.35 0.38 0.45 rg");
        curOps.push(`${marginX} ${y} Td (${escapePdfText(params.customHeader)}) Tj ET`);
        y -= 16;
      }

      curOps.push("BT /F2 17 Tf 0.08 0.09 0.12 rg");
      curOps.push(`${marginX} ${y} Td (${escapePdfText(params.title)}) Tj ET`);
      y -= 18;

      curOps.push("BT /F1 10 Tf 0.32 0.35 0.42 rg");
      curOps.push(`${marginX} ${y} Td (${escapePdfText(params.subtitle)}) Tj ET`);
      y -= 18;

      curOps.push(
        "BT /F1 10 Tf 0.12 0.14 0.18 rg " +
          `${marginX} ${y} Td (${escapePdfText(
            "Student: ________________________   Date: ______________   Score: _____ / _____"
          )}) Tj ET`
      );
      y -= 16;

      for (let b = 0; b < params.blankLines; b++) {
        curOps.push(
          `BT /F1 10 Tf 0.35 0.38 0.44 rg ${marginX} ${y} Td (${escapePdfText(
            "________________________________________________________________________"
          )}) Tj ET`
        );
        y -= 16;
      }

      curOps.push("0.25 0.28 0.34 RG 1 w");
      curOps.push(`${marginX} ${y} m ${pageWidth - marginX} ${y} l S`);
      y -= 20;
    }
  }

  startNewPage(true);

  params.questions.forEach((q, idx) => {
    const qLines = wrapLine(`${idx + 1}. ${q.question || ""}`, 84);
    const optLines: string[] = [];
    (q.options || []).forEach((opt, oIdx) => {
      const letter = String.fromCharCode(65 + oIdx);
      for (const wl of wrapLine(`   ${letter}) ${opt}`, 82)) {
        optLines.push(wl);
      }
    });

    const neededHeight = (qLines.length + optLines.length) * 14 + 14;
    if (y - neededHeight < bottomY) {
      startNewPage(false);
    }

    for (const ql of qLines) {
      curOps.push("BT /F2 10.5 Tf 0.09 0.10 0.13 rg");
      curOps.push(`${marginX} ${y} Td (${escapePdfText(ql)}) Tj ET`);
      y -= 14;
    }

    for (const ol of optLines) {
      curOps.push("BT /F1 10 Tf 0.20 0.22 0.27 rg");
      curOps.push(`${marginX} ${y} Td (${escapePdfText(ol)}) Tj ET`);
      y -= 13.5;
    }

    y -= 10;
  });

  if (curOps.length > 0) {
    pages.push(curOps);
  }

  // Assemble valid PDF 1.4 binary
  const objects: string[] = [];
  const catalogId = 1;
  const pagesId = 2;
  const fontRegularId = 3;
  const fontBoldId = 4;

  const pageObjIds: number[] = [];
  const contentObjIds: number[] = [];
  let nextId = 5;

  for (let i = 0; i < pages.length; i++) {
    pageObjIds.push(nextId++);
    contentObjIds.push(nextId++);
  }

  objects[catalogId] = `${catalogId} 0 obj
<< /Type /Catalog /Pages ${pagesId} 0 R >>
endobj
`;
  objects[pagesId] = `${pagesId} 0 obj
<< /Type /Pages /Kids [${pageObjIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${pageObjIds.length} >>
endobj
`;
  objects[fontRegularId] = `${fontRegularId} 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
`;
  objects[fontBoldId] = `${fontBoldId} 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
`;

  pages.forEach((ops, idx) => {
    const streamStr = ops.join("\n");
    const contentId = contentObjIds[idx];
    const pageId = pageObjIds[idx];

    objects[contentId] =
      `${contentId} 0 obj
<< /Length ${Buffer.byteLength(streamStr, "utf8")} >>
stream
` +
      `${streamStr}
endstream
endobj
`;

    objects[pageId] =
      `${pageId} 0 obj
<< /Type /Page /Parent ${pagesId} 0 R ` +
      `/MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> ` +
      `/Contents ${contentId} 0 R >>
endobj
`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, "utf8");
    pdf += objects[i];
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const test = await db.test.findUnique({ where: { id } });
    if (!test) {
      return NextResponse.json({ error: "Test topilmadi." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const bgStyle = searchParams.get("bg") || "none";
    const blankLines = Math.min(4, Math.max(0, Number(searchParams.get("blanks") || 0)));
    const customHeader = (searchParams.get("header") || "").trim();

    const questions = Array.isArray(test.questionsJson) ? test.questionsJson : [];
    const bytes = buildAcademicPdfBytes({
      title: String(test.title || "English Test"),
      subtitle: `Topic: ${test.topic} | Level: ${test.level} | Questions: ${questions.length} | ID: ${test.id}`,
      customHeader,
      blankLines,
      bgStyle,
      questions,
    });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${String(test.title || "test")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/tests/[id]/pdf error:", error);
    return NextResponse.json({ error: "PDF yaratishda xato." }, { status: 500 });
  }
}
