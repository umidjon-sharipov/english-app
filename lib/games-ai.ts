import {
  GAME_TYPES,
  GameCatalogItem,
  GameRoundQuestion,
} from "./games-catalog";

export { GAME_TYPES };
export type { GameCatalogItem, GameRoundQuestion };

const PREFERRED_GAME_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemma-4-31b-it",
];

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
        prompt: `Round ${roundNum} · So'z kartalarini tartib bilan bosib to'g'ri ${level} gap tuzing:`,
        targetSentence: sentence,
        chunks: [parts[2], parts[3], parts[0], parts[1]],
        options: [
          sentence,
          `Carefully ${scenario} our team in ${topic} handles.`,
          `In ${topic} handles our team ${scenario} carefully.`,
          `Our team in ${topic} carefully ${scenario} handles.`,
        ],
        correctIndex: 0,
        explanation: `Ingliz tilida odatiy so'z tartibi: Ega (Subject: Our team) + Kesim (Verb: handles) + To'ldiruvchi (Object: ${scenario}) + Hol (Adverb/Preposition).`,
      };
    }

    if (gameType === "phrasal-match" || gameType === "synonym-duel" || gameType === "antonym-clash") {
      const pairs: Array<{ term: string; match: string; dist1: string; dist2: string; dist3: string }> = [
        { term: "Carry out", match: "Perform / Execute a task", dist1: "Delay indefinitely", dist2: "Cancel completely", dist3: "Forget about" },
        { term: "Bring about", match: "Cause something to happen", dist1: "Prevent from happening", dist2: "Travel far away", dist3: "Refuse an offer" },
        { term: "Break down", match: "Stop functioning / Analyze details", dist1: "Fix immediately", dist2: "Start moving fast", dist3: "Build a skyscraper" },
        { term: "Put off", match: "Postpone to a later time", dist1: "Accelerate forward", dist2: "Wear new clothes", dist3: "Extinguish fire" },
        { term: "Look into", match: "Investigate and examine", dist1: "Ignore deliberately", dist2: "Close the eyes", dist3: "Run away" },
      ];
      const p = pairs[i % pairs.length];
      return {
        id: roundNum,
        prompt: `Round ${roundNum} · '${p.term}' kartasiga mos ma'no kartasini toping:`,
        targetSentence: `${p.term} = ${p.match}`,
        chunks: [p.term, p.match],
        options: [p.match, p.dist1, p.dist2, p.dist3],
        correctIndex: 0,
        explanation: `'${p.term}' iborasi '${p.match}' ma'nosini anglatadi.`,
      };
    }

    return {
      id: roundNum,
      prompt: `Round ${roundNum} · ${gameType} (${level} · ${topic}${focus}) — '${scenario}':`,
      options: [
        `Mos keladigan to'g'ri ifoda: "${scenario}" (${topic})`,
        `Qarama-qarshi yoki noo'rin variant`,
        `Boshqa mavzuga oid variant`,
        `Grammatik jihatdan xato tuzilma`,
      ],
      correctIndex: 0,
      explanation: `To'g'ri variant kontekst va darajaga to'liq mos keladi.`,
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

  const prompt = `You are an educational game designer for English learners.
Generate EXACTLY ${params.questionCount} unique, interactive rounds for the game: "${gameMeta.name}".
Game mechanic: ${gameMeta.mechanic} (${gameMeta.description})
Topic: ${params.topic} | CEFR Level: ${params.level}
${params.customPrompt?.trim() ? `Specific Requirements: ${params.customPrompt.trim()}` : ""}

Rules:
1. Every round must be engaging, unique, and pedagogically sound.
2. If sentence-scramble: provide "targetSentence" and 4-6 shuffled word "chunks".
3. If matching: provide "chunks" with the pair items and 4 choices in "options" with "correctIndex" (0..3).
4. Return ONLY a valid JSON array of objects without markdown:
[
  {
    "prompt": "Task instruction or context clue",
    "targetSentence": "Full target sentence if applicable",
    "chunks": ["piece1", "piece2", "piece3", "piece4"],
    "options": ["Correct Option", "Distractor 1", "Distractor 2", "Distractor 3"],
    "correctIndex": 0,
    "explanation": "Brief explanation"
  }
]`;

  for (const model of PREFERRED_GAME_MODELS) {
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

      const cleaned = rawText
        .replace(/```(?:json)?\s*/gi, "")
        .replace(/```/g, "")
        .trim();

      const firstBracket = cleaned.indexOf("[");
      const lastBracket = cleaned.lastIndexOf("]");
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        const parsed = JSON.parse(cleaned.substring(firstBracket, lastBracket + 1));
        return {
          rounds: normalizeRounds(parsed, params),
          usedAi: true,
        };
      }
    } catch {
      // try next model
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    rounds: buildFallbackRounds(params),
    usedAi: false,
    aiNote: "Fallback generator ishga tushirildi.",
  };
}
