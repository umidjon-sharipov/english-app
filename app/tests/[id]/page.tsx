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
    questionsJson: QuestionItem[];
    creatorId: string;
    creator: UserSummary;
    participants: ParticipantItem[];
}

export default function TestByIdPage() {
    const params = useParams<{ id: string }>();
    const testId = params?.id ?? "";

    const [test, setTest] = useState<TestDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [infoMsg, setInfoMsg] = useState<string | null>(null);

    const [answers, setAnswers] = useState<Record<number, number>>({});
    const [result, setResult] = useState<{ score: number; total: number } | null>(
        null
    );
    const [submitting, setSubmitting] = useState(false);

    const [pageTheme, setPageTheme] = useState<"dark" | "light">("dark");
    const [cardDesign, setCardDesign] = useState<"minimal" | "card" | "paper">(
        "minimal"
    );

    const loadTest = useCallback(async () => {
        if (!testId) return;
        try {
            setLoading(true);
            setErrorMsg(null);
            const res = await fetch(`/api/tests/${encodeURIComponent(testId)}`, {
                cache: "no-store",
            });
            const data = await res.json();

            if (data.test) {
                setTest(data.test);
                if (data.test.designTheme === "card" || data.test.designTheme === "paper") {
                    setCardDesign(data.test.designTheme);
                }
            }

            if (!res.ok) {
                setErrorMsg(data.error || "Testni ochishda xatolik yuz berdi.");
            } else if (data.autoJoined) {
                setInfoMsg("Siz avtomatik ravishda qatnashuvchilar ro'yxatiga qo'shildingiz.");
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

    function handleExportPdf() {
        window.print();
    }

    const questions: QuestionItem[] = Array.isArray(test?.questionsJson)
        ? test.questionsJson
        : [];

    const isLight = pageTheme === "light";

    return (
        <main
            className={ `min-h-screen p-6 md:p-10 transition-colors ${isLight ? "bg-stone-100 text-stone-900" : "bg-neutral-950 text-neutral-100"
                }` }
        >
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <Link className="text-xs underline opacity-80 hover:opacity-100" href="/tests">
                        ← Barcha ochiq testlarga qaytish
                    </Link>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={ () => setPageTheme((t) => (t === "dark" ? "light" : "dark")) }
                            className="px-3 py-1.5 rounded-lg text-xs border border-neutral-700 cursor-pointer"
                        >
                            Theme: { pageTheme.toUpperCase() }
                        </button>

                        <select
                            value={ cardDesign }
                            onChange={ (e) =>
                                setCardDesign(e.target.value as "minimal" | "card" | "paper")
                            }
                            className={ `px-3 py-1.5 rounded-lg text-xs border ${isLight
                                ? "bg-white border-stone-300 text-stone-900"
                                : "bg-neutral-900 border-neutral-700 text-white"
                                }` }
                        >
                            <option value="minimal">Design: Minimal</option>
                            <option value="card">Design: Card</option>
                            <option value="paper">Design: Paper</option>
                        </select>

                        <button
                            type="button"
                            onClick={ handleExportPdf }
                            className={ `px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${isLight ? "bg-stone-900 text-white" : "bg-white text-neutral-950"
                                }` }
                        >
                            Export .PDF
                        </button>
                    </div>
                </div>

                { infoMsg && (
                    <div className="rounded-lg border border-emerald-600/50 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-300 print:hidden">
                        { infoMsg }
                    </div>
                ) }
                { errorMsg && (
                    <div className="rounded-lg border border-red-600/50 bg-red-950/30 px-4 py-3 text-xs text-red-300 print:hidden">
                        { errorMsg }
                    </div>
                ) }

                { loading ? (
                    <p className="text-sm opacity-70">Test yuklanmoqda...</p>
                ) : !test ? (
                    <div className="rounded-xl border border-neutral-800 p-6 text-sm opacity-75">
                        Test topilmadi. ID: <code>{ testId }</code>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div
                            className={ `rounded-xl border p-6 ${cardDesign === "paper"
                                ? "bg-amber-50 text-stone-900 border-amber-300"
                                : cardDesign === "card"
                                    ? isLight
                                        ? "bg-white border-stone-300 shadow-sm"
                                        : "bg-neutral-900 border-neutral-700"
                                    : isLight
                                        ? "bg-white border-stone-200"
                                        : "bg-neutral-900/60 border-neutral-800"
                                }` }
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h1 className="text-2xl font-semibold">{ test.title }</h1>
                                <span className="text-xs px-2.5 py-1 rounded-full border border-neutral-600">
                                    { test.status }
                                </span>
                            </div>
                            <p className="text-xs opacity-75 mt-1">
                                { test.topic } · { test.level } · { questions.length } savol · Founder: @
                                { test.creator?.userName }
                            </p>
                            <p className="text-xs opacity-65 mt-1">
                                Qatnashuvchilar: { test.participants?.length ?? 0 }
                                { test.maxParticipants ? ` / ${test.maxParticipants}` : " / ∞" }
                                { test.startsAt
                                    ? ` · Boshlanish: ${new Date(test.startsAt).toLocaleString()}`
                                    : "" }
                                { test.endsAt
                                    ? ` · Tugash: ${new Date(test.endsAt).toLocaleString()}`
                                    : "" }
                            </p>

                            { result && (
                                <div className="mt-4 rounded-lg bg-emerald-950/40 border border-emerald-600/40 px-4 py-2.5 text-sm font-medium text-emerald-300">
                                    Natija: { result.score } / { result.total }
                                </div>
                            ) }
                        </div>

                        <div className="space-y-4">
                            { questions.map((q, qIdx) => (
                                <div
                                    key={ q.id ?? qIdx }
                                    className={ `rounded-xl border p-4 space-y-2.5 ${cardDesign === "paper"
                                        ? "bg-amber-50/90 text-stone-900 border-amber-300"
                                        : isLight
                                            ? "bg-white border-stone-200"
                                            : "bg-neutral-900/60 border-neutral-800"
                                        }` }
                                >
                                    <p className="text-sm font-medium">
                                        { qIdx + 1 }. { q.question }
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        { q.options.map((opt, oIdx) => {
                                            const picked = answers[qIdx] === oIdx;
                                            return (
                                                <button
                                                    key={ oIdx }
                                                    type="button"
                                                    onClick={ () =>
                                                        setAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))
                                                    }
                                                    className={ `text-left rounded-md border px-3 py-2 text-xs transition cursor-pointer ${picked
                                                        ? "bg-white text-neutral-950 border-white font-medium"
                                                        : "border-neutral-700/70 hover:border-neutral-500"
                                                        }` }
                                                >
                                                    { String.fromCharCode(65 + oIdx) }. { opt }
                                                </button>
                                            );
                                        }) }
                                    </div>
                                    { result && (
                                        <p className="text-xs opacity-80 pt-1">Izoh: { q.explanation }</p>
                                    ) }
                                </div>
                            )) }
                        </div>

                        <div className="flex justify-end print:hidden">
                            <button
                                type="button"
                                disabled={ submitting }
                                onClick={ handleSubmit }
                                className={ `rounded-lg px-6 py-2.5 text-sm font-medium cursor-pointer disabled:opacity-50 ${isLight ? "bg-stone-900 text-white" : "bg-white text-neutral-950"
                                    }` }
                            >
                                { submitting ? "Saqlanmoqda..." : "Testni Yakunlash va Saqlash" }
                            </button>
                        </div>
                    </div>
                ) }
            </div>
        </main>
    );
}
