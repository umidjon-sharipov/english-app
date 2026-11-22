"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useNotification } from "@/components/notification-provider";
import { useTheme } from "@/components/theme-provider";
import { VocabularyWord } from "@/app/api/vocabulary/route";

export default function VocabularyStudioPage() {
  const notify = useNotification();
  const themeCtx = useTheme();
  const isLight = themeCtx.theme === "light";

  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("ALL");

  // Flip card tracking: record of wordId -> isFlipped
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});

  // Memorization tracking: wordId -> "learning" | "mastered" | "hard"
  const [learningStatus, setLearningStatus] = useState<Record<string, "learning" | "mastered" | "hard">>({});

  // AI Look-up state
  const [aiWordQuery, setAiWordQuery] = useState("");
  const [aiLookingUp, setAiLookingUp] = useState(false);

  useEffect(() => {
    async function fetchWords() {
      try {
        setLoading(true);
        const q = new URLSearchParams({ q: search, level: levelFilter });
        const res = await fetch(`/api/vocabulary?${q.toString()}`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.words)) {
          setWords(data.words);
        } else {
          notify.show(data.error || "Lug'atni yuklab bo'lmadi.");
        }
      } catch {
        notify.show("Tarmoq xatoligi yuz berdi.");
      } finally {
        setLoading(false);
      }
    }

    const timer = setTimeout(fetchWords, 300);
    return () => clearTimeout(timer);
  }, [search, levelFilter, notify]);

  function handlePlayPronunciation(e: React.MouseEvent, word: string) {
    e.stopPropagation();
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      notify.show("Audio talaffuz brauzeringizda qo'llab-quvvatlanmaydi.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function toggleFlip(wordId: string) {
    setFlippedCards((prev) => ({ ...prev, [wordId]: !prev[wordId] }));
  }

  function handleSetStatus(e: React.MouseEvent, wordId: string, status: "learning" | "mastered" | "hard") {
    e.stopPropagation();
    setLearningStatus((prev) => ({ ...prev, [wordId]: status }));
    const msg =
      status === "mastered"
        ? "So'z 'Yodlangan' deb belgilandi ✓"
        : status === "hard"
        ? "So'z 'Qiyin' ro'yxatiga qo'shildi ⚡"
        : "So'z 'O'rganilmoqda' holatiga o'tkazildi ↻";
    notify.show(msg, "info");
  }

  async function handleAiLookup(e: React.FormEvent) {
    e.preventDefault();
    const clean = aiWordQuery.trim();
    if (!clean) return;

    setAiLookingUp(true);
    try {
      const res = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: clean }),
      });
      const data = await res.json();
      if (res.ok && data.entry) {
        setWords((prev) => [data.entry, ...prev.filter((w) => w.word.toLowerCase() !== clean.toLowerCase())]);
        setAiWordQuery("");
        notify.show(`'${data.entry.word}' so'zi AI tomonidan tahlil qilindi va lug'atga qo'shildi!`, "success");
      } else {
        notify.show(data.error || "So'zni tahlil qilib bo'lmadi.");
      }
    } catch {
      notify.show("Tarmoq xatoligi yuz berdi.");
    } finally {
      setAiLookingUp(false);
    }
  }

  return (
    <main
      className={`min-h-screen p-5 md:p-8 transition-colors ${
        isLight ? "bg-stone-100 text-neutral-900" : "bg-neutral-950 text-neutral-100"
      }`}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-xs underline opacity-80 hover:opacity-100" href="/">
            ← Bosh sahifaga qaytish
          </Link>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold border border-neutral-700 bg-neutral-900/60 text-neutral-200">
              Vocabulary Studio
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

        {/* Studio Hero Card */}
        <div
          className={`rounded-2xl border p-6 ${
            isLight ? "bg-white border-stone-200" : "bg-neutral-900/80 border-neutral-800"
          }`}
        >
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Vocabulary Flashcards & Lexicon</h1>
          <p className="text-xs md:text-sm opacity-75 mt-1 leading-relaxed">
            CEFR darajalari bo&apos;yicha professional so&apos;zlar, audio talaffuz va 3D Flip Card xotira mashqlari. Xohlagan so&apos;zingizni kiritib, sun&apos;iy intellekt orqali to&apos;liq lug&apos;at maqolasini oling.
          </p>

          {/* AI Instant Look-up Input */}
          <form onSubmit={handleAiLookup} className="mt-5 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={aiWordQuery}
              onChange={(e) => setAiWordQuery(e.target.value)}
              placeholder="Istalgan yangi so'zni kiriting (masalan: serendipity, quintessential)..."
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-xs text-neutral-100 focus:outline-none focus:border-neutral-400"
            />
            <button
              type="submit"
              disabled={aiLookingUp || !aiWordQuery.trim()}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white text-neutral-950 hover:bg-neutral-200 cursor-pointer disabled:opacity-40 transition shadow"
            >
              {aiLookingUp ? "AI tahlil qilmoqda..." : "+ AI Lug'atga Qo'shish"}
            </button>
          </form>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {["ALL", "A1", "A2", "B1", "B2", "C1", "C2"].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  levelFilter === lvl
                    ? isLight
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white text-neutral-950 border-white"
                    : "border-neutral-800 opacity-60 hover:opacity-100"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Lug'atdan qidirish..."
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        {/* Flashcards Grid with 3D Flip */}
        {loading ? (
          <p className="text-sm opacity-75">So&apos;zlar yuklanmoqda...</p>
        ) : words.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 p-8 text-center text-xs opacity-70">
            Hech qanday so&apos;z topilmadi. Yuqoridagi maydondan yangi so&apos;z kiritib AI orqali qo&apos;shishingiz mumkin.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {words.map((item) => {
              const isFlipped = Boolean(flippedCards[item.id]);
              const st = learningStatus[item.id] || "learning";

              return (
                <div
                  key={item.id}
                  onClick={() => toggleFlip(item.id)}
                  className="h-64 cursor-pointer perspective-1000 group"
                >
                  <div
                    className={`relative w-full h-full duration-500 transform-style-preserve-3d transition-transform ${
                      isFlipped ? "rotate-y-180" : ""
                    }`}
                  >
                    {/* Front Side */}
                    <div
                      className={`absolute inset-0 w-full h-full rounded-2xl border p-5 flex flex-col justify-between backface-hidden ${
                        isLight
                          ? "bg-white border-stone-200 text-neutral-900 shadow-sm"
                          : "bg-neutral-900/90 border-neutral-800 text-neutral-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-neutral-700 bg-neutral-800 text-neutral-300">
                          {item.level} · {item.partOfSpeech}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handlePlayPronunciation(e, item.word)}
                          className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center text-xs"
                          title="Talaffuzni tinglash"
                        >
                          🔊
                        </button>
                      </div>

                      <div className="text-center space-y-1">
                        <h2 className="text-2xl font-extrabold tracking-tight">{item.word}</h2>
                        <p className="text-xs opacity-60 font-mono">{item.phonetic}</p>
                      </div>

                      <div className="flex items-center justify-between text-[11px] opacity-60 pt-2 border-t border-neutral-800">
                        <span>Aylantirish uchun bosing ↻</span>
                        <span className="capitalize">{st}</span>
                      </div>
                    </div>

                    {/* Back Side (Flipped) */}
                    <div
                      className={`absolute inset-0 w-full h-full rounded-2xl border p-5 flex flex-col justify-between rotate-y-180 backface-hidden overflow-y-auto ${
                        isLight
                          ? "bg-stone-50 border-stone-300 text-neutral-900 shadow-sm"
                          : "bg-neutral-950 border-neutral-800 text-neutral-100"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-indigo-400">{item.word}</span>
                          <span className="text-[10px] opacity-60">Ma&apos;no &amp; Misol</span>
                        </div>
                        <p className="text-xs font-semibold leading-snug">{item.meaningUz}</p>
                        <p className="text-[11px] opacity-75 italic leading-snug">{item.meaningEn}</p>

                        {item.examples?.[0] && (
                          <p className="text-[11px] text-neutral-400 pt-1 border-t border-neutral-800">
                            &ldquo;{item.examples[0]}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Memorization Status Selector */}
                      <div className="flex items-center justify-between pt-2 border-t border-neutral-800 gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={(e) => handleSetStatus(e, item.id, "learning")}
                          className={`px-2 py-1 rounded border transition ${
                            st === "learning" ? "bg-indigo-600 text-white border-indigo-500" : "border-neutral-800 opacity-60"
                          }`}
                        >
                          O&apos;rganish
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleSetStatus(e, item.id, "hard")}
                          className={`px-2 py-1 rounded border transition ${
                            st === "hard" ? "bg-amber-600 text-white border-amber-500" : "border-neutral-800 opacity-60"
                          }`}
                        >
                          Qiyin
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleSetStatus(e, item.id, "mastered")}
                          className={`px-2 py-1 rounded border transition ${
                            st === "mastered" ? "bg-emerald-600 text-white border-emerald-500" : "border-neutral-800 opacity-60"
                          }`}
                        >
                          Yodlandi ✓
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
