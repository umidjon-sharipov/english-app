"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { GAME_TYPES, GameRoundQuestion } from "@/lib/games-catalog";

interface ParticipantRow {
  id: string;
  userId: string;
  score: number | null;
  total: number | null;
  streak: number | null;
  user: { firstName: string; lastName: string | null; userName: string };
}

interface GameDetail {
  id: string;
  title: string;
  gameType: string;
  topic: string;
  level: string;
  questionCount: number;
  status: "OPEN" | "CLOSED";
  allowParticipantAi: boolean;
  blockedUserIds?: string[];
  questionsJson: GameRoundQuestion[];
  creator: { userName: string };
  participants: ParticipantRow[];
}

type CheckMode = "step" | "end";

function buildExpectedSentence(round: GameRoundQuestion): string {
  if (round.targetSentence && round.targetSentence.trim()) {
    return round.targetSentence.trim();
  }
  const correctOpt = round.options?.[round.correctIndex];
  if (correctOpt && correctOpt.trim()) {
    return correctOpt.trim();
  }
  return (round.chunks || []).join(" ").trim();
}

function normalizeSentence(str: string): string {
  return str
    .toLowerCase()
    .replace(/[.,!?;:'"()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function GameArenaContent() {
  const params = useParams<{ id: string }>();
  const gameId = params?.id ?? "";

  const [game, setGame] = useState<GameDetail | null>(null);
  const [isFounder, setIsFounder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [checkMode, setCheckMode] = useState<CheckMode>("step");
  const [activeIdx, setActiveIdx] = useState(0);

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [slotChunks, setSlotChunks] = useState<Record<number, number[]>>({});
  const [dragPayload, setDragPayload] = useState<{
    from: "pool" | "slot";
    chunkIdx: number;
    slotPos?: number;
  } | null>(null);
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);

  const [checkedRounds, setCheckedRounds] = useState<Record<number, boolean>>({});
  const [roundCorrectMap, setRoundCorrectMap] = useState<Record<number, boolean>>({});
  const [allSubmitted, setAllSubmitted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showClue, setShowClue] = useState<Record<number, boolean>>({});
  const [doubts, setDoubts] = useState<Record<number, string>>({});
  const [hints, setHints] = useState<Record<number, string>>({});
  const [loadingHintIdx, setLoadingHintIdx] = useState<number | null>(null);

  const [moderatingId, setModeratingId] = useState<string | null>(null);

  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfBg, setPdfBg] = useState<"stars" | "books" | "grid" | "waves" | "none">("stars");
  const [blankLines, setBlankLines] = useState<number>(2);
  const [customHeader, setCustomHeader] = useState<string>("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadGame = useCallback(async () => {
    if (!gameId) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/games/${encodeURIComponent(gameId)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (typeof data.isFounder === "boolean") setIsFounder(data.isFounder);
      if (data.game) setGame(data.game);
      if (!res.ok) setErr(data.error || "O'yinni ochishda xato.");
    } catch {
      setErr("Tarmoq xatoligi.");
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  const rounds: GameRoundQuestion[] = useMemo(
    () => (Array.isArray(game?.questionsJson) ? game.questionsJson : []),
    [game]
  );

  const currentRound = rounds[activeIdx] || rounds[0];
  const meta = useMemo(
    () => GAME_TYPES.find((g) => g.id === game?.gameType) || GAME_TYPES[0],
    [game]
  );

  const isScramble = game?.gameType === "sentence-scramble";
  const isPairCardGame = [
    "phrasal-match",
    "synonym-duel",
    "antonym-clash",
    "collocation-chain",
  ].includes(game?.gameType || "");

  const scrambleChunks: string[] = useMemo(() => {
    if (!currentRound) return [];
    if (Array.isArray(currentRound.chunks) && currentRound.chunks.length >= 2) {
      return currentRound.chunks;
    }
    const target = buildExpectedSentence(currentRound);
    const words = target.split(/\s+/).filter(Boolean);
    if (words.length >= 3) {
      return words.map((_, i) => words[(i * 2 + 1) % words.length]);
    }
    return currentRound.options || [];
  }, [currentRound]);

  const currentSlotOrder: number[] = slotChunks[activeIdx] || [];
  const assembledSentence = currentSlotOrder
    .map((cIdx) => scrambleChunks[cIdx] ?? "")
    .filter(Boolean)
    .join(" ");

  function evaluateRound(rIdx: number, roundItem: GameRoundQuestion): boolean {
    if (game?.gameType === "sentence-scramble") {
      const order = slotChunks[rIdx] || [];
      if (order.length > 0) {
        const chList =
          Array.isArray(roundItem.chunks) && roundItem.chunks.length >= 2
            ? roundItem.chunks
            : buildExpectedSentence(roundItem).split(/\s+/).filter(Boolean);
        const built = order
          .map((cIdx) => chList[cIdx] ?? "")
          .filter(Boolean)
          .join(" ");
        const expected = buildExpectedSentence(roundItem);
        if (built.trim() && expected.trim()) {
          return normalizeSentence(built) === normalizeSentence(expected);
        }
      }
    }
    return answers[rIdx] === roundItem.correctIndex;
  }

  function computeTotals(
    checkedMap: Record<number, boolean>,
    correctMap: Record<number, boolean>,
    forceAll: boolean
  ) {
    let sc = 0;
    let curS = 0;
    let maxS = 0;
    rounds.forEach((r, idx) => {
      const isEv = forceAll || Boolean(checkedMap[idx]);
      const ok =
        typeof correctMap[idx] === "boolean" && checkedMap[idx]
          ? correctMap[idx]
          : evaluateRound(idx, r);
      if (isEv && ok) {
        sc += 1;
        curS += 1;
        if (curS > maxS) maxS = curS;
      } else if (isEv) {
        curS = 0;
      }
    });
    return { score: sc, streak: maxS };
  }

  const { score, streak: bestStreak } = computeTotals(
    checkedRounds,
    roundCorrectMap,
    allSubmitted
  );

  // Persist result event to backend
  async function persistEventResult(
    nextScore: number,
    nextStreak: number,
    eventLabel: string,
    refreshParticipants = false
  ) {
    if (!game) return;
    setSaving(true);
    try {
      await fetch(`/api/games/${encodeURIComponent(game.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: nextScore,
          total: rounds.length,
          streak: nextStreak,
        }),
      });
      setMsg(`${eventLabel}: ${nextScore}/${rounds.length} · Streak ${nextStreak}`);
      if (refreshParticipants) {
        await loadGame();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckCurrentRound() {
    if (!currentRound) return;
    const ok = evaluateRound(activeIdx, currentRound);
    const nextChecked = { ...checkedRounds, [activeIdx]: true };
    const nextCorrect = { ...roundCorrectMap, [activeIdx]: ok };
    setCheckedRounds(nextChecked);
    setRoundCorrectMap(nextCorrect);

    const totals = computeTotals(nextChecked, nextCorrect, allSubmitted);
    await persistEventResult(
      totals.score,
      totals.streak,
      `Round #${activeIdx + 1} tekshirildi (${ok ? "To'g'ri" : "Noto'g'ri"})`
    );
  }

  function handleNextRound() {
    if (activeIdx + 1 < rounds.length) {
      setActiveIdx((i) => i + 1);
      setIsDragOverDropzone(false);
    }
  }

  function handlePrevRound() {
    if (activeIdx > 0) {
      setActiveIdx((i) => i - 1);
      setIsDragOverDropzone(false);
    }
  }

  function handleDropToSlot(insertAt?: number) {
    if (!dragPayload || !currentRound) return;
    const { from, chunkIdx, slotPos } = dragPayload;

    setSlotChunks((prev) => {
      const base = [...(prev[activeIdx] || [])];
      if (from === "pool") {
        if (base.includes(chunkIdx)) return prev;
        if (typeof insertAt === "number" && insertAt >= 0 && insertAt <= base.length) {
          base.splice(insertAt, 0, chunkIdx);
        } else {
          base.push(chunkIdx);
        }
      } else if (from === "slot" && typeof slotPos === "number") {
        const currentIdx = base.indexOf(chunkIdx);
        if (currentIdx === -1) return prev;
        base.splice(currentIdx, 1);
        const targetPos =
          typeof insertAt === "number"
            ? Math.max(0, Math.min(base.length, insertAt))
            : base.length;
        base.splice(targetPos, 0, chunkIdx);
      }
      return { ...prev, [activeIdx]: base };
    });

    setCheckedRounds((prev) => ({ ...prev, [activeIdx]: false }));
    setDragPayload(null);
    setIsDragOverDropzone(false);
  }

  function handleClickChunkFromPool(chunkIdx: number) {
    setSlotChunks((prev) => {
      const base = prev[activeIdx] || [];
      if (base.includes(chunkIdx)) return prev;
      return { ...prev, [activeIdx]: [...base, chunkIdx] };
    });
    setCheckedRounds((prev) => ({ ...prev, [activeIdx]: false }));
  }

  function handleRemoveFromSlot(chunkIdx: number) {
    setSlotChunks((prev) => {
      const base = prev[activeIdx] || [];
      return { ...prev, [activeIdx]: base.filter((id) => id !== chunkIdx) };
    });
    setCheckedRounds((prev) => ({ ...prev, [activeIdx]: false }));
  }

  function handleClearSlot() {
    setSlotChunks((prev) => ({ ...prev, [activeIdx]: [] }));
    setCheckedRounds((prev) => ({ ...prev, [activeIdx]: false }));
  }

  async function handleCheckAllAtEnd() {
    if (!game) return;
    const nextChecked: Record<number, boolean> = {};
    const nextCorrect: Record<number, boolean> = {};

    rounds.forEach((r, idx) => {
      nextChecked[idx] = true;
      nextCorrect[idx] = evaluateRound(idx, r);
    });

    setCheckedRounds(nextChecked);
    setRoundCorrectMap(nextCorrect);
    setAllSubmitted(true);

    const totals = computeTotals(nextChecked, nextCorrect, true);
    await persistEventResult(
      totals.score,
      totals.streak,
      "Barcha raundlar tekshirildi",
      true
    );
  }

  async function handleFinishGame() {
    if (!game) return;
    setFinished(true);
    const totals = computeTotals(checkedRounds, roundCorrectMap, true);
    await persistEventResult(
      totals.score,
      totals.streak,
      "O'yin yakunlandi va saqlandi",
      true
    );
  }

  async function handleToggleAi() {
    if (!game || !isFounder) return;
    const nextAi = !Boolean(game.allowParticipantAi);
    const res = await fetch(`/api/games/${encodeURIComponent(game.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowParticipantAi: nextAi }),
    });
    const data = await res.json();
    if (res.ok && data.game) {
      setGame(data.game);
      setMsg(`O'yinda AI ${nextAi ? "ON" : "OFF"} qilindi.`);
    }
  }

  async function handleModerate(
    action: "kick" | "block" | "unblock",
    targetUserId: string,
    participantId?: string
  ) {
    if (!game || !isFounder) return;
    setModeratingId(participantId || targetUserId);
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(game.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetUserId, participantId }),
      });
      const data = await res.json();
      if (res.ok && data.game) {
        setGame(data.game);
        setMsg(data.message || "Yangilandi.");
      } else {
        setErr(data.error || "Amal bajarilmadi.");
      }
    } finally {
      setModeratingId(null);
    }
  }

  async function handleAskHint(rIdx: number) {
    if (!game || !game.allowParticipantAi) return;
    setLoadingHintIdx(rIdx);
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(game.id)}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundIndex: rIdx,
          doubt: doubts[rIdx] || "",
        }),
      });
      const data = await res.json();
      if (res.ok && data.hint) {
        setHints((prev) => ({ ...prev, [rIdx]: data.hint }));
      } else {
        setErr(data.error || "AI tushuntirish olib bo'lmadi.");
      }
    } finally {
      setLoadingHintIdx(null);
    }
  }

  async function handleDownloadPdf() {
    if (!game) return;
    setDownloadingPdf(true);
    try {
      const q = new URLSearchParams({
        bg: pdfBg,
        blanks: String(blankLines),
        header: customHeader.trim(),
      });
      const res = await fetch(
        `/api/games/${encodeURIComponent(game.id)}/pdf?${q.toString()}`
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(game.title || "game")
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

  const participants = Array.isArray(game?.participants) ? game.participants : [];
  const blockedIds = Array.isArray(game?.blockedUserIds) ? game.blockedUserIds : [];
  const aiEnabled = Boolean(game?.allowParticipantAi);
  const currentChecked = Boolean(allSubmitted || checkedRounds[activeIdx]);
  const currentIsRight = currentRound ? evaluateRound(activeIdx, currentRound) : false;

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#1e1b4b_0%,#09090b_55%,#040406_100%)] text-neutral-100 p-5 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-xs underline opacity-80 hover:opacity-100" href="/games">
            ← O&apos;yinlar studiyasi
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-indigo-500/30 bg-neutral-900/90 p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setCheckMode("step");
                  setAllSubmitted(false);
                }}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  checkMode === "step"
                    ? "bg-indigo-500 text-white font-semibold"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                Tekshir → Next
              </button>
              <button
                type="button"
                onClick={() => setCheckMode("end")}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  checkMode === "end"
                    ? "bg-amber-400 text-neutral-950 font-semibold"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                Oxirida tekshirtir
              </button>
            </div>

            {isFounder && game && (
              <button
                type="button"
                onClick={handleToggleAi}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
                  aiEnabled
                    ? "bg-emerald-400 text-neutral-950 border-emerald-300"
                    : "border-neutral-700 bg-neutral-900/80"
                }`}
              >
                O&apos;yinda AI: {aiEnabled ? "ON" : "OFF"}
              </button>
            )}

            <button
              type="button"
              disabled={!game}
              onClick={() => setPdfModalOpen(true)}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-white text-neutral-950 cursor-pointer disabled:opacity-50"
            >
              .PDF Yuklash
            </button>
          </div>
        </div>

        {pdfModalOpen && game && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-indigo-400/30 bg-neutral-900 p-5 space-y-4 shadow-2xl">
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
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                  >
                    <option value="stars">Stars (Yulduzcha)</option>
                    <option value="books">Books (Kitoblar)</option>
                    <option value="grid">Grid (Katak)</option>
                    <option value="waves">Waves (To&apos;lqin)</option>
                    <option value="none">None</option>
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
                  <label className="block opacity-75 mb-1">Qo&apos;shimcha yozuv</label>
                  <input
                    type="text"
                    value={customHeader}
                    onChange={(e) => setCustomHeader(e.target.value)}
                    placeholder="Masalan: 2D Game Sheet"
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPdfModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs border border-neutral-700 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  disabled={downloadingPdf}
                  onClick={handleDownloadPdf}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white text-neutral-950 cursor-pointer disabled:opacity-50"
                >
                  {downloadingPdf ? "Yuklanmoqda..." : "Serverdan .PDF Yuklash"}
                </button>
              </div>
            </div>
          </div>
        )}

        {msg && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-300">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-xs text-red-300">
            {err}
          </div>
        )}

        {loading ? (
          <p className="text-sm opacity-75">2D o&apos;yin sahnasi yuklanmoqda...</p>
        ) : !game ? (
          <div className="rounded-2xl border border-neutral-800 p-6 text-sm">
            O&apos;yin topilmadi: <code>{gameId}</code>
          </div>
        ) : (
          <div className="space-y-6">
            {isFounder && (
              <div className="rounded-2xl border border-indigo-500/30 bg-neutral-900/80 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-300">
                    Founder Panel · O&apos;yinchilar ({participants.length})
                  </span>
                  <span className="opacity-70">Blocklanganlar: {blockedIds.length}</span>
                </div>
                {participants.length === 0 ? (
                  <p className="text-xs opacity-65">Hozircha boshqa o&apos;yinchi yo&apos;q.</p>
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
                                ? `${p.score}/${p.total} · Streak ${p.streak ?? 0}`
                                : "O'ynamoqda"}
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

            <div className="relative overflow-hidden rounded-3xl border border-indigo-400/30 bg-gradient-to-r from-indigo-950/80 via-neutral-900 to-fuchsia-950/60 p-6 flex flex-wrap items-center justify-between gap-4 shadow-xl">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2">
                  <span className="-skew-x-6 inline-block px-3 py-0.5 rounded-md bg-indigo-500 text-white text-[11px] font-bold uppercase tracking-wider">
                    {meta.name}
                  </span>
                  <span className="text-xs opacity-75">
                    {game.topic} · {game.level} · {game.status}
                  </span>
                </div>
                <h1 className="text-xl md:text-2xl font-bold">{game.title}</h1>
                <p className="text-xs opacity-75">{meta.uzLabel}</p>
              </div>

              <div className="flex items-center gap-2.5 text-xs">
                <div className="px-3.5 py-2 rounded-2xl bg-neutral-950/85 border border-neutral-700">
                  Ball: <b className="text-white">{score}</b>/{rounds.length}
                </div>
                <div className="-skew-x-6 px-3.5 py-2 rounded-2xl bg-amber-400/15 border border-amber-400/50 text-amber-300 font-bold">
                  Streak {bestStreak}
                </div>
              </div>
            </div>

            {finished && (
              <div className="rounded-2xl border border-emerald-400/50 bg-emerald-950/40 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-emerald-200">
                    O&apos;yin Yakunlandi!
                  </p>
                  <p className="text-xs opacity-85 mt-0.5">
                    Yakuniy natija: {score}/{rounds.length} · Best Streak: {bestStreak}
                  </p>
                </div>
                <Link className="px-4 py-2 rounded-xl text-xs font-semibold bg-white text-neutral-950" href="/games">
                  O&apos;yinlar ro&apos;yxatiga qaytish
                </Link>
              </div>
            )}

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {rounds.map((r, idx) => {
                const isDone =
                  typeof answers[idx] === "number" ||
                  (slotChunks[idx] && slotChunks[idx].length > 0);
                const isChecked = Boolean(allSubmitted || checkedRounds[idx]);
                const ok = evaluateRound(idx, r);
                return (
                  <button
                    key={r.id ?? idx}
                    type="button"
                    onClick={() => {
                      setActiveIdx(idx);
                      setIsDragOverDropzone(false);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer shrink-0 ${
                      idx === activeIdx
                        ? "bg-white text-neutral-950 border-white shadow-md"
                        : isChecked
                        ? ok
                          ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40"
                          : "bg-rose-950/60 text-rose-300 border-rose-500/40"
                        : isDone
                        ? "bg-indigo-950/60 text-indigo-200 border-indigo-500/40"
                        : "bg-neutral-900/75 text-neutral-300 border-neutral-800 hover:border-neutral-600"
                    }`}
                  >
                    #{idx + 1}
                  </button>
                );
              })}
            </div>

            {currentRound && (
              <section className="rounded-3xl border border-indigo-400/30 bg-neutral-900/80 p-6 space-y-5 shadow-2xl">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono uppercase tracking-wider text-indigo-300">
                    ROUND {activeIdx + 1} OF {rounds.length} ·{" "}
                    {checkMode === "step" ? "TEKSHIR → NEXT" : "OXIRIDA TEKSHIRTIRISH"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setShowClue((p) => ({ ...p, [activeIdx]: !p[activeIdx] }))
                    }
                    className="px-3 py-1 rounded-lg border border-neutral-700 bg-neutral-950 hover:border-indigo-400 cursor-pointer"
                  >
                    {showClue[activeIdx] ? "Clue yopish" : "Ishora (Clue)"}
                  </button>
                </div>

                <h2 className="text-base md:text-lg font-semibold leading-snug">
                  {currentRound.prompt}
                </h2>

                {isScramble ? (
                  <div className="space-y-4">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOverDropzone(true);
                      }}
                      onDragLeave={() => setIsDragOverDropzone(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropToSlot();
                      }}
                      className={`min-h-[84px] rounded-2xl border-2 border-dashed p-4 transition flex flex-wrap items-center gap-2 ${
                        isDragOverDropzone
                          ? "border-emerald-400 bg-emerald-950/25"
                          : "border-indigo-400/45 bg-neutral-950/75"
                      }`}
                    >
                      {currentSlotOrder.length === 0 ? (
                        <span className="text-xs opacity-60">
                          So&apos;z kartochkalarini shu yerga sudrab tashlang (Drag &amp; Drop) yoki ustiga bosing...
                        </span>
                      ) : (
                        currentSlotOrder.map((cIdx, pos) => (
                          <div
                            key={`${cIdx}-${pos}`}
                            draggable
                            onDragStart={() =>
                              setDragPayload({
                                from: "slot",
                                chunkIdx: cIdx,
                                slotPos: pos,
                              })
                            }
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDropToSlot(pos);
                            }}
                            onClick={() => handleRemoveFromSlot(cIdx)}
                            title="Sudrab o'rnini o'zgartiring yoki bosib qaytaring"
                            className="rotate-1 hover:rotate-0 px-3.5 py-2 rounded-xl bg-indigo-500 text-white text-xs font-semibold shadow-md cursor-grab active:cursor-grabbing transition select-none"
                          >
                            <span className="opacity-75 mr-1.5">{pos + 1}.</span>
                            {scrambleChunks[cIdx]}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs opacity-75">
                        <span>So&apos;z kartochkalari (chapga/o&apos;ngga sudrang yoki bosing):</span>
                        <button
                          type="button"
                          onClick={handleClearSlot}
                          className="underline hover:opacity-100 cursor-pointer"
                        >
                          Tozalash
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {scrambleChunks.map((ch, cIdx) => {
                          const placed = currentSlotOrder.includes(cIdx);
                          const tilt = cIdx % 2 === 0 ? "-rotate-1" : "rotate-1";
                          return (
                            <button
                              key={cIdx}
                              type="button"
                              draggable={!placed}
                              onDragStart={() =>
                                setDragPayload({ from: "pool", chunkIdx: cIdx })
                              }
                              disabled={placed}
                              onClick={() => handleClickChunkFromPool(cIdx)}
                              className={`${tilt} hover:rotate-0 hover:-translate-y-0.5 px-4 py-2.5 rounded-2xl border text-xs font-semibold transition select-none ${
                                placed
                                  ? "opacity-25 border-neutral-800 bg-neutral-900 cursor-default"
                                  : "border-indigo-400/50 bg-gradient-to-b from-indigo-950/70 to-neutral-900 text-indigo-100 shadow cursor-grab active:cursor-grabbing"
                              }`}
                            >
                              {ch}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {assembledSentence && (
                      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-4 py-2.5 text-xs">
                        <span className="opacity-65 mr-2">Yig&apos;ilgan gap:</span>
                        <span className="font-medium text-white">{assembledSentence}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {(currentRound.options || []).map((opt, oIdx) => {
                      const picked = answers[activeIdx] === oIdx;
                      const isRight = currentRound.correctIndex === oIdx;
                      const cardSkew = isPairCardGame
                        ? oIdx % 2 === 0
                          ? "-skew-x-2"
                          : "skew-x-2"
                        : "";

                      let stateStyle =
                        "border-neutral-700/80 bg-neutral-950/80 hover:-translate-y-0.5 hover:border-indigo-400";
                      if (currentChecked) {
                        if (isRight) {
                          stateStyle =
                            "border-emerald-400 bg-emerald-950/50 text-emerald-200";
                        } else if (picked) {
                          stateStyle =
                            "border-rose-400 bg-rose-950/50 text-rose-200";
                        } else {
                          stateStyle =
                            "border-neutral-800 bg-neutral-950/50 opacity-60";
                        }
                      } else if (picked) {
                        stateStyle =
                          "border-white bg-white text-neutral-950 font-semibold -translate-y-0.5 shadow-lg";
                      }

                      return (
                        <button
                          key={oIdx}
                          type="button"
                          onClick={() => {
                            setAnswers((prev) => ({ ...prev, [activeIdx]: oIdx }));
                            if (checkMode === "step") {
                              setCheckedRounds((prev) => ({
                                ...prev,
                                [activeIdx]: false,
                              }));
                            }
                          }}
                          className={`${cardSkew} text-left rounded-2xl border p-4 text-xs md:text-sm transition cursor-pointer ${stateStyle}`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono opacity-70 mb-1">
                            <span>CARD {String.fromCharCode(65 + oIdx)}</span>
                            <span>{picked ? "SELECTED" : ""}</span>
                          </div>
                          <div>{opt}</div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {showClue[activeIdx] && (
                  <div className="rounded-xl border border-amber-400/35 bg-amber-950/25 p-3 text-xs text-amber-200">
                    Clue: {currentRound.explanation}
                  </div>
                )}

                {currentChecked && (
                  <div
                    className={`rounded-2xl border p-4 text-xs space-y-1 ${
                      currentIsRight
                        ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                        : "border-rose-500/40 bg-rose-950/30 text-rose-200"
                    }`}
                  >
                    <p className="font-bold">
                      {currentIsRight
                        ? "✓ To'g'ri! Keyingi bosqichga o'tishingiz mumkin."
                        : `✕ Noto'g'ri. To'g'ri javob: ${buildExpectedSentence(currentRound)}`}
                    </p>
                    <p className="opacity-90">{currentRound.explanation}</p>
                  </div>
                )}

                {aiEnabled && (
                  <div className="pt-3 border-t border-neutral-800 space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={doubts[activeIdx] || ""}
                        onChange={(e) =>
                          setDoubts((prev) => ({
                            ...prev,
                            [activeIdx]: e.target.value,
                          }))
                        }
                        placeholder="AI yordamchidan yo'nalish so'rang (tayyor javobsiz)..."
                        className="flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs"
                      />
                      <button
                        type="button"
                        disabled={loadingHintIdx === activeIdx}
                        onClick={() => handleAskHint(activeIdx)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold border border-emerald-400/50 text-emerald-300 cursor-pointer disabled:opacity-50"
                      >
                        {loadingHintIdx === activeIdx
                          ? "O'ylanmoqda..."
                          : "AI Tushuntirish"}
                      </button>
                    </div>
                    {hints[activeIdx] && (
                      <p className="text-xs rounded-xl bg-emerald-950/30 border border-emerald-600/30 p-3 text-emerald-200">
                        {hints[activeIdx]}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-800/80">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={activeIdx === 0}
                      onClick={handlePrevRound}
                      className="px-4 py-2 rounded-xl text-xs border border-neutral-700 bg-neutral-950 cursor-pointer disabled:opacity-40"
                    >
                      ← Oldingi
                    </button>

                    {checkMode === "step" ? (
                      <>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={handleCheckCurrentRound}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-500 text-white hover:bg-indigo-400 cursor-pointer disabled:opacity-50"
                        >
                          Tekshirish
                        </button>
                        <button
                          type="button"
                          disabled={activeIdx >= rounds.length - 1}
                          onClick={handleNextRound}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-white text-neutral-950 hover:bg-neutral-200 cursor-pointer disabled:opacity-40"
                        >
                          Next →
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={activeIdx >= rounds.length - 1}
                        onClick={handleNextRound}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-white text-neutral-950 hover:bg-neutral-200 cursor-pointer disabled:opacity-40"
                      >
                        Keyingi karta →
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {checkMode === "end" && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleCheckAllAtEnd}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-400 text-neutral-950 hover:bg-amber-300 cursor-pointer disabled:opacity-50"
                      >
                        {saving ? "Tekshirilmoqda..." : "Hammasini Tekshirtirish"}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleFinishGame}
                      className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold bg-emerald-400 text-neutral-950 hover:bg-emerald-300 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? "Saqlanmoqda..." : "O'yinni Yakunlash"}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function Play2DGameArenaPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
          <p className="text-sm opacity-75">2D o&apos;yin sahnasi yuklanmoqda...</p>
        </main>
      }
    >
      <GameArenaContent/>
    </Suspense>
  );
}
