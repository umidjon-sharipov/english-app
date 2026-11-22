"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface QuestionItem {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface UserSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  userName: string;
}

interface ParticipantItem {
  id: string;
  userId: string;
  score: number | null;
  total: number | null;
  completedAt: string | null;
  joinedAt: string;
  user: UserSummary;
}

interface TestDetail {
  id: string;
  title: string;
  topic: string;
  level: string;
  questionCount: number;
  status: "OPEN" | "CLOSED";
  maxParticipants: number | null;
  startsAt: string | null;
  endsAt: string | null;
  designTheme: string | null;
  allowParticipantAi: boolean;
  blockedUserIds?: string[];
  questionsJson: QuestionItem[];
  creatorId: string;
  creator: UserSummary;
  participants: ParticipantItem[];
}

export default function TestByIdPage() {
  const params = useParams<{ id: string }>();
  const testId = params?.id ?? "";

  const [test, setTest] = useState<TestDetail | null>(null);
  const [isFounder, setIsFounder] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ score: number; total: number } | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  // Per-question AI doubt & explanation (only visible when test.allowParticipantAi === true)
  const [doubtInputs, setDoubtInputs] = useState<Record<number, string>>({});
  const [aiHints, setAiHints] = useState<Record<number, string>>({});
  const [hintLoadingIdx, setHintLoadingIdx] = useState<number | null>(null);

  // Founder panel state
  const [showParticipantsPanel, setShowParticipantsPanel] = useState<boolean>(true);
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  // Design & .PDF modal selector
  const [pageTheme, setPageTheme] = useState<"dark" | "light">("dark");
  const [cardDesign, setCardDesign] = useState<"minimal" | "card" | "paper">("minimal");
  const [pdfModalOpen, setPdfModalOpen] = useState<boolean>(false);
  const [pdfBgIcon, setPdfBgIcon] = useState<"none" | "stars" | "books" | "grid" | "waves">("stars");
  const [blankLines, setBlankLines] = useState<number>(2);
  const [customHeaderText, setCustomHeaderText] = useState<string>("");
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);

  const loadTest = useCallback(async () => {
    if (!testId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/tests/${encodeURIComponent(testId)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (typeof data.isFounder === "boolean") {
        setIsFounder(data.isFounder);
      }

      if (data.test) {
        setTest(data.test);
        if (data.test.designTheme === "card" || data.test.designTheme === "paper") {
          setCardDesign(data.test.designTheme);
        }
      }

      if (!res.ok) {
        setErrorMsg(data.error || "Testni ochishda xatolik yuz berdi.");
      } else if (data.autoJoined) {
        setInfoMsg("Siz testga qo'shildingiz.");
      }
    } catch {
      setErrorMsg("Tarmoq xatoligi yuz berdi.");
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    loadTest();
  }, [loadTest]);

  async function handleToggleTestAi() {
    if (!test || !isFounder) return;
    setErrorMsg(null);
    setInfoMsg(null);
    const nextAi = !Boolean(test.allowParticipantAi);
    try {
      const res = await fetch(`/api/tests/${encodeURIComponent(test.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowParticipantAi: nextAi }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "AI holatini o'zgartirib bo'lmadi.");
        return;
      }
      if (data.test) setTest(data.test);
      setInfoMsg(`Testda AI ${nextAi ? "ON" : "OFF"} qilindi.`);
    } catch {
      setErrorMsg("AI holatini yangilashda xato.");
    }
  }

  async function handleAskTutor(qIdx: number) {
    if (!test || !test.allowParticipantAi) return;
    setHintLoadingIdx(qIdx);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/tests/${encodeURIComponent(test.id)}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionIndex: qIdx,
          doubt: doubtInputs[qIdx] || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "AI tushuntirish olib bo'lmadi.");
        return;
      }
      setAiHints((prev) => ({ ...prev, [qIdx]: data.hint }));
    } catch {
      setErrorMsg("AI yordamchi bilan bog'lanishda xato.");
    } finally {
      setHintLoadingIdx(null);
    }
  }

  async function handleModerateParticipant(
    action: "kick" | "block" | "unblock",
    targetUserId: string,
    participantId?: string
  ) {
    if (!test || !isFounder) return;
    setModeratingId(participantId || targetUserId);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await fetch(`/api/tests/${encodeURIComponent(test.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetUserId, participantId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Amalni bajarib bo'lmadi.");
        return;
      }
      if (data.test) setTest(data.test);
      setInfoMsg(data.message || "Yangilandi.");
    } catch {
      setErrorMsg("Amalda tarmoq xatoligi yuz berdi.");
    } finally {
      setModeratingId(null);
    }
  }

  async function handleSubmit() {
    if (!test) return;
    setSubmitting(true);
    setErrorMsg(null);
    setInfoMsg(null);

    const questions = Array.isArray(test.questionsJson) ? test.questionsJson : [];
    let score = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.correctIndex) score += 1;
    });
    const total = questions.length || test.questionCount;

    try {
      const res = await fetch(`/api/tests/${test.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score, total }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Natijani saqlashda xato.");
        return;
      }
      setResult({ score, total });
      setInfoMsg(`Natija saqlandi: ${score} / ${total}`);
      await loadTest();
    } catch {
      setErrorMsg("Yuborishda xato.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmAndDownloadPdf() {
    if (!test) return;
    try {
      setDownloadingPdf(true);
      const query = new URLSearchParams({
        bg: pdfBgIcon,
        blanks: String(blankLines),
        header: customHeaderText.trim(),
      });
      const res = await fetch(
        `/api/tests/${encodeURIComponent(test.id)}/pdf?${query.toString()}`
      );
      if (!res.ok) {
        setErrorMsg("Serverdan PDF yuklab olishda xato yuz berdi.");
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
    } catch {
      setErrorMsg("PDF faylni saqlashda xato.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  const questions: QuestionItem[] = Array.isArray(test?.questionsJson)
    ? test.questionsJson
    : [];
  const participants: ParticipantItem[] = Array.isArray(test?.participants)
    ? test.participants
    : [];
  const blockedIds: string[] = Array.isArray(test?.blockedUserIds)
    ? test.blockedUserIds
    : [];

  const isLight = pageTheme === "light";
  const aiEnabledOnTest = Boolean(test?.allowParticipantAi);

  return (
    <main
      className={`min-h-screen p-6 md:p-10 transition-colors ${
        isLight ? "bg-stone-100 text-stone-900" : "bg-neutral-950 text-neutral-100"
      }`}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-xs underline opacity-80 hover:opacity-100" href="/tests">
            ← Barcha ochiq testlarga qaytish
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {isFounder && test && (
              <>
                <button
                  type="button"
                  onClick={handleToggleTestAi}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                    aiEnabledOnTest
                      ? "bg-emerald-500 text-neutral-950 border-emerald-400"
                      : "border-neutral-700 opacity-85"
                  }`}
                >
                  Testda AI: {aiEnabledOnTest ? "ON" : "OFF"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowParticipantsPanel((s) => !s)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-700 cursor-pointer"
                >
                  Kirganlar ({participants.length}) / Datalar
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setPageTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="px-3 py-1.5 rounded-lg text-xs border border-neutral-700 cursor-pointer"
            >
              Theme: {pageTheme.toUpperCase()}
            </button>

            <button
              type="button"
              disabled={!test}
              onClick={() => setPdfModalOpen(true)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 ${
                isLight ? "bg-stone-900 text-white" : "bg-white text-neutral-950"
              }`}
            >
              .PDF Yuklash
            </button>
          </div>
        </div>

        {/* Modal when .PDF clicked */}
        {pdfModalOpen && test && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div
              className={`w-full max-w-md rounded-xl border p-5 space-y-4 ${
                isLight
                  ? "bg-white text-stone-900 border-stone-300"
                  : "bg-neutral-900 text-neutral-100 border-neutral-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">.PDF Dizayn va Effekt Sozlamalari</h2>
                <button
                  type="button"
                  onClick={() => setPdfModalOpen(false)}
                  className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block opacity-75 mb-1">
                    Orqa fon ikon / effekti (yulduzcha va boshqalar)
                  </label>
                  <select
                    value={pdfBgIcon}
                    onChange={(e) =>
                      setPdfBgIcon(
                        e.target.value as
                          | "none"
                          | "stars"
                          | "books"
                          | "grid"
                          | "waves"
                      )
                    }
                    className={`w-full rounded-lg border px-3 py-2 ${
                      isLight
                        ? "bg-stone-50 border-stone-300 text-stone-900"
                        : "bg-neutral-950 border-neutral-700 text-white"
                    }`}
                  >
                    <option value="stars">Stars (Yulduzcha effekti)</option>
                    <option value="books">Books (Kitoblar naqshi)</option>
                    <option value="grid">Grid (Katak naqshi)</option>
                    <option value="waves">Waves (To&apos;lqin effekti)</option>
                    <option value="none">None (Effektsiz)</option>
                  </select>
                </div>

                <div>
                  <label className="block opacity-75 mb-1">
                    Tepada ______ yozish qatorlari
                  </label>
                  <select
                    value={blankLines}
                    onChange={(e) => setBlankLines(Number(e.target.value))}
                    className={`w-full rounded-lg border px-3 py-2 ${
                      isLight
                        ? "bg-stone-50 border-stone-300 text-stone-900"
                        : "bg-neutral-950 border-neutral-700 text-white"
                    }`}
                  >
                    <option value={0}>0 ta</option>
                    <option value={1}>1 qator (Name / Date)</option>
                    <option value={2}>2 qator (Name / Class / Score)</option>
                    <option value={3}>3 qator (+ Notes)</option>
                  </select>
                </div>

                <div>
                  <label className="block opacity-75 mb-1">
                    Tepadagi qo&apos;shimcha yozuv
                  </label>
                  <input
                    type="text"
                    value={customHeaderText}
                    onChange={(e) => setCustomHeaderText(e.target.value)}
                    placeholder="Masalan: 9-sinf Mock / Variant A"
                    className={`w-full rounded-lg border px-3 py-2 ${
                      isLight
                        ? "bg-stone-50 border-stone-300 text-stone-900"
                        : "bg-neutral-950 border-neutral-700 text-white"
                    }`}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPdfModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg text-xs border border-neutral-700 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  disabled={downloadingPdf}
                  onClick={confirmAndDownloadPdf}
                  className={`px-4 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 ${
                    isLight ? "bg-stone-900 text-white" : "bg-white text-neutral-950"
                  }`}
                >
                  {downloadingPdf ? "Yuklanmoqda..." : "Serverdan .PDF Yuklash"}
                </button>
              </div>
            </div>
          </div>
        )}

        {infoMsg && (
          <div className="rounded-lg border border-emerald-600/50 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-300">
            {infoMsg}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-lg border border-red-600/50 bg-red-950/30 px-4 py-3 text-xs text-red-300">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <p className="text-sm opacity-70">Test yuklanmoqda...</p>
        ) : !test ? (
          <div className="rounded-xl border border-neutral-800 p-6 text-sm opacity-75">
            Test topilmadi. ID: <code>{testId}</code>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Founder-only participants, data, kick & block panel */}
            {isFounder && showParticipantsPanel && (
              <div
                className={`rounded-xl border p-4 space-y-3 ${
                  isLight
                    ? "bg-white border-stone-300"
                    : "bg-neutral-900/70 border-neutral-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">
                    Founder Panel · Kirganlar &amp; Datalar ({participants.length} ta)
                  </h2>
                  <span className="text-[11px] opacity-65">
                    Blocklanganlar: {blockedIds.length} ta
                  </span>
                </div>

                {participants.length === 0 ? (
                  <p className="text-xs opacity-70">Hozircha boshqa qatnashuvchi yo&apos;q.</p>
                ) : (
                  <div className="divide-y divide-neutral-800/60 text-xs">
                    {participants.map((p) => {
                      const fullName = `${p.user?.firstName || ""} ${
                        p.user?.lastName || ""
                      }`.trim();
                      const busy = moderatingId === p.id || moderatingId === p.userId;
                      return (
                        <div
                          key={p.id}
                          className="py-2 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-medium">
                              {fullName || p.user?.userName || p.userId}
                            </span>{" "}
                            <span className="opacity-65">@{p.user?.userName}</span>
                            <span className="ml-2 px-2 py-0.5 rounded bg-neutral-800 text-[11px]">
                              Natija:{" "}
                              {p.score !== null && p.total !== null
                                ? `${p.score}/${p.total}`
                                : "Jarayonda"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                handleModerateParticipant("kick", p.userId, p.id)
                              }
                              className="px-2.5 py-1 rounded border border-amber-500/50 text-amber-300 hover:bg-amber-950/30 cursor-pointer disabled:opacity-40"
                            >
                              Chiqarish
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                handleModerateParticipant("block", p.userId, p.id)
                              }
                              className="px-2.5 py-1 rounded border border-rose-500/50 text-rose-300 hover:bg-rose-950/30 cursor-pointer disabled:opacity-40"
                            >
                              Block qilish
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {blockedIds.length > 0 && (
                  <div className="pt-2 border-t border-neutral-800/60 flex flex-wrap items-center gap-2 text-xs">
                    <span className="opacity-70">Blocklanganlar:</span>
                    {blockedIds.map((bId) => (
                      <span
                        key={bId}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-950/40 border border-rose-700/40 text-rose-200"
                      >
                        <code>{bId}</code>
                        <button
                          type="button"
                          onClick={() => handleModerateParticipant("unblock", bId)}
                          className="underline cursor-pointer"
                        >
                          Unblock
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              className={`rounded-xl border p-6 space-y-2 ${
                cardDesign === "paper"
                  ? "bg-amber-50 text-stone-900 border-amber-300"
                  : cardDesign === "card"
                  ? isLight
                    ? "bg-white border-stone-300 shadow-sm"
                    : "bg-neutral-900 border-neutral-700"
                  : isLight
                  ? "bg-white border-stone-200"
                  : "bg-neutral-900/60 border-neutral-800"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-2xl font-semibold">{test.title}</h1>
                <span className="text-xs px-2.5 py-1 rounded-full border border-neutral-600">
                  {test.status}
                </span>
              </div>
              <p className="text-xs opacity-75">
                {test.topic} · {test.level} · {questions.length} savol · Founder: @
                {test.creator?.userName} · AI: {aiEnabledOnTest ? "ON" : "OFF"}
              </p>

              {result && (
                <div className="mt-3 rounded-lg bg-emerald-950/40 border border-emerald-600/40 px-4 py-2.5 text-sm font-medium text-emerald-300">
                  Natija: {result.score} / {result.total}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {questions.map((q, qIdx) => (
                <div
                  key={q.id ?? qIdx}
                  className={`rounded-xl border p-4 space-y-2.5 ${
                    cardDesign === "paper"
                      ? "bg-amber-50/90 text-stone-900 border-amber-300"
                      : isLight
                      ? "bg-white border-stone-200"
                      : "bg-neutral-900/60 border-neutral-800"
                  }`}
                >
                  <p className="text-sm font-medium">
                    {qIdx + 1}. {q.question}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, oIdx) => {
                      const picked = answers[qIdx] === oIdx;
                      return (
                        <button
                          key={oIdx}
                          type="button"
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))
                          }
                          className={`text-left rounded-md border px-3 py-2 text-xs transition cursor-pointer ${
                            picked
                              ? "bg-white text-neutral-950 border-white font-medium"
                              : "border-neutral-700/70 hover:border-neutral-500"
                          }`}
                        >
                          {String.fromCharCode(65 + oIdx)}. {opt}
                        </button>
                      );
                    })}
                  </div>

                  {/* Shown ONLY when test.allowParticipantAi === true */}
                  {aiEnabledOnTest && (
                    <div className="pt-2 border-t border-neutral-800/60 space-y-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={doubtInputs[qIdx] || ""}
                          onChange={(e) =>
                            setDoubtInputs((prev) => ({
                              ...prev,
                              [qIdx]: e.target.value,
                            }))
                          }
                          placeholder="Nimani tushunmadingiz? (tayyor javob berilmaydi)"
                          className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs ${
                            isLight
                              ? "bg-stone-50 border-stone-300 text-stone-900"
                              : "bg-neutral-950 border-neutral-800 text-white"
                          }`}
                        />
                        <button
                          type="button"
                          disabled={hintLoadingIdx === qIdx}
                          onClick={() => handleAskTutor(qIdx)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium border border-emerald-500/50 text-emerald-300 hover:bg-emerald-950/30 cursor-pointer disabled:opacity-50"
                        >
                          {hintLoadingIdx === qIdx ? "Tushuntirilmoqda..." : "AI Tushuntirish"}
                        </button>
                      </div>
                      {aiHints[qIdx] && (
                        <p className="text-xs rounded-md bg-emerald-950/25 border border-emerald-700/30 p-2.5 text-emerald-200">
                          {aiHints[qIdx]}
                        </p>
                      )}
                    </div>
                  )}

                  {result && (
                    <p className="text-xs opacity-80 pt-1">Izoh: {q.explanation}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className={`rounded-lg px-6 py-2.5 text-sm font-medium cursor-pointer disabled:opacity-50 ${
                  isLight ? "bg-stone-900 text-white" : "bg-white text-neutral-950"
                }`}
              >
                {submitting ? "Saqlanmoqda..." : "Testni Yakunlash va Saqlash"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
