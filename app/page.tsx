"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { useNotification } from "@/components/notification-provider";

interface SessionUser {
  id: string;
  firstName: string;
  lastName?: string | null;
  userName: string;
  email?: string | null;
}

interface AiDiagnostic {
  estimatedLevel: string;
  overallIndex: number;
  competencies: {
    grammar: number;
    reading: number;
    vocabulary: number;
    speed: number;
  };
  strengths: string[];
  growthAreas: string[];
  roadmap: string[];
  motivationalQuote: string;
}

export default function HomePage() {
  const router = useRouter();
  const themeCtx = useTheme();
  const notify = useNotification();
  const isLight = themeCtx.theme === "light";

  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [year, setYear] = useState(0)
  useEffect(() => { setYear(new Date().getFullYear()); }, [])

  // AI Diagnostic
  const [diagnostic, setDiagnostic] = useState<AiDiagnostic | null>(null);
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false);

  useEffect(() => {
    async function loadMe() {
      try {
        setAuthLoading(true);
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
          }
        }
      } catch {
        // guest
      } finally {
        setAuthLoading(false);
      }
    }
    loadMe();
  }, []);

  async function handleFetchAiDiagnostic() {
    if (!user) {
      notify.show("AI tahlilini olish uchun avval tizimga kiring.");
      router.push("/auth");
      return;
    }
    setLoadingDiagnostic(true);
    try {
      const res = await fetch("/api/analytics/ai-report");
      const data = await res.json();
      if (res.ok && data.report) {
        setDiagnostic(data.report);
        notify.show(`AI diagnostikasi tayyor! CEFR: ${data.report.estimatedLevel}`, "success");
      } else {
        notify.show(data.error || "Tahlilni yuklab bo'lmadi.");
      }
    } catch {
      notify.show("Tarmoq xatoligi yuz berdi.");
    } finally {
      setLoadingDiagnostic(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      notify.show("Tizimdan chiqildi.");
      router.refresh();
    } catch {
      notify.show("Chiqishda xatolik.");
    }
  }

  const MODULES = [
    {
      title: "Tests Studio",
      path: "/tests",
      tag: "Grammar & CEFR",
      badge: "5–100 Qs",
      desc: "100% sun'iy intellekt tomonidan shakllantiriladigan grammatik va leksik imtihonlar. Vaqt, baholash va to'liq tahlil.",
      accent: "from-neutral-800 to-neutral-900",
      action: "Testlarga o'tish →",
    },
    {
      title: "Reading Studio",
      path: "/reading",
      tag: "Comprehension & IELTS",
      badge: "Academic",
      desc: "Cambridge va IELTS formatidagi akademik matnlar, ochiq va test savollari hamda AI individual baholashi.",
      accent: "from-neutral-800 to-neutral-900",
      action: "Reading Studio →",
    },
    {
      title: "Speaking Studio",
      path: "/speaking",
      tag: "Speech & Fluency",
      badge: "Microphone AI",
      desc: "Qurilma mikrofonidan foydalanib nutqingizni yozib oling. Talaffuz, grammatika va CEFR darajangizni aniqlang.",
      accent: "from-neutral-800 to-neutral-900",
      action: "Nutqni boshlash →",
    },
    {
      title: "Listening Studio",
      path: "/listening",
      tag: "Audio & Dictation",
      badge: "Speech Synthesis",
      desc: "Qurilma audio tizimi orqali inglizcha nutqni tinglang, tezlikni boshqaring va so'zma-so'z diktant yozing.",
      accent: "from-neutral-800 to-neutral-900",
      action: "Tinglashni boshlash →",
    },
    {
      title: "Vocabulary Studio",
      path: "/vocabulary",
      tag: "Flashcards & Lexicon",
      badge: "3D Flip Cards",
      desc: "3D aylanuvchi flashcardlar, US/UK audio talaffuz va istalgan so'zni AI orqali bir zumda tahlil qilish.",
      accent: "from-neutral-800 to-neutral-900",
      action: "Lug'atga o'tish →",
    },
    {
      title: "Games Arena",
      path: "/games",
      tag: "Gamified English",
      badge: "Card Match & Scramble",
      desc: "So'z kartalaridan gap yig'ish, combo streaklar va har bir o'yindan keyin shaxsiy pedagogik AI hisoboti.",
      accent: "from-neutral-800 to-neutral-900",
      action: "O'yinlarga kirish →",
    },
  ];

  return (
    <main
      className={`min-h-screen p-5 md:p-10 transition-colors ${
        isLight ? "bg-[#fafafa] text-neutral-950" : "bg-[#000000] text-neutral-100"
      }`}
    >
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Vercel Style Navigation Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800/80 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white text-neutral-950 flex items-center justify-center font-extrabold text-sm shadow">
              ▲
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight">English Studio</span>
              <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 text-neutral-300 font-mono">
                PRODUCTION v2.5
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {authLoading ? (
              <span className="opacity-60">Tekshirilmoqda...</span>
            ) : user ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/profile"
                  className="px-3.5 py-1.5 rounded-xl border border-neutral-700 hover:border-neutral-500 transition font-medium"
                >
                  @{user.userName} ({user.firstName})
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-950/20 transition cursor-pointer"
                >
                  Chiqish
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/auth"
                  className="px-4 py-1.5 rounded-xl font-bold bg-white text-neutral-950 hover:bg-neutral-200 transition shadow"
                >
                  Kirish / Ro&apos;yxatdan o&apos;tish
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={() => themeCtx.setTheme(isLight ? "dark" : "light")}
              className="px-3.5 py-1.5 rounded-xl border border-neutral-700 hover:border-neutral-500 transition cursor-pointer"
            >
              {isLight ? "🌙 Dark" : "☀️ Light"}
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="text-center space-y-4 max-w-3xl mx-auto pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-800 bg-neutral-900/50 text-[11px] font-mono text-neutral-300">
            <span>● Cambridge CEFR &amp; AI-Driven Architecture</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
            Ingliz tilini mukammal o&apos;rganish uchun to&apos;liq ekotizim.
          </h1>
          <p className="text-sm md:text-base opacity-75 leading-relaxed">
            Grammatika, Reading, Speaking, Listening, Lug&apos;at va Gamifikatsiyalashgan interaktiv o&apos;yinlar — barchasi sun&apos;iy intellekt tahlili va qurilma imkoniyatlari bilan boyitilgan.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            <button
              type="button"
              onClick={handleFetchAiDiagnostic}
              disabled={loadingDiagnostic}
              className="px-6 py-3 rounded-full text-xs md:text-sm font-bold bg-white text-neutral-950 hover:bg-neutral-200 shadow-lg cursor-pointer transition transform hover:scale-105 disabled:opacity-50"
            >
              {loadingDiagnostic ? "AI tahlil qilmoqda..." : "✦ AI Darajangizni Tahlil Qilish"}
            </button>
            <Link
              href="/tests"
              className="px-6 py-3 rounded-full text-xs md:text-sm font-bold border border-neutral-700 hover:border-neutral-500 text-neutral-200 transition"
            >
              Test boshlash →
            </Link>
          </div>
        </section>

        {/* AI Learning Diagnostic Dashboard */}
        {diagnostic && (
          <section
            className={`rounded-3xl border p-6 md:p-8 space-y-6 ${
              isLight ? "bg-white border-stone-300 shadow-md" : "bg-neutral-900/90 border-neutral-800"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-5">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-widest text-indigo-400">
                  Shaxsiy AI Diagnostika Hisoboti
                </span>
                <div className="flex items-baseline gap-3 mt-1">
                  <h2 className="text-3xl font-extrabold">CEFR Daraja: {diagnostic.estimatedLevel}</h2>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                    Indeks: {diagnostic.overallIndex}%
                  </span>
                </div>
              </div>
              <p className="text-xs opacity-70 italic max-w-sm text-right">
                &ldquo;{diagnostic.motivationalQuote}&rdquo;
              </p>
            </div>

            {/* Competency 4 Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl border border-neutral-800 bg-neutral-950/70">
                <span className="text-[11px] opacity-65 block">Grammar &amp; Tests</span>
                <span className="text-xl font-bold mt-1 block">{diagnostic.competencies.grammar}%</span>
              </div>
              <div className="p-4 rounded-2xl border border-neutral-800 bg-neutral-950/70">
                <span className="text-[11px] opacity-65 block">Reading Comprehension</span>
                <span className="text-xl font-bold mt-1 block">{diagnostic.competencies.reading}%</span>
              </div>
              <div className="p-4 rounded-2xl border border-neutral-800 bg-neutral-950/70">
                <span className="text-[11px] opacity-65 block">Vocabulary &amp; Flashcards</span>
                <span className="text-xl font-bold mt-1 block">{diagnostic.competencies.vocabulary}%</span>
              </div>
              <div className="p-4 rounded-2xl border border-neutral-800 bg-neutral-950/70">
                <span className="text-[11px] opacity-65 block">Gaming Speed &amp; Reflexes</span>
                <span className="text-xl font-bold mt-1 block">{diagnostic.competencies.speed}%</span>
              </div>
            </div>

            {/* Strengths & Growth Areas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/15 space-y-2">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  ✓ Qayd etilgan kuchli tomonlaringiz
                </p>
                <ul className="text-xs space-y-1.5 list-disc list-inside text-neutral-300">
                  {diagnostic.strengths.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-950/15 space-y-2">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  ⚡ O&apos;sish va kuchaytirish nuqtalari
                </p>
                <ul className="text-xs space-y-1.5 list-disc list-inside text-neutral-300">
                  {diagnostic.growthAreas.map((g, idx) => (
                    <li key={idx}>{g}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 14-day Action Roadmap */}
            <div className="p-4 rounded-2xl border border-neutral-800 bg-neutral-950 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                📅 14 Kunlik Shaxsiy Harakatlar Yo&apos;l Xaritasi:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1 text-xs">
                {diagnostic.roadmap.map((step, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-neutral-850 bg-neutral-900/50">
                    <span className="text-[10px] font-mono opacity-50 block mb-1">Bosqich #{idx + 1}</span>
                    <p className="opacity-90">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 6 Core Product Modules Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">O&apos;quv Modullari</h2>
            <span className="text-xs opacity-60">Barcha 6 ta modul faol</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((mod) => (
              <Link
                key={mod.title}
                href={mod.path}
                className={`group rounded-3xl border p-6 flex flex-col justify-between space-y-4 transition duration-300 transform hover:-translate-y-1 ${
                  isLight
                    ? "bg-white border-stone-200 hover:border-neutral-950 shadow-sm"
                    : "bg-neutral-900/80 border-neutral-800 hover:border-neutral-500"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase tracking-wider opacity-65">
                      {mod.tag}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-neutral-700 bg-neutral-800 text-neutral-300">
                      {mod.badge}
                    </span>
                  </div>
                  <h3 className="text-xl font-extrabold tracking-tight group-hover:text-indigo-400 transition">
                    {mod.title}
                  </h3>
                  <p className="text-xs opacity-75 leading-relaxed">{mod.desc}</p>
                </div>

                <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-xs font-bold">
                  <span className="group-hover:translate-x-1 transition-transform inline-block">
                    {mod.action}
                  </span>
                  <span className="opacity-40">↗</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-10 border-t border-neutral-800/60 text-center text-xs opacity-60 space-y-1">
          <p>© {year} English AI Learning Ecosystem · Crafted with Vercel Minimalist Design System.</p>
          <p>Next.js Server Imkoniyatlari &amp; Speech API Integratsiyasi.</p>
        </footer>
      </div>
    </main>
  );
}
