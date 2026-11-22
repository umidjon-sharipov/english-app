import {
  GAME_TYPES,
  GameCatalogItem,
  GameRoundQuestion,
} from "./games-catalog";

export { GAME_TYPES };
export type { GameCatalogItem, GameRoundQuestion };

function buildFallbackRounds(params: {
  gameType: string;
  topic: string;
  level: string;
  questionCount: number;
  customPrompt?: string;
}): GameRoundQuestion[] {
  const { gameType, topic, level, questionCount, customPrompt } = params;
  const focus = customPrompt?.trim() ? ` (${customPrompt.trim()})` : "";

  const samples: Record<
    string,
    Array<{
      prompt: string;
      targetSentence?: string;
      chunks?: string[];
      options: string[];
      correctIndex: number;
      explanation: string;
    }>
  > = {
    "sentence-scramble": [
      {
        prompt: `Assemble a natural ${level} sentence about ${topic}${focus}:`,
        targetSentence: "Developers test new features before release.",
        chunks: ["new features", "Developers", "before release.", "test"],
        options: [
          "Developers test new features before release.",
          "Features test developers before release new.",
          "Before release test new features developers.",
          "Developers before test new features release.",
        ],
        correctIndex: 0,
        explanation:
          "Subject + Verb + Object + Time/Condition clause order is standard in English.",
      },
      {
        prompt: `Build a clear ${level} sentence (${topic}):`,
        targetSentence: "Practice every day builds strong fluency.",
        chunks: ["builds strong", "Practice", "fluency.", "every day"],
        options: [
          "Practice every day builds strong fluency.",
          "Every day builds fluency practice strong.",
          "Strong fluency builds practice every day.",
          "Builds practice strong fluency every day.",
        ],
        correctIndex: 0,
        explanation:
          "'Practice every day' acts as the subject phrase followed by verb 'builds'.",
      },
    ],
    "phrasal-match": [
      {
        prompt: `Match the phrasal verb 'figure out' (${level} · ${topic}${focus}):`,
        options: [
          "To find a solution or understand something",
          "To draw a geometric figure on paper",
          "To cancel a meeting suddenly",
          "To speak louder in a crowd",
        ],
        correctIndex: 0,
        explanation:
          "'Figure out' means to solve or comprehend after thinking.",
      },
    ],
  };

  const bank = samples[gameType] || [
    {
      prompt: `${gameType} (${level} · ${topic}${focus}): Select the card that best fits this challenge.`,
      options: [
        "Sharp & context-accurate match",
        "Opposite meaning card",
        "Unrelated vocabulary card",
        "Grammatically broken form",
      ],
      correctIndex: 0,
      explanation:
        "The first card matches the context and target grammar/meaning.",
    },
  ];

  return Array.from({ length: questionCount }, (_, i) => {
    const base = bank[i % bank.length];
    return {
      id: i + 1,
      prompt:
        questionCount > bank.length
          ? `${base.prompt} [Card #${i + 1}]`
          : base.prompt,
      targetSentence: base.targetSentence,
      chunks: base.chunks ? [...base.chunks] : undefined,
      options: [...base.options],
      correctIndex: base.correctIndex,
      explanation: base.explanation,
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
      aiNote: ".env faylida GEMINI_API_KEY topilmadi.",
    };
  }

  const gameMeta =
    GAME_TYPES.find((g) => g.id === params.gameType) || GAME_TYPES[0];

  const prompt = `Create ${params.questionCount} distinct interactive English game cards/rounds for "${gameMeta.name}" (${gameMeta.description}).
Topic: ${params.topic}
CEFR Level: ${params.level}
${params.customPrompt?.trim() ? `Extra instruction: ${params.customPrompt.trim()}` : ""}

Return ONLY valid JSON array (no markdown fences):
[
  {
    "prompt": "Clear challenge or clue for the player",
    "targetSentence": "Complete natural English sentence if sentence-scramble, else omit or empty",
    "chunks": ["part1", "part2", "part3", "part4"],
    "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
    "correctIndex": 0,
    "explanation": "Short clear explanation"
  }
]
Rules:
- Every round must have 4 distinct options and integer correctIndex (0..3).
- For sentence-scramble, put scrambled word/phrase pieces in "chunks" and the right sentence in "options[correctIndex]".`;

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
              temperature: 0.75,
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
