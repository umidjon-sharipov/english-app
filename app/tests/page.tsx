"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotification } from "@/components/notification-provider";
import { useTheme } from "@/components/theme-provider";
import { UiModal } from "@/components/ui-modal";

interface ParticipantItem {
  id: string;
  userId: string;
  score: number | null;
  total: number | null;
  user: { firstName: string; lastName: string | null; userName: string };
}

interface TestRecord {
  id: string;
  title: string;
  topic: string;
  level: string;
  questionCount: number;
  status: "OPEN" | "CLOSED";
  maxParticipants: number | null;
  designStyle: string;
  allowParticipantAi: boolean;
  creatorId: string;
  creator: { firstName: string; lastName: string | null; userName: string };
  participants: ParticipantItem[];
}

export default function TestsStudioPage() {
  const router = useRouter();
const themeCtx = useTheme(); const theme = themeCtx.theme; const toggleTheme = () => themeCtx.setTheme(theme === "dark" ? "light" : "dark");
  const notifyApi = useNotification();

  const [tests, setTests] = useState<TestRecord[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [founderMode, setFounderMode] = useState(true);
  const [loading, setLoading] = useState(true);

  const [directId, setDirectId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const [levelFilter, setLevelFilter] = useState<string>("ALL");

  // Universal Modal for creating a new test
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ percent: number; completed: number; total: number; label: string } | null>(null);

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("Grammar & Tenses");
  const [level, setLevel] = useState("B1");
  const [questionCount, setQuestionCount] = useState(10);
  const [customPrompt, setCustomPrompt] = useState("");
  const [status, setStatus] = useState<"OPEN" | "CLOSED">("OPEN");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [designStyle, setDesignStyle] = useState("Minimal");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [allowParticipantAi, setAllowParticipantAi] = useState(false);

  const loadSessionAndTests = useCallback(async () => {
    try {
      setLoading(true);
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      let uid: string | null = null;
      if (meRes.ok) {
        const meData = await meRes.json();
        uid = meData?.user?.id ?? null;
        setCurrentUserId(uid);
      }

      const res = await fetch("/api/tests?all=1", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.tests)) {
        setTests(data.tests);
      } else {
        notifyApi.show(data.error || "Testlarni yuklashda xato.");
      }
    } catch {
      notifyApi.show("Tarmoq xatoligi.");
    } finally {
      setLoading(false);
    }
  }, [notifyApi]);

  useEffect(() => {
    loadSessionAndTests();
  }, [loadSessionAndTests]);

  const visibleTests = useMemo(() => {
    return tests.filter((t) => {
      const isCreator = Boolean(currentUserId && t.creatorId === currentUserId);
      const canSeeClosed = founderMode && isCreator;
      if (t.status === "CLOSED" && !canSeeClosed) return false;

      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (levelFilter !== "ALL" && t.level !== levelFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${t.title} ${t.topic} ${t.level} ${t.id} ${t.creator?.userName || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tests, currentUserId, founderMode, statusFilter, levelFilter, searchQuery]);

  async function handleCreateTest(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    try {
      const jobId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setGenProgress({ percent: 0, completed: 0, total: questionCount, label: `Boshlanmoqda... (0/${questionCount} · 0%)` });
      pollTimer = setInterval(async () => {
        try {
          const pRes = await fetch(`/api/tests/progress?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" });
          if (pRes.ok) {
            const pData = await pRes.json();
            if (typeof pData.percent === "number") {
              setGenProgress({
                percent: pData.percent,
                completed: pData.completed ?? 0,
                total: pData.total ?? questionCount,
                label: pData.statusText || `${pData.completed ?? 0}/${questionCount} · ${pData.percent}%`,
              });
            }
          }
        } catch {}
      }, 600);
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          title: title.trim() || undefined,
          topic,
          level,
          questionCount,
          customPrompt: customPrompt.trim() || undefined,
          status,
          maxParticipants: maxParticipants.trim() ? Number(maxParticipants) : undefined,
          designStyle,
          startsAt: startsAt || undefined,
          endsAt: endsAt || undefined,
          allowParticipantAi,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notifyApi.show(data.error || "AI test yarata olmadi.");
        return;
      }

      notifyApi.show("AI yangi test savollarini generatsiya qildi va saqladi.");
      setCreateModalOpen(false);
      setTitle("");
      setCustomPrompt("");
      await loadSessionAndTests();
      if (data?.test?.id) {
        router.push(`/tests/${data.test.id}`);
      }
    } catch {
      notifyApi.show("Test yaratishda tarmoq xatoligi.");
    } finally {
      if (pollTimer) clearInterval(pollTimer);
      setCreating(false);
      setGenProgress(null);
    }
  }

  async function handleDeleteTest(id: string) {
    try {
      const res = await fetch(`/api/tests/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        notifyApi.show(data.error || "Testni o'chirib bo'lmadi.");
        return;
      }
      setTests((prev) => prev.filter((t) => t.id !== id));
      notifyApi.show("Test o'chirildi.");
    } catch {
      notifyApi.show("O'chirishda tarmoq xatoligi.");
    }
  }

  async function handleToggleStatus(t: TestRecord) {
    const nextStatus = t.status === "OPEN" ? "CLOSED" : "OPEN";
    const res = await fetch(`/api/tests/${encodeURIComponent(t.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = await res.json();
    if (res.ok && data.test) {
      setTests((prev) => prev.map((item) => (item.id === t.id ? data.test : item)));
      notifyApi.show(`Test holati ${nextStatus} ga o'zgartirildi.`);
    } else {
      notifyApi.show(data.error || "Holatni o'zgartirib bo'lmadi.");
    }
  }

  function handleDirectOpen(e: React.FormEvent) {
    e.preventDefault();
    const clean = directId.trim();
    if (!clean) return;
    router.push(`/tests/${encodeURIComponent(clean)}`);
  }

  const isLight = theme === "light";

  return (
    <main
      className={`min-h-screen p-5 md:p-8 transition-colors ${
        isLight
          ? "bg-stone-100 text-neutral-900"
          : "bg-neutral-950 text-neutral-100"
      }`}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Test Studio</h1>
            <p className="text-xs opacity-75 mt-1">
              Founder o&apos;zining OPEN va CLOSED testlarini boshqaradi; barcha savollar 100% AI orqali yaratiladi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={toggleTheme}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium border cursor-pointer ${
                isLight
                  ? "bg-white border-stone-300 text-neutral-900"
                  : "bg-neutral-900 border-neutral-700 text-neutral-100"
              }`}
            >
              Theme: {theme.toUpperCase()}
            </button>

            <button
              type="button"
              onClick={() => setFounderMode((f) => !f)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                founderMode
                  ? "bg-emerald-500 text-neutral-950 border-emerald-400"
                  : isLight
                  ? "bg-white border-stone-300 text-neutral-700"
                  : "bg-neutral-900 border-neutral-700 text-neutral-300"
              }`}
            >
              Founder Control: {founderMode ? "ON" : "OFF"}
            </button>

            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs md:text-sm font-semibold bg-indigo-500 text-white hover:bg-indigo-400 shadow cursor-pointer"
            >
              + New Test
            </button>
          </div>
        </div>

        {/* Direct Test ID Access Bar */}
        <form
          onSubmit={handleDirectOpen}
          className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isLight
              ? "bg-white border-stone-200"
              : "bg-neutral-900/75 border-neutral-800"
          }`}
        >
          <div>
            <p className="text-xs font-semibold">Test ID orqali kirish</p>
            <p className="text-[11px] opacity-70">
              Yopiq yoki boshqa test ID ni kiriting:
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={directId}
              onChange={(e) => setDirectId(e.target.value)}
              placeholder="Test ID kiriting..."
              className={`rounded-xl border px-3 py-2 text-xs w-56 sm:w-64 ${
                isLight
                  ? "bg-stone-50 border-stone-300 text-neutral-900"
                  : "bg-neutral-950 border-neutral-700 text-neutral-100"
              }`}
            />
            <button
              type="submit"
              className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                isLight
                  ? "bg-neutral-900 text-white"
                  : "bg-white text-neutral-950"
              }`}
            >
              Ochish
            </button>
          </div>
        </form>

        {/* Search & Filter Bar */}
        <div
          className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
            isLight
              ? "bg-white border-stone-200"
              : "bg-neutral-900/75 border-neutral-800"
          }`}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Nomi, mavzu, daraja yoki ID bo'yicha qidirish..."
            className={`flex-1 min-w-[220px] rounded-xl border px-3.5 py-2 text-xs ${
              isLight
                ? "bg-stone-50 border-stone-300 text-neutral-900"
                : "bg-neutral-950 border-neutral-700 text-neutral-100"
            }`}
          />

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(["ALL", "OPEN", "CLOSED"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg border cursor-pointer ${
                  statusFilter === st
                    ? "bg-indigo-500 text-white border-indigo-400 font-semibold"
                    : "border-neutral-700/60 opacity-75 hover:opacity-100"
                }`}
              >
                {st}
              </button>
            ))}

            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className={`rounded-lg border px-2.5 py-1.5 ${
                isLight
                  ? "bg-stone-50 border-stone-300 text-neutral-900"
                  : "bg-neutral-950 border-neutral-700 text-neutral-100"
              }`}
            >
              <option value="ALL">All Levels</option>
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
              <option value="C2">C2</option>
            </select>

            <button
              type="button"
              onClick={loadSessionAndTests}
              className="px-3 py-1.5 rounded-lg border border-neutral-700/60 underline cursor-pointer"
            >
              Yangilash
            </button>
          </div>
        </div>

        {/* Tests List */}
        <section className="space-y-3">
          <div className="flex items-center justify-between text-xs opacity-75">
            <span>Topilgan testlar: {visibleTests.length}</span>
            <span>{founderMode ? "Founder yopiq (CLOSED) testlaringiz ham ko'rinadi" : "Faqat OPEN testlar"}</span>
          </div>

          {loading ? (
            <p className="text-sm opacity-75">Testlar yuklanmoqda...</p>
          ) : visibleTests.length === 0 ? (
            <div
              className={`rounded-2xl border p-8 text-center space-y-3 ${
                isLight
                  ? "bg-white border-stone-200"
                  : "bg-neutral-900/60 border-neutral-800"
              }`}
            >
              <p className="text-sm font-medium">Mos test topilmadi.</p>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-500 text-white cursor-pointer"
              >
                + New Test yaratish
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleTests.map((t) => {
                const isCreator = Boolean(currentUserId && t.creatorId === currentUserId);
                return (
                  <div
                    key={t.id}
                    className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 transition ${
                      isLight
                        ? "bg-white border-stone-200 shadow-xs"
                        : "bg-neutral-900/80 border-neutral-800 hover:border-neutral-700"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            t.status === "OPEN"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          }`}
                        >
                          {t.status}
                        </span>
                        <span className="text-[11px] font-mono opacity-60">{t.id}</span>
                      </div>

                      <h2 className="text-base font-bold">{t.title}</h2>
                      <p className="text-xs opacity-75">
                        {t.topic} · {t.level} · {t.questionCount} savol · Kirganlar:{" "}
                        {t.participants?.length ?? 0}
                      </p>
                      <p className="text-[11px] opacity-60">
                        Muallif: @{t.creator?.userName || "user"} · Dizayn: {t.designStyle}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-neutral-800/60">
                      <Link href={`/tests/${t.id}`} className={`px-4 py-1.5 rounded-xl text-xs font-semibold ${isLight ? "bg-neutral-900 text-white" : "bg-white text-neutral-950"}`}>
                        Testni boshlash
                      </Link>

                      {founderMode && isCreator && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(t)}
                            className="px-2.5 py-1.5 rounded-lg text-xs border border-indigo-400/40 text-indigo-300 cursor-pointer"
                          >
                            {t.status === "OPEN" ? "Yopish (CLOSED)" : "Ochish (OPEN)"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTest(t.id)}
                            className="px-2.5 py-1.5 rounded-lg text-xs border border-rose-500/50 text-rose-400 cursor-pointer"
                          >
                            O&apos;chirish
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Universal Modal for Creating New Test */}
        <UiModal open={createModalOpen} onClose={() => setCreateModalOpen(false)}
          title="Yangi Test Yaratish (100% AI)"
          subtitle="Savollar faqat AI tomonidan yaratiladi; AI xato qilsa test yaratilmaydi va xabar beriladi."
        >
          <form onSubmit={handleCreateTest} className="space-y-4 text-xs">
            <div>
              <label className="block opacity-75 mb-1">Test nomi (ixtiyoriy)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Masalan: B1 Mixed Practice"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block opacity-75 mb-1">Mavzu</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>
              <div>
                <label className="block opacity-75 mb-1">Qiyinlik darajasi</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                >
                  <option value="A1">A1</option>
                  <option value="A2">A2</option>
                  <option value="B1">B1</option>
                  <option value="B2">B2</option>
                  <option value="C1">C1</option>
                  <option value="C2">C2</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block opacity-75 mb-1">
                Savollar soni (5–100): <b>{questionCount} ta</b>
              </label>
              <input
                type="range"
                min={5}
                max={100}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block opacity-75 mb-1">
                Qo&apos;shimcha Prompt (ixtiyoriy)
              </label>
              <textarea
                rows={2}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Masalan: Focus on conditionals, phrasal verbs, and gap-fill practice..."
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block opacity-75 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value === "CLOSED" ? "CLOSED" : "OPEN")
                  }
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                >
                  <option value="OPEN">OPEN (Ochiq)</option>
                  <option value="CLOSED">CLOSED (Yopiq)</option>
                </select>
              </div>

              <div>
                <label className="block opacity-75 mb-1">Max qatnashuvchi</label>
                <input
                  type="number"
                  min={1}
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(e.target.value)}
                  placeholder="Cheklovsiz"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="block opacity-75 mb-1">Test dizayni</label>
                <select
                  value={designStyle}
                  onChange={(e) => setDesignStyle(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                >
                  <option value="Minimal">Minimal</option>
                  <option value="Academic">Academic</option>
                  <option value="Focus">Focus</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block opacity-75 mb-1">Boshlanish vaqti</label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>
              <div>
                <label className="block opacity-75 mb-1">Tugash vaqti</label>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowParticipantAi}
                onChange={(e) => setAllowParticipantAi(e.target.checked)}
              />
              <span>Qatnashuvchilar uchun AI tushuntirish yordamchisini yoqish</span>
            </label>

            {creating && (
            <div className="rounded-xl border border-indigo-500/40 bg-neutral-900/90 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-neutral-200">
                <span className="truncate pr-2">{genProgress ? genProgress.label : `AI savol tuzmoqda... (0/${questionCount} · 0%)`}</span>
                <span className="shrink-0 font-bold text-indigo-400">{genProgress ? genProgress.percent : 0}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(3, genProgress ? genProgress.percent : 3))}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-neutral-700 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 rounded-xl font-semibold bg-white text-neutral-950 cursor-pointer disabled:opacity-50"
              >
                {creating ? "AI savol tuzmoqda..." : "AI bilan Test Yaratish"}
              </button>
            </div>
          </form>
        </UiModal>
      </div>
    </main>
  );
}
