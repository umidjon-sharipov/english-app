"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Code2,
  Gamepad2,
  Headphones,
  Loader2,
  LogOut,
  Mic,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
  User,
  Volume2,
} from "lucide-react";
import { useTheme, type ThemeSetting } from "@/components/theme-provider";
import { useNotify } from "@/components/notification-provider";

interface SessionUser {
  id: string;
  firstName: string;
  lastName?: string | null;
  userName: string;
  email?: string | null;
}

type ModuleTab = "reading" | "listening" | "speaking" | "game";

interface QuestionItem {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
}

const READING_PASSAGE = {
  level: "B2 · Upper-Intermediate",
  title: "Spaced Repetition and Long-Term Retention",
  text: [
    "Cramming large amounts of vocabulary in a single evening rarely produces durable recall. Cognitive research consistently shows that revisiting information right before it begins to fade strengthens neural retrieval pathways.",
    "Spaced repetition schedules review intervals progressively—after one day, three days, a week, and longer—allowing learners to spend minimal time on words they already know while focusing effort on fragile items.",
    "When paired with active recall—such as producing a definition or using a phrase in context rather than passively re-reading—retention rises sharply across both reading and speaking tasks.",
  ],
  questions: [
    {
      id: "r1",
      prompt: "Why does spaced repetition outperform single-session cramming?",
      options: [
        "It replaces the need for active recall",
        "It schedules reviews right before recall weakens",
        "It requires studying every word daily for months",
        "It focuses only on passive recognition",
      ],
      answer: 1,
      explanation:
        "Revisiting material right before it fades strengthens retrieval pathways.",
    },
    {
      id: "r2",
      prompt: "How does spaced repetition allocate study time?",
      options: [
        "Equal time is spent on every item",
        "Familiar words are reviewed more often than new ones",
        "Less time goes to secure words and more to fragile ones",
        "All review intervals stay fixed at 24 hours",
      ],
      answer: 2,
      explanation:
        "Intervals expand for known items while keeping attention on fragile ones.",
    },
  ] as QuestionItem[],
};

const LISTENING_EXERCISE = {
  level: "B1–B2 · Academic Dialogue",
  title: "Clarifying Project Scope Before Deadlines",
  transcript:
    "Before we lock in the final build, let us confirm two things: first, all core workflows must work reliably without half-finished screens; second, any edge case should fail loudly with a clear message rather than silently.",
  questions: [
    {
      id: "l1",
      prompt: "What is the first priority mentioned for the build?",
      options: [
        "Adding extra visual effects first",
        "Ensuring core workflows work without half-finished screens",
        "Delaying testing until after release",
        "Removing error messages",
      ],
      answer: 1,
      explanation:
        "The speaker states core workflows must work reliably without half-finished screens.",
    },
    {
      id: "l2",
      prompt: "How should edge cases behave according to the speaker?",
      options: [
        "Fail silently in the background",
        "Redirect to a blank page",
        "Surface a clear message instead of failing silently",
        "Reset user settings automatically",
      ],
      answer: 2,
      explanation:
        "Edge cases should fail with a clear message rather than silently.",
    },
  ] as QuestionItem[],
};

const SPEAKING_PROMPTS = [
  {
    id: "s1",
    level: "IELTS Part 2 · Cue Card",
    topic: "Describe a technical problem you solved recently.",
    points: [
      "What caused the issue and how you spotted it",
      "Which steps you took to isolate the root cause",
      "What you learned for future projects",
    ],
    sample:
      "Recently, I ran into a configuration mismatch between a library and our build setup. Instead of guessing, I checked the exact error trace, isolated the failing layer, verified the environment variables, and documented the fix so it wouldn't happen again.",
  },
  {
    id: "s2",
    level: "B2 · Opinion & Justification",
    topic: "Should practical problem-solving matter more than rote memorization?",
    points: [
      "State your clear position in the opening sentence",
      "Give one concrete example from study or work",
      "Acknowledge balance where memorization still helps",
    ],
    sample:
      "I believe practical problem-solving matters more for real mastery because applying concepts under real constraints builds adaptable skill, while core facts and vocabulary still provide the foundation.",
  },
];

const GAME_ROUNDS = [
  {
    id: "g1",
    clue: "To make something clear or easy to understand",
    choices: ["ambiguous", "elucidate", "reluctant", "obsolete"],
    answer: 1,
  },
  {
    id: "g2",
    clue: "Hesitant or unwilling to do something",
    choices: ["reluctant", "concise", "thorough", "inevitable"],
    answer: 0,
  },
  {
    id: "g3",
    clue: "Giving a lot of information clearly in few words",
    choices: ["vague", "redundant", "concise", "trivial"],
    answer: 2,
  },
  {
    id: "g4",
    clue: "No longer in use because something newer replaced it",
    choices: ["viable", "obsolete", "subtle", "consistent"],
    answer: 1,
  },
];

export default function HomePage() {
  const router = useRouter();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const notify = useNotify();

  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const [activeTab, setActiveTab] = useState<ModuleTab>("reading");

  // Reading state
  const [readingAnswers, setReadingAnswers] = useState<Record<string, number>>(
    {}
  );
  const [readingSubmitted, setReadingSubmitted] = useState(false);

  // Listening state
  const [listeningAnswers, setListeningAnswers] = useState<
    Record<string, number>
  >({});
  const [listeningSubmitted, setListeningSubmitted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [isSpeakingAudio, setIsSpeakingAudio] = useState(false);

  // Speaking state
  const [speakingIndex, setSpeakingIndex] = useState(0);
  const [speakingNotes, setSpeakingNotes] = useState("");
  const [showSample, setShowSample] = useState(false);

  // Game state
  const [gameIndex, setGameIndex] = useState(0);
  const [gameScore, setGameScore] = useState(0);
  const [gameSelected, setGameSelected] = useState<number | null>(null);
  const [gameFinished, setGameFinished] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadSession = useCallback(async () => {
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) {
        setUser(null);
      } else {
        const data = await res.json();
        setUser(data.user || null);
      }
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        notify.error("Could not sign out.", { title: "Session" });
        setLoggingOut(false);
        return;
      }
      setUser(null);
      notify.success("Signed out of your session.", { title: "Session" });
      router.refresh();
    } catch {
      notify.error("Network error while signing out.", { title: "Session" });
    } finally {
      setLoggingOut(false);
    }
  };

  const handlePlayAudio = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setShowTranscript(true);
      notify.info("Speech synthesis unavailable; showing transcript.", {
        title: "Listening",
      });
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      LISTENING_EXERCISE.transcript
    );
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.onstart = () => setIsSpeakingAudio(true);
    utterance.onend = () => setIsSpeakingAudio(false);
    utterance.onerror = () => {
      setIsSpeakingAudio(false);
      setShowTranscript(true);
    };
    window.speechSynthesis.speak(utterance);
  };

  const handleStopAudio = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeakingAudio(false);
  };

  const gradeQuiz = (
    questions: QuestionItem[],
    answers: Record<string, number>,
    label: string
  ) => {
    let correct = 0;
    questions.forEach((q) => {
      if (answers[q.id] === q.answer) correct += 1;
    });
    notify.success(
      `${label}: ${correct}/${questions.length} correct answers.`,
      { title: "Quiz Score" }
    );
    return correct;
  };

  const handleGameChoice = (choiceIdx: number) => {
    if (gameSelected !== null || gameFinished) return;
    setGameSelected(choiceIdx);
    const round = GAME_ROUNDS[gameIndex];
    const isCorrect = choiceIdx === round.answer;
    const nextScore = isCorrect ? gameScore + 1 : gameScore;
    if (isCorrect) {
      setGameScore(nextScore);
      notify.success("Exact match.", { duration: 1800 });
    } else {
      notify.error(`Expected: "${round.choices[round.answer]}"`, {
        duration: 2400,
      });
    }
  };

  const handleNextGameRound = () => {
    if (gameIndex + 1 < GAME_ROUNDS.length) {
      setGameIndex((i) => i + 1);
      setGameSelected(null);
    } else {
      setGameFinished(true);
      notify.success(
        `Game finished: ${gameScore}/${GAME_ROUNDS.length} points.`,
        { title: "Vocabulary Sprint" }
      );
    }
  };

  const handleResetGame = () => {
    setGameIndex(0);
    setGameScore(0);
    setGameSelected(null);
    setGameFinished(false);
  };

  const handleExportXmlSnapshot = () => {
    const payload = `<session user="${user?.userName || "guest"}" tab="${activeTab}" gameScore="${gameScore}/${GAME_ROUNDS.length}" />`;
    notify.xml(payload, { title: "Session XML" });
  };

  const isDark = mounted ? resolvedTheme === "dark" : false;
  const activeTheme: ThemeSetting = mounted ? theme : "system";

  const pageBg = isDark
    ? "bg-[#000000] text-[#ededed]"
    : "bg-[#ffffff] text-[#171717]";
  const surfaceBg = isDark
    ? "bg-[#0a0a0a] border-white/15"
    : "bg-[#ffffff] border-black/15";
  const subtleBg = isDark
    ? "bg-[#111111] border-white/10"
    : "bg-[#fafafa] border-black/10";
  const mutedText = isDark ? "text-[#888888]" : "text-[#666666]";
  const primaryBtn = isDark
    ? "bg-white text-black hover:bg-[#e5e5e5]"
    : "bg-black text-white hover:bg-[#222222]";
  const secondaryBtn = isDark
    ? "border-white/15 bg-[#0a0a0a] text-[#ededed] hover:border-white/35 hover:bg-white/[0.04]"
    : "border-black/15 bg-[#ffffff] text-[#171717] hover:border-black/35 hover:bg-black/[0.03]";

  const currentSpeaking = SPEAKING_PROMPTS[speakingIndex];
  const currentRound = GAME_ROUNDS[gameIndex];

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${pageBg}`}
    >
      {/* Top Navigation */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors duration-200 ${
          isDark
            ? "border-white/10 bg-[#000000]/85"
            : "border-black/10 bg-[#ffffff]/85"
        }`}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold tracking-tight">
              English Studio
            </span>
            <span
              className={`hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline-block ${
                isDark
                  ? "border-white/15 text-[#888888]"
                  : "border-black/15 text-[#666666]"
              }`}
            >
              v1.0
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportXmlSnapshot}
              title="Inspect session XML"
              className={`hidden h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors sm:inline-flex ${secondaryBtn}`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>XML</span>
            </button>

            {mounted && (
              <div
                role="group"
                aria-label="Theme"
                className={`inline-flex items-center rounded-full border p-0.5 ${
                  isDark
                    ? "border-white/15 bg-[#0a0a0a]"
                    : "border-black/15 bg-[#fafafa]"
                }`}
              >
                {(
                  [
                    { id: "light", label: "Light", Icon: Sun },
                    { id: "system", label: "System", Icon: Monitor },
                    { id: "dark", label: "Dark", Icon: Moon },
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const selected = activeTheme === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTheme(id)}
                      title={label}
                      aria-label={label}
                      className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                        selected
                          ? isDark
                            ? "bg-white text-black"
                            : "bg-black text-white"
                          : `${mutedText} ${
                              isDark ? "hover:text-white" : "hover:text-black"
                            }`
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                    </button>
                  );
                })}
              </div>
            )}

            {authLoading ? (
              <div
                className={`flex h-7 w-20 items-center justify-center rounded-md border ${secondaryBtn}`}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </div>
            ) : user ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => router.push("/profile")}
                  title="Open profile & switch accounts"
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${secondaryBtn}`}
                >
                  {((user as { avatarUrl?: string | null }).avatarUrl ?? undefined) ? (
                    <img
                      src={((user as { avatarUrl?: string | null }).avatarUrl ?? undefined)}
                      alt={user.userName}
                      className="h-4 w-4 rounded-full object-cover"
                    />
                  ) : (
                    <User className="h-3 w-3" />
                  )}
                  <span className="font-medium">{user.firstName}</span>
                  <span className={`hidden font-mono text-[10px] sm:inline ${mutedText}`}>
                    @{user.userName}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${secondaryBtn}`}
                >
                  {loggingOut ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => router.push("/auth?mode=login&redirect=/")}
                  className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors ${secondaryBtn}`}
                >
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/auth?mode=register&redirect=/")}
                  className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors ${primaryBtn}`}
                >
                  <span>Sign Up</span>
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {/* Hero / Status Strip */}
        <section className="mb-8 flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end border-inherit">
          <div>
            <p className={`font-mono text-[11px] uppercase ${mutedText}`}>
              {user
                ? `Active learner · ${user.firstName} (@${user.userName})`
                : "Guest mode · Sign in to track account session"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Reading, Listening, Speaking &amp; Practice
            </h1>
            <p className={`mt-1 text-xs sm:text-sm ${mutedText}`}>
              Structured practice modules built for clarity, active recall, and
              steady progress.
            </p>
          </div>

          {!user && !authLoading && (
            <button
              type="button"
              onClick={() => router.push("/auth?mode=login&redirect=/")}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${primaryBtn}`}
            >
              <span>Continue to Auth</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </section>

        {/* Module Switcher */}
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "reading", label: "Reading", Icon: BookOpen },
              { id: "listening", label: "Listening", Icon: Headphones },
              { id: "speaking", label: "Speaking", Icon: Mic },
              { id: "game", label: "Vocab Game", Icon: Gamepad2 },
            ] as const
          ).map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors active:scale-[0.98] ${
                  isActive
                    ? isDark
                      ? "border-white bg-white text-black"
                      : "border-black bg-black text-white"
                    : secondaryBtn
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* READING TAB */}
        {activeTab === "reading" && (
          <div className="grid gap-6 lg:grid-cols-12">
            <article
              className={`rounded-lg border p-5 lg:col-span-7 ${surfaceBg}`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className={`font-mono text-[11px] ${mutedText}`}>
                  {READING_PASSAGE.level}
                </span>
                <span className={`font-mono text-[11px] ${mutedText}`}>
                  2 questions
                </span>
              </div>
              <h2 className="text-base font-semibold tracking-tight">
                {READING_PASSAGE.title}
              </h2>
              <div className="mt-3 space-y-3 text-xs leading-relaxed sm:text-sm">
                {READING_PASSAGE.text.map((para, idx) => (
                  <p
                    key={idx}
                    className={isDark ? "text-[#cccccc]" : "text-[#262626]"}
                  >
                    {para}
                  </p>
                ))}
              </div>
            </article>

            <div className={`rounded-lg border p-5 lg:col-span-5 ${surfaceBg}`}>
              <h3 className="text-sm font-semibold tracking-tight">
                Comprehension Check
              </h3>
              <p className={`mt-0.5 text-xs ${mutedText}`}>
                Select one option per question and submit.
              </p>

              <div className="mt-4 space-y-5">
                {READING_PASSAGE.questions.map((q, qIdx) => {
                  const chosen = readingAnswers[q.id];
                  return (
                    <div key={q.id} className="space-y-2">
                      <p className="text-xs font-medium leading-snug">
                        {qIdx + 1}. {q.prompt}
                      </p>
                      <div className="space-y-1.5">
                        {q.options.map((opt, optIdx) => {
                          const picked = chosen === optIdx;
                          const isRight = q.answer === optIdx;
                          let stateStyle = "";
                          if (readingSubmitted) {
                            if (isRight) {
                              stateStyle = isDark
                                ? "border-white bg-white text-black font-medium"
                                : "border-black bg-black text-white font-medium";
                            } else if (picked && !isRight) {
                              stateStyle = isDark
                                ? "border-white/40 bg-white/10 line-through"
                                : "border-black/40 bg-black/5 line-through";
                            }
                          } else if (picked) {
                            stateStyle = isDark
                              ? "border-white bg-white/[0.08]"
                              : "border-black bg-black/[0.05]";
                          }

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => {
                                setReadingSubmitted(false);
                                setReadingAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: optIdx,
                                }));
                              }}
                              className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                                isDark
                                  ? "border-white/15 hover:border-white/30"
                                  : "border-black/15 hover:border-black/30"
                              } ${stateStyle}`}
                            >
                              <span>{opt}</span>
                              {readingSubmitted && isRight && (
                                <Check className="h-3.5 w-3.5 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {readingSubmitted && (
                        <p className={`text-[11px] ${mutedText}`}>
                          {q.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReadingSubmitted(true);
                    gradeQuiz(
                      READING_PASSAGE.questions,
                      readingAnswers,
                      "Reading"
                    );
                  }}
                  className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors ${primaryBtn}`}
                >
                  Check Answers
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReadingAnswers({});
                    setReadingSubmitted(false);
                  }}
                  className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors ${secondaryBtn}`}
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LISTENING TAB */}
        {activeTab === "listening" && (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className={`rounded-lg border p-5 lg:col-span-6 ${surfaceBg}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`font-mono text-[11px] ${mutedText}`}>
                  {LISTENING_EXERCISE.level}
                </span>
                <button
                  type="button"
                  onClick={() => setShowTranscript((v) => !v)}
                  className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${secondaryBtn}`}
                >
                  {showTranscript ? "Hide Transcript" : "Show Transcript"}
                </button>
              </div>

              <h2 className="mt-2 text-base font-semibold tracking-tight">
                {LISTENING_EXERCISE.title}
              </h2>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {!isSpeakingAudio ? (
                  <button
                    type="button"
                    onClick={handlePlayAudio}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${primaryBtn}`}
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Play Audio</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopAudio}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${secondaryBtn}`}
                  >
                    <span>Stop Audio</span>
                  </button>
                )}
              </div>

              {showTranscript && (
                <div
                  className={`mt-4 rounded-md border p-3.5 text-xs leading-relaxed ${subtleBg}`}
                >
                  <p className={`mb-1 font-mono text-[10px] uppercase ${mutedText}`}>
                    Transcript
                  </p>
                  <p>{LISTENING_EXERCISE.transcript}</p>
                </div>
              )}
            </div>

            <div className={`rounded-lg border p-5 lg:col-span-6 ${surfaceBg}`}>
              <h3 className="text-sm font-semibold tracking-tight">
                Listening Questions
              </h3>
              <div className="mt-4 space-y-5">
                {LISTENING_EXERCISE.questions.map((q, qIdx) => {
                  const chosen = listeningAnswers[q.id];
                  return (
                    <div key={q.id} className="space-y-2">
                      <p className="text-xs font-medium">
                        {qIdx + 1}. {q.prompt}
                      </p>
                      <div className="space-y-1.5">
                        {q.options.map((opt, optIdx) => {
                          const picked = chosen === optIdx;
                          const isRight = q.answer === optIdx;
                          let style = "";
                          if (listeningSubmitted && isRight) {
                            style = isDark
                              ? "border-white bg-white text-black font-medium"
                              : "border-black bg-black text-white font-medium";
                          } else if (picked) {
                            style = isDark
                              ? "border-white bg-white/[0.08]"
                              : "border-black bg-black/[0.05]";
                          }
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => {
                                setListeningSubmitted(false);
                                setListeningAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: optIdx,
                                }));
                              }}
                              className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                                isDark
                                  ? "border-white/15 hover:border-white/30"
                                  : "border-black/15 hover:border-black/30"
                              } ${style}`}
                            >
                              <span>{opt}</span>
                              {listeningSubmitted && isRight && (
                                <Check className="h-3.5 w-3.5 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setListeningSubmitted(true);
                    gradeQuiz(
                      LISTENING_EXERCISE.questions,
                      listeningAnswers,
                      "Listening"
                    );
                  }}
                  className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors ${primaryBtn}`}
                >
                  Submit Listening
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setListeningAnswers({});
                    setListeningSubmitted(false);
                  }}
                  className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors ${secondaryBtn}`}
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SPEAKING TAB */}
        {activeTab === "speaking" && (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className={`rounded-lg border p-5 lg:col-span-5 ${surfaceBg}`}>
              <div className="flex items-center justify-between">
                <span className={`font-mono text-[11px] ${mutedText}`}>
                  {currentSpeaking.level}
                </span>
                <div className="flex items-center gap-1">
                  {SPEAKING_PROMPTS.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSpeakingIndex(idx);
                        setShowSample(false);
                      }}
                      className={`h-6 w-6 rounded border font-mono text-[11px] ${
                        speakingIndex === idx
                          ? isDark
                            ? "border-white bg-white text-black font-semibold"
                            : "border-black bg-black text-white font-semibold"
                          : secondaryBtn
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              <h2 className="mt-3 text-base font-semibold tracking-tight">
                {currentSpeaking.topic}
              </h2>

              <ul className="mt-3 space-y-1.5 text-xs">
                {currentSpeaking.points.map((pt, i) => (
                  <li key={i} className={`flex items-start gap-2 ${mutedText}`}>
                    <span className="font-mono">0{i + 1}</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowSample((s) => !s)}
                  className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition-colors ${secondaryBtn}`}
                >
                  {showSample ? "Hide Model Response" : "View Model Response"}
                </button>
              </div>

              {showSample && (
                <div
                  className={`mt-3 rounded-md border p-3 text-xs leading-relaxed ${subtleBg}`}
                >
                  {currentSpeaking.sample}
                </div>
              )}
            </div>

            <div className={`rounded-lg border p-5 lg:col-span-7 ${surfaceBg}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-tight">
                  Draft Your Spoken Response
                </h3>
                <span className={`font-mono text-[11px] ${mutedText}`}>
                  {speakingNotes.trim()
                    ? speakingNotes.trim().split(/\s+/).length
                    : 0}{" "}
                  words
                </span>
              </div>

              <textarea
                rows={7}
                value={speakingNotes}
                onChange={(e) => setSpeakingNotes(e.target.value)}
                placeholder="Write key points or practice your response here..."
                className={`mt-3 w-full rounded-md border p-3 text-xs leading-relaxed outline-none transition-colors ${
                  isDark
                    ? "border-white/15 bg-[#000000] text-white placeholder-[#555555] focus:border-white"
                    : "border-black/15 bg-[#ffffff] text-black placeholder-[#999999] focus:border-black"
                }`}
              />

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!speakingNotes.trim()) {
                      notify.error("Write a draft response first.", {
                        title: "Speaking",
                      });
                      return;
                    }
                    const words = speakingNotes.trim().split(/\s+/).length;
                    notify.success(`Saved speaking draft (${words} words).`, {
                      title: "Speaking",
                    });
                  }}
                  className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors ${primaryBtn}`}
                >
                  Save Draft
                </button>

                <button
                  type="button"
                  onClick={() => setSpeakingNotes("")}
                  className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors ${secondaryBtn}`}
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Clear</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VOCAB GAME TAB */}
        {activeTab === "game" && (
          <div className={`mx-auto max-w-xl rounded-lg border p-6 ${surfaceBg}`}>
            <div className="flex items-center justify-between border-b pb-3 border-inherit">
              <span className={`font-mono text-[11px] ${mutedText}`}>
                ROUND {Math.min(gameIndex + 1, GAME_ROUNDS.length)}/
                {GAME_ROUNDS.length}
              </span>
              <span className="font-mono text-xs font-semibold">
                SCORE: {gameScore}
              </span>
            </div>

            {!gameFinished ? (
              <div className="mt-5">
                <p className={`text-xs ${mutedText}`}>Definition</p>
                <h2 className="mt-1 text-base font-semibold tracking-tight">
                  “{currentRound.clue}”
                </h2>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {currentRound.choices.map((choice, idx) => {
                    const isPicked = gameSelected === idx;
                    const isCorrect = currentRound.answer === idx;

                    let btnStyle = secondaryBtn;
                    if (gameSelected !== null) {
                      if (isCorrect) {
                        btnStyle = isDark
                          ? "border-white bg-white text-black font-semibold"
                          : "border-black bg-black text-white font-semibold";
                      } else if (isPicked) {
                        btnStyle = isDark
                          ? "border-white/40 bg-white/10 text-[#999999]"
                          : "border-black/40 bg-black/5 text-[#666666]";
                      }
                    }

                    return (
                      <button
                        key={choice}
                        type="button"
                        disabled={gameSelected !== null}
                        onClick={() => handleGameChoice(idx)}
                        className={`flex h-9 items-center justify-between rounded-md border px-3 text-xs font-medium transition-colors ${btnStyle}`}
                      >
                        <span>{choice}</span>
                        {gameSelected !== null && isCorrect && (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {gameSelected !== null && (
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={handleNextGameRound}
                      className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors ${primaryBtn}`}
                    >
                      {gameIndex + 1 < GAME_ROUNDS.length
                        ? "Next Round"
                        : "Finish Round"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 text-center">
                <h2 className="text-lg font-semibold">Session Complete</h2>
                <p className={`mt-1 text-xs ${mutedText}`}>
                  You scored {gameScore} out of {GAME_ROUNDS.length}.
                </p>
                <button
                  type="button"
                  onClick={handleResetGame}
                  className={`mt-4 inline-flex h-8 items-center gap-1.5 rounded-md px-3.5 text-xs font-medium transition-colors ${primaryBtn}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Play Again</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
