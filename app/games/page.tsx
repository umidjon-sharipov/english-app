"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GAME_TYPES } from "@/lib/games-catalog";

interface GameRecord {
    id: string;
    title: string;
    gameType: string;
    topic: string;
    level: string;
    questionCount: number;
    status: "OPEN" | "CLOSED";
    allowParticipantAi: boolean;
}

const TOPICS = [
    "Everyday English & Slang",
    "Academic & IELTS Vocabulary",
    "Business & Workplace",
    "Grammar & Sentence Craft",
    "Tech & Modern Life",
];

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function GamesHubPage() {
    const [openGames, setOpenGames] = useState<GameRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const [title, setTitle] = useState("");
    const [gameType, setGameType] = useState(GAME_TYPES[0].id);
    const [topic, setTopic] = useState(TOPICS[0]);
    const [level, setLevel] = useState("B1");
    const [questionCount, setQuestionCount] = useState<number>(10);
    const [customPrompt, setCustomPrompt] = useState("");
    const [status, setStatus] = useState<"OPEN" | "CLOSED">("OPEN");
    const [allowParticipantAi, setAllowParticipantAi] = useState<boolean>(false);
    const [creating, setCreating] = useState(false);

    const [directId, setDirectId] = useState("");
    const [uiTheme, setUiTheme] = useState<"dark" | "light">("dark");
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const loadGames = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/games", { cache: "no-store" });
            const data = await res.json();
            if (res.ok && Array.isArray(data.games)) {
                setOpenGames(data.games);
            }
        } catch {
            setErr("O'yinlarni yuklashda xato.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadGames();
    }, [loadGames]);

    async function handleCreateGame(e: React.FormEvent) {
        e.preventDefault();
        setMsg(null);
        setErr(null);
        setCreating(true);
        try {
            const res = await fetch("/api/games", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim() || undefined,
                    gameType,
                    topic,
                    level,
                    questionCount,
                    customPrompt: customPrompt.trim() || undefined,
                    status,
                    allowParticipantAi,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setErr(data.error || "O'yin yaratishda xato.");
                return;
            }
            setTitle("");
            setCustomPrompt("");
            setMsg(`"${data.game.title}" AI tomonidan yaratildi.`);
            await loadGames();
        } catch {
            setErr("Tarmoq xatoligi.");
        } finally {
            setCreating(false);
        }
    }

    async function handleToggleStatus(g: GameRecord) {
        setErr(null);
        setMsg(null);
        const nextStatus = g.status === "OPEN" ? "CLOSED" : "OPEN";
        const res = await fetch(`/api/games/${g.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus }),
        });
        const data = await res.json();
        if (!res.ok) {
            setErr(data.error || "Holatni o'zgartirib bo'lmadi.");
            return;
        }
        setMsg(`Holat ${nextStatus} qilindi.`);
        await loadGames();
    }

    async function handleDelete(id: string) {
        setErr(null);
        setMsg(null);
        const res = await fetch(`/api/games/${id}`, { method: "DELETE" });
        if (res.ok) {
            setMsg("O'yin o'chirildi.");
            await loadGames();
        }
    }

    const isLight = uiTheme === "light";
    const selectedGameMeta =
        GAME_TYPES.find((g) => g.id === gameType) || GAME_TYPES[0];

    return (
        <main
            className={ `min-h-screen p-6 md:p-10 transition-colors ${isLight ? "bg-stone-100 text-stone-900" : "bg-neutral-950 text-neutral-100"
                }` }
        >
            <div className="max-w-6xl mx-auto space-y-8">
                <div
                    className={ `flex flex-wrap items-center justify-between gap-4 border-b pb-5 ${isLight ? "border-stone-300" : "border-neutral-800"
                        }` }
                >
                    <div>
                        <h1 className="text-2xl md:text-3xl font-semibold">
                            Game Arcade · 12 AI English Games
                        </h1>
                        <p className="text-sm opacity-75 mt-1">
                            12 xil o&apos;yin turi, A1–C2 daraja, prompt va 100% AI generatsiya. OPEN yoki CLOSED.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link className="px-3 py-2 rounded-lg text-xs border border-neutral-700" href="/tests">
                            Tests
                        </Link>
                        <Link className="px-3 py-2 rounded-lg text-xs border border-neutral-700" href="/reading">
                            Reading
                        </Link>
                        <button
                            type="button"
                            onClick={ () => setUiTheme((t) => (t === "dark" ? "light" : "dark")) }
                            className="px-3.5 py-2 rounded-lg text-xs border border-neutral-700 cursor-pointer"
                        >
                            Theme: { uiTheme.toUpperCase() }
                        </button>
                    </div>
                </div>

                {/* Direct ID access */ }
                <div
                    className={ `rounded-xl border p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 ${isLight ? "bg-white border-stone-300" : "bg-neutral-900/70 border-neutral-800"
                        }` }
                >
                    <div className="text-xs">
                        <p className="font-semibold">Game ID orqali kirish (OPEN / CLOSED)</p>
                        <p className="opacity-70">Yopiq o&apos;yinga ham ID orqali /games/[id] dan kiring.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={ directId }
                            onChange={ (e) => setDirectId(e.target.value) }
                            placeholder="Game ID..."
                            className={ `rounded-lg border px-3 py-2 text-xs w-56 ${isLight ? "bg-stone-50 border-stone-300" : "bg-neutral-950 border-neutral-700"
                                }` }
                        />
                        { directId.trim() ? (
                            <Link
                                href={ `/games/${encodeURIComponent(directId.trim())}` }
                                className={ `px-4 py-2 rounded-lg text-xs font-medium ${isLight ? "bg-stone-900 text-white" : "bg-white text-neutral-950"
                                    }` }
                            >
                                Ochish
                            </Link>
                        ) : (
                            <button
                                type="button"
                                disabled
                                className="px-4 py-2 rounded-lg text-xs opacity-40 border border-neutral-700"
                            >
                                Ochish
                            </button>
                        ) }
                    </div>
                </div>

                { msg && (
                    <div className="rounded-lg border border-emerald-600/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
                        { msg }
                    </div>
                ) }
                { err && (
                    <div className="rounded-lg border border-red-600/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                        { err }
                    </div>
                ) }

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <form
                        onSubmit={ handleCreateGame }
                        className={ `lg:col-span-6 rounded-xl border p-5 space-y-4 ${isLight ? "bg-white border-stone-300" : "bg-neutral-900/70 border-neutral-800"
                            }` }
                    >
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-lg font-medium">Yangi AI O&apos;yin Yaratish</h2>
                            <button
                                type="button"
                                onClick={ () => setAllowParticipantAi((v) => !v) }
                                className={ `px-3 py-1 rounded-full text-xs font-medium border cursor-pointer ${allowParticipantAi
                                    ? "bg-emerald-500 text-neutral-950 border-emerald-400"
                                    : "border-neutral-700 opacity-80"
                                    }` }
                            >
                                O&apos;yinda AI: { allowParticipantAi ? "ON" : "OFF" }
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs opacity-75 mb-1">
                                O&apos;yin turi (12 xil)
                            </label>
                            <select
                                value={ gameType }
                                onChange={ (e) => setGameType(e.target.value) }
                                className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight ? "bg-stone-50 border-stone-300" : "bg-neutral-950 border-neutral-800"
                                    }` }
                            >
                                { GAME_TYPES.map((g, idx) => (
                                    <option key={ g.id } value={ g.id }>
                                        { idx + 1 }. { g.name } — { g.uzLabel }
                                    </option>
                                )) }
                            </select>
                            <p className="text-[11px] opacity-65 mt-1">{ selectedGameMeta.description }</p>
                        </div>

                        <div>
                            <label className="block text-xs opacity-75 mb-1">Nomi (ixtiyoriy)</label>
                            <input
                                type="text"
                                value={ title }
                                onChange={ (e) => setTitle(e.target.value) }
                                placeholder={ `Masalan: ${selectedGameMeta.name} (${level})` }
                                className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight ? "bg-stone-50 border-stone-300" : "bg-neutral-950 border-neutral-800"
                                    }` }
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs opacity-75 mb-1">Mavzu</label>
                                <select
                                    value={ topic }
                                    onChange={ (e) => setTopic(e.target.value) }
                                    className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight ? "bg-stone-50 border-stone-300" : "bg-neutral-950 border-neutral-800"
                                        }` }
                                >
                                    { TOPICS.map((t) => (
                                        <option key={ t } value={ t }>
                                            { t }
                                        </option>
                                    )) }
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs opacity-75 mb-1">Daraja (A1–C2)</label>
                                <select
                                    value={ level }
                                    onChange={ (e) => setLevel(e.target.value) }
                                    className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight ? "bg-stone-50 border-stone-300" : "bg-neutral-950 border-neutral-800"
                                        }` }
                                >
                                    { LEVELS.map((l) => (
                                        <option key={ l } value={ l }>
                                            { l }
                                        </option>
                                    )) }
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs opacity-75 mb-1">Status</label>
                                <select
                                    value={ status }
                                    onChange={ (e) =>
                                        setStatus(e.target.value === "CLOSED" ? "CLOSED" : "OPEN")
                                    }
                                    className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight ? "bg-stone-50 border-stone-300" : "bg-neutral-950 border-neutral-800"
                                        }` }
                                >
                                    <option value="OPEN">OPEN (Ochiq)</option>
                                    <option value="CLOSED">CLOSED (Yopiq)</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="opacity-75">Roundlar soni (4–30)</span>
                                <span className="font-semibold">{ questionCount } ta</span>
                            </div>
                            <input
                                type="range"
                                min={ 4 }
                                max={ 30 }
                                value={ questionCount }
                                onChange={ (e) => setQuestionCount(Number(e.target.value)) }
                                className="w-full cursor-pointer"
                            />
                        </div>

                        <div>
                            <label className="block text-xs opacity-75 mb-1">
                                Qo&apos;shimcha Prompt (ixtiyoriy)
                            </label>
                            <textarea
                                rows={ 2 }
                                value={ customPrompt }
                                onChange={ (e) => setCustomPrompt(e.target.value) }
                                placeholder="Masalan: Tricky idioms, fast-paced challenges..."
                                className={ `w-full rounded-lg border px-3 py-2 text-xs ${isLight ? "bg-stone-50 border-stone-300" : "bg-neutral-950 border-neutral-800"
                                    }` }
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={ creating }
                            className={ `w-full rounded-lg py-2.5 text-sm font-medium cursor-pointer disabled:opacity-50 ${isLight ? "bg-stone-900 text-white" : "bg-white text-neutral-950"
                                }` }
                        >
                            { creating ? "AI o'yin tuzmoqda..." : "100% AI O'yin Yaratish" }
                        </button>
                    </form>

                    {/* OPEN Games List */ }
                    <div
                        className={ `lg:col-span-6 rounded-xl border p-5 space-y-4 ${isLight ? "bg-white border-stone-300" : "bg-neutral-900/70 border-neutral-800"
                            }` }
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-medium">
                                Ochiq (OPEN) O&apos;yinlar ({ openGames.length })
                            </h2>
                            <button
                                type="button"
                                onClick={ loadGames }
                                className="text-xs underline opacity-75 cursor-pointer"
                            >
                                Yangilash
                            </button>
                        </div>

                        { loading ? (
                            <p className="text-sm opacity-70">Yuklanmoqda...</p>
                        ) : openGames.length === 0 ? (
                            <p className="text-sm opacity-70">
                                Hozircha OPEN o&apos;yin yo&apos;q. Yangi o&apos;yin yarating yoki ID orqali /games/[id] ga kiring.
                            </p>
                        ) : (
                            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                                { openGames.map((g) => (
                                    <div
                                        key={ g.id }
                                        className={ `rounded-lg border p-4 space-y-2 ${isLight
                                            ? "bg-stone-50 border-stone-200"
                                            : "bg-neutral-950/70 border-neutral-800"
                                            }` }
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Link className="font-medium hover:underline" href="{`/games/${g.id}`}">
                                                        { g.title }
                                                    </Link>
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-600/40">
                                                        OPEN
                                                    </span>
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-neutral-700">
                                                        { g.gameType }
                                                    </span>
                                                </div>
                                                <p className="text-xs opacity-75 mt-1">
                                                    { g.topic } · { g.level } · { g.questionCount } round
                                                </p>
                                                <p className="text-[11px] opacity-60 mt-0.5">
                                                    ID: <code className="select-all">{ g.id }</code>
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={ `/games/${g.id}` }
                                                    className={ `px-3 py-1.5 rounded-md text-xs font-medium ${isLight ? "bg-stone-900 text-white" : "bg-white text-neutral-950"
                                                        }` }
                                                >
                                                    O&apos;ynash
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={ () => handleToggleStatus(g) }
                                                    className="px-2.5 py-1.5 rounded-md text-xs border border-neutral-600 cursor-pointer"
                                                >
                                                    Yopish
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={ () => handleDelete(g.id) }
                                                    className="px-2.5 py-1.5 rounded-md text-xs text-rose-400 cursor-pointer"
                                                >
                                                    O&apos;chirish
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )) }
                            </div>
                        ) }
                    </div>
                </div>
            </div>
        </main >
    );
}
