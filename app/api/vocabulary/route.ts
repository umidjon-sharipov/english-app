import { NextRequest, NextResponse } from "next/server";
import { requireAuthUserId } from "@/app/api/tests/route";

// export const dynamic = "force-dynamic";

export interface VocabularyWord {
  id: string;
  word: string;
  phonetic: string;
  partOfSpeech: string;
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  meaningEn: string;
  meaningUz: string;
  examples: string[];
  synonyms: string[];
}

const DEFAULT_VOCABULARY: VocabularyWord[] = [
  {
    id: "v_1",
    word: "Resilience",
    phonetic: "/rɪˈzɪl.jəns/",
    partOfSpeech: "noun",
    level: "B2",
    meaningEn: "The capacity to recover quickly from difficulties; toughness.",
    meaningUz: "Qiyinchiliklarga bardoshlilik, chidamlilik, o'zini tez tiklay olish qobiliyati.",
    examples: [
      "Courage and resilience are essential qualities for entrepreneurial success.",
      "The local community demonstrated remarkable resilience in the aftermath of the disaster.",
    ],
    synonyms: ["endurance", "fortitude", "tenacity", "toughness"],
  },
  {
    id: "v_2",
    word: "Ubiquitous",
    phonetic: "/juːˈbɪk.wɪ.təs/",
    partOfSpeech: "adjective",
    level: "C1",
    meaningEn: "Present, appearing, or found everywhere.",
    meaningUz: "Hamma joyda uchraydigan, ommalashgan, keng tarqalgan.",
    examples: [
      "Smartphones have become ubiquitous across modern urban society.",
      "In the digital age, internet connectivity is virtually ubiquitous.",
    ],
    synonyms: ["omnipresent", "pervasive", "universal", "widespread"],
  },
  {
    id: "v_3",
    word: "Mitigate",
    phonetic: "/ˈmɪt.ɪ.ɡeɪt/",
    partOfSpeech: "verb",
    level: "B2",
    meaningEn: "Make something less severe, serious, or painful.",
    meaningUz: "Yumshatmoq, zararini kamaytirmoq, yengillashtirmoq.",
    examples: [
      "Governments must implement rapid policies to mitigate carbon emissions.",
      "Emergency relief supplies helped mitigate the severity of the crisis.",
    ],
    synonyms: ["alleviate", "reduce", "diminish", "moderate"],
  },
  {
    id: "v_4",
    word: "Perseverance",
    phonetic: "/ˌpɜː.sɪˈvɪə.rəns/",
    partOfSpeech: "noun",
    level: "B1",
    meaningEn: "Persistence in doing something despite difficulty or delay in achieving success.",
    meaningUz: "Matonat, sabot, qat'iyat bilan davom etish.",
    examples: [
      "Through sheer perseverance, she mastered fluent English within a year.",
      "Success in scientific research demands dedication and tireless perseverance.",
    ],
    synonyms: ["persistence", "determination", "grit", "stamina"],
  },
  {
    id: "v_5",
    word: "Articulate",
    phonetic: "/ɑːˈtɪk.jə.lət/",
    partOfSpeech: "adjective",
    level: "B2",
    meaningEn: "Having or showing the ability to speak fluently and coherently.",
    meaningUz: "O'z fikrini ravon va aniq ifodalay oladigan, notiq.",
    examples: [
      "She presented an articulate argument during the international academic symposium.",
      "An articulate leader inspires confidence across multinational teams.",
    ],
    synonyms: ["eloquent", "fluent", "persuasive", "lucid"],
  },
  {
    id: "v_6",
    word: "Comprehensive",
    phonetic: "/ˌkɒm.prɪˈhen.sɪv/",
    partOfSpeech: "adjective",
    level: "B1",
    meaningEn: "Including or dealing with all or nearly all elements or aspects of something.",
    meaningUz: "Keng qamrovli, har tomonlama to'liq, mukammal.",
    examples: [
      "The university provides a comprehensive training curriculum for language instructors.",
      "We conducted a comprehensive analysis of the quarterly examination metrics.",
    ],
    synonyms: ["exhaustive", "thorough", "extensive", "complete"],
  },
  {
    id: "v_7",
    word: "Scrutinize",
    phonetic: "/ˈskruː.tɪ.naɪz/",
    partOfSpeech: "verb",
    level: "C1",
    meaningEn: "Examine or inspect closely and thoroughly.",
    meaningUz: "Sinchkovlik bilan tekshirmoq, sinchiklab o'rganmoq.",
    examples: [
      "Scholars closely scrutinized the historic legal documents before drawing conclusions.",
      "The audit team will scrutinize every financial transaction carefully.",
    ],
    synonyms: ["inspect", "examine", "analyze", "investigate"],
  },
  {
    id: "v_8",
    word: "Eloquent",
    phonetic: "/ˈel.ə.kwənt/",
    partOfSpeech: "adjective",
    level: "B2",
    meaningEn: "Fluent or persuasive in speaking or writing.",
    meaningUz: "Fasohotli, ta'sirchan so'zlovchi, yoqimli va balog'atli.",
    examples: [
      "His eloquent speech moved the entire assembly to a standing ovation.",
      "The novelist crafted an eloquent portrayal of human empathy.",
    ],
    synonyms: ["expressive", "poignant", "silver-tongued", "vivid"],
  },
];

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Avval tizimga kiring." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("q")?.trim().toLowerCase() || "";
    const level = searchParams.get("level")?.trim().toUpperCase() || "ALL";

    let words = [...DEFAULT_VOCABULARY];

    if (level !== "ALL") {
      words = words.filter((w) => w.level === level);
    }

    if (search) {
      words = words.filter(
        (w) =>
          w.word.toLowerCase().includes(search) ||
          w.meaningEn.toLowerCase().includes(search) ||
          w.meaningUz.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({ words });
  } catch (error) {
    console.error("GET /api/vocabulary error:", error);
    return NextResponse.json({ error: "Lug'atni yuklashda xatolik." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Avval tizimga kiring." }, { status: 401 });
    }

    const body = (await req.json()) as { word?: string };
    const wordQuery = (body.word || "").trim();
    if (!wordQuery) {
      return NextResponse.json({ error: "So'z kiritilishi shart." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (apiKey) {
      const prompt = `You are an Oxford English lexicographer.
Provide a complete dictionary entry for the English word or phrase: "${wordQuery}".
Output ONLY a JSON object (no markdown):
{
  "word": "${wordQuery}",
  "phonetic": "/.../",
  "partOfSpeech": "noun | verb | adjective | adverb",
  "level": "A1 | A2 | B1 | B2 | C1 | C2",
  "meaningEn": "Clear concise English definition",
  "meaningUz": "Aniq va boy o'zbekcha tarjimasi/izohi",
  "examples": [
    "Realistic context sentence 1",
    "Realistic context sentence 2"
  ],
  "synonyms": ["syn1", "syn2", "syn3"]
}`;

      for (const m of ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash"]) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(
              apiKey
            )}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3 },
              }),
            }
          );
          clearTimeout(timer);

          if (res.ok) {
            const data = (await res.json()) as any;
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
            const firstBrace = cleaned.indexOf("{");
            const lastBrace = cleaned.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
              return NextResponse.json({
                ok: true,
                entry: { ...parsed, id: `v_${Date.now()}` },
              });
            }
          }
        } catch {
          // try next
        }
      }
    }

    // Fallback dictionary item
    const fallbackEntry: VocabularyWord = {
      id: `v_${Date.now()}`,
      word: wordQuery,
      phonetic: "/.../",
      partOfSpeech: "noun/verb",
      level: "B2",
      meaningEn: `An important English lexical term referring to ${wordQuery}.`,
      meaningUz: `${wordQuery} so'zi (kontekstga qarab o'rganiladi).`,
      examples: [
        `Mastering the word '${wordQuery}' enriches academic communication.`,
        `Frequent contextual usage ensures that '${wordQuery}' is retained permanently.`,
      ],
      synonyms: ["term", "expression", "phrase"],
    };

    return NextResponse.json({ ok: true, entry: fallbackEntry });
  } catch (error) {
    console.error("POST /api/vocabulary error:", error);
    return NextResponse.json({ error: "So'zni tahlil qilishda server xatoligi." }, { status: 500 });
  }
}
