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
    `Strong readers approach ${topic} at the ${level} level by identifying main claims, supporting evidence, and subtle tone shifts rather than guessing.${focus}`,
    `Comparing how ideas connect across sentences reveals cause-and-effect relationships and implied conclusions even in dense passages.`,
    `Consistent reflection on difficult questions helps learners refine accuracy and build confidence across complex reading tasks.`,
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
            question: `Passage ${pIdx + 1}, Q${qIdx + 1}: Explain the main idea or key point discussed regarding ${topic} (${level}).`,
            options: [],
            correctIndex: 0,
            modelAnswer:
              "Identify the central argument and support it with key details from the passage.",
            explanation:
              "A good answer clearly states the core idea and references supporting details from the text.",
          };
        }

        return {
          id: qIdx + 1,
          type: "test",
          question: `Passage ${pIdx + 1}, Q${qIdx + 1}: Which statement best reflects the passage on ${topic} (${level})?`,
          options: [
            "Analyzing main ideas and supporting evidence improves comprehension",
            "Ignoring context clues is the fastest way to read",
            "Every detail in a passage carries equal weight",
            "Reading speed matters more than understanding meaning",
          ],
          correctIndex: 0,
          explanation:
            "The passage highlights identifying main claims and supporting evidence for accurate comprehension.",
        };
      }
    );

    return {
      id: pIdx + 1,
      title: `Reading ${pIdx + 1}: ${topic} (${level})`,
      text: passageCount > 1 ? `[Passage ${pIdx + 1}/${passageCount}] ${bodyText}` : bodyText,
      questions,
    };
  });
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
      out.push({ ...fb, id: p + 1 });
      continue;
    }

    const obj = item as Record<string, unknown>;
    const pTitle =
      typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : fb.title;
    const pText =
      typeof obj.text === "string" && obj.text.trim() ? obj.text.trim() : fb.text;

    const rawQs = Array.isArray(obj.questions) ? obj.questions : [];
    const qs: ReadingQuestion[] = [];

    for (let q = 0; q < params.questionsPerPassage; q++) {
      const qItem = rawQs[q];
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
  const apiKey = process.env.GEMINI_API_KEY;
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
      ? `Each question is an OPEN-ENDED written question (NOT multiple choice). Set "options": [], "correctIndex": 0, and provide a concise "modelAnswer" plus "explanation".`
      : `Each question is MULTIPLE CHOICE with 4 options in "options": ["...", "...", "...", "..."] and "correctIndex": 0..3.`;

  const extra = params.customPrompt?.trim()
    ? `Additional instructions: ${params.customPrompt.trim()}`
    : "";

  const prompt = `Create an English reading set with ${params.passageCount} distinct passage(s).
Each passage MUST have ${params.questionsPerPassage} questions.
Topic: ${params.topic}
CEFR Level: ${params.level}
Passage Length: ${params.length} (${lengthGuide})
Question Format: ${params.questionType}
${qFormatInstruction}
${extra}

Return ONLY valid JSON (no markdown code fences) in this exact format:
[
  {
    "title": "string",
    "text": "string",
    "questions": [
      {
        "question": "string",
        "options": ["string", "string", "string", "string"],
        "correctIndex": 0,
        "modelAnswer": "string",
        "explanation": "string"
      }
    ]
  }
]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
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
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!res.ok) return fallbackPassages(params);

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    return normalizePassages(parsed, params);
  } catch {
    return fallbackPassages(params);
  } finally {
    clearTimeout(timer);
  }
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
          userText.length >= 12 &&
          (matched >= 1 || userText.split(/\s+/).length >= 5);
        if (isCorrect) score += 1;

        results.push({
          passageIndex: pIdx,
          questionIndex: qIdx,
          selectedIndex: null,
          textAnswer: userText,
          isCorrect,
          aiFeedback: isCorrect
            ? `Qabul qilindi (AI). Namuna fikr: ${q.modelAnswer || q.explanation}`
            : `Javob qisqa yoki mavzuga yetarlicha aniq emas. ${
                q.modelAnswer || q.explanation
              }`,
        });
      } else {
        const selected =
          typeof answers[key] === "number" ? answers[key] : null;
        const isCorrect = selected === q.correctIndex;
        if (isCorrect) score += 1;

        results.push({
          passageIndex: pIdx,
          questionIndex: qIdx,
          selectedIndex: selected,
          isCorrect,
          aiFeedback: isCorrect
            ? `To'g'ri! ${q.explanation}`
            : `Noto'g'ri. ${q.explanation}`,
        });
      }
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      score,
      total,
      results,
      summary: `AI tekshiruvi yakunlandi: ${score} / ${total}.`,
    };
  }

  try {
    // Use Gemini to grade open-ended answers accurately when present
    const openItems = results.filter((r) => {
      const q = passages[r.passageIndex]?.questions?.[r.questionIndex];
      return (
        q?.type === "question" ||
        !Array.isArray(q?.options) ||
        q?.options.length === 0
      );
    });

    if (openItems.length > 0) {
      const payloadForAi = openItems.slice(0, 30).map((r) => {
        const p = passages[r.passageIndex];
        const q = p?.questions?.[r.questionIndex];
        return {
          pIdx: r.passageIndex,
          qIdx: r.questionIndex,
          passageSnippet: (p?.text || "").slice(0, 500),
          question: q?.question || "",
          modelAnswer: q?.modelAnswer || q?.explanation || "",
          studentAnswer: r.textAnswer || "",
        };
      });

      const prompt = `Grade these open-ended English reading answers fairly against the passage and modelAnswer.
Return ONLY JSON array: [{"pIdx":0,"qIdx":0,"isCorrect":true,"feedback":"short Uzbek feedback"}]
Items: ${JSON.stringify(payloadForAi)}`;

      const res = await fetch(
        `[https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$){encodeURIComponent(
          apiKey
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        const raw =
          data.candidates?.[0]?.content?.parts?.[0]?.text
            ?.replace(/^```json\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim() || "[]";
        const parsedGrades = JSON.parse(raw) as Array<{
          pIdx: number;
          qIdx: number;
          isCorrect: boolean;
          feedback?: string;
        }>;

        if (Array.isArray(parsedGrades) && parsedGrades.length > 0) {
          for (const g of parsedGrades) {
            const target = results.find(
              (item) =>
                item.passageIndex === g.pIdx && item.questionIndex === g.qIdx
            );
            if (target) {
              target.isCorrect = Boolean(g.isCorrect);
              if (g.feedback && g.feedback.trim()) {
                target.aiFeedback = g.feedback.trim();
              }
            }
          }
          score = results.filter((item) => item.isCorrect).length;
        }
      }
    }
  } catch {
    // Keep rule + keyword grading above
  }

  return {
    score,
    total,
    results,
    summary: `AI tekshiruvi: ${score} / ${total} to'g'ri javob.`,
  };
}
