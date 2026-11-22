"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

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

interface TestRecord {
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
    creatorId: string;
    creator: UserSummary;
    participants: ParticipantItem[];
    createdAt: string;
}

const TOPICS = [
    "Grammar & Tenses",
    "Vocabulary & Collocations",
    "IELTS Reading & Inference",
    "Business & Workplace English",
    "Everyday Conversation & Idioms",
];

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function TestsHubPage() {
    const [openTests, setOpenTests] = useState<TestRecord[]>([]);
    const [allTestsForMerge, setAllTestsForMerge] = useState<TestRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const [title, setTitle] = useState("");
    const [topic, setTopic] = useState(TOPICS[0]);
    const [level, setLevel] = useState("B1");
    const [questionCount, setQuestionCount] = useState<number>(10);
    const [useAi, setUseAi] = useState<boolean>(false); // default OFF
    const [customPrompt, setCustomPrompt] = useState<string>("");
    const [status, setStatus] = useState<"OPEN" | "CLOSED">("OPEN");
    const [maxParticipants, setMaxParticipants] = useState<string>("");
    const [startsAt, setStartsAt] = useState<string>("");
    const [endsAt, setEndsAt] = useState<string>("");
    const [designTheme, setDesignTheme] = useState<"minimal" | "card" | "paper">("minimal");
    const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
    const [generating, setGenerating] = useState(false);

    const [directTestId, setDirectTestId] = useState("");
    const [uiTheme, setUiTheme] = useState<"dark" | "light">("dark");
    const [founderMode, setFounderMode] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const loadTests = useCallback(async () => {
        try {
            setLoading(true);
            const [openRes, allRes] = await Promise.all([
                fetch("/api/tests", { cache: "no-store" }),
                fetch("/api/tests?all=1", { cache: "no-store" }),
            ]);
            const openData = await openRes.json();
            const allData = await allRes.json();

            if (openRes.ok && Array.isArray(openData.tests)) {
                setOpenTests(openData.tests);
            }
            if (allRes.ok && Array.isArray(allData.tests)) {
                setAllTestsForMerge(allData.tests);
            }
        } catch {
            setErrorMsg("Testlarni yuklashda xatolik yuz berdi.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTests();
    }, [loadTests]);

    function toggleMergeId(id: string) {
        setMergeSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    }

    async function handleCreateOrMergeTest(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);
        setErrorMsg(null);
        setGenerating(true);

        try {
            const parsedLimit =
                maxParticipants.trim() === "" ? null : Number(maxParticipants);

            const res = await fetch("/api/tests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim() || undefined,
                    topic,
                    level,
                    questionCount,
                    useAi,
                    customPrompt: customPrompt.trim() || undefined,
                    status,
                    maxParticipants:
                        parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0
                            ? Math.round(parsedLimit)
                            : null,
                    startsAt: startsAt || null,
                    endsAt: endsAt || null,
                    designTheme,
                    mergeTestIds: mergeSelectedIds.length >= 2 ? mergeSelectedIds : undefined,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || "Test yaratishda xatolik yuz berdi.");
                return;
            }

            setTitle("");
            setCustomPrompt("");
            setMergeSelectedIds([]);
            setMessage(
                data.test.status === "CLOSED"
                    ? `Yopiq (CLOSED) test yaratildi! ID: ${data.test.id} (/tests/${data.test.id} orqali kiring)`
                    : `"${data.test.title}" yaratildi (AI: ${useAi ? "ON" : "OFF"}).`
            );
            await loadTests();
        } catch {
            setErrorMsg("Tarmoq xatoligi yuz berdi.");
        } finally {
            setGenerating(false);
        }
    }

    async function handleToggleStatus(test: TestRecord) {
        setMessage(null);
        setErrorMsg(null);
        const nextStatus = test.status === "OPEN" ? "CLOSED" : "OPEN";
        try {
            const res = await fetch(`/api/tests/${test.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus }),
            });
            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || "Holatni o'zgartirib bo'lmadi.");
                return;
            }
            setMessage(`Holat ${nextStatus} ga o'zgartirildi.`);
            await loadTests();
        } catch {
            setErrorMsg("Holatni o'zgartirishda xato.");
        }
    }

    async function handleDeleteTest(id: string) {
        setMessage(null);
        setErrorMsg(null);
        try {
            const res = await fetch(`/api/tests/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || "Testni o'chirib bo'lmadi.");
                return;
            }
            setMessage("Test o'chirildi.");
            await loadTests();
        } catch {
            setErrorMsg("O'chirishda xato.");
        }
    }

    const isLight = uiTheme === "light";

    return (
        <main
            className={ `min-h-screen p-6 md:p-10 transition-colors ${isLight
                ? "bg-stone-100 text-stone-900"
                : "bg-neutral-950 text-neutral-100"
                }` }
        >
            <div className="max-w-6xl mx-auto space-y-8">
                <div
                    className={ `flex flex-wrap items-center justify-between gap-4 border-b pb-5 ${isLight ? "border-stone-300" : "border-neutral-800"
                        }` }
                >
                    <div>
                        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                            Test Studio · Open &amp; ID Access
                        </h1>
                        <p
                            className={ `text-sm mt-1 ${isLight ? "text-stone-600" : "text-neutral-400"
                                }` }
                        >
                            Faqat OPEN testlar ro&apos;yxatda ko&apos;rinadi. Yopiq (CLOSED) yoki boshqa testlarga
                            ID orqali /tests/[id] sahifasidan kiring.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={ () => setUiTheme((t) => (t === "dark" ? "light" : "dark")) }
                            className={ `px-3.5 py-2 rounded-lg text-xs font-medium border cursor-pointer ${isLight
                                ? "bg-white text-stone-900 border-stone-300"
                                : "bg-neutral-900 text-neutral-200 border-neutral-700"
                                }` }
                        >
                            Theme: { uiTheme.toUpperCase() }
                        </button>
                        <button
                            type="button"
                            onClick={ () => setFounderMode((f) => !f) }
                            className={ `px-3.5 py-2 rounded-lg text-xs font-medium border cursor-pointer ${founderMode
                                ? isLight
                                    ? "bg-stone-900 text-white border-stone-900"
                                    : "bg-white text-neutral-950 border-white"
                                : isLight
                                    ? "bg-white text-stone-700 border-stone-300"
                                    : "bg-neutral-900 text-neutral-400 border-neutral-800"
                                }` }
                        >
                            { founderMode ? "Founder Control: ON" : "Participant View" }
                        </button>
                    </div>
                </div>

                {/* Direct Test ID Access */ }
                <div
                    className={ `rounded-xl border p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 ${isLight
                        ? "bg-white border-stone-300"
                        : "bg-neutral-900/70 border-neutral-800"
                        }` }
                >
                    <div className="text-xs">
                        <p className="font-semibold">
                            Test ID orqali kirish (Yopiq / Private testlar uchun)
                        </p>
                        <p className={ isLight ? "text-stone-600" : "text-neutral-400" }>
                            Yopiq testlar ro&apos;yxatda chiqmaydi — ID ni kiriting va /tests/[id] ga o&apos;ting.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={ directTestId }
                            onChange={ (e) => setDirectTestId(e.target.value) }
                            placeholder="Test ID kiriting..."
                            className={ `rounded-lg border px-3 py-2 text-xs w-56 ${isLight
                                ? "bg-stone-50 border-stone-300 text-stone-900"
                                : "bg-neutral-950 border-neutral-700 text-white"
                                }` }
                        />
                        { directTestId.trim() ? (
                            <Link
                                href={ `/tests/${encodeURIComponent(directTestId.trim())}` }
                                className={ `px-4 py-2 rounded-lg text-xs font-medium ${isLight ? "bg-stone-900 text-white" : "bg-white text-neutral-950"
                                    }` }
                            >
                                Ochish
                            </Link>
                        ) : (
                            <button
                                type="button"
                                disabled
                                className="px-4 py-2 rounded-lg text-xs font-medium opacity-40 border border-neutral-700"
                            >
                                Ochish
                            </button>
                        ) }
                    </div>
                </div>

                { message && (
                    <div className="rounded-lg border border-emerald-600/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
                        { message }
                    </div>
                ) }
                { errorMsg && (
                    <div className="rounded-lg border border-red-600/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                        { errorMsg }
                    </div>
                ) }

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <form
                        onSubmit={ handleCreateOrMergeTest }
                        className={ `lg:col-span-6 rounded-xl border p-5 space-y-4 ${isLight
                            ? "bg-white border-stone-300"
                            : "bg-neutral-900/70 border-neutral-800"
                            }` }
                    >
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-lg font-medium">
                                { mergeSelectedIds.length >= 2
                                    ? `Testlarni Birlashma Qilish (${mergeSelectedIds.length} ta)`
                                    : "Yangi Test Yaratish" }
                            </h2>

                            <button
                                type="button"
                                onClick={ () => setUseAi((v) => !v) }
                                className={ `px-3 py-1 rounded-full text-xs font-medium border cursor-pointer ${useAi
                                    ? "bg-emerald-500 text-neutral-950 border-emerald-400"
                                    : isLight
                                        ? "bg-stone-100 text-stone-700 border-stone-300"
                                        : "bg-neutral-950 text-neutral-400 border-neutral-700"
                                    }` }
                            >
                                AI: { useAi ? "ON" : "OFF" }
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs opacity-75 mb-1">Test nomi</label>
                            <input
                                type="text"
                                value={ title }
                                onChange={ (e) => setTitle(e.target.value) }
                                placeholder="Masalan: B1 Mixed Practice"
                                className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight
                                    ? "bg-stone-50 border-stone-300 text-stone-900"
                                    : "bg-neutral-950 border-neutral-800 text-white"
                                    }` }
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs opacity-75 mb-1">Mavzu</label>
                                <select
                                    value={ topic }
                                    onChange={ (e) => setTopic(e.target.value) }
                                    className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight
                                        ? "bg-stone-50 border-stone-300 text-stone-900"
                                        : "bg-neutral-950 border-neutral-800 text-white"
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
                                <label className="block text-xs opacity-75 mb-1">Qiyinlik darajasi</label>
                                <select
                                    value={ level }
                                    onChange={ (e) => setLevel(e.target.value) }
                                    className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight
                                        ? "bg-stone-50 border-stone-300 text-stone-900"
                                        : "bg-neutral-950 border-neutral-800 text-white"
                                        }` }
                                >
                                    { LEVELS.map((lvl) => (
                                        <option key={ lvl } value={ lvl }>
                                            { lvl }
                                        </option>
                                    )) }
                                </select>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="opacity-75">Savollar soni (5–100)</span>
                                <span className="font-semibold">{ questionCount } ta</span>
                            </div>
                            <input
                                type="range"
                                min={ 5 }
                                max={ 100 }
                                value={ questionCount }
                                onChange={ (e) => setQuestionCount(Number(e.target.value)) }
                                className="w-full cursor-pointer"
                            />
                        </div>

                        <div>
                            <label className="block text-xs opacity-75 mb-1">
                                Qo&apos;shimcha Prompt (mavzu va darajadan tashqari)
                            </label>
                            <textarea
                                rows={ 2 }
                                value={ customPrompt }
                                onChange={ (e) => setCustomPrompt(e.target.value) }
                                placeholder="Masalan: Focus on conditionals, phrasal verbs, and academic gap-fill questions..."
                                className={ `w-full rounded-lg border px-3 py-2 text-xs ${isLight
                                    ? "bg-stone-50 border-stone-300 text-stone-900"
                                    : "bg-neutral-950 border-neutral-800 text-white"
                                    }` }
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs opacity-75 mb-1">Status</label>
                                <select
                                    value={ status }
                                    onChange={ (e) =>
                                        setStatus(e.target.value === "CLOSED" ? "CLOSED" : "OPEN")
                                    }
                                    className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight
                                        ? "bg-stone-50 border-stone-300 text-stone-900"
                                        : "bg-neutral-950 border-neutral-800 text-white"
                                        }` }
                                >
                                    <option value="OPEN">OPEN (Ochiq)</option>
                                    <option value="CLOSED">CLOSED (Yopiq)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs opacity-75 mb-1">Max qatnashuvchi</label>
                                <input
                                    type="number"
                                    min={ 1 }
                                    value={ maxParticipants }
                                    onChange={ (e) => setMaxParticipants(e.target.value) }
                                    placeholder="Cheklovsiz"
                                    className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight
                                        ? "bg-stone-50 border-stone-300 text-stone-900"
                                        : "bg-neutral-950 border-neutral-800 text-white"
                                        }` }
                                />
                            </div>

                            <div>
                                <label className="block text-xs opacity-75 mb-1">Test dizayni</label>
                                <select
                                    value={ designTheme }
                                    onChange={ (e) =>
                                        setDesignTheme(e.target.value as "minimal" | "card" | "paper")
                                    }
                                    className={ `w-full rounded-lg border px-3 py-2 text-sm ${isLight
                                        ? "bg-stone-50 border-stone-300 text-stone-900"
                                        : "bg-neutral-950 border-neutral-800 text-white"
                                        }` }
                                >
                                    <option value="minimal">Minimal</option>
                                    <option value="card">Card</option>
                                    <option value="paper">Paper</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs opacity-75 mb-1">
                                    Boshlanish vaqti (ixtiyoriy)
                                </label>
                                <input
                                    type="datetime-local"
                                    value={ startsAt }
                                    onChange={ (e) => setStartsAt(e.target.value) }
                                    className={ `w-full rounded-lg border px-3 py-2 text-xs ${isLight
                                        ? "bg-stone-50 border-stone-300 text-stone-900"
                                        : "bg-neutral-950 border-neutral-800 text-white"
                                        }` }
                                />
                            </div>

                            <div>
                                <label className="block text-xs opacity-75 mb-1">
                                    Tugash vaqti (ixtiyoriy)
                                </label>
                                <input
                                    type="datetime-local"
                                    value={ endsAt }
                                    onChange={ (e) => setEndsAt(e.target.value) }
                                    className={ `w-full rounded-lg border px-3 py-2 text-xs ${isLight
                                        ? "bg-stone-50 border-stone-300 text-stone-900"
                                        : "bg-neutral-950 border-neutral-800 text-white"
                                        }` }
                                />
                            </div>
                        </div>

                        { allTestsForMerge.length >= 2 && (
                            <div className="pt-2 border-t border-neutral-800/60">
                                <p className="text-xs font-medium mb-2">
                                    2–3+ testni qo&apos;shib bitta test qilish (ixtiyoriy):
                                </p>
                                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                                    { allTestsForMerge.map((mt) => {
                                        const checked = mergeSelectedIds.includes(mt.id);
                                        return (
                                            <button
                                                key={ mt.id }
                                                type="button"
                                                onClick={ () => toggleMergeId(mt.id) }
                                                className={ `px-2.5 py-1 rounded text-xs border cursor-pointer ${checked
                                                    ? "bg-emerald-500 text-neutral-950 border-emerald-400 font-medium"
                                                    : "border-neutral-700 opacity-80"
                                                    }` }
                                            >
                                                { checked ? "✓ " : "+ " }
                                                { mt.title } ({ mt.questionCount })
                                            </button>
                                        );
                                    }) }
                                </div>
                            </div>
                        ) }

                        <button
                            type="submit"
                            disabled={ generating }
                            className={ `w-full rounded-lg font-medium py-2.5 text-sm transition cursor-pointer disabled:opacity-50 ${isLight
                                ? "bg-stone-900 text-white hover:bg-stone-800"
                                : "bg-white text-neutral-950 hover:bg-neutral-200"
                                }` }
                        >
                            { generating
                                ? "Bajarilmoqda..."
                                : mergeSelectedIds.length >= 2
                                    ? "Tanlangan Testlarni Bitta Testga Birlashtirish"
                                    : useAi
                                        ? "AI Orqali Test Yaratish (AI: ON)"
                                        : "Test Yaratish (AI: OFF)" }
                        </button>
                    </form>

                    {/* OPEN Tests List */ }
                    <div
                        className={ `lg:col-span-6 rounded-xl border p-5 space-y-4 ${isLight
                            ? "bg-white border-stone-300"
                            : "bg-neutral-900/70 border-neutral-800"
                            }` }
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-medium">
                                Ochiq (OPEN) Testlar ({ openTests.length })
                            </h2>
                            <button
                                type="button"
                                onClick={ loadTests }
                                className="text-xs underline opacity-75 hover:opacity-100 cursor-pointer"
                            >
                                Yangilash
                            </button>
                        </div>

                        { loading ? (
                            <p className="text-sm opacity-70">Yuklanmoqda...</p>
                        ) : openTests.length === 0 ? (
                            <p className="text-sm opacity-70">
                                Hozircha OPEN test yo&apos;q. Yangi OPEN test yarating yoki ID orqali /tests/[id] ga kiring.
                            </p>
                        ) : (
                            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                                { openTests.map((t) => {
                                    const pCount = t.participants?.length ?? 0;
                                    const limitStr =
                                        t.maxParticipants !== null && t.maxParticipants !== undefined
                                            ? `${pCount}/${t.maxParticipants}`
                                            : `${pCount}/∞`;

                                    return (
                                        <div
                                            key={ t.id }
                                            className={ `rounded-lg border p-4 space-y-2 ${isLight
                                                ? "bg-stone-50 border-stone-200"
                                                : "bg-neutral-950/70 border-neutral-800"
                                                }` }
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <Link className="font-medium hover:underline" href="{`/tests/${t.id}`}">
                                                            { t.title }
                                                        </Link>
                                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-600/40">
                                                            OPEN
                                                        </span>
                                                    </div>
                                                    <p className="text-xs opacity-75 mt-1">
                                                        { t.topic } · { t.level } · { t.questionCount } savol · Qatnashuvchilar:{ " " }
                                                        { limitStr }
                                                    </p>
                                                    <p className="text-[11px] opacity-60 mt-0.5">
                                                        ID: <code className="select-all">{ t.id }</code>
                                                    </p>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Link
                                                        href={ `/tests/${t.id}` }
                                                        className={ `px-3 py-1.5 rounded-md text-xs font-medium ${isLight ? "bg-stone-900 text-white" : "bg-white text-neutral-950"
                                                            }` }
                                                    >
                                                        Testga kirish
                                                    </Link>
                                                    { founderMode && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={ () => handleToggleStatus(t) }
                                                                className="px-2.5 py-1.5 rounded-md text-xs border border-neutral-600 cursor-pointer"
                                                            >
                                                                Yopish (CLOSED)
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={ () => handleDeleteTest(t.id) }
                                                                className="px-2.5 py-1.5 rounded-md text-xs text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                                                            >
                                                                O&apos;chirish
                                                            </button>
                                                        </>
                                                    ) }
                                                </div>
                                            </div>

                                            {
                                                founderMode && t.participants && t.participants.length > 0 && (
                                                    <div className="pt-2 border-t border-neutral-800/60 text-xs">
                                                        <p className="opacity-75 mb-1">
                                                            Qatnashuvchilar ({ t.participants.length }):
                                                        </p>
                                                        <div className="flex flex-wrap gap-2">
                                                            { t.participants.map((p) => (
                                                                <span
                                                                    key={ p.id }
                                                                    className="px-2 py-1 rounded bg-neutral-800/70 text-[11px]"
                                                                >
                                                                    @{ p.user.userName }:{ " " }
                                                                    { p.score !== null && p.total !== null
                                                                        ? `${p.score}/${p.total}`
                                                                        : "Joined" }
                                                                </span>
                                                            )) }
                                                        </div>
                                                    </div>
                                                )
                                            }
                                        </div>
                                    );
                                }) }
                            </div>
                        ) }
                    </div>
                </div>
            </div>
        </main >
    );
}
