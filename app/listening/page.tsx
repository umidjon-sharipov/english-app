"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useNotification } from "@/components/notification-provider";
import { useTheme } from "@/components/theme-provider";

interface ListeningQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface ListeningItem {
  id: string;
  title: string;
  level: string;
  category: "dialogue" | "lecture" | "story";
  audioText: string;
  transcript: string;
  questions: ListeningQuestion[];
  dictationSentences: string[];
}

export default function ListeningStudioPage() {
  const notify = useNotification();
  const themeCtx = useTheme();
  const isLight = themeCtx.theme === "light";

  const [items, setItems] = useState<ListeningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1.0);
  const [showTranscript, setShowTranscript] = useState(false);

  // Tab mode: "quiz" or "dictation"
  const [activeTab, setActiveTab] = useState<"quiz" | "dictation">("quiz");

  // Quiz state
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Dictation state
  const [dictationIndex, setDictationIndex] = useState(0);
  const [userInputDictation, setUserInputDictation] = useState("");
  const [dictationScore, setDictationScore] = useState<{
    accuracy: number;
    correctWords: number;
    totalWords: number;
    comparison: Array<{ word: string; status: "correct" | "missing" | "extra" }>;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch("/api/listening");
        const data = await res.json();
        if (res.ok && Array.isArray(data.items)) {
          setItems(data.items);
        } else {
          notify.show(data.error || "Materiallarni yuklab bo'lmadi.");
        }
      } catch {
        notify.show("Tarmoq xatoligi yuz berdi.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [notify]);

  const activeItem = items[selectedItemIndex];

  function handlePlayAudio(textToSpeak: string, customRate?: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      notify.show("Audio brauzeringizda qo'llab-quvvatlanmaydi.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = "en-US";
    utterance.rate = customRate || speed;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    window.speechSynthesis.speak(utterance);
  }

  function handleStopAudio() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    }
  }

  function handleCheckDictation() {
    if (!activeItem) return;
    const target = activeItem.dictationSentences[dictationIndex] || "";
    if (!userInputDictation.trim()) {
      notify.show("Iltimos, avval eshitgan jumlani yozing.");
      return;
    }

    const cleanWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetWords = target.split(/\s+/).filter(Boolean);
    const userWords = userInputDictation.split(/\s+/).filter(Boolean);

    let matchCount = 0;
    const comparison: Array<{ word: string; status: "correct" | "missing" | "extra" }> = [];

    targetWords.forEach((tw, idx) => {
      const uw = userWords[idx];
      if (uw && cleanWord(tw) === cleanWord(uw)) {
        matchCount++;
        comparison.push({ word: tw, status: "correct" });
      } else {
        comparison.push({ word: tw, status: "missing" });
      }
    });

    const accuracy = Math.round((matchCount / Math.max(1, targetWords.length)) * 100);
    setDictationScore({
      accuracy,
      correctWords: matchCount,
      totalWords: targetWords.length,
      comparison,
    });
    notify.show(`Aniqlik ko'rsatkichi: ${accuracy}%`, accuracy >= 80 ? "success" : "info");
  }

  return (
    <main
      className={`min-h-screen p-5 md:p-8 transition-colors ${
        isLight ? "bg-stone-100 text-neutral-900" : "bg-neutral-950 text-neutral-100"
      }`}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-xs underline opacity-80 hover:opacity-100" href="/">
            ← Bosh sahifaga qaytish
          </Link>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold border border-neutral-700 bg-neutral-900/60 text-neutral-200">
              Listening Studio
            </span>
            <button
              type="button"
              onClick={() => themeCtx.setTheme(isLight ? "dark" : "light")}
              className="px-3 py-1 rounded-xl text-xs font-medium border border-neutral-700 cursor-pointer"
            >
              Theme: {themeCtx.theme.toUpperCase()}
            </button>
          </div>
        </div>

        {/* Studio Banner */}
        <div
          className={`rounded-2xl border p-6 ${
            isLight ? "bg-white border-stone-200" : "bg-neutral-900/80 border-neutral-800"
          }`}
        >
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Listening Studio</h1>
          <p className="text-xs md:text-sm opacity-75 mt-1 leading-relaxed">
            Qurilma ovoz tizimi orqali ingliz tilidagi tabiiy nutqni tinglang, tezlikni boshqaring va tushunish darajangizni interaktiv testlar hamda diktantlar orqali sinab ko&apos;ring.
          </p>

          {/* Lesson selector chips */}
          <div className="flex flex-wrap gap-2 mt-4">
            {items.map((it, idx) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  handleStopAudio();
                  setSelectedItemIndex(idx);
                  setQuizSubmitted(false);
                  setQuizAnswers({});
                  setDictationIndex(0);
                  setDictationScore(null);
                  setUserInputDictation("");
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  selectedItemIndex === idx
                    ? isLight
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white text-neutral-950 border-white"
                    : "border-neutral-800 opacity-60 hover:opacity-100"
                }`}
              >
                {it.level} · {it.title}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm opacity-75">Materiallar yuklanmoqda...</p>
        ) : !activeItem ? (
          <p className="text-sm opacity-75">Listening materiallari mavjud emas.</p>
        ) : (
          <div className="space-y-6">
            {/* Audio Controller Card */}
            <div
              className={`rounded-2xl border p-6 space-y-4 ${
                isLight ? "bg-white border-stone-200" : "bg-neutral-900/80 border-neutral-800"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{activeItem.title}</h2>
                  <p className="text-xs opacity-75 mt-0.5">
                    Daraja: <b className="text-indigo-400">{activeItem.level}</b> · Janr: {activeItem.category}
                  </p>
                </div>

                {/* Speed Controls */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] opacity-70 mr-1">Tezlik:</span>
                  {[0.75, 1.0, 1.25].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      className={`px-2 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        speed === s
                          ? "bg-neutral-800 text-white border-neutral-600"
                          : "border-neutral-800 opacity-60"
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio Playback Controls */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {!isPlaying ? (
                  <button
                    type="button"
                    onClick={() => handlePlayAudio(activeItem.audioText)}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs bg-white text-neutral-950 hover:bg-neutral-200 flex items-center gap-2 cursor-pointer shadow transition"
                  >
                    ▶ Tinglashni boshlash
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopAudio}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs bg-rose-600 text-white flex items-center gap-2 cursor-pointer transition"
                  >
                    ⏹ To&apos;xtatish
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowTranscript((s) => !s)}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium border border-neutral-700 opacity-80 hover:opacity-100 cursor-pointer"
                >
                  {showTranscript ? "Matnni yashirish (Hide)" : "Transkriptni ko'rish (Show)"}
                </button>

                {isPlaying && (
                  <div className="flex items-center gap-1 h-6 ml-2">
                    <span className="w-1 bg-indigo-400 rounded-full animate-wave-1" />
                    <span className="w-1 bg-indigo-400 rounded-full animate-wave-2" />
                    <span className="w-1 bg-indigo-400 rounded-full animate-wave-3" />
                    <span className="w-1 bg-indigo-400 rounded-full animate-wave-4" />
                    <span className="text-xs text-indigo-400 ml-1.5 font-medium">Ovoz yangramoqda...</span>
                  </div>
                )}
              </div>

              {/* Collapsible Transcript */}
              {showTranscript && (
                <div
                  className={`p-4 rounded-xl border text-xs md:text-sm leading-relaxed ${
                    isLight
                      ? "bg-stone-50 border-stone-200 text-neutral-800"
                      : "bg-neutral-950 border-neutral-800 text-neutral-200"
                  }`}
                >
                  <p className="font-semibold text-xs mb-1 opacity-75 uppercase">Transkript:</p>
                  {activeItem.transcript}
                </div>
              )}
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex border-b border-neutral-800 gap-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("quiz")}
                className={`pb-2.5 transition border-b-2 cursor-pointer ${
                  activeTab === "quiz"
                    ? "border-white text-white"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                1. Comprehension Savollari ({activeItem.questions.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("dictation")}
                className={`pb-2.5 transition border-b-2 cursor-pointer ${
                  activeTab === "dictation"
                    ? "border-white text-white"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                2. Diktant (Eshitib yozish) ({activeItem.dictationSentences.length})
              </button>
            </div>

            {/* Tab 1: Comprehension Quiz */}
            {activeTab === "quiz" && (
              <div className="space-y-4">
                {activeItem.questions.map((q, qIdx) => {
                  const chosen = quizAnswers[qIdx];
                  const isRight = chosen === q.correctIndex;

                  return (
                    <div
                      key={q.id}
                      className={`rounded-2xl border p-5 space-y-3 ${
                        isLight
                          ? "bg-white border-stone-200"
                          : "bg-neutral-900/80 border-neutral-800"
                      }`}
                    >
                      <p className="text-xs md:text-sm font-semibold">
                        {qIdx + 1}. {q.question}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, oIdx) => {
                          const isSelected = chosen === oIdx;
                          let cls = isLight
                            ? "border-stone-200 hover:border-stone-400"
                            : "border-neutral-800 hover:border-neutral-600";

                          if (quizSubmitted) {
                            if (q.correctIndex === oIdx) {
                              cls = "border-emerald-500 bg-emerald-500/20 text-emerald-300 font-semibold";
                            } else if (isSelected) {
                              cls = "border-rose-500 bg-rose-500/20 text-rose-300 font-semibold";
                            }
                          } else if (isSelected) {
                            cls = isLight
                              ? "bg-neutral-900 text-white font-semibold"
                              : "bg-white text-neutral-950 font-semibold";
                          }

                          return (
                            <button
                              key={oIdx}
                              type="button"
                              disabled={quizSubmitted}
                              onClick={() =>
                                setQuizAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))
                              }
                              className={`text-left rounded-xl border p-2.5 text-xs transition cursor-pointer disabled:cursor-default ${cls}`}
                            >
                              {String.fromCharCode(65 + oIdx)}. {opt}
                            </button>
                          );
                        })}
                      </div>

                      {quizSubmitted && (
                        <div
                          className={`p-3 rounded-xl border text-xs space-y-1 ${
                            isRight
                              ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-200"
                              : "border-rose-500/40 bg-rose-950/20 text-rose-200"
                          }`}
                        >
                          <p className="font-bold">
                            {isRight ? "✓ To'g'ri javob" : "✕ Noto'g'ri javob"}
                          </p>
                          <p className="opacity-90">{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {!quizSubmitted && activeItem.questions.length > 0 && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setQuizSubmitted(true);
                        notify.show("Javoblaringiz tekshirildi!", "success");
                      }}
                      className="px-6 py-2.5 rounded-xl text-xs font-bold bg-white text-neutral-950 hover:bg-neutral-200 transition cursor-pointer"
                    >
                      Javoblarni tekshirish
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Interactive Dictation */}
            {activeTab === "dictation" && (
              <div
                className={`rounded-2xl border p-6 space-y-4 ${
                  isLight ? "bg-white border-stone-200" : "bg-neutral-900/80 border-neutral-800"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                    Diktant mashqi #{dictationIndex + 1} / {activeItem.dictationSentences.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {activeItem.dictationSentences.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setDictationIndex(idx);
                          setUserInputDictation("");
                          setDictationScore(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                          dictationIndex === idx
                            ? "bg-neutral-800 text-white border-neutral-600"
                            : "border-neutral-800 opacity-50"
                        }`}
                      >
                        Gap #{idx + 1}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-xs opacity-75">
                    Tugmani bosing va eshitgan jumlani diqqat bilan yozing:
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      handlePlayAudio(activeItem.dictationSentences[dictationIndex], 0.9)
                    }
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer flex items-center gap-1.5"
                  >
                    🔊 Jumlani tinglash
                  </button>
                </div>

                <div className="space-y-1">
                  <textarea
                    rows={2}
                    value={userInputDictation}
                    onChange={(e) => setUserInputDictation(e.target.value)}
                    placeholder="Eshitgan jumlani ingliz tilida so'zma-so'z kiriting..."
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-xs md:text-sm text-neutral-100 focus:outline-none focus:border-neutral-400"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCheckDictation}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white text-neutral-950 hover:bg-neutral-200 cursor-pointer transition"
                  >
                    Diktantni tekshirish →
                  </button>
                </div>

                {/* Dictation Score & Word Comparison */}
                {dictationScore && (
                  <div className="pt-4 border-t border-neutral-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">
                        Aniqlik darajasi: {dictationScore.accuracy}%
                      </span>
                      <span className="text-xs opacity-75">
                        {dictationScore.correctWords} / {dictationScore.totalWords} so&apos;z to&apos;g&apos;ri
                      </span>
                    </div>

                    <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-950 flex flex-wrap gap-2 text-xs md:text-sm">
                      {dictationScore.comparison.map((item, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-0.5 rounded font-medium ${
                            item.status === "correct"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-700/50"
                              : "bg-rose-950 text-rose-300 border border-rose-700/50 underline"
                          }`}
                        >
                          {item.word}
                        </span>
                      ))}
                    </div>

                    <p className="text-[11px] opacity-70">
                      Asl jumla: &ldquo;{activeItem.dictationSentences[dictationIndex]}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
