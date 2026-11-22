"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { GradedQuestionResult, ReadingPassageItem } from "@/lib/reading-ai";

interface ParticipantRow {
  id: string;
  userId: string;
  score: number | null;
  total: number | null;
  user: { firstName: string; lastName: string | null; userName: string };
}

interface ReadingDetail {
  id: string;
  title: string;
  topic: string;
  level: string;
  length: string;
  passageCount: number;
  questionsPerPassage: number;
  questionType?: "test" | "question";
  status: "OPEN" | "CLOSED";
  allowParticipantAi: boolean;
  blockedUserIds?: string[];
  passagesJson: ReadingPassageItem[];
  creator: { userName: string };
  participants: ParticipantRow[];
}

function ReadingDetailContent() {
  const params = useParams<{ id: string }>();
  const readingId = params?.id ?? "";

  const [reading, setReading] = useState<ReadingDetail | null>(null);
  const [isFounder, setIsFounder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [grading, setGrading] = useState(false);
  const [gradeReport, setGradeReport] = useState<{
    score: number;
    total: number;
    results: GradedQuestionResult[];
    summary: string;
  } | null>(null);

  const [doubts, setDoubts] = useState<Record<string, string>>({});
  const [hints, setHints] = useState<Record<string, string>>({});
  const [loadingHintKey, setLoadingHintKey] = useState<string | null>(null);

  const [moderatingId, setModeratingId] = useState<string | null>(null);

  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfBg, setPdfBg] = useState<"stars" | "books" | "grid" | "waves" | "none">("stars");
  const [blankLines, setBlankLines] = useState<number>(2);
  const [customHeader, setCustomHeader] = useState<string>("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadReading = useCallback(async () => {
    if (!readingId) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/reading/${encodeURIComponent(readingId)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (typeof data.isFounder === "boolean") setIsFounder(data.isFounder);
      if (data.reading) setReading(data.reading);
      if (!res.ok) setErr(data.error || "Reading'ni ochishda xato.");
    } catch {
      setErr("Tarmoq xatoligi.");
    } finally {
      setLoading(false);
    }
  }, [readingId]);

  useEffect(() => {
    loadReading();
  }, [loadReading]);

  async function handleToggleAi() {
    if (!reading || !isFounder) return;
    setErr(null);
    const nextAi = !Boolean(reading.allowParticipantAi);
    const res = await fetch(`/api/reading/${encodeURIComponent(reading.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowParticipantAi: nextAi }),
    });
    const data = await res.json();
    if (res.ok && data.reading) {
      setReading(data.reading);
      setMsg(`Reading'da AI ${nextAi ? "ON" : "OFF"} qilindi.`);
    }
  }

  async function handleModerate(
    action: "kick" | "block" | "unblock",
    targetUserId: string,
    participantId?: string
  ) {
    if (!reading || !isFounder) return;
    setModeratingId(participantId || targetUserId);
    setErr(null);
    try {
      const res = await fetch(`/api/reading/${encodeURIComponent(reading.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetUserId, participantId }),
      });
      const data = await res.json();
      if (res.ok && data.reading) {
        setReading(data.reading);
        setMsg(data.message || "Yangilandi.");
      } else {
        setErr(data.error || "Amal bajarilmadi.");
      }
    } finally {
      setModeratingId(null);
    }
  }

  async function handleAskHint(pIdx: number, qIdx: number) {
    if (!reading || !reading.allowParticipantAi) return;
    const key = `${pIdx}-${qIdx}`;
    setLoadingHintKey(key);
    setErr(null);
    try {
      const res = await fetch(`/api/reading/${encodeURIComponent(reading.id)}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passageIndex: pIdx,
          questionIndex: qIdx,
          doubt: doubts[key] || "",
        }),
      });
      const data = await res.json();
      if (res.ok && data.hint) {
        setHints((prev) => ({ ...prev, [key]: data.hint }));
      } else {
        setErr(data.error || "AI tushuntirish olib bo'lmadi.");
      }
    } finally {
      setLoadingHintKey(null);
    }
  }

  async function handleGradeWithAi() {
    if (!reading) return;
    setGrading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/reading/${encodeURIComponent(reading.id)}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, textAnswers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "AI tekshiruvida xato.");
        return;
      }
      setGradeReport(data);
      setMsg(`AI tekshirdi: ${data.score} / ${data.total}`);
      await loadReading();
    } finally {
      setGrading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!reading) return;
    setDownloadingPdf(true);
    try {
      const paramsObj = new URLSearchParams({
        bg: pdfBg,
        blanks: String(blankLines),
        header: customHeader.trim(),
      });
      const res = await fetch(
        `/api/reading/${encodeURIComponent(reading.id)}/pdf?${paramsObj.toString()}`
      );
      if (!res.ok) {
        setErr("PDF yuklab olishda xato.");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(reading.title || "reading")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setPdfModalOpen(false);
    } finally {
      setDownloadingPdf(false);
    }
  }

  const passages: ReadingPassageItem[] = Array.isArray(reading?.passagesJson)
    ? reading.passagesJson
    : [];
  const participants = Array.isArray(reading?.participants)
    ? reading.participants
    : [];
  const blockedIds = Array.isArray(reading?.blockedUserIds)
    ? reading.blockedUserIds
    : [];
  const aiEnabled = Boolean(reading?.allowParticipantAi);
  const mode = reading?.questionType === "question" ? "question" : "test";

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-xs underline opacity-80 hover:opacity-100" href="/reading">
            ← Reading ro&apos;yxatiga qaytish
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {isFounder && reading && (
              <button
                type="button"
                onClick={handleToggleAi}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                  aiEnabled
                    ? "bg-emerald-500 text-neutral-950 border-emerald-400"
                    : "border-neutral-700 opacity-85"
                }`}
              >
                Readingda AI: {aiEnabled ? "ON" : "OFF"}
              </button>
            )}
            <button
              type="button"
              disabled={!reading}
              onClick={() => setPdfModalOpen(true)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-white text-neutral-950 cursor-pointer disabled:opacity-50"
            >
              .PDF Yuklash
            </button>
          </div>
        </div>

        {pdfModalOpen && reading && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">.PDF Dizayn va Effektlar</h2>
                <button
                  type="button"
                  onClick={() => setPdfModalOpen(false)}
                  className="text-xs opacity-70 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block opacity-75 mb-1">Orqa fon effekti</label>
                  <select
                    value={pdfBg}
                    onChange={(e) =>
                      setPdfBg(
                        e.target.value as "stars" | "books" | "grid" | "waves" | "none"
                      )
                    }
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2"
                  >
                    <option value="stars">Stars (Yulduzcha)</option>
                    <option value="books">Books (Kitoblar)</option>
                    <option value="grid">Grid (Katak)</option>
                    <option value="waves">Waves (To&apos;lqin)</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div>
                  <label className="block opacity-75 mb-1">
                    Tepada va savol tagida ______ qatorlari
                  </label>
                  <select
                    value={blankLines}
                    onChange={(e) => setBlankLines(Number(e.target.value))}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2"
                  >
                    <option value={0}>0 ta (savol tagida 1 ta chiziq)</option>
                    <option value={1}>1 qator (Name / Date)</option>
                    <option value={2}>2 qator (Name / Class / Score)</option>
                    <option value={3}>3 qator (+ Notes)</option>
                  </select>
                </div>
                <div>
                  <label className="block opacity-75 mb-1">Qo&apos;shimcha yozuv</label>
                  <input
                    type="text"
                    value={customHeader}
                    onChange={(e) => setCustomHeader(e.target.value)}
                    placeholder="Masalan: Reading Practice #1"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2"
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
                  onClick={handleDownloadPdf}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-white text-neutral-950 cursor-pointer disabled:opacity-50"
                >
                  {downloadingPdf ? "Yuklanmoqda..." : "Serverdan .PDF Yuklash"}
                </button>
              </div>
            </div>
          </div>
        )}

        {msg && (
          <div className="rounded-lg border border-emerald-600/50 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-300">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-600/50 bg-red-950/30 px-4 py-3 text-xs text-red-300">
            {err}
          </div>
        )}

        {loading ? (
          <p className="text-sm opacity-70">Yuklanmoqda...</p>
        ) : !reading ? (
          <div className="rounded-xl border border-neutral-800 p-6 text-sm opacity-75">
            Reading topilmadi: <code>{readingId}</code>
          </div>
        ) : (
          <div className="space-y-6">
            {isFounder && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">
                    Founder Panel · Kirganlar &amp; Datalar ({participants.length})
                  </span>
                  <span className="opacity-70">Blocklanganlar: {blockedIds.length}</span>
                </div>
                {participants.length === 0 ? (
                  <p className="text-xs opacity-65">Hozircha boshqa qatnashuvchi yo&apos;q.</p>
                ) : (
                  <div className="divide-y divide-neutral-800 text-xs">
                    {participants.map((p) => {
                      const busy = moderatingId === p.id || moderatingId === p.userId;
                      return (
                        <div
                          key={p.id}
                          className="py-2 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-medium">
                              {`${p.user?.firstName || ""} ${p.user?.lastName || ""}`.trim() ||
                                p.user?.userName}
                            </span>{" "}
                            <span className="opacity-65">@{p.user?.userName}</span>
                            <span className="ml-2 px-2 py-0.5 rounded bg-neutral-800">
                              {p.score !== null && p.total !== null
                                ? `${p.score}/${p.total}`
                                : "Jarayonda"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleModerate("kick", p.userId, p.id)}
                              className="px-2.5 py-1 rounded border border-amber-500/50 text-amber-300 cursor-pointer disabled:opacity-40"
                            >
                              Chiqarish
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleModerate("block", p.userId, p.id)}
                              className="px-2.5 py-1 rounded border border-rose-500/50 text-rose-300 cursor-pointer disabled:opacity-40"
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
                  <div className="pt-2 border-t border-neutral-800 flex flex-wrap gap-2 text-xs">
                    {blockedIds.map((bId) => (
                      <span
                        key={bId}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-950/40 border border-rose-700/40"
                      >
                        <code>{bId}</code>
                        <button
                          type="button"
                          onClick={() => handleModerate("unblock", bId)}
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

            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h1 className="text-2xl font-semibold">{reading.title}</h1>
                <span className="text-xs px-2.5 py-1 rounded-full border border-neutral-600">
                  {reading.status} · {mode.toUpperCase()}
                </span>
              </div>
              <p className="text-xs opacity-75">
                {reading.topic} · {reading.level} · {reading.length} · {passages.length} matn · AI:{" "}
                {aiEnabled ? "ON" : "OFF"}
              </p>
              {gradeReport && (
                <div className="mt-3 rounded-lg border border-emerald-600/40 bg-emerald-950/30 p-4 space-y-1 text-xs text-emerald-200">
                  <p className="text-sm font-semibold">
                    AI Natija: {gradeReport.score} / {gradeReport.total}
                  </p>
                  <p>{gradeReport.summary}</p>
                </div>
              )}
            </div>

            <div className="space-y-8">
              {passages.map((p, pIdx) => (
                <section
                  key={p.id ?? pIdx}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 space-y-4"
                >
                  <h2 className="text-lg font-semibold">
                    {pIdx + 1}. {p.title}
                  </h2>
                  <p className="text-sm leading-relaxed opacity-90 whitespace-pre-line">
                    {p.text}
                  </p>

                  <div className="space-y-3 pt-2 border-t border-neutral-800">
                    {(p.questions || []).map((q, qIdx) => {
                      const key = `${pIdx}-${qIdx}`;
                      const picked = answers[key];
                      const isOpenQ =
                        q.type === "question" ||
                        mode === "question" ||
                        !Array.isArray(q.options) ||
                        q.options.length === 0;
                      const gradedItem = gradeReport?.results?.find(
                        (r) => r.passageIndex === pIdx && r.questionIndex === qIdx
                      );

                      return (
                        <div
                          key={q.id ?? qIdx}
                          className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4 space-y-2.5"
                        >
                          <p className="text-sm font-medium">
                            {qIdx + 1}) {q.question}
                          </p>

                          {isOpenQ ? (
                            <textarea
                              rows={3}
                              value={textAnswers[key] || ""}
                              onChange={(e) =>
                                setTextAnswers((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              placeholder="Javobingizni shu yerga yozing..."
                              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-white"
                            />
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {(q.options || []).map((opt, oIdx) => {
                                const selected = picked === oIdx;
                                return (
                                  <button
                                    key={oIdx}
                                    type="button"
                                    onClick={() =>
                                      setAnswers((prev) => ({ ...prev, [key]: oIdx }))
                                    }
                                    className={`text-left rounded-md border px-3 py-2 text-xs cursor-pointer ${
                                      selected
                                        ? "bg-white text-neutral-950 border-white font-medium"
                                        : "border-neutral-800 hover:border-neutral-600"
                                    }`}
                                  >
                                    {String.fromCharCode(65 + oIdx)}. {opt}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {aiEnabled && (
                            <div className="pt-2 border-t border-neutral-800/70 space-y-2">
                              <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                  type="text"
                                  value={doubts[key] || ""}
                                  onChange={(e) =>
                                    setDoubts((prev) => ({
                                      ...prev,
                                      [key]: e.target.value,
                                    }))
                                  }
                                  placeholder="Nimani tushunmadingiz? (tayyor javob berilmaydi)"
                                  className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs"
                                />
                                <button
                                  type="button"
                                  disabled={loadingHintKey === key}
                                  onClick={() => handleAskHint(pIdx, qIdx)}
                                  className="px-3 py-1.5 rounded-md text-xs border border-emerald-500/50 text-emerald-300 cursor-pointer disabled:opacity-50"
                                >
                                  {loadingHintKey === key
                                    ? "Tushuntirilmoqda..."
                                    : "AI Tushuntirish"}
                                </button>
                              </div>
                              {hints[key] && (
                                <p className="text-xs rounded-md bg-emerald-950/25 border border-emerald-700/30 p-2.5 text-emerald-200">
                                  {hints[key]}
                                </p>
                              )}
                            </div>
                          )}

                          {gradedItem && (
                            <p
                              className={`text-xs pt-1 ${
                                gradedItem.isCorrect ? "text-emerald-300" : "text-amber-300"
                              }`}
                            >
                              {gradedItem.aiFeedback}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={grading}
                onClick={handleGradeWithAi}
                className="rounded-lg bg-white text-neutral-950 px-6 py-2.5 text-sm font-medium cursor-pointer disabled:opacity-50"
              >
                {grading ? "AI tekshirmoqda..." : "Javoblarni AI Tekshirsin"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ReadingDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
          <p className="text-sm opacity-75">Reading yuklanmoqda...</p>
        </main>
      }
    >
      <ReadingDetailContent />
    </Suspense>
  );
}
