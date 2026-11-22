"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { GradedQuestionResult, ReadingPassageItem } from "@/lib/reading-ai";
import { useNotification } from "@/components/notification-provider";
import { useTheme } from "@/components/theme-provider";
import { UiModal } from "@/components/ui-modal";

interface ParticipantRow {
  id: string;
  userId: string;
  score: number | null;
  total: number | null;
  feedbackJson?: unknown;
  user: { firstName: string; lastName: string | null; userName: string };
}

interface ModeratedUser {
  id: string;
  firstName: string;
  lastName: string | null;
  userName: string;
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
  blockedUsers?: ModeratedUser[];
  kickedUsers?: ModeratedUser[];
  passagesJson: ReadingPassageItem[];
  creatorId: string;
  creator: { id: string; firstName?: string; lastName?: string | null; userName: string };
  participants: ParticipantRow[];
}

function ReadingDetailContent() {
  const params = useParams<{ id: string }>();
  const readingId = params?.id ?? "";
  const themeCtx = useTheme();
  const theme = themeCtx.theme;
  const toggleTheme = () => themeCtx.setTheme(theme === "dark" ? "light" : "dark");
  const notifyApi = useNotification();

  const [reading, setReading] = useState<ReadingDetail | null>(null);
  const [isFounder, setIsFounder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blockedState, setBlockedState] = useState<{ isBlocked?: boolean; isKicked?: boolean; message: string } | null>(null);

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

  const [participantsModalOpen, setParticipantsModalOpen] = useState(false);
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
      const res = await fetch(`/api/reading/${encodeURIComponent(readingId)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (res.status === 403) {
        setBlockedState({
          isBlocked: data.isBlocked,
          isKicked: data.isKicked,
          message: data.error || "Sizga ushbu reading to'plamiga kirish taqiqlangan.",
        });
        setReading(null);
        return;
      }

      setBlockedState(null);
      if (typeof data.isFounder === "boolean") setIsFounder(data.isFounder);
      if (res.ok && data.reading) {
        setReading(data.reading);
        if (data.currentUserParticipant && typeof data.currentUserParticipant.score === "number") {
          const r = data.currentUserParticipant;
          setGradeReport({
            score: r.score,
            total: r.total ?? 10,
            results: Array.isArray(r.feedbackJson?.results) ? r.feedbackJson.results : [],
            summary: r.feedbackJson?.summary || `Oldingi natijangiz: ${r.score}/${r.total}`,
          });
        }
      } else {
        notifyApi.show(data.error || "Reading'ni ochishda xato.");
      }
    } catch {
      notifyApi.show("Tarmoq xatoligi.");
    } finally {
      setLoading(false);
    }
  }, [readingId, notifyApi]);

  useEffect(() => {
    loadReading();
  }, [loadReading]);

  async function handleToggleAi() {
    if (!reading || !isFounder) return;
    const nextAi = !Boolean(reading.allowParticipantAi);
    const res = await fetch(`/api/reading/${encodeURIComponent(reading.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowParticipantAi: nextAi }),
    });
    const data = await res.json();
    if (res.ok && data.reading) {
      setReading(data.reading);
      notifyApi.show(`Reading'da AI ${nextAi ? "ON" : "OFF"} qilindi.`);
    }
  }

  async function handleModerate(
    action: "kick" | "unkick" | "block" | "unblock",
    targetUserId: string,
    participantId?: string
  ) {
    if (!reading || !isFounder) return;
    setModeratingId(participantId || targetUserId);
    try {
      const res = await fetch(`/api/reading/${encodeURIComponent(reading.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetUserId, participantId }),
      });
      const data = await res.json();
      if (res.ok && data.reading) {
        setReading(data.reading);
        notifyApi.show(data.message || "Ishtirokchi holati yangilandi.");
      } else {
        notifyApi.show(data.error || "Amal bajarilmadi.");
      }
    } finally {
      setModeratingId(null);
    }
  }

  async function handleAskHint(pIdx: number, qIdx: number) {
    if (!reading || !reading.allowParticipantAi) return;
    const key = `${pIdx}-${qIdx}`;
    setLoadingHintKey(key);
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
        notifyApi.show(data.error || "AI tushuntirish olib bo'lmadi.");
      }
    } finally {
      setLoadingHintKey(null);
    }
  }

  async function handleGrade() {
    if (!reading) return;
    setGrading(true);
    try {
      const res = await fetch(`/api/reading/${encodeURIComponent(reading.id)}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          textAnswers,
        }),
      });
      const data = await res.json();
      if (res.ok && data.report) {
        setGradeReport(data.report);
        notifyApi.show(
          `Tekshirildi: ${data.report.score}/${data.report.total} to'g'ri.`,
          "success"
        );
      } else {
        notifyApi.show(data.error || "Baholashda xatolik.");
      }
    } catch {
      notifyApi.show("Tarmoq xatoligi.");
    } finally {
      setGrading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!reading) return;
    setDownloadingPdf(true);
    try {
      const q = new URLSearchParams({
        bg: pdfBg,
        blanks: String(blankLines),
        header: customHeader.trim(),
      });
      const res = await fetch(
        `/api/reading/${encodeURIComponent(reading.id)}/pdf?${q.toString()}`
      );
      if (!res.ok) {
        notifyApi.show("PDF faylni yuklab bo'lmadi.");
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
      notifyApi.show(".PDF yuklab olindi.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  const isLight = theme === "light";
  const passages = Array.isArray(reading?.passagesJson) ? reading.passagesJson : [];
  const participants = Array.isArray(reading?.participants) ? reading.participants : [];
  const blockedUsers = Array.isArray(reading?.blockedUsers) ? reading.blockedUsers : [];
  const kickedUsers = Array.isArray(reading?.kickedUsers) ? reading.kickedUsers : [];
  const blockedIds = Array.isArray(reading?.blockedUserIds) ? reading.blockedUserIds : [];
  const totalBlocked = Math.max(blockedUsers.length, blockedIds.length);
  const isOpenMode = reading?.questionType === "question";

  return (
    <main
      className={`min-h-screen p-5 md:p-8 transition-colors ${
        isLight
          ? "bg-stone-100 text-neutral-900"
          : "bg-neutral-950 text-neutral-100"
      }`}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-xs underline opacity-80 hover:opacity-100" href="/reading">
            ← Reading Studio ga qaytish
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {isFounder && reading && (
              <>
                <button
                  type="button"
                  onClick={handleToggleAi}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
                    reading.allowParticipantAi
                      ? "bg-emerald-500 text-neutral-950 border-emerald-400 font-semibold"
                      : isLight
                      ? "bg-white border-stone-300"
                      : "bg-neutral-900 border-neutral-700"
                  }`}
                >
                  Readingda AI: {reading.allowParticipantAi ? "ON" : "OFF"}
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
              disabled={!reading}
              onClick={() => setPdfModalOpen(true)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                isLight ? "bg-neutral-900 text-white" : "bg-white text-neutral-950"
              }`}
            >
              .PDF Yuklash
            </button>
          </div>
        </div>

        {/* Moderation Modal */}
        <UiModal
          open={participantsModalOpen}
          onClose={() => setParticipantsModalOpen(false)}
          title={`Qatnashuvchilar (${participants.length} ta)`}
          subtitle={`Blocklanganlar: ${totalBlocked} ta | Chiqarilganlar: ${kickedUsers.length} ta`}
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-4 text-xs">
            <div>
              <p className="font-semibold text-sm mb-2 opacity-90">Faol qatnashuvchilar</p>
              {participants.length === 0 ? (
                <p className="opacity-60 italic py-2">Hozircha ishtirokchilar mavjud emas.</p>
              ) : (
                <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-xl overflow-hidden px-3">
                  {participants.map((p) => {
                    const busy = moderatingId === p.id || moderatingId === p.userId;
                    const isSelf = p.userId === reading?.creatorId;
                    const fullName =
                      `${p.user?.firstName || ""} ${p.user?.lastName || ""}`.trim() ||
                      p.user?.userName ||
                      "Foydalanuvchi";
                    const scoreLabel =
                      typeof p.score === "number"
                        ? `Natija: ${p.score}/${p.total ?? 10}`
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
                            {isSelf && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300 text-[10px] font-bold">
                                FOUNDER
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] opacity-75 mt-1">{scoreLabel}</p>
                        </div>

                        {!isSelf && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleModerate("kick", p.userId, p.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-amber-500/50 text-amber-300 hover:bg-amber-500/10 cursor-pointer disabled:opacity-40"
                            >
                              Chiqarish (Kick)
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleModerate("block", p.userId, p.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-rose-500/50 text-rose-300 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40"
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

            {totalBlocked > 0 && (
              <div className="pt-3 border-t border-neutral-800 space-y-2">
                <p className="font-semibold text-sm text-rose-400">Blocklanganlar ({totalBlocked} ta)</p>
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
                          className="px-3 py-1 rounded-lg border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 cursor-pointer"
                        >
                          Blokdan chiqarish
                        </button>
                      </div>
                    ))
                  ) : (
                    blockedIds.map((bId) => (
                      <div key={bId} className="flex items-center justify-between p-2 rounded-xl border border-neutral-800">
                        <code>{bId}</code>
                        <button type="button" onClick={() => handleModerate("unblock", bId)} className="underline">Unblock</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {kickedUsers.length > 0 && (
              <div className="pt-3 border-t border-neutral-800 space-y-2">
                <p className="font-semibold text-sm text-amber-400">Chiqarilganlar ({kickedUsers.length} ta)</p>
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
                        className="px-3 py-1 rounded-lg border border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/10 cursor-pointer"
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

        {/* PDF Modal */}
        <UiModal
          open={pdfModalOpen}
          onClose={() => setPdfModalOpen(false)}
          title=".PDF Eksport Sozlamalari"
          subtitle="Akademik varaq ko'rinishi va matnlar"
          maxWidthClass="max-w-md"
        >
          <div className="space-y-3 text-xs">
            <div>
              <label className="block opacity-75 mb-1">Fon uslubi</label>
              <select
                value={pdfBg}
                onChange={(e) => setPdfBg(e.target.value as any)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
              >
                <option value="stars">Yulduzli (Stars)</option>
                <option value="books">Kitoblar (Books)</option>
                <option value="grid">Katakli (Grid)</option>
                <option value="waves">To'lqinli (Waves)</option>
                <option value="none">Oddiy (None)</option>
              </select>
            </div>

            <div>
              <label className="block opacity-75 mb-1">Qatorlar soni</label>
              <select
                value={blankLines}
                onChange={(e) => setBlankLines(Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
              >
                <option value={0}>0 qator</option>
                <option value={1}>1 qator</option>
                <option value={2}>2 qator</option>
                <option value={3}>3 qator</option>
              </select>
            </div>

            <div>
              <label className="block opacity-75 mb-1">Maxsus sarlavha</label>
              <input
                type="text"
                value={customHeader}
                onChange={(e) => setCustomHeader(e.target.value)}
                placeholder="Reading Exam #1"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setPdfModalOpen(false)}
                className="px-3.5 py-2 rounded-xl border border-neutral-700"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={downloadingPdf}
                onClick={handleDownloadPdf}
                className="px-4 py-2 rounded-xl font-semibold bg-white text-neutral-950 disabled:opacity-50"
              >
                {downloadingPdf ? "Yuklanmoqda..." : ".PDF Yuklash"}
              </button>
            </div>
          </div>
        </UiModal>

        {loading ? (
          <p className="text-sm opacity-75">Reading to'plami yuklanmoqda...</p>
        ) : blockedState ? (
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
                href="/reading"
                className="inline-block px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500"
              >
                Reading Studio ga qaytish
              </Link>
            </div>
          </div>
        ) : !reading ? (
          <div className="rounded-2xl border border-neutral-800 p-6 text-sm">
            Reading topilmadi: <code>{readingId}</code>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Header */}
            <div
              className={`rounded-2xl border p-6 flex flex-wrap items-center justify-between gap-4 ${
                isLight
                  ? "bg-white border-stone-200"
                  : "bg-neutral-900/75 border-neutral-800"
              }`}
            >
              <div>
                <h1 className="text-xl md:text-2xl font-bold">{reading.title}</h1>
                <p className="text-xs opacity-75 mt-1">
                  {reading.topic} · {reading.level} · {passages.length} matn · {isOpenMode ? "Ochiq savollar" : "Test savollar"} · Muallif: @{reading.creator?.userName}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold border border-neutral-700">
                {reading.status}
              </span>
            </div>

            {/* Grade Report Banner */}
            {gradeReport && (
              <div
                className={`rounded-2xl border p-5 space-y-2 ${
                  isLight
                    ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                    : "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                }`}
              >
                <p className="text-base font-bold">
                  Yakuniy Baholash: {gradeReport.score} / {gradeReport.total} (
                  {gradeReport.total > 0
                    ? Math.round((gradeReport.score / gradeReport.total) * 100)
                    : 0}
                  %)
                </p>
                <p className="text-xs opacity-85 leading-relaxed">{gradeReport.summary}</p>
              </div>
            )}

            {/* Passages and Questions */}
            <div className="space-y-6">
              {passages.map((p, pIdx) => (
                <div
                  key={p.id ?? pIdx}
                  className={`rounded-2xl border p-6 space-y-5 ${
                    isLight
                      ? "bg-white border-stone-200"
                      : "bg-neutral-900/75 border-neutral-800"
                  }`}
                >
                  <div>
                    <h2 className="text-lg font-bold mb-2">{p.title || `Matn #${pIdx + 1}`}</h2>
                    <div
                      className={`rounded-xl border p-4 text-xs md:text-sm leading-relaxed whitespace-pre-line ${
                        isLight
                          ? "bg-stone-50 border-stone-200 text-neutral-800"
                          : "bg-neutral-950 border-neutral-800 text-neutral-200"
                      }`}
                    >
                      {p.text}
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <p className="text-xs font-semibold opacity-80 uppercase tracking-wider">
                      Ushbu matn savollari:
                    </p>
                    {(p.questions || []).map((q, qIdx) => {
                      const key = `${pIdx}-${qIdx}`;
                      const reportItem = gradeReport?.results?.find(
                        (r) => r.passageIndex === pIdx && r.questionIndex === qIdx
                      );

                      return (
                        <div
                          key={q.id ?? qIdx}
                          className={`rounded-xl border p-4 space-y-3 ${
                            isLight ? "bg-stone-50/50 border-stone-200" : "bg-neutral-950/50 border-neutral-850"
                          }`}
                        >
                          <p className="text-xs md:text-sm font-semibold">
                            {qIdx + 1}. {q.question}
                          </p>

                          {isOpenMode ? (
                            <div>
                              <textarea
                                rows={3}
                                disabled={Boolean(gradeReport)}
                                value={textAnswers[key] || ""}
                                onChange={(e) =>
                                  setTextAnswers((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                placeholder="Javobingizni ingliz tilida batafsil yozing..."
                                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-xs text-neutral-100 focus:outline-none focus:border-neutral-400"
                              />
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {(q.options || []).map((opt, oIdx) => {
                                const isSelected = answers[key] === oIdx;
                                const isCorrect = q.correctIndex === oIdx;
                                let btnCls = isLight
                                  ? "border-stone-200 hover:border-stone-400"
                                  : "border-neutral-800 hover:border-neutral-600";

                                if (gradeReport) {
                                  if (isCorrect) {
                                    btnCls = "border-emerald-500 bg-emerald-500/20 text-emerald-200 font-semibold";
                                  } else if (isSelected) {
                                    btnCls = "border-rose-500 bg-rose-500/20 text-rose-200 font-semibold";
                                  }
                                } else if (isSelected) {
                                  btnCls = isLight
                                    ? "bg-neutral-900 text-white font-semibold"
                                    : "bg-white text-neutral-950 font-semibold";
                                }

                                return (
                                  <button
                                    key={oIdx}
                                    type="button"
                                    disabled={Boolean(gradeReport)}
                                    onClick={() =>
                                      setAnswers((prev) => ({
                                        ...prev,
                                        [key]: oIdx,
                                      }))
                                    }
                                    className={`text-left rounded-xl border p-2.5 text-xs transition cursor-pointer disabled:cursor-default ${btnCls}`}
                                  >
                                    {String.fromCharCode(65 + oIdx)}. {opt}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* AI Hint Section */}
                          {reading.allowParticipantAi && !gradeReport && (
                            <div className="pt-2 border-t border-neutral-850 flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                value={doubts[key] || ""}
                                onChange={(e) =>
                                  setDoubts((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                placeholder="Savol bo'yicha yo'nalish so'rang..."
                                className="flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-100"
                              />
                              <button
                                type="button"
                                disabled={loadingHintKey === key}
                                onClick={() => handleAskHint(pIdx, qIdx)}
                                className="px-3 py-1.5 rounded-xl text-xs font-medium border border-emerald-500/50 text-emerald-300 disabled:opacity-50 cursor-pointer"
                              >
                                {loadingHintKey === key ? "AI o'ylamoqda..." : "AI Maslahat"}
                              </button>
                            </div>
                          )}

                          {hints[key] && (
                            <p className="text-xs p-3 rounded-xl bg-emerald-950/25 border border-emerald-700/30 text-emerald-200 leading-relaxed">
                              {hints[key]}
                            </p>
                          )}

                          {/* Grading Feedback */}
                          {reportItem && (
                            <div
                              className={`p-3 rounded-xl border text-xs space-y-1 ${
                                reportItem.isCorrect
                                  ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-200"
                                  : "border-rose-500/40 bg-rose-950/20 text-rose-200"
                              }`}
                            >
                              <p className="font-bold">
                                {reportItem.isCorrect ? "✓ To'g'ri tahlil" : "✕ Noto'g'ri"}
                              </p>
                              <p className="opacity-90">{reportItem.aiFeedback}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Submit / Grade Button */}
            {!gradeReport && passages.length > 0 && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={grading}
                  onClick={handleGrade}
                  className="px-6 py-3 rounded-xl text-sm font-bold bg-white text-neutral-950 hover:bg-neutral-200 transition cursor-pointer disabled:opacity-50"
                >
                  {grading ? "AI tekshirmoqda..." : "Reading Natijalarini Baholash"}
                </button>
              </div>
            )}
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
