"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { GAME_TYPES, GameRoundQuestion } from "@/lib/games-catalog";
import { useNotification } from "@/components/notification-provider";
import { useTheme } from "@/components/theme-provider";
import { UiModal } from "@/components/ui-modal";

interface ParticipantRow {
  id: string;
  userId: string;
  score: number | null;
  total: number | null;
  streak: number | null;
  user: { firstName: string; lastName: string | null; userName: string };
}

interface ModeratedUser {
  id: string;
  firstName: string;
  lastName: string | null;
  userName: string;
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
  blockedUsers?: ModeratedUser[];
  kickedUsers?: ModeratedUser[];
  questionsJson: GameRoundQuestion[];
  creatorId: string;
  creator: { id: string; firstName?: string; lastName?: string | null; userName: string };
  participants: ParticipantRow[];
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
  const themeCtx = useTheme();
  const theme = themeCtx.theme;
  const toggleTheme = () => themeCtx.setTheme(theme === "dark" ? "light" : "dark");
  const notifyApi = useNotification();

  const [game, setGame] = useState<GameDetail | null>(null);
  const [isFounder, setIsFounder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blockedState, setBlockedState] = useState<{ isBlocked?: boolean; isKicked?: boolean; message: string } | null>(null);

  const [activeIdx, setActiveIdx] = useState(0);

  // Scramble and Card Matching State
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [slotChunks, setSlotChunks] = useState<Record<number, number[]>>({});
  const [roundCorrectMap, setRoundCorrectMap] = useState<Record<number, boolean>>({});
  const [currentStreak, setCurrentStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI Game Analysis
  const [aiReport, setAiReport] = useState<any | null>(null);
  const [analyzingAi, setAnalyzingAi] = useState(false);

  // Hint & Moderation
  const [doubts, setDoubts] = useState<Record<number, string>>({});
  const [hints, setHints] = useState<Record<number, string>>({});
  const [loadingHintIdx, setLoadingHintIdx] = useState<number | null>(null);

  const [participantsModalOpen, setParticipantsModalOpen] = useState(false);
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  const loadGame = useCallback(async () => {
    if (!gameId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/games/${encodeURIComponent(gameId)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (res.status === 403) {
        setBlockedState({
          isBlocked: data.isBlocked,
          isKicked: data.isKicked,
          message: data.error || "Sizga ushbu o'yinga kirish taqiqlangan.",
        });
        setGame(null);
        return;
      }

      setBlockedState(null);
      if (typeof data.isFounder === "boolean") setIsFounder(data.isFounder);
      if (res.ok && data.game) {
        setGame(data.game);
        if (data.currentUserParticipant && typeof data.currentUserParticipant.score === "number") {
          setScore(data.currentUserParticipant.score);
          setMaxStreak(data.currentUserParticipant.streak ?? 0);
          setFinished(true);
        }
      } else {
        notifyApi.show(data.error || "O'yinni yuklashda xatolik.");
      }
    } catch {
      notifyApi.show("Tarmoq xatoligi yuz berdi.");
    } finally {
      setLoading(false);
    }
  }, [gameId, notifyApi]);

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

  const scrambleChunks: string[] = useMemo(() => {
    if (!currentRound) return [];
    if (Array.isArray(currentRound.chunks) && currentRound.chunks.length >= 2) {
      return currentRound.chunks;
    }
    if (currentRound.targetSentence) {
      return currentRound.targetSentence.split(/\s+/).filter(Boolean);
    }
    return (currentRound.options?.[0] || "").split(/\s+/).filter(Boolean);
  }, [currentRound]);

  const placedChunkIndices = slotChunks[activeIdx] || [];
  const unplacedChunkIndices = useMemo(() => {
    const all = scrambleChunks.map((_, i) => i);
    const placedSet = new Set(placedChunkIndices);
    return all.filter((i) => !placedSet.has(i));
  }, [scrambleChunks, placedChunkIndices]);

  function playSoundVoice(textToSpeak: string) {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(textToSpeak);
      u.lang = "en-US";
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
    }
  }

  function handleAddChunkToSlot(chunkIdx: number) {
    if (roundCorrectMap[activeIdx] !== undefined) return;
    playSoundVoice(scrambleChunks[chunkIdx]);
    setSlotChunks((prev) => ({
      ...prev,
      [activeIdx]: [...(prev[activeIdx] || []), chunkIdx],
    }));
  }

  function handleRemoveChunkFromSlot(slotPos: number) {
    if (roundCorrectMap[activeIdx] !== undefined) return;
    setSlotChunks((prev) => {
      const cur = [...(prev[activeIdx] || [])];
      cur.splice(slotPos, 1);
      return { ...prev, [activeIdx]: cur };
    });
  }

  function handleCheckRound(isCorrectAnswer: boolean) {
    const nextMap = { ...roundCorrectMap, [activeIdx]: isCorrectAnswer };
    setRoundCorrectMap(nextMap);

    if (isCorrectAnswer) {
      const nextStreak = currentStreak + 1;
      setCurrentStreak(nextStreak);
      if (nextStreak > maxStreak) setMaxStreak(nextStreak);
      const bonus = nextStreak >= 3 ? 2 : 1;
      setScore((s) => s + bonus);
      notifyApi.show(`✓ To'g'ri! ${nextStreak >= 2 ? `Combo x${nextStreak}! 🔥` : ""}`, "success");
    } else {
      setCurrentStreak(0);
      notifyApi.show("✕ Noto'g'ri tanlov. Keyingisiga harakat qiling!", "error");
    }

    if (activeIdx + 1 < rounds.length) {
      setTimeout(() => {
        setActiveIdx((i) => i + 1);
      }, 700);
    } else {
      setTimeout(() => {
        handleFinishGame(nextMap);
      }, 700);
    }
  }

  function handleCheckScramble() {
    const assembled = placedChunkIndices.map((i) => scrambleChunks[i]).join(" ");
    const expected = currentRound.targetSentence || currentRound.options?.[0] || "";
    const isCorrect = normalizeSentence(assembled) === normalizeSentence(expected);
    handleCheckRound(isCorrect);
  }

  async function handleFinishGame(finalMap: Record<number, boolean>) {
    setFinished(true);
    setSaving(true);
    let finalScore = 0;
    Object.values(finalMap).forEach((v) => {
      if (v) finalScore++;
    });

    try {
      await fetch(`/api/games/${encodeURIComponent(gameId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: finalScore,
          total: rounds.length,
          streak: maxStreak,
        }),
      });

      // Request AI Analysis of Game Session
      setAnalyzingAi(true);
      const mistakes = rounds
        .map((r, idx) => ({
          round: idx + 1,
          prompt: r.prompt,
          correct: r.targetSentence || r.options?.[0],
          wasCorrect: finalMap[idx],
        }))
        .filter((r) => !r.wasCorrect);

      const aiRes = await fetch(`/api/games/${encodeURIComponent(gameId)}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: meta.name,
          level: game?.level,
          score: finalScore,
          total: rounds.length,
          maxStreak,
          mistakes,
        }),
      });
      const aiData = await aiRes.json();
      if (aiRes.ok && aiData.report) {
        setAiReport(aiData.report);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
      setAnalyzingAi(false);
    }
  }

  async function handleModerate(
    action: "kick" | "unkick" | "block" | "unblock",
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
        notifyApi.show(data.message || "Ishtirokchi holati yangilandi.");
      } else {
        notifyApi.show(data.error || "Amal bajarilmadi.");
      }
    } finally {
      setModeratingId(null);
    }
  }

  const isLight = theme === "light";
  const participants = Array.isArray(game?.participants) ? game.participants : [];
  const blockedUsers = Array.isArray(game?.blockedUsers) ? game.blockedUsers : [];
  const kickedUsers = Array.isArray(game?.kickedUsers) ? game.kickedUsers : [];
  const totalBlocked = Math.max(blockedUsers.length, (game?.blockedUserIds || []).length);

  return (
    <main
      className={`min-h-screen p-5 md:p-8 transition-colors ${
        isLight ? "bg-stone-100 text-neutral-900" : "bg-neutral-950 text-neutral-100"
      }`}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-xs underline opacity-80 hover:opacity-100" href="/games">
            ← Games Hub ga qaytish
          </Link>
          <div className="flex items-center gap-2">
            {isFounder && game && (
              <button
                type="button"
                onClick={() => setParticipantsModalOpen(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium border border-neutral-700 cursor-pointer"
              >
                Qatnashuvchilar ({participants.length}) / Moderatsiya
              </button>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded-xl text-xs font-medium border border-neutral-700 cursor-pointer"
            >
              Theme: {theme.toUpperCase()}
            </button>
          </div>
        </div>

        {/* Moderation Modal */}
        <UiModal
          open={participantsModalOpen}
          onClose={() => setParticipantsModalOpen(false)}
          title={`O'yin Qatnashuvchilari (${participants.length} ta)`}
          subtitle={`Blocklanganlar: ${totalBlocked} ta | Chiqarilganlar: ${kickedUsers.length} ta`}
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-4 text-xs">
            <div>
              <p className="font-semibold text-sm mb-2 opacity-90">Faol qatnashuvchilar</p>
              {participants.length === 0 ? (
                <p className="opacity-60 italic py-2">Hozircha o&apos;yinda qatnashuvchilar yo&apos;q.</p>
              ) : (
                <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-xl overflow-hidden px-3">
                  {participants.map((p) => {
                    const busy = moderatingId === p.id || moderatingId === p.userId;
                    const isSelf = p.userId === game?.creatorId;
                    const fullName =
                      `${p.user?.firstName || ""} ${p.user?.lastName || ""}`.trim() ||
                      p.user?.userName;

                    return (
                      <div key={p.id} className="py-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-neutral-100">{fullName} <span className="opacity-60">@{p.user?.userName}</span></p>
                          <p className="text-[11px] opacity-75 mt-0.5">
                            Ball: {p.score ?? 0}/{p.total ?? game?.questionCount} · Streak: {p.streak ?? 0}
                          </p>
                        </div>
                        {!isSelf && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleModerate("kick", p.userId, p.id)}
                              className="px-2.5 py-1 rounded border border-amber-500/50 text-amber-300 cursor-pointer"
                            >
                              Chiqarish
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleModerate("block", p.userId, p.id)}
                              className="px-2.5 py-1 rounded border border-rose-500/50 text-rose-300 cursor-pointer"
                            >
                              Block
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
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {blockedUsers.map((b) => (
                    <div key={b.id} className="flex items-center justify-between p-2 rounded-xl bg-rose-950/20 border border-rose-800/40">
                      <div>
                        <p className="font-semibold text-rose-200">{b.firstName || b.userName}</p>
                        <p className="text-[11px] opacity-70">@{b.userName}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleModerate("unblock", b.id)}
                        className="px-2.5 py-1 rounded border border-emerald-500/50 text-emerald-300"
                      >
                        Blokdan chiqarish
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </UiModal>

        {loading ? (
          <p className="text-sm opacity-75">O&apos;yin arenasi yuklanmoqda...</p>
        ) : blockedState ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-8 text-center space-y-4 max-w-lg mx-auto">
            <h2 className="text-lg font-bold text-rose-300">Kirish taqiqlangan</h2>
            <p className="text-xs text-rose-200/80">{blockedState.message}</p>
            <Link href="/games" className="inline-block px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white">
              Games Hub ga qaytish
            </Link>
          </div>
        ) : !game || rounds.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 p-8 text-center text-xs opacity-75">
            O&apos;yin bosqichlari topilmadi.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Game Dashboard Header */}
            <div
              className={`rounded-2xl border p-5 flex flex-wrap items-center justify-between gap-4 ${
                isLight ? "bg-white border-stone-200" : "bg-neutral-900/80 border-neutral-800"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg md:text-xl font-extrabold">{game.title}</h1>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-neutral-700 bg-neutral-800 text-neutral-300">
                    {game.level} · {meta.name}
                  </span>
                </div>
                <p className="text-xs opacity-70 mt-1">Mavzu: {game.topic}</p>
              </div>

              {/* Live Combo & Score Badges */}
              <div className="flex items-center gap-3 text-xs font-bold">
                <div className="px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-950 flex items-center gap-1.5">
                  <span className="text-amber-400">🔥 Streak:</span>
                  <span>{currentStreak}</span>
                </div>
                <div className="px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-950 flex items-center gap-1.5">
                  <span className="text-emerald-400">⭐ Ball:</span>
                  <span>{score}</span>
                </div>
                <div className="text-xs opacity-70">
                  {activeIdx + 1} / {rounds.length}
                </div>
              </div>
            </div>

            {/* Game Play Arena */}
            {!finished ? (
              <div
                className={`rounded-2xl border p-6 space-y-6 ${
                  isLight ? "bg-white border-stone-200" : "bg-neutral-900/80 border-neutral-800"
                }`}
              >
                <div className="space-y-1">
                  <span className="text-xs uppercase tracking-wider font-semibold opacity-75">
                    Bosqich #{activeIdx + 1}
                  </span>
                  <p className="text-sm md:text-base font-bold">{currentRound.prompt}</p>
                </div>

                {/* Mechanic A: Sentence Scramble (Word Cards) */}
                {isScramble ? (
                  <div className="space-y-5">
                    {/* Destination Slot (Selected Cards) */}
                    <div>
                      <p className="text-[11px] opacity-75 mb-1.5 font-medium">Tuzilgan gap maydoni (kartalarni bosib joylashtiring yoki olib tashlang):</p>
                      <div
                        className={`min-h-[70px] p-3 rounded-2xl border border-dashed flex flex-wrap items-center gap-2 transition ${
                          placedChunkIndices.length === 0
                            ? "border-neutral-700 bg-neutral-950/40 justify-center text-xs opacity-50"
                            : "border-indigo-500/50 bg-neutral-950"
                        }`}
                      >
                        {placedChunkIndices.length === 0 ? (
                          <span>Pastdagi so&apos;z kartalarini tartib bilan tanlang...</span>
                        ) : (
                          placedChunkIndices.map((cIdx, pos) => (
                            <button
                              key={pos}
                              type="button"
                              onClick={() => handleRemoveChunkFromSlot(pos)}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-neutral-950 shadow hover:bg-rose-100 transition cursor-pointer"
                            >
                              {scrambleChunks[cIdx]} ✕
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Source Cards Pool */}
                    <div>
                      <p className="text-[11px] opacity-75 mb-1.5 font-medium">Mavjud so&apos;z kartalari:</p>
                      <div className="flex flex-wrap gap-2.5">
                        {unplacedChunkIndices.map((cIdx) => (
                          <button
                            key={cIdx}
                            type="button"
                            onClick={() => handleAddChunkToSlot(cIdx)}
                            className="px-4 py-2.5 rounded-xl text-xs font-bold border border-neutral-700 bg-neutral-800 text-neutral-100 hover:border-neutral-400 hover:bg-neutral-700 shadow transition cursor-pointer"
                          >
                            {scrambleChunks[cIdx]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        disabled={placedChunkIndices.length === 0}
                        onClick={handleCheckScramble}
                        className="px-6 py-2.5 rounded-xl text-xs font-bold bg-white text-neutral-950 hover:bg-neutral-200 cursor-pointer disabled:opacity-40 transition shadow"
                      >
                        Gapni tekshirish →
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Mechanic B: Interactive Multiple Match Cards */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentRound.options?.map((opt, oIdx) => {
                      const isCorrectChoice = oIdx === currentRound.correctIndex;
                      return (
                        <button
                          key={oIdx}
                          type="button"
                          onClick={() => {
                            playSoundVoice(opt);
                            handleCheckRound(isCorrectChoice);
                          }}
                          className={`p-4 rounded-xl border text-left text-xs md:text-sm font-semibold transition cursor-pointer ${
                            isLight
                              ? "bg-stone-50 border-stone-300 text-neutral-900 hover:border-neutral-900"
                              : "bg-neutral-950 border-neutral-800 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-900"
                          }`}
                        >
                          <span className="text-indigo-400 mr-2">{String.fromCharCode(65 + oIdx)}.</span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Finished State & AI Session Analysis */
              <div
                className={`rounded-2xl border p-6 space-y-6 ${
                  isLight ? "bg-white border-stone-200" : "bg-neutral-900/90 border-neutral-800"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
                  <div>
                    <h2 className="text-2xl font-extrabold">O&apos;yin Muvaffaqiyatli Yakunlandi! 🎉</h2>
                    <p className="text-xs opacity-75 mt-1">
                      Natijangiz: <b className="text-emerald-400 text-sm">{score}</b> / {rounds.length} ball · Eng yuqori streak: <b className="text-amber-400">{maxStreak}</b>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveIdx(0);
                      setRoundCorrectMap({});
                      setSlotChunks({});
                      setScore(0);
                      setCurrentStreak(0);
                      setFinished(false);
                      setAiReport(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-neutral-950 hover:bg-neutral-200 cursor-pointer"
                  >
                    Qaytadan o&apos;ynash ↻
                  </button>
                </div>

                {/* AI Performance Report */}
                {analyzingAi ? (
                  <div className="p-6 rounded-xl border border-neutral-800 text-center text-xs opacity-75 space-y-2">
                    <p className="animate-pulse">AI o&apos;yin sessiyangizni tahlil qilmoqda...</p>
                  </div>
                ) : aiReport ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                          Pedagogik AI Tahlili ({aiReport.performanceLevel})
                        </span>
                        <span className="text-xs font-mono font-bold text-indigo-400">
                          Aniqlik: {aiReport.accuracyPercent}%
                        </span>
                      </div>
                      <p className="text-xs md:text-sm opacity-90 leading-relaxed">{aiReport.insights}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/15 space-y-2">
                        <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          ✓ Namoyon etilgan mahorat
                        </p>
                        <ul className="text-xs space-y-1 list-disc list-inside text-neutral-300">
                          {aiReport.strengths?.map((s: string, idx: number) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/15 space-y-2">
                        <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                          ⚡ E&apos;tibor qaratilishi zarur bo&apos;lgan sohalar
                        </p>
                        <ul className="text-xs space-y-1 list-disc list-inside text-neutral-300">
                          {aiReport.focusAreas?.map((f: string, idx: number) => (
                            <li key={idx}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {aiReport.recommendedDrill && (
                      <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-xs text-neutral-300">
                        <span className="font-bold text-neutral-100">Keyingi mashg&apos;ulot tavsiyasi: </span>
                        {aiReport.recommendedDrill}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function GameArenaPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
          <p className="text-sm opacity-75">O&apos;yin arenasi yuklanmoqda...</p>
        </main>
      }
    >
      <GameArenaContent />
    </Suspense>
  );
}
