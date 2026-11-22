"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useNotification } from "@/components/notification-provider";
import { useTheme } from "@/components/theme-provider";
import { UiModal } from "@/components/ui-modal";

interface TestQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface ParticipantRow {
  id: string;
  userId: string;
  score: number | null;
  total: number | null;
  user: { firstName: string; lastName: string | null; userName: string };
}

interface ModeratedUser {
  id: string;
  firstName: string;
  lastName: string | null;
  userName: string;
}

interface TestDetail {
  id: string;
  title: string;
  topic: string;
  level: string;
  questionCount: number;
  status: "OPEN" | "CLOSED";
  allowParticipantAi: boolean;
  blockedUserIds?: string[];
  blockedUsers?: ModeratedUser[];
  kickedUsers?: ModeratedUser[];
  questionsJson: TestQuestion[];
  creatorId: string;
  creator: { id: string; firstName?: string; lastName?: string | null; userName: string };
  participants: ParticipantRow[];
}

function TestDetailContent() {
  const params = useParams<{ id: string }>();
  const testId = params?.id ?? "";
  const themeCtx = useTheme();
  const theme = themeCtx.theme;
  const toggleTheme = () => themeCtx.setTheme(theme === "dark" ? "light" : "dark");
  const notifyApi = useNotification();

  const [test, setTest] = useState<TestDetail | null>(null);
  const [isFounder, setIsFounder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blockedState, setBlockedState] = useState<{ isBlocked?: boolean; isKicked?: boolean; message: string } | null>(null);

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [savedResult, setSavedResult] = useState<{ score: number; total: number } | null>(null);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [doubts, setDoubts] = useState<Record<number, string>>({});
  const [hints, setHints] = useState<Record<number, string>>({});
  const [loadingHintIdx, setLoadingHintIdx] = useState<number | null>(null);

  const [participantsModalOpen, setParticipantsModalOpen] = useState(false);
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfBg, setPdfBg] = useState<"none" | "grid" | "lines" | "watermark">("none");
  const [blankLines, setBlankLines] = useState<number>(1);
  const [customHeader, setCustomHeader] = useState<string>("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadTest = useCallback(async () => {
    if (!testId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/tests/${encodeURIComponent(testId)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (res.status === 403) {
        setBlockedState({
          isBlocked: data.isBlocked,
          isKicked: data.isKicked,
          message: data.error || "Sizga ushbu testga kirish taqiqlangan.",
        });
        setTest(null);
        return;
      }

      setBlockedState(null);
      if (typeof data.isFounder === "boolean") setIsFounder(data.isFounder);
      if (typeof data.currentUserId === "string") setSavedUserId(data.currentUserId);

      if (res.ok && data.test) {
        setTest(data.test);
        if (data.currentUserParticipant && typeof data.currentUserParticipant.score === "number") {
          setSavedResult({
            score: data.currentUserParticipant.score,
            total: data.currentUserParticipant.total ?? data.test.questionCount ?? 0,
          });
          setSubmitted(true);
        } else if (Array.isArray(data.test.participants) && data.currentUserId) {
          const mine = data.test.participants.find(
            (p: { userId?: string; score?: number | null; total?: number | null }) =>
              p.userId === data.currentUserId &&
              (typeof p.score === "number" || (typeof p.score === "string" && p.score !== ""))
          );
          if (mine) {
            setSavedResult({
              score: mine.score,
              total: mine.total ?? data.test.questionCount ?? 0,
            });
            setSubmitted(true);
          }
        }

        if (data.autoJoined) {
          notifyApi.show("Siz testga muvaffaqiyatli qo'shildingiz.");
        }
      } else {
        notifyApi.show(data.error || "Testni yuklashda xato.");
      }
    } catch {
      notifyApi.show("Tarmoq xatoligi.");
    } finally {
      setLoading(false);
    }
  }, [testId, notifyApi]);

  useEffect(() => {
    loadTest();
  }, [loadTest]);

  useEffect(() => {
    if (!testId || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`test_result_${testId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.score === "number" && typeof parsed.total === "number") {
          setSavedResult({ score: parsed.score, total: parsed.total });
          setSubmitted(true);
          if (parsed.answers && typeof parsed.answers === "object") {
            setAnswers(parsed.answers);
          }
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [testId]);

  const questions: TestQuestion[] = Array.isArray(test?.questionsJson)
    ? test.questionsJson
    : [];

  let correctCount = 0;
  questions.forEach((q, idx) => {
    if (answers[idx] === q.correctIndex) correctCount += 1;
  });

  async function handleSubmitTest() {
    if (!test) return;
    setSubmitting(true);
    setSubmitted(true);
    try {
      const res = await fetch(`/api/tests/${encodeURIComponent(test.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: correctCount,
          total: questions.length,
          answers,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const finalScore = typeof data.score === "number" ? data.score : correctCount;
        const finalTotal = typeof data.total === "number" ? data.total : questions.length;
        setSavedResult({ score: finalScore, total: finalTotal });
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              `test_result_${test.id}`,
              JSON.stringify({ score: finalScore, total: finalTotal, answers })
            );
          }
        } catch {}
        await loadTest();
        notifyApi.show(
          `Test yakunlandi: ${correctCount}/${questions.length} to'g'ri javob.`,
          "success"
        );
      } else {
        notifyApi.show(data.error || "Natijani saqlashda xato.");
      }
    } catch {
      notifyApi.show("Natija yuborishda tarmoq xatoligi.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleAi() {
    if (!test || !isFounder) return;
    const nextAi = !Boolean(test.allowParticipantAi);
    const res = await fetch(`/api/tests/${encodeURIComponent(test.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowParticipantAi: nextAi }),
    });
    const data = await res.json();
    if (res.ok && data.test) {
      setTest(data.test);
      notifyApi.show(`Testda AI ${nextAi ? "ON" : "OFF"} qilindi.`);
    }
  }

  async function handleModerate(
    action: "kick" | "unkick" | "block" | "unblock",
    targetUserId: string,
    participantId?: string
  ) {
    if (!test || !isFounder) return;
    setModeratingId(participantId || targetUserId);
    try {
      const res = await fetch(`/api/tests/${encodeURIComponent(test.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetUserId, participantId }),
      });
      const data = await res.json();
      if (res.ok && data.test) {
        setTest(data.test);
        notifyApi.show(data.message || "Qatnashuvchi holati muvaffaqiyatli yangilandi.");
      } else {
        notifyApi.show(data.error || "Amal bajarilmadi.");
      }
    } finally {
      setModeratingId(null);
    }
  }

  async function handleAskHint(qIdx: number) {
    if (!test || !test.allowParticipantAi) return;
    setLoadingHintIdx(qIdx);
    try {
      const res = await fetch(`/api/tests/${encodeURIComponent(test.id)}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionIndex: qIdx,
          doubt: doubts[qIdx] || "",
        }),
      });
      const data = await res.json();
      if (res.ok && data.hint) {
        setHints((prev) => ({ ...prev, [qIdx]: data.hint }));
      } else {
        notifyApi.show(data.error || "AI tushuntirish olib bo'lmadi.");
      }
    } finally {
      setLoadingHintIdx(null);
    }
  }

  async function handleDownloadPdf() {
    if (!test) return;
    setDownloadingPdf(true);
    try {
      const q = new URLSearchParams({
        bg: pdfBg,
        blanks: String(blankLines),
        header: customHeader.trim(),
      });
      const res = await fetch(
        `/api/tests/${encodeURIComponent(test.id)}/pdf?${q.toString()}`
      );
      if (!res.ok) {
        notifyApi.show("PDF faylni yuklab bo'lmadi.");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(test.title || "test")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setPdfModalOpen(false);
      notifyApi.show(".PDF fayl yuklab olindi.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  const isLight = theme === "light";
  const participants = Array.isArray(test?.participants) ? test.participants : [];
  const blockedUsers = Array.isArray(test?.blockedUsers) ? test.blockedUsers : [];
  const kickedUsers = Array.isArray(test?.kickedUsers) ? test.kickedUsers : [];
  const blockedIds = Array.isArray(test?.blockedUserIds) ? test.blockedUserIds : [];
  const totalBlockedCount = Math.max(blockedUsers.length, blockedIds.length);
  const aiEnabled = Boolean(test?.allowParticipantAi);

  return (
    <main
      className={`min-h-screen p-5 md:p-8 transition-colors ${
        isLight
          ? "bg-stone-100 text-neutral-900"
          : "bg-neutral-950 text-neutral-100"
      }`}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-xs underline opacity-80 hover:opacity-100" href="/tests">
            ← Test Studio ga qaytish
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {isFounder && test && (
              <>
                <button
                  type="button"
                  onClick={handleToggleAi}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
                    aiEnabled
                      ? "bg-emerald-500 text-neutral-950 border-emerald-400"
                      : isLight
                      ? "bg-white border-stone-300"
                      : "bg-neutral-900 border-neutral-700"
                  }`}
                >
                  Testda AI: {aiEnabled ? "ON" : "OFF"}
                </button>

                <button
                  type="button"
                  onClick={() => setParticipantsModalOpen(true)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
                    isLight
                      ? "bg-white border-stone-300"
                      : "bg-neutral-900 border-neutral-700"
                  }`}
                >
                  Qatnashuvchilar ({participants.length}) / Moderatsiya
                </button>
              </>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
                isLight
                  ? "bg-white border-stone-300"
                  : "bg-neutral-900 border-neutral-700"
              }`}
            >
              Theme: {theme.toUpperCase()}
            </button>

            <button
              type="button"
              disabled={!test}
              onClick={() => setPdfModalOpen(true)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                isLight ? "bg-neutral-900 text-white" : "bg-white text-neutral-950"
              }`}
            >
              .PDF Yuklash
            </button>
          </div>
        </div>

        {/* Universal Modal for Participants & Moderation */}
        <UiModal
          open={participantsModalOpen}
          onClose={() => setParticipantsModalOpen(false)}
          title={`Qatnashuvchilar & Moderatsiya (${participants.length} ta)`}
          subtitle={`Blocklanganlar: ${totalBlockedCount} ta | Chiqarilganlar: ${kickedUsers.length} ta`}
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-5 text-xs">
            {/* Active Participants List */}
            <div>
              <p className="font-semibold text-sm mb-2 opacity-90">Faol qatnashuvchilar</p>
              {participants.length === 0 ? (
                <p className="opacity-60 italic py-2">Hozircha testga kirgan boshqa qatnashuvchilar yo&apos;q.</p>
              ) : (
                <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-xl overflow-hidden px-3">
                  {participants.map((p) => {
                    const busy = moderatingId === p.id || moderatingId === p.userId;
                    const isSelf = p.userId === test?.creatorId || (savedUserId && p.userId === savedUserId);
                    const fullName =
                      `${p.user?.firstName || ""} ${p.user?.lastName || ""}`.trim() ||
                      p.user?.userName ||
                      "Foydalanuvchi";
                    const numScore =
                      typeof p.score === "number" && !Number.isNaN(p.score)
                        ? p.score
                        : null;
                    const numTotal =
                      typeof p.total === "number" && p.total > 0
                        ? p.total
                        : test?.questionCount || 0;
                    const resultLabel =
                      numScore !== null
                        ? `Natija: ${numScore}/${numTotal} (${Math.round((numScore / Math.max(1, numTotal)) * 100)}%)`
                        : "Jarayonda";

                    return (
                      <div
                        key={p.id}
                        className="py-3 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-neutral-100">{fullName}</span>
                            <span className="opacity-60">@{p.user?.userName}</span>
                            {p.userId === test?.creatorId && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300 text-[10px] font-bold">
                                FOUNDER
                              </span>
                            )}
                          </div>
                          <div className="mt-1">
                            <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[11px]">
                              {resultLabel}
                            </span>
                          </div>
                        </div>

                        {!isSelf && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleModerate("kick", p.userId, p.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-amber-500/50 text-amber-300 hover:bg-amber-500/10 cursor-pointer disabled:opacity-40 transition"
                            >
                              Chiqarish (Kick)
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleModerate("block", p.userId, p.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-rose-500/50 text-rose-300 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40 transition"
                            >
                              Block qilish
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Blocked Users Section with Clear Identity */}
            {totalBlockedCount > 0 && (
              <div className="pt-3 border-t border-neutral-800 space-y-2">
                <p className="font-semibold text-sm text-rose-400">
                  Blocklangan foydalanuvchilar ({totalBlockedCount} ta)
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {blockedUsers.length > 0 ? (
                    blockedUsers.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/20 border border-rose-800/40"
                      >
                        <div>
                          <p className="font-semibold text-rose-200">
                            {`${b.firstName || ""} ${b.lastName || ""}`.trim() || b.userName}
                          </p>
                          <p className="text-[11px] opacity-70">@{b.userName}</p>
                        </div>
                        <button
                          type="button"
                          disabled={moderatingId === b.id}
                          onClick={() => handleModerate("unblock", b.id)}
                          className="px-3 py-1 rounded-lg border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-40"
                        >
                          Blokdan chiqarish
                        </button>
                      </div>
                    ))
                  ) : (
                    blockedIds.map((bId) => (
                      <div
                        key={bId}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/20 border border-rose-800/40"
                      >
                        <code className="text-[11px]">{bId}</code>
                        <button
                          type="button"
                          disabled={moderatingId === bId}
                          onClick={() => handleModerate("unblock", bId)}
                          className="px-3 py-1 rounded-lg border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-40"
                        >
                          Blokdan chiqarish
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Kicked Users Section with Re-admit button */}
            {kickedUsers.length > 0 && (
              <div className="pt-3 border-t border-neutral-800 space-y-2">
                <p className="font-semibold text-sm text-amber-400">
                  Testdan chiqarilganlar ({kickedUsers.length} ta)
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {kickedUsers.map((k) => (
                    <div
                      key={k.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-amber-950/20 border border-amber-800/40"
                    >
                      <div>
                        <p className="font-semibold text-amber-200">
                          {`${k.firstName || ""} ${k.lastName || ""}`.trim() || k.userName}
                        </p>
                        <p className="text-[11px] opacity-70">@{k.userName}</p>
                      </div>
                      <button
                        type="button"
                        disabled={moderatingId === k.id}
                        onClick={() => handleModerate("unkick", k.id)}
                        className="px-3 py-1 rounded-lg border border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/10 cursor-pointer disabled:opacity-40"
                      >
                        Qayta ruxsat berish
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </UiModal>

        {/* Universal Modal for .PDF Export */}
        <UiModal
          open={pdfModalOpen}
          onClose={() => setPdfModalOpen(false)}
          title=".PDF Eksport Sozlamalari"
          subtitle="Akademik varaq ko'rinishi va qo'shimcha maydonlar"
          maxWidthClass="max-w-md"
        >
          <div className="space-y-3 text-xs">
            <div>
              <label className="block opacity-75 mb-1">Fon uslubi</label>
              <select
                value={pdfBg}
                onChange={(e) =>
                  setPdfBg(
                    e.target.value as "none" | "grid" | "lines" | "watermark"
                  )
                }
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
              >
                <option value="none">Toza oq varaq (None)</option>
                <option value="watermark">Watermark matn</option>
                <option value="grid">Katakli (Grid)</option>
                <option value="lines">Chiziqli (Lines)</option>
              </select>
            </div>

            <div>
              <label className="block opacity-75 mb-1">Tepada ______ qatorlari</label>
              <select
                value={blankLines}
                onChange={(e) => setBlankLines(Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
              >
                <option value={0}>0 ta</option>
                <option value={1}>1 qator</option>
                <option value={2}>2 qator</option>
                <option value={3}>3 qator</option>
              </select>
            </div>

            <div>
              <label className="block opacity-75 mb-1">Qo&apos;shimcha sarlavha/eslatma</label>
              <input
                type="text"
                value={customHeader}
                onChange={(e) => setCustomHeader(e.target.value)}
                placeholder="Masalan: Mock Exam #1"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setPdfModalOpen(false)}
                className="px-3.5 py-2 rounded-xl border border-neutral-700 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={downloadingPdf}
                onClick={handleDownloadPdf}
                className="px-4 py-2 rounded-xl font-semibold bg-white text-neutral-950 cursor-pointer disabled:opacity-50"
              >
                {downloadingPdf ? "Yuklanmoqda..." : ".PDF Yuklash"}
              </button>
            </div>
          </div>
        </UiModal>

        {loading ? (
          <p className="text-sm opacity-75">Test yuklanmoqda...</p>
        ) : blockedState ? (
          /* Dedicated Blocked / Kicked Card */
          <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-8 text-center space-y-4 max-w-lg mx-auto">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-2xl font-bold">
              ✕
            </div>
            <h2 className="text-lg font-bold text-rose-300">Kirish taqiqlangan</h2>
            <p className="text-xs text-rose-200/80 leading-relaxed">
              {blockedState.message}
            </p>
            <div className="pt-2">
              <Link
                href="/tests"
                className="inline-block px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500"
              >
                Test Studio ga qaytish
              </Link>
            </div>
          </div>
        ) : !test ? (
          <div className="rounded-2xl border border-neutral-800 p-6 text-sm">
            Test topilmadi: <code>{testId}</code>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Test Summary Card */}
            <div
              className={`rounded-2xl border p-6 flex flex-wrap items-center justify-between gap-4 ${
                isLight
                  ? "bg-white border-stone-200"
                  : "bg-neutral-900/75 border-neutral-800"
              }`}
            >
              <div>
                <h1 className="text-xl md:text-2xl font-bold">{test.title}</h1>
                <p className="text-xs opacity-75 mt-1">
                  {test.topic} · {test.level} · {questions.length} savol · Muallif: @
                  {test.creator?.userName}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold border border-neutral-700">
                {test.status}
              </span>
            </div>

            {/* Post-Submit Detailed Result Banner */}
            {(submitted || savedResult !== null) && (
              <div
                className={`rounded-2xl border p-5 space-y-1 ${
                  isLight
                    ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                    : "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                }`}
              >
                <p className="text-base font-bold">
                  Yakuniy Natija: {savedResult ? savedResult.score : correctCount} / {savedResult ? savedResult.total : questions.length} (
                  {questions.length > 0
                    ? Math.round((correctCount / questions.length) * 100)
                    : 0}
                  %)
                </p>
                <p className="text-xs opacity-85">
                  Har bir savol ostida siz tanlagan variant, to&apos;g&apos;ri javob va uning sababi ko&apos;rsatilgan.
                </p>
              </div>
            )}

            {/* Questions List */}
            <div className="space-y-4">
              {questions.map((q, qIdx) => {
                const chosen = answers[qIdx];
                const isRight = chosen === q.correctIndex;
                const chosenLetter =
                  typeof chosen === "number" ? String.fromCharCode(65 + chosen) : "Belgilanmagan";
                const chosenText =
                  typeof chosen === "number" && q.options?.[chosen]
                    ? `${chosenLetter}) ${q.options[chosen]}`
                    : "Javob berilmagan";
                const rightLetter = String.fromCharCode(65 + q.correctIndex);
                const rightText = `${rightLetter}) ${q.options?.[q.correctIndex] ?? ""}`;

                return (
                  <div
                    key={q.id ?? qIdx}
                    className={`rounded-2xl border p-5 space-y-3 ${
                      isLight
                        ? "bg-white border-stone-200"
                        : "bg-neutral-900/75 border-neutral-800"
                    }`}
                  >
                    <p className="text-sm font-semibold leading-snug">
                      {qIdx + 1}. {q.question}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(q.options || []).map((opt, oIdx) => {
                        const isSelected = chosen === oIdx;
                        const isCorrectOpt = q.correctIndex === oIdx;
                        let cls = isLight
                          ? "border-stone-200 hover:border-stone-400"
                          : "border-neutral-800 hover:border-neutral-600";

                        if (submitted) {
                          if (isCorrectOpt) {
                            cls =
                              "border-emerald-500 bg-emerald-500/20 text-emerald-200 font-semibold";
                          } else if (isSelected) {
                            cls =
                              "border-rose-500 bg-rose-500/20 text-rose-200 font-semibold";
                          }
                        } else if (isSelected) {
                          cls = isLight
                            ? "bg-neutral-900 text-white border-neutral-900 font-semibold"
                            : "bg-white text-neutral-950 border-white font-semibold";
                        }

                        return (
                          <button
                            key={oIdx}
                            type="button"
                            disabled={submitted}
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))
                            }
                            className={`text-left rounded-xl border px-3.5 py-2.5 text-xs transition cursor-pointer disabled:cursor-default ${cls}`}
                          >
                            {String.fromCharCode(65 + oIdx)}. {opt}
                          </button>
                        );
                      })}
                    </div>

                    {aiEnabled && !submitted && (
                      <div className="pt-2 border-t border-neutral-800/60 space-y-2">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={doubts[qIdx] || ""}
                            onChange={(e) =>
                              setDoubts((prev) => ({
                                ...prev,
                                [qIdx]: e.target.value,
                              }))
                            }
                            placeholder="Savol bo'yicha yo'nalish so'rang (tayyor javobsiz)..."
                            className="flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-100"
                          />
                          <button
                            type="button"
                            disabled={loadingHintIdx === qIdx}
                            onClick={() => handleAskHint(qIdx)}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-medium border border-emerald-500/50 text-emerald-300 cursor-pointer disabled:opacity-50"
                          >
                            {loadingHintIdx === qIdx
                              ? "Tushuntirilmoqda..."
                              : "AI Tushuntirish"}
                          </button>
                        </div>
                        {hints[qIdx] && (
                          <p className="text-xs rounded-xl bg-emerald-950/30 border border-emerald-700/30 p-3 text-emerald-200">
                            {hints[qIdx]}
                          </p>
                        )}
                      </div>
                    )}

                    {submitted && (
                      <div
                        className={`rounded-xl border p-3.5 text-xs space-y-1 ${
                          isRight
                            ? "border-emerald-500/40 bg-emerald-950/25 text-emerald-200"
                            : "border-rose-500/40 bg-rose-950/25 text-rose-200"
                        }`}
                      >
                        <p className="font-bold">
                          {isRight ? "✓ To'g'ri javob" : "✕ Noto'g'ri javob"}
                        </p>
                        <p>
                          <b>Siz belgiladingiz:</b> {chosenText}
                        </p>
                        {!isRight && (
                          <p>
                            <b>To'g'ri javob:</b> {rightText}
                          </p>
                        )}
                        <p className="opacity-90 pt-0.5">
                          <b>Sababi / Izoh:</b> {q.explanation}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!submitted && questions.length > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitTest}
                  className="px-6 py-3 rounded-xl text-sm font-bold bg-emerald-400 text-neutral-950 hover:bg-emerald-300 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Tekshirilmoqda..." : "Testni Yakunlash"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function TestByIdPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
          <p className="text-sm opacity-75">Test yuklanmoqda...</p>
        </main>
      }
    >
      <TestDetailContent />
    </Suspense>
  );
}
