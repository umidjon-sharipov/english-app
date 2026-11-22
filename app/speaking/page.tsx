"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNotification } from "@/components/notification-provider";
import { useTheme } from "@/components/theme-provider";

interface SpeakingAnalysis {
  overallScore: number;
  estimatedLevel: string;
  metrics: {
    fluency: number;
    vocabulary: number;
    grammar: number;
    pronunciation: number;
  };
  strengths: string[];
  improvements: string[];
  nativePhrasing: string;
  summary: string;
}

const READ_ALOUD_CARDS = [
  {
    title: "Technology & Innovation",
    level: "B2",
    text: "Artificial intelligence is rapidly reshaping contemporary industry by automating repetitive routines and empowering human specialists to focus on strategic creativity.",
  },
  {
    title: "Environmental Sustainability",
    level: "C1",
    text: "Mitigating catastrophic climate degradation necessitates unprecedented collaboration across international governance, renewable infrastructure, and grassroots civic engagement.",
  },
  {
    title: "Daily Habit & Productivity",
    level: "B1",
    text: "Establishing a consistent morning routine with dedicated time for focused reading and exercise significantly elevates daily mental sharpness and emotional resilience.",
  },
  {
    title: "Travel & Cultural Exchange",
    level: "A2",
    text: "Traveling to unfamiliar destinations enables adventurous individuals to discover traditional cuisine, interact with hospitable locals, and develop broader worldviews.",
  },
];

const TOPIC_QUESTIONS = [
  {
    topic: "Career Aspirations & Education",
    cue: "Describe your ideal career path. Explain what specialized skills you need to cultivate and why this profession aligns with your personal values.",
  },
  {
    topic: "Modern Urban Architecture",
    cue: "Talk about a memorable building or city you have visited. Detail its architectural style, the atmosphere of the surrounding area, and how it impacted you.",
  },
  {
    topic: "Language Acquisition Strategies",
    cue: "Explain the most effective techniques you employ when mastering foreign vocabulary and pronunciation. What common obstacles do you encounter?",
  },
];

export default function SpeakingStudioPage() {
  const notify = useNotification();
  const themeCtx = useTheme();
  const isLight = themeCtx.theme === "light";

  const [mode, setMode] = useState<"read" | "topic" | "free">("read");
  const [selectedReadIndex, setSelectedReadIndex] = useState(0);
  const [selectedTopicIndex, setSelectedTopicIndex] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SpeakingAnalysis | null>(null);

  const recognitionRef = useRef<any>(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setSpeechSupported(false);
      }
    }
  }, []);

  function handlePlayText(textToPlay: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      notify.show("Karnay funksiyasi brauzeringizda qo'llab-quvvatlanmaydi.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToPlay);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    notify.show("Inglizcha talaffuz ijro etilmoqda...", "info");
  }

  function handleStartRecording() {
    if (!speechSupported) {
      notify.show("Brauzeringizda SpeechRecognition qo'llab-quvvatlanmaydi. Chrome/Edge tavsiya etiladi.");
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let fullText = "";
      for (let i = 0; i < event.results.length; i++) {
        fullText += event.results[i][0].transcript + " ";
      }
      setTranscript(fullText.trim());
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        notify.show("Mikrofonga ruxsat berilmagan. Iltimos, brauzerda ruxsat bering.");
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
      setTranscript("");
      setAnalysis(null);
      notify.show("Mikrofon yondi, inglizcha gapiring...", "info");
    } catch {
      notify.show("Mikrofonni ishga tushirishda xatolik.");
    }
  }

  function handleStopRecording() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      notify.show("Ovoz yozish to'xtatildi.", "info");
    }
  }

  async function handleAnalyze() {
    if (!transcript.trim()) {
      notify.show("Iltimos, avval mikrofonga gapiring yoki matn kiriting.");
      return;
    }

    setAnalyzing(true);
    try {
      const activeTarget =
        mode === "read"
          ? READ_ALOUD_CARDS[selectedReadIndex].text
          : mode === "topic"
          ? TOPIC_QUESTIONS[selectedTopicIndex].cue
          : "";

      const activeTopic =
        mode === "read"
          ? READ_ALOUD_CARDS[selectedReadIndex].title
          : mode === "topic"
          ? TOPIC_QUESTIONS[selectedTopicIndex].topic
          : "Free Speaking";

      const activeLevel =
        mode === "read" ? READ_ALOUD_CARDS[selectedReadIndex].level : "B2";

      const res = await fetch("/api/speaking/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          topic: activeTopic,
          level: activeLevel,
          targetText: activeTarget,
          transcript,
        }),
      });

      const data = await res.json();
      if (res.ok && data.analysis) {
        setAnalysis(data.analysis);
        notify.show(
          `AI Tahlili yakunlandi! Natija: ${data.analysis.overallScore}% (${data.analysis.estimatedLevel})`,
          "success"
        );
      } else {
        notify.show(data.error || "Tahlil qilishda xatolik yuz berdi.");
      }
    } catch {
      notify.show("Tarmoq xatoligi yuz berdi.");
    } finally {
      setAnalyzing(false);
    }
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
              AI Speaking Lab
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

        {/* Title Card */}
        <div
          className={`rounded-2xl border p-6 ${
            isLight ? "bg-white border-stone-200" : "bg-neutral-900/80 border-neutral-800"
          }`}
        >
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Speaking Studio</h1>
          <p className="text-xs md:text-sm opacity-75 mt-1 leading-relaxed">
            Qurilmangiz mikrofonidan foydalanib nutqingizni yozib oling. Sun&apos;iy intellekt talaffuz, ravonlik va CEFR darajangizni bir zumda baholaydi.
          </p>

          {/* Mode Selector */}
          <div className="grid grid-cols-3 gap-2 mt-5">
            <button
              type="button"
              onClick={() => {
                setMode("read");
                setAnalysis(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                mode === "read"
                  ? isLight
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white text-neutral-950 border-white"
                  : "border-neutral-800 opacity-70 hover:opacity-100"
              }`}
            >
              Read Aloud (O&apos;qish)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("topic");
                setAnalysis(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                mode === "topic"
                  ? isLight
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white text-neutral-950 border-white"
                  : "border-neutral-800 opacity-70 hover:opacity-100"
              }`}
            >
              Topic Cue Card
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("free");
                setAnalysis(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                mode === "free"
                  ? isLight
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white text-neutral-950 border-white"
                  : "border-neutral-800 opacity-70 hover:opacity-100"
              }`}
            >
              Free Speaking
            </button>
          </div>
        </div>

        {/* Task Prompt Area */}
        <div
          className={`rounded-2xl border p-6 space-y-4 ${
            isLight ? "bg-white border-stone-200" : "bg-neutral-900/80 border-neutral-800"
          }`}
        >
          {mode === "read" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                  Topshiriq: Ovoz chiqarib ravon o&apos;qing
                </span>
                <div className="flex items-center gap-1.5">
                  {READ_ALOUD_CARDS.map((c, i) => (
                    <button
                      key={c.title}
                      type="button"
                      onClick={() => setSelectedReadIndex(i)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        selectedReadIndex === i
                          ? "bg-neutral-800 text-white border-neutral-600"
                          : "border-neutral-800 opacity-50"
                      }`}
                    >
                      {c.level}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`p-4 rounded-xl border text-sm md:text-base leading-relaxed ${
                  isLight
                    ? "bg-stone-50 border-stone-300 text-neutral-900"
                    : "bg-neutral-950 border-neutral-800 text-neutral-100"
                }`}
              >
                &ldquo;{READ_ALOUD_CARDS[selectedReadIndex].text}&rdquo;
              </div>

              <button
                type="button"
                onClick={() => handlePlayText(READ_ALOUD_CARDS[selectedReadIndex].text)}
                className="text-xs flex items-center gap-1.5 opacity-80 hover:opacity-100 font-medium cursor-pointer"
              >
                🔊 To&apos;g&apos;ri US talaffuzni eshitish
              </button>
            </div>
          )}

          {mode === "topic" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                  IELTS Speaking Part 2 · Cue Card
                </span>
                <div className="flex items-center gap-1.5">
                  {TOPIC_QUESTIONS.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedTopicIndex(i)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        selectedTopicIndex === i
                          ? "bg-neutral-800 text-white border-neutral-600"
                          : "border-neutral-800 opacity-50"
                      }`}
                    >
                      Card #{i + 1}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`p-4 rounded-xl border space-y-2 ${
                  isLight
                    ? "bg-stone-50 border-stone-300 text-neutral-900"
                    : "bg-neutral-950 border-neutral-800 text-neutral-100"
                }`}
              >
                <p className="font-bold text-sm">
                  {TOPIC_QUESTIONS[selectedTopicIndex].topic}
                </p>
                <p className="text-xs md:text-sm opacity-85 leading-relaxed">
                  {TOPIC_QUESTIONS[selectedTopicIndex].cue}
                </p>
              </div>
            </div>
          )}

          {mode === "free" && (
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                Erkin mavzuda nutq
              </span>
              <p className="text-xs opacity-75">
                O&apos;zingiz xohlagan mavzuda inglizcha 30-60 soniya gapiring. AI sizning leksik va grammatik darajangizni aniqlab beradi.
              </p>
            </div>
          )}

          {/* Interactive Microphone & Waveform Area */}
          <div className="pt-4 border-t border-neutral-800 flex flex-col items-center justify-center space-y-4">
            <div className="flex items-center justify-center gap-4">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={handleStartRecording}
                  className="px-6 py-3 rounded-full font-bold text-xs md:text-sm bg-rose-600 hover:bg-rose-500 text-white shadow-lg flex items-center gap-2 cursor-pointer transition transform hover:scale-105"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                  Yozishni boshlash (Mikrofon)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="px-6 py-3 rounded-full font-bold text-xs md:text-sm bg-neutral-100 text-neutral-950 border border-neutral-300 shadow flex items-center gap-2 cursor-pointer transition"
                >
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-600" />
                  To&apos;xtatish
                </button>
              )}
            </div>

            {/* Subtle Sound Waves when recording */}
            {isRecording && (
              <div className="flex items-center justify-center gap-1.5 h-8">
                <span className="w-1 bg-rose-500 rounded-full animate-wave-1" />
                <span className="w-1 bg-rose-500 rounded-full animate-wave-2" />
                <span className="w-1 bg-rose-500 rounded-full animate-wave-3" />
                <span className="w-1 bg-rose-500 rounded-full animate-wave-4" />
                <span className="w-1 bg-rose-500 rounded-full animate-wave-5" />
                <span className="text-xs text-rose-400 font-medium ml-2">Tinglanmoqda...</span>
              </div>
            )}

            {/* Transcript Preview & Manual Edit */}
            <div className="w-full space-y-1">
              <label className="block text-[11px] opacity-75">
                Yozilgan nutq transkripsiyasi (kerak bo&apos;lsa tahrirlashingiz mumkin):
              </label>
              <textarea
                rows={3}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Mikrofonga gapirganingizda matn shu yerda real-vaqtda paydo bo'ladi..."
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-xs md:text-sm text-neutral-100 focus:outline-none focus:border-neutral-400"
              />
            </div>

            <div className="w-full flex justify-end">
              <button
                type="button"
                disabled={analyzing || !transcript.trim()}
                onClick={handleAnalyze}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-white text-neutral-950 hover:bg-neutral-200 cursor-pointer disabled:opacity-40 transition"
              >
                {analyzing ? "AI tahlil qilmoqda..." : "AI Tahlilini Olish →"}
              </button>
            </div>
          </div>
        </div>

        {/* AI Analysis Result Display */}
        {analysis && (
          <div
            className={`rounded-2xl border p-6 space-y-6 ${
              isLight ? "bg-white border-stone-200" : "bg-neutral-900/90 border-neutral-800"
            }`}
          >
            {/* Top Score Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold opacity-70">
                  Umumiy Baholash
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold">{analysis.overallScore}%</span>
                  <span className="text-sm px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                    CEFR: {analysis.estimatedLevel}
                  </span>
                </div>
              </div>
              <p className="text-xs opacity-75 max-w-sm text-right leading-relaxed">
                {analysis.summary}
              </p>
            </div>

            {/* 4 Core Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60">
                <span className="text-[11px] opacity-70 block">Fluency</span>
                <span className="text-lg font-bold">{analysis.metrics.fluency}%</span>
              </div>
              <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60">
                <span className="text-[11px] opacity-70 block">Vocabulary</span>
                <span className="text-lg font-bold">{analysis.metrics.vocabulary}%</span>
              </div>
              <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60">
                <span className="text-[11px] opacity-70 block">Grammar</span>
                <span className="text-lg font-bold">{analysis.metrics.grammar}%</span>
              </div>
              <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60">
                <span className="text-[11px] opacity-70 block">Pronunciation</span>
                <span className="text-lg font-bold">{analysis.metrics.pronunciation}%</span>
              </div>
            </div>

            {/* Strengths & Improvements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/15 space-y-2">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  ✓ Kuchli tomonlaringiz
                </p>
                <ul className="text-xs space-y-1.5 list-disc list-inside text-neutral-300">
                  {analysis.strengths.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/15 space-y-2">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  ⚡ Yaxshilash bo&apos;yicha tavsiyalar
                </p>
                <ul className="text-xs space-y-1.5 list-disc list-inside text-neutral-300">
                  {analysis.improvements.map((im, idx) => (
                    <li key={idx}>{im}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Native Phrasing Recommendation */}
            {analysis.nativePhrasing && (
              <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    💡 Native Speaker jumlasi (Qanday chiroyliroq aytish mumkin):
                  </p>
                  <button
                    type="button"
                    onClick={() => handlePlayText(analysis.nativePhrasing)}
                    className="text-xs text-neutral-400 hover:text-white cursor-pointer"
                  >
                    🔊 Tinglash
                  </button>
                </div>
                <p className="text-xs md:text-sm italic opacity-90 leading-relaxed text-indigo-300">
                  &ldquo;{analysis.nativePhrasing}&rdquo;
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
