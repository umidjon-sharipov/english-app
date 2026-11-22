import { NextRequest, NextResponse } from "next/server";
import { requireAuthUserId } from "@/app/api/tests/route";

// export const dynamic = "force-dynamic";

export interface ListeningItem {
  id: string;
  title: string;
  level: string;
  category: "dialogue" | "lecture" | "story";
  audioText: string;
  transcript: string;
  questions: Array<{
    id: number;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }>;
  dictationSentences: string[];
}

const LISTENING_COLLECTION: ListeningItem[] = [
  {
    id: "lis_1",
    title: "Job Interview at a Tech Startup",
    level: "B1",
    category: "dialogue",
    audioText:
      "Good morning, Alex. Thank you for coming in today. We reviewed your portfolio, and we were particularly impressed by your collaboration on the cross-platform application. Could you describe a significant technical hurdle your team overcame recently?",
    transcript:
      "Good morning, Alex. Thank you for coming in today. We reviewed your portfolio, and we were particularly impressed by your collaboration on the cross-platform application. Could you describe a significant technical hurdle your team overcame recently?",
    questions: [
      {
        id: 1,
        question: "What specific aspect of the candidate's portfolio impressed the interviewer?",
        options: [
          "Their collaboration on the cross-platform application",
          "Their high school mathematics certificate",
          "Their ability to speak four different European languages",
          "Their past experience in financial banking operations",
        ],
        correctIndex: 0,
        explanation: "The speaker explicitly mentions being impressed by 'your collaboration on the cross-platform application'.",
      },
      {
        id: 2,
        question: "What is the candidate invited to describe?",
        options: [
          "A major technical hurdle their team overcame recently",
          "Their salary expectations for the upcoming fiscal quarter",
          "Their favorite software development framework",
          "The history of startup organizations in Silicon Valley",
        ],
        correctIndex: 0,
        explanation: "The interviewer asks: 'Could you describe a significant technical hurdle your team overcame recently?'",
      },
    ],
    dictationSentences: [
      "We reviewed your portfolio with great attention.",
      "Could you describe a significant technical hurdle?",
      "Collaboration is essential for startup innovation.",
    ],
  },
  {
    id: "lis_2",
    title: "Deep Space Exploration & Exoplanets",
    level: "B2",
    category: "lecture",
    audioText:
      "Astronomers utilizing infrared orbital telescopes have detected atmospheric water vapor surrounding a terrestrial exoplanet orbiting within its host star's habitable zone. While surface liquid water is not yet confirmed, this finding represents an unprecedented milestone in astrobiology.",
    transcript:
      "Astronomers utilizing infrared orbital telescopes have detected atmospheric water vapor surrounding a terrestrial exoplanet orbiting within its host star's habitable zone. While surface liquid water is not yet confirmed, this finding represents an unprecedented milestone in astrobiology.",
    questions: [
      {
        id: 1,
        question: "What instrument helped astronomers make the discovery?",
        options: [
          "Infrared orbital telescopes",
          "Ground-based optical radio antennas",
          "Underwater acoustic detection sensors",
          "Automated deep space mining drones",
        ],
        correctIndex: 0,
        explanation: "The lecture highlights 'infrared orbital telescopes'.",
      },
      {
        id: 2,
        question: "Has surface liquid water been unequivocally confirmed?",
        options: [
          "No, it is not yet confirmed",
          "Yes, vast oceans were directly photographed",
          "Yes, robotic rovers gathered water samples",
          "No, because the planet is completely frozen",
        ],
        correctIndex: 0,
        explanation: "The speaker clarifies: 'While surface liquid water is not yet confirmed...'",
      },
    ],
    dictationSentences: [
      "Astronomers have detected atmospheric water vapor.",
      "The exoplanet is located within the habitable zone.",
      "This finding represents an unprecedented milestone.",
    ],
  },
  {
    id: "lis_3",
    title: "The Cognitive Benefits of Bilingualism",
    level: "C1",
    category: "lecture",
    audioText:
      "Neuroscientific research corroborates that individuals fluent in multiple linguistic frameworks exhibit superior executive functioning, including rapid task-switching and heightened resistance to neurodegenerative cognitive decline in senior years.",
    transcript:
      "Neuroscientific research corroborates that individuals fluent in multiple linguistic frameworks exhibit superior executive functioning, including rapid task-switching and heightened resistance to neurodegenerative cognitive decline in senior years.",
    questions: [
      {
        id: 1,
        question: "What cognitive ability is heightened in multilingual speakers?",
        options: [
          "Executive functioning and rapid task-switching",
          "Involuntary photographic visual memory",
          "Physical reflexes during competitive athletics",
          "Instant mathematical calculation speed",
        ],
        correctIndex: 0,
        explanation: "The speaker cites 'superior executive functioning, including rapid task-switching'.",
      },
    ],
    dictationSentences: [
      "Individuals fluent in multiple languages exhibit superior executive functioning.",
      "Bilingualism provides resistance to cognitive decline.",
    ],
  },
];

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Avval tizimga kiring." }, { status: 401 });
    }

    return NextResponse.json({ items: LISTENING_COLLECTION });
  } catch (error) {
    console.error("GET /api/listening error:", error);
    return NextResponse.json({ error: "Listening materiallarini yuklashda xatolik." }, { status: 500 });
  }
}
