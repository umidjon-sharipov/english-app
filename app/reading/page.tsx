"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface ReadingRecord {
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
    creator: { userName: string; firstName: string };
    participants: Array<{ id: string }>;
}

const TOPICS = [
    "Science & Technology",
    "Culture & Society",
    "IELTS Academic Passages",
    "Environment & Nature",
    "Business & Innovation",
];

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function ReadingHubPage() {
    const [openReadings, setOpenReadings] = useState<ReadingRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const [title, setTitle] = useState("");
    const [topic, setTopic] = useState(TOPICS[0]);
    const [level, setLevel] = useState("B1");
    const [length, setLength] = useState<"short" | "medium" | "long">("medium");
    const [questionType, setQuestionType] = useState<"test" | "question">("test");
    const [passageCount, setPassageCount] = useState<number>(1);
    const [questionsPerPassage, setQuestionsPerPassage] = useState<number>(5);
    const [customPrompt, setCustomPrompt] = useState("");
    const [status, setStatus] = useState<"OPEN" | "CLOSED">("OPEN");
    const [allowParticipantAi, setAllowParticipantAi] = useState<boolean>(false);
    const [creating, setCreating] = useState(false);

    const [directId, setDirectId] = useState("");
    const [uiTheme, setUiTheme] = useState<"dark" | "light">("dark");
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const loadReadings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/reading", { cache: "no-store" });
            const data = await res.json();
            if (res.ok && Array.isArray(data.readings)) {
                setOpenReadings(data.readings);
            } else if (data.error) {
                setErr(data.error);
            }
        } catch {
            setErr("Reading'larni yuklashda xato.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadReadings();
    }, [loadReadings]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setMsg(null);
        setErr(null);
        setCreating(true);
        try {
            const res = await fetch("/api/reading", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim() || undefined,
                    topic,
                    level,
                    length,
                    questionType,
                    passageCount,
                    questionsPerPassage,
                    customPrompt: customPrompt.trim() || undefined,
                    status,
                    allowParticipantAi,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setErr(data.error || "Reading yaratishda xato.");
                return;
            }
            setTitle("");
            setCustomPrompt("");
            setMsg(`"${data.reading.title}" AI tomonidan yaratildi.`);
            await loadReadings();
        } catch {
            setErr("Tarmoq xatoligi.");
        } finally {
            setCreating(false);
        }
    }

    async function handleToggleStatus(item: ReadingRecord) {
        setErr(null);
        setMsg(null);
        const nextStatus = item.status === "OPEN" ? "CLOSED" : "OPEN";
        const res = await fetch(`/api/reading/${item.id}`, {
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
        await loadReadings();
    }

    async function handleDelete(id: string) {
        setErr(null);
        setMsg(null);
        const res = await fetch(`/api/reading/${id}`, { method: "DELETE" });
        if (res.ok) {
            setMsg("Reading o'chirildi.");
            await loadReadings();
        }
    }

    const isLight = uiTheme === "light";

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
                            Reading Studio · AI Passages &amp; AI Grading
                        </h1>
                        <p className="text-sm opacity-75 mt-1">
                            1–10 matn, 4–10 savol, A1–C2, uzunlik, Test yoki Ochiq Savol, prompt. OPEN / CLOSED.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link className="px-3 py-2 rounded-lg text-xs border border-neutral-700" href="/tests">
                            Tests Studio
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

                <div
                    className={ `rounded-xl border p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 ${isLight ? "bg-white border-stone-300" : "bg-neutral-900/70 border-neutral-800"
                        }` }
                >
                    <div className="text-xs">
                        <p className="font-semibold">Reading ID orqali kirish (OPEN / CLOSED)</p>
                        <p className="opacity-70">Yopiq Reading&apos;ga ham ID orqali /reading/[id] dan kiring.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={ directId }
                            onChange={ (e) => setDirectId(e.target.value) }
                            placeholder="Reading ID..."
                            className={ `rounded-lg border px-3 py-2 text-xs w-56 ${isLight ? "bg-stone-50 border-stone-300" : "bg-neutral-950 border-neutral-700"
                                }` }
                        />
                        { directId.trim() ? (
                            <Link
                                href={ `/reading/${encodeURIComponent(directId.trim())}` }
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
                        onSubmit={ handleCreate }
                        className={ `lg:col-span-6 rounded-xl border p-5 space-y-4 ${isLight ? "bg-white border-stone-300" : "bg-neutral-900/70 border-neutral-800"
                            }` }
                    >
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-lg font-medium">Yangi Reading Yaratish (AI)</h2>
                            <button
                                type="button"
                                onClick={ () => setAllowParticipantAi((v) => !v) }
                                className={ `px-3 py-1 rounded-full text-xs font-medium border cursor-pointer ${allowParticipantAi
                                    ? "bg-emerald-500 text-neutral-950 border-emerald-400"
                                    : "border-neutral-700 opacity-80"
                                    }` }
                            >
                                Readingda AI: { allowParticipantAi ? "ON" : "OFF" }
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs opacity-75 mb-1">Nomi (ixtiyoriy)</label>
                            <input
                                type="text"
                                value={ title }
                                onChange={ (e) => setTitle(e.target.value) }
                                placeholder="Masalan: B2 Science Reading Set"
                                className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight ? "bg-stone-50 border-stone-300" : "bg-neutral-950 border-neutral-800"
                                    }` }
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                <label className="block text-xs opacity-75 mb-1">Format: Test yoki Savol</label>
                                <select
                                    value={ questionType }
                                    onChange={ (e) =>
                                        setQuestionType(e.target.value === "question" ? "question" : "test")
                                    }
                                    className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight ? "bg-stone-50 border-stone-300" : "bg-neutral-950 border-neutral-800"
                                        }` }
                                >
                                    <option value="test">Test (Variantli A/B/C/D)</option>
                                    <option value="question">Savol (Ochiq javob — textarea / ______)</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                                <label className="block text-xs opacity-75 mb-1">Matn uzunligi</label>
                                <select
                                    value={ length }
                                    onChange={ (e) =>
                                        setLength(e.target.value as "short" | "medium" | "long")
                                    }
                                    className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight ? "bg-stone-50 border-stone-300" : "bg-neutral-950 border-neutral-800"
                                        }` }
                                >
                                    <option value="short">Short (Qisqa)</option>
                                    <option value="medium">Medium (O&apos;rta)</option>
                                    <option value="long">Long (Uzun)</option>
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs opacity-75 mb-1">
                                    Reading soni (1–10): <b>{ passageCount }</b>
                                </label>
                                <input
                                    type="range"
                                    min={ 1 }
                                    max={ 10 }
                                    value={ passageCount }
                                    onChange={ (e) => setPassageCount(Number(e.target.value)) }
                                    className="w-full cursor-pointer"
                                />
                            </div>

                            <div>
                                <label className="block text-xs opacity-75 mb-1">
                                    Har matnda savol/test (4–10): <b>{ questionsPerPassage }</b>
                                </label>
                                <input
                                    type="range"
                                    min={ 4 }
                                    max={ 10 }
                                    value={ questionsPerPassage }
                                    onChange={ (e) => setQuestionsPerPassage(Number(e.target.value)) }
                                    className="w-full cursor-pointer"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs opacity-75 mb-1">
                                Qo&apos;shimcha Prompt (ixtiyoriy)
                            </label>
                            <textarea
                                rows={ 2 }
                                value={ customPrompt }
                                onChange={ (e) => setCustomPrompt(e.target.value) }
                                placeholder="Masalan: Include analytical questions and expert vocabulary..."
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
                            { creating ? "AI Reading tuzmoqda..." : "AI Reading Yaratish" }
                        </button>
                    </form>

                    <div
                        className={ `lg:col-span-6 rounded-xl border p-5 space-y-4 ${isLight ? "bg-white border-stone-300" : "bg-neutral-900/70 border-neutral-800"
                            }` }
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-medium">
                                Ochiq (OPEN) Readinglar ({ openReadings.length })
                            </h2>
                            <button
                                type="button"
                                onClick={ loadReadings }
                                className="text-xs underline opacity-75 cursor-pointer"
                            >
                                Yangilash
                            </button>
                        </div>

                        { loading ? (
                            <p className="text-sm opacity-70">Yuklanmoqda...</p>
                        ) : openReadings.length === 0 ? (
                            <p className="text-sm opacity-70">
                                Hozircha OPEN Reading yo&apos;q. Yangi Reading yarating yoki ID orqali /reading/[id] ga kiring.
                            </p>
                        ) : (
                            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                                { openReadings.map((r) => (
                                    <div
                                        key={ r.id }
                                        className={ `rounded-lg border p-4 space-y-2 ${isLight
                                            ? "bg-stone-50 border-stone-200"
                                            : "bg-neutral-950/70 border-neutral-800"
                                            }` }
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Link className="font-medium hover:underline" href="{`/reading/${r.id}`}">
                                                        { r.title }
                                                    </Link>
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-600/40">
                                                        OPEN
                                                    </span>
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-neutral-700">
                                                        { (r.questionType || "test").toUpperCase() }
                                                    </span>
                                                </div>
                                                <p className="text-xs opacity-75 mt-1">
                                                    { r.topic } · { r.level } · { r.length } · { r.passageCount } matn ×{ " " }
                                                    { r.questionsPerPassage } savol
                                                </p>
                                                <p className="text-[11px] opacity-60 mt-0.5">
                                                    ID: <code className="select-all">{ r.id }</code>
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={ `/reading/${r.id}` }
                                                    className={ `px-3 py-1.5 rounded-md text-xs font-medium ${isLight ? "bg-stone-900 text-white" : "bg-white text-neutral-950"
                                                        }` }
                                                >
                                                    Boshlash
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={ () => handleToggleStatus(r) }
                                                    className="px-2.5 py-1.5 rounded-md text-xs border border-neutral-600 cursor-pointer"
                                                >
                                                    Yopish
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={ () => handleDelete(r.id) }
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
