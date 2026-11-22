export type ReadingQuestionMode = "test" | "question";

export interface ReadingQuestion {
  id: number;
  type?: ReadingQuestionMode;
  question: string;
  options: string[];
  correctIndex: number;
  modelAnswer?: string;
  explanation: string;
}

export interface ReadingPassageItem {
  id: number;
  title: string;
  text: string;
  questions: ReadingQuestion[];
}

export interface GradedQuestionResult {
  passageIndex: number;
  questionIndex: number;
  selectedIndex: number | null;
  textAnswer?: string;
  isCorrect: boolean;
  aiFeedback: string;
}

const PREFERRED_READING_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemma-4-31b-it",
];

function fallbackPassages(params: {
  topic: string;
  level: string;
  length: string;
  passageCount: number;
  questionsPerPassage: number;
  questionType: ReadingQuestionMode;
  customPrompt?: string;
}): ReadingPassageItem[] {
  const {
    topic,
    level,
    length,
    passageCount,
    questionsPerPassage,
    questionType,
    customPrompt,
  } = params;

  const focus = customPrompt?.trim() ? ` Focus: ${customPrompt.trim()}.` : "";
  const countParas = length === "short" ? 1 : length === "long" ? 3 : 2;

  const paras = [
    `Strong readers approach ${topic} at the ${level} level by analyzing primary arguments, supporting evidence, and contextual subtleties rather than relying on guesswork.${focus}`,
    `Examining how ideas logically transition across paragraphs illuminates cause-and-effect relationships and critical implications within the text.`,
    `Consistent practice with varied academic registers fosters greater fluency, sharpens critical thinking, and ensures high accuracy on comprehension benchmarks.`,
  ];

  const bodyText = paras.slice(0, countParas).join(" ");

  return Array.from({ length: passageCount }, (_, pIdx) => {
    const questions: ReadingQuestion[] = Array.from(
      { length: questionsPerPassage },
      (__, qIdx) => {
        if (questionType === "question") {
          return {
            id: qIdx + 1,
            type: "question",
            question: `Passage ${pIdx + 1}, Q${qIdx + 1}: Explain how the author structures the discussion regarding ${topic} (${level}).`,
            options: [],
            correctIndex: 0,
            modelAnswer:
              "The author presents the core premise directly, supporting it with logical transitions and evidence.",
            explanation:
              "A comprehensive answer highlights the core thesis and references textual supporting details.",
          };
        }

        return {
          id: qIdx + 1,
          type: "test",
          question: `Passage ${pIdx + 1}, Q${qIdx + 1}: Which assertion best represents the core thesis regarding ${topic} (${level})?`,
          options: [
            "Analytical reading of key claims and textual evidence substantially improves comprehension",
            "Reading rapidly without reviewing transitional context guarantees maximum retention",
            "Individual sentences should always be interpreted in complete isolation",
            "Comprehension depends exclusively on memorizing arbitrary vocabulary lists",
          ],
          correctIndex: 0,
          explanation:
            "The passage emphasizes that active analysis of claims and context provides accurate comprehension.",
        };
      }
    );

    return {
      id: pIdx + 1,
      title: `Reading Passage ${pIdx + 1}: ${topic} (${level})`,
      text: passageCount > 1 ? `[Passage ${pIdx + 1}/${passageCount}] ${bodyText}` : bodyText,
      questions,
    };
  });
}

function cleanAndParseJson(rawText: string): unknown {
  try {
    const cleaned = rawText
      .replace(/```(?:json)?\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    const firstBrace = cleaned.indexOf("[");
    const lastBrace = cleaned.lastIndexOf("]");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
    }
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function normalizePassages(
  raw: unknown,
  params: {
    topic: string;
    level: string;
    length: string;
    passageCount: number;
    questionsPerPassage: number;
    questionType: ReadingQuestionMode;
    customPrompt?: string;
  }
): ReadingPassageItem[] {
  const fbList = fallbackPassages(params);
  if (!Array.isArray(raw) || raw.length === 0) return fbList;

  const out: ReadingPassageItem[] = [];
  for (let p = 0; p < params.passageCount; p++) {
    const item = raw[p];
    const fb = fbList[p] || fbList[0];

    if (!item || typeof item !== "object") {
      out.push(fb);
      continue;
    }

    const obj = item as Record<string, unknown>;
    const pTitle =
      typeof obj.title === "string" && obj.title.trim()
        ? obj.title.trim()
        : fb.title;
    const pText =
      typeof obj.text === "string" && obj.text.trim().length >= 40
        ? obj.text.trim()
        : fb.text;

    const rawQuestions = Array.isArray(obj.questions) ? obj.questions : [];
    const qs: ReadingQuestion[] = [];

    for (let q = 0; q < params.questionsPerPassage; q++) {
      const qItem = rawQuestions[q];
      const fbQ = fb.questions[q] || fb.questions[0];

      if (!qItem || typeof qItem !== "object") {
        qs.push({ ...fbQ, id: q + 1, type: params.questionType });
        continue;
      }

      const qObj = qItem as Record<string, unknown>;
      const qText =
        typeof qObj.question === "string" && qObj.question.trim()
          ? qObj.question.trim()
          : fbQ.question;

      const optsRaw = Array.isArray(qObj.options)
        ? qObj.options.filter(
            (o): o is string => typeof o === "string" && o.trim().length > 0
          )
        : [];
      const options =
        params.questionType === "question"
          ? []
          : optsRaw.length >= 4
          ? optsRaw.slice(0, 4)
          : [...optsRaw, ...fbQ.options].slice(0, 4);

      const correctIndex =
        typeof qObj.correctIndex === "number" &&
        Number.isInteger(qObj.correctIndex) &&
        qObj.correctIndex >= 0 &&
        qObj.correctIndex < 4
          ? qObj.correctIndex
          : 0;

      const modelAnswer =
        typeof qObj.modelAnswer === "string" && qObj.modelAnswer.trim()
          ? qObj.modelAnswer.trim()
          : fbQ.modelAnswer || fbQ.explanation;

      const explanation =
        typeof qObj.explanation === "string" && qObj.explanation.trim()
          ? qObj.explanation.trim()
          : fbQ.explanation;

      qs.push({
        id: q + 1,
        type: params.questionType,
        question: qText,
        options,
        correctIndex,
        modelAnswer,
        explanation,
      });
    }

    out.push({
      id: p + 1,
      title: pTitle,
      text: pText,
      questions: qs,
    });
  }

  return out;
}

export async function generateReadingWithAi(params: {
  topic: string;
  level: string;
  length: string;
  passageCount: number;
  questionsPerPassage: number;
  questionType: ReadingQuestionMode;
  customPrompt?: string;
}): Promise<ReadingPassageItem[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return fallbackPassages(params);
  }

  const lengthGuide =
    params.length === "short"
      ? "around 90-130 words per passage"
      : params.length === "long"
      ? "around 250-330 words per passage"
      : "around 150-210 words per passage";

  const qFormatInstruction =
    params.questionType === "question"
      ? `Each question is an OPEN-ENDED written comprehension question. Provide "options": [], "correctIndex": 0, plus a clear "modelAnswer" and "explanation".`
      : `Each question is MULTIPLE CHOICE with exactly 4 options in "options": ["...", "...", "...", "..."] and "correctIndex": 0..3.`;

  const extra = params.customPrompt?.trim()
    ? `Additional Focus: ${params.customPrompt.trim()}`
    : "";

  const prompt = `You are a certified Cambridge English reading examiner.
Create a comprehensive English reading assessment with ${params.passageCount} passage(s).
Each passage must have EXACTLY ${params.questionsPerPassage} questions.
Topic: ${params.topic} | CEFR Level: ${params.level}
Passage Length: ${params.length} (${lengthGuide})
Question Type: ${params.questionType}
${qFormatInstruction}
${extra}

Output ONLY a valid JSON array of objects without Markdown formatting:
[
  {
    "title": "Passage Title",
    "text": "Detailed reading passage content...",
    "questions": [
      {
        "question": "Question text...",
        "options": ["A", "B", "C", "D"],
        "correctIndex": 0,
        "modelAnswer": "Expected answer",
        "explanation": "Concise rationale"
      }
    ]
  }
]`;

  for (const model of PREFERRED_READING_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!res.ok) continue;

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      if (!rawText) continue;

      const parsed = cleanAndParseJson(rawText);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizePassages(parsed, params);
      }
    } catch {
      // try next model
    } finally {
      clearTimeout(timer);
    }
  }

  return fallbackPassages(params);
}

export async function gradeReadingAnswersWithAi(params: {
  questionType?: ReadingQuestionMode;
  passages: ReadingPassageItem[];
  answers: Record<string, number>;
  textAnswers?: Record<string, string>;
}): Promise<{
  score: number;
  total: number;
  results: GradedQuestionResult[];
  summary: string;
}> {
  const { passages, answers, textAnswers = {} } = params;
  let score = 0;
  let total = 0;
  const results: GradedQuestionResult[] = [];

  for (let pIdx = 0; pIdx < passages.length; pIdx++) {
    const p = passages[pIdx];
    const qs = Array.isArray(p.questions) ? p.questions : [];
    for (let qIdx = 0; qIdx < qs.length; qIdx++) {
      const q = qs[qIdx];
      total += 1;
      const key = `${pIdx}-${qIdx}`;
      const isOpenQuestion =
        q.type === "question" ||
        params.questionType === "question" ||
        !Array.isArray(q.options) ||
        q.options.length === 0;

      if (isOpenQuestion) {
        const userText = (textAnswers[key] || "").trim();
        const refText = (q.modelAnswer || q.explanation || "").toLowerCase();
        const keywords = refText
          .split(/[^a-zA-Z0-9]+/)
          .filter((w) => w.length >= 4);
        const matched = keywords.filter((kw) =>
          userText.toLowerCase().includes(kw)
        ).length;

        const isCorrect =
          userText.length >= 10 &&
          (matched >= 1 || userText.split(/\s+/).length >= 4);
        if (isCorrect) score += 1;

        results.push({
          passageIndex: pIdx,
          questionIndex: qIdx,
          selectedIndex: null,
          textAnswer: userText || "Javob berilmadi",
          isCorrect,
          aiFeedback: isCorrect
            ? "To'g'ri tahlil! Javobingiz matn mazmuniga to'laqonli mos keladi."
            : userText
            ? `Qoniqarsiz: Asosiy fikr matndan to'liq aks etmagan. Model javob: ${q.modelAnswer || q.explanation}`
            : "Javob yozilmadi.",
        });
      } else {
        const selected = answers[key];
        const isCorrect = selected === q.correctIndex;
        if (isCorrect) score += 1;

        results.push({
          passageIndex: pIdx,
          questionIndex: qIdx,
          selectedIndex: typeof selected === "number" ? selected : null,
          isCorrect,
          aiFeedback: isCorrect
            ? `To'g'ri! ${q.explanation}`
            : typeof selected === "number"
            ? `Noto'g'ri tanlov. To'g'ri variant: ${String.fromCharCode(65 + q.correctIndex)}. ${q.explanation}`
            : `Tanlanmadi. To'g'ri variant: ${String.fromCharCode(65 + q.correctIndex)}.`,
        });
      }
    }
  }

  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const summary = `Natija: ${score}/${total} (${pct}%). ${
    pct >= 80
      ? "A'lo darajada matn tushunish ko'rsatkichi!"
      : pct >= 50
      ? "Yaxshi natija, asosiy fikrlarni ajratishga ko'proq e'tibor bering."
      : "Matnni qayta ko'rib chiqish va nozik nuqtalarni tahlil qilish tavsiya etiladi."
  }`;

  return { score, total, results, summary };
}
