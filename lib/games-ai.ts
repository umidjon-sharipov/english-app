import {
  GAME_TYPES,
  GameCatalogItem,
  GameRoundQuestion,
} from "./games-catalog";

export { GAME_TYPES };
export type { GameCatalogItem, GameRoundQuestion };

const UNIQUE_STARTERS = [
  "morning standup",
  "API timeout bug",
  "database migration",
  "code review feedback",
  "sprint deadline",
  "cache invalidation",
  "unit test coverage",
  "production deploy",
  "user onboarding",
  "search query speed",
  "error boundary",
  "team retrospective",
];

function buildFallbackRounds(params: {
  gameType: string;
  topic: string;
  level: string;
  questionCount: number;
  customPrompt?: string;
}): GameRoundQuestion[] {
  const { gameType, topic, level, questionCount, customPrompt } = params;
  const focus = customPrompt?.trim() ? ` (${customPrompt.trim()})` : "";

  return Array.from({ length: questionCount }, (_, i) => {
    const scenario = UNIQUE_STARTERS[i % UNIQUE_STARTERS.length];
    const roundNum = i + 1;

    if (gameType === "sentence-scramble") {
      const sentence = `Our team handles ${scenario} carefully in ${topic}.`;
      const parts = [
        "Our team",
        `handles ${scenario}`,
        "carefully",
        `in ${topic}.`,
      ];
      return {
        id: roundNum,
        prompt: `Round ${roundNum} · Drag & drop word tiles to form a ${level} sentence about "${scenario}"${focus}:`,
        targetSentence: sentence,
        chunks: [parts[2], parts[3], parts[0], parts[1]],
        options: [
          sentence,
          `Carefully ${scenario} our team in ${topic} handles.`,
          `In ${topic} handles our team ${scenario} carefully.`,
          `Our team in ${topic} carefully ${scenario} handles.`,
        ],
        correctIndex: 0,
        explanation: `Standard English word order places subject ("Our team") + verb ("handles") + object ("${scenario}") + adverb/prepositional phrase.`,
      };
    }

    return {
      id: roundNum,
      prompt: `Round ${roundNum} · ${gameType} (${level} · ${topic}${focus}) — Scenario: ${scenario}`,
      options: [
        `Best ${level} fit for "${scenario}" in ${topic}`,
        `Opposite or mismatched option for "${scenario}"`,
        `Unrelated phrase outside ${topic}`,
        `Grammatically incorrect form for "${scenario}"`,
      ],
      correctIndex: 0,
      explanation: `Option A fits "${scenario}" accurately for ${level} level and ${topic}.`,
    };
  });
}

function normalizeRounds(
  raw: unknown,
  params: {
    gameType: string;
    topic: string;
    level: string;
    questionCount: number;
    customPrompt?: string;
  }
): GameRoundQuestion[] {
  const fb = buildFallbackRounds(params);
  if (!Array.isArray(raw) || raw.length === 0) return fb;

  const list: GameRoundQuestion[] = [];
  for (let i = 0; i < params.questionCount; i++) {
    const item = raw[i];
    const fallbackItem = fb[i] || fb[0];
    if (!item || typeof item !== "object") {
      list.push({ ...fallbackItem, id: i + 1 });
      continue;
    }

    const obj = item as Record<string, unknown>;
    const promptText =
      typeof obj.prompt === "string" && obj.prompt.trim()
        ? obj.prompt.trim()
        : fallbackItem.prompt;

    const rawOpts = Array.isArray(obj.options)
      ? obj.options.filter(
          (o): o is string => typeof o === "string" && o.trim().length > 0
        )
      : [];
    const options =
      rawOpts.length >= 4
        ? rawOpts.slice(0, 4)
        : [...rawOpts, ...fallbackItem.options].slice(0, 4);

    const correctIndex =
      typeof obj.correctIndex === "number" &&
      Number.isInteger(obj.correctIndex) &&
      obj.correctIndex >= 0 &&
      obj.correctIndex < 4
        ? obj.correctIndex
        : 0;

    const explanation =
      typeof obj.explanation === "string" && obj.explanation.trim()
        ? obj.explanation.trim()
        : fallbackItem.explanation;

    const chunks = Array.isArray(obj.chunks)
      ? obj.chunks.filter(
          (c): c is string => typeof c === "string" && c.trim().length > 0
        )
      : fallbackItem.chunks;

    const targetSentence =
      typeof obj.targetSentence === "string" && obj.targetSentence.trim()
        ? obj.targetSentence.trim()
        : fallbackItem.targetSentence;

    list.push({
      id: i + 1,
      prompt: promptText,
      targetSentence,
      chunks,
      options,
      correctIndex,
      explanation,
    });
  }

  return list;
}

export async function generateGameWithAi(params: {
  gameType: string;
  topic: string;
  level: string;
  questionCount: number;
  customPrompt?: string;
}): Promise<{ rounds: GameRoundQuestion[]; usedAi: boolean; aiNote?: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || null;
  if (!apiKey) {
    return {
      rounds: buildFallbackRounds(params),
      usedAi: false,
      aiNote: "GEMINI_API_KEY topilmadi.",
    };
  }

  const gameMeta =
    GAME_TYPES.find((g) => g.id === params.gameType) || GAME_TYPES[0];

  const prompt = `Generate EXACTLY ${params.questionCount} unique, non-repeating English learning game rounds for "${gameMeta.name}" (${gameMeta.description}).
Topic: ${params.topic}
CEFR Level: ${params.level}
${params.customPrompt?.trim() ? `Custom focus: ${params.customPrompt.trim()}` : ""}

IMPORTANT:
- Every single one of the ${params.questionCount} items must be distinct and have a different sentence/word/phrase/context. Do NOT repeat the same item.
- Return ONLY a raw JSON array of ${params.questionCount} objects (no markdown):
[
  {
    "prompt": "Unique challenge or sentence clue",
    "targetSentence": "Full correct sentence if sentence-scramble, otherwise omit",
    "chunks": ["tile1", "tile2", "tile3", "tile4"],
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Concise explanation"
  }
]`;

  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  let lastErr = "";

  for (const model of models) {
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
              temperature: 0.85,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!res.ok) {
        lastErr = `${model} -> HTTP ${res.status}`;
        continue;
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const rawText =
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      if (!rawText) {
        lastErr = `${model} -> bo'sh javob`;
        continue;
      }

      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      return {
        rounds: normalizeRounds(parsed, params),
        usedAi: true,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "AI xatosi";
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    rounds: buildFallbackRounds(params),
    usedAi: false,
    aiNote: lastErr || "Gemini API ulanmadi.",
  };
}
