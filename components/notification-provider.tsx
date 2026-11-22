"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import {
    AlertCircle,
    AlertTriangle,
    Check,
    Code2,
    Copy,
    Info,
    Loader2,
    X,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export type NotifyStatus = "success" | "error" | "warning" | "info" | "loading";

export interface NotifyOptions {
    title?: string;
    description?: string;
    xml?: string;
    duration?: number;
    dismissible?: boolean;
}

interface NotificationItem {
    id: string;
    status: NotifyStatus;
    title: string;
    message?: string;
    xml?: string;
    duration: number;
    dismissible: boolean;
}

export interface NotifyApi {
    show: (
        message: string,
        status?: NotifyStatus,
        options?: NotifyOptions
    ) => string;
    success: (message: string, options?: NotifyOptions) => string;
    error: (message: string, options?: NotifyOptions) => string;
    warning: (message: string, options?: NotifyOptions) => string;
    info: (message: string, options?: NotifyOptions) => string;
    loading: (message: string, options?: NotifyOptions) => string;
    xml: (xmlContent: string, options?: Omit<NotifyOptions, "xml">) => string;
    dismiss: (id: string) => void;
    clear: () => void;
}

const NotificationContext = createContext<NotifyApi | undefined>(undefined);

function useIsDesktop() {
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia("(min-width: 768px)");
        const update = () => setIsDesktop(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, []);

    return isDesktop;
}

function defaultTitleFor(status: NotifyStatus): string {
    switch (status) {
        case "success":
            return "Success";
        case "error":
            return "Error";
        case "warning":
            return "Warning";
        case "loading":
            return "Processing";
        default:
            return "Info";
    }
}

function formatXmlPreview(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("<")) return trimmed;

    try {
        let formatted = "";
        let indent = 0;
        const tokens = trimmed.replace(/>\s*</g, "><").split(/(?=<)|(?<=>)/g);

        for (const token of tokens) {
            const part = token.trim();
            if (!part) continue;

            if (part.startsWith("</")) {
                indent = Math.max(0, indent - 1);
                formatted += `${"  ".repeat(indent)}${part}\n`;
            } else if (
                part.startsWith("<?") ||
                part.startsWith("<!") ||
                part.endsWith("/>") ||
                (part.startsWith("<") && part.includes("</"))
            ) {
                formatted += `${"  ".repeat(indent)}${part}\n`;
            } else if (part.startsWith("<")) {
                formatted += `${"  ".repeat(indent)}${part}\n`;
                indent += 1;
            } else {
                formatted += `${"  ".repeat(indent)}${part}\n`;
            }
        }

        return formatted.trimEnd();
    } catch {
        return trimmed;
    }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
    const { resolvedTheme } = useTheme();
    const isDesktop = useIsDesktop();
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [isHovered, setIsHovered] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    const dismiss = useCallback((id: string) => {
        const timers = timersRef.current;
        if (timers && timers[id]) {
            clearTimeout(timers[id]);
            delete timers[id];
        }
        setItems((prev) => prev.filter((item) => item.id !== id));
    }, []);

    const clear = useCallback(() => {
        const timers = timersRef.current;
        if (timers) {
            Object.values(timers).forEach((t) => clearTimeout(t));
            timersRef.current = {};
        }
        setItems([]);
    }, []);

    const show = useCallback(
        (
            message: string,
            status: NotifyStatus = "info",
            options?: NotifyOptions
        ): string => {
            const id = `${Date.now().toString(36)}-${Math.random()
                .toString(36)
                .slice(2, 7)}`;
            const isLoading = status === "loading";
            const duration = options?.duration ?? (isLoading ? 0 : 3800);
            const dismissible = options?.dismissible ?? true;

            const nextItem: NotificationItem = {
                id,
                status,
                title: options?.title ?? defaultTitleFor(status),
                message: message || options?.description,
                xml: options?.xml,
                duration,
                dismissible,
            };

            setItems((prev) => [...prev.slice(-4), nextItem]);
            return id;
        },
        []
    );

    const success = useCallback(
        (message: string, options?: NotifyOptions) =>
            show(message, "success", options),
        [show]
    );

    const error = useCallback(
        (message: string, options?: NotifyOptions) => show(message, "error", options),
        [show]
    );

    const warning = useCallback(
        (message: string, options?: NotifyOptions) =>
            show(message, "warning", options),
        [show]
    );

    const info = useCallback(
        (message: string, options?: NotifyOptions) => show(message, "info", options),
        [show]
    );

    const loading = useCallback(
        (message: string, options?: NotifyOptions) =>
            show(message, "loading", options),
        [show]
    );

    const xml = useCallback(
        (xmlContent: string, options?: Omit<NotifyOptions, "xml">) =>
            show(options?.description ?? "", "info", {
                title: options?.title ?? "XML Payload",
                xml: xmlContent,
                duration: options?.duration ?? 6000,
                dismissible: options?.dismissible,
            }),
        [show]
    );

    useEffect(() => {
        if (!timersRef.current) {
            timersRef.current = {};
        }
        const timers = timersRef.current;

        if (isHovered || items.length === 0) {
            Object.values(timers).forEach((t) => clearTimeout(t));
            timersRef.current = {};
            return;
        }

        items.forEach((item) => {
            if (item.duration > 0 && !timers[item.id]) {
                timers[item.id] = setTimeout(() => {
                    dismiss(item.id);
                }, item.duration);
            }
        });
    }, [dismiss, isHovered, items]);

    useEffect(() => {
        return () => {
            const timers = timersRef.current;
            if (timers) {
                Object.values(timers).forEach((t) => clearTimeout(t));
            }
        };
    }, []);

    const handleCopyXml = async (id: string, content: string) => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedId(id);
            setTimeout(() => {
                setCopiedId((curr) => (curr === id ? null : curr));
            }, 1400);
        } catch {
            // ignore
        }
    };

    const api = useMemo<NotifyApi>(
        () => ({
            show,
            success,
            error,
            warning,
            info,
            loading,
            xml,
            dismiss,
            clear,
        }),
        [show, success, error, warning, info, loading, xml, dismiss, clear]
    );

    const isDark = resolvedTheme === "dark";

    const cardTone = (status: NotifyStatus) => {
        if (isDark) {
            switch (status) {
                case "error":
                    return "bg-[#0a0a0a]/95 text-[#ededed] border-white/30 shadow-[0_10px_28px_rgba(0,0,0,0.75)]";
                case "warning":
                    return "bg-[#0d0d0d]/95 text-[#ededed] border-white/25 shadow-[0_10px_28px_rgba(0,0,0,0.7)]";
                case "success":
                    return "bg-[#080808]/95 text-[#ffffff] border-white/20 shadow-[0_10px_28px_rgba(0,0,0,0.7)]";
                default:
                    return "bg-[#0a0a0a]/95 text-[#ededed] border-white/15 shadow-[0_10px_28px_rgba(0,0,0,0.65)]";
            }
        }

        switch (status) {
            case "error":
                return "bg-[#ffffff]/95 text-[#171717] border-black/35 shadow-[0_10px_28px_rgba(0,0,0,0.12)]";
            case "warning":
                return "bg-[#fafafa]/95 text-[#171717] border-black/25 shadow-[0_10px_28px_rgba(0,0,0,0.09)]";
            case "success":
                return "bg-[#ffffff]/95 text-[#000000] border-black/20 shadow-[0_10px_28px_rgba(0,0,0,0.09)]";
            default:
                return "bg-[#ffffff]/95 text-[#171717] border-black/15 shadow-[0_10px_28px_rgba(0,0,0,0.08)]";
        }
    };

    const badgeTone = (status: NotifyStatus) => {
        if (isDark) {
            switch (status) {
                case "success":
                    return "bg-white text-black border-white";
                case "error":
                    return "bg-[#1a1a1a] text-white border-white/45";
                case "warning":
                    return "bg-[#141414] text-[#e5e5e5] border-white/30";
                case "loading":
                    return "bg-[#111111] text-white border-white/20";
                default:
                    return "bg-[#111111] text-[#d4d4d4] border-white/20";
            }
        }

        switch (status) {
            case "success":
                return "bg-black text-white border-black";
            case "error":
                return "bg-[#f4f4f4] text-black border-black/45";
            case "warning":
                return "bg-[#f5f5f5] text-[#171717] border-black/30";
            case "loading":
                return "bg-[#f5f5f5] text-[#171717] border-black/20";
            default:
                return "bg-[#f5f5f5] text-[#262626] border-black/20";
        }
    };

    const iconFor = (status: NotifyStatus) => {
        switch (status) {
            case "success":
                return <Check className="h-3 w-3 stroke-[2.5]" />;
            case "error":
                return <AlertCircle className="h-3 w-3" />;
            case "warning":
                return <AlertTriangle className="h-3 w-3" />;
            case "loading":
                return <Loader2 className="h-3 w-3 animate-spin" />;
            default:
                return <Info className="h-3 w-3" />;
        }
    };

    return (
        <NotificationContext.Provider value={ api }>
            { children }

            {/* PC: bottom-right | Mobile: top-center */ }
            <div
                onMouseEnter={ () => setIsHovered(true) }
                onMouseLeave={ () => setIsHovered(false) }
                className="pointer-events-none fixed top-4 left-1/2 z-[99999] w-full max-w-[390px] -translate-x-1/2 px-4 md:top-auto md:right-6 md:bottom-6 md:left-auto md:translate-x-0 md:px-0"
            >
                <div className="relative flex min-h-[60px] w-full flex-col items-center md:items-end">
                    <AnimatePresence mode="popLayout" initial={ false }>
                        { items.map((item, idx) => {
                            const stackIndex = items.length - 1 - idx;
                            const ySign = isDesktop ? -1 : 1;
                            const hasXml = Boolean(item.xml);

                            const yOffset = isHovered
                                ? stackIndex * (hasXml ? 144 : 74) * ySign
                                : stackIndex * 9 * ySign;

                            const scale = isHovered
                                ? 1
                                : Math.max(0.88, 1 - stackIndex * 0.045);

                            const opacity = isHovered
                                ? 1
                                : stackIndex > 3
                                    ? 0
                                    : Math.max(0.4, 1 - stackIndex * 0.2);

                            return (
                                <motion.div
                                    key={ item.id }
                                    layout
                                    drag="x"
                                    dragConstraints={ { left: 0, right: 0 } }
                                    dragElastic={ 0.65 }
                                    onDragEnd={ (
                                        _e: MouseEvent | TouchEvent | PointerEvent,
                                        info: PanInfo
                                    ) => {
                                        if (
                                            item.dismissible &&
                                            (Math.abs(info.offset.x) > 90 ||
                                                Math.abs(info.velocity.x) > 500)
                                        ) {
                                            dismiss(item.id);
                                        }
                                    } }
                                    initial={ {
                                        opacity: 0,
                                        y: isDesktop ? 20 : -20,
                                        scale: 0.95,
                                    } }
                                    animate={ {
                                        opacity,
                                        y: yOffset,
                                        scale,
                                        zIndex: 60 - stackIndex,
                                    } }
                                    exit={ {
                                        opacity: 0,
                                        x: isDesktop ? 140 : 0,
                                        y: isDesktop ? 0 : -14,
                                        scale: 0.95,
                                        transition: { duration: 0.16, ease: "easeOut" },
                                    } }
                                    transition={ {
                                        type: "spring",
                                        stiffness: 430,
                                        damping: 33,
                                        mass: 0.8,
                                    } }
                                    style={ {
                                        position: stackIndex === 0 ? "relative" : "absolute",
                                        ...(isDesktop ? { bottom: 0 } : { top: 0 }),
                                    } }
                                    className="pointer-events-auto w-full cursor-grab touch-none active:cursor-grabbing"
                                >
                                    <div
                                        className={ `rounded-lg border px-3.5 py-2.5 backdrop-blur-md transition-colors duration-200 ${cardTone(
                                            item.status
                                        )}` }
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <span
                                                className={ `mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${badgeTone(
                                                    item.status
                                                )}` }
                                            >
                                                { iconFor(item.status) }
                                            </span>

                                            <div className="min-w-0 flex-1 select-none">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate text-xs font-medium tracking-tight">
                                                        { item.title }
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#737373]">
                                                        { hasXml && <Code2 className="h-2.5 w-2.5" /> }
                                                        { item.status }
                                                    </span>
                                                </div>

                                                { item.message && (
                                                    <p
                                                        className={ `mt-0.5 text-xs leading-normal whitespace-pre-line ${isDark ? "text-[#a3a3a3]" : "text-[#525252]"
                                                            }` }
                                                    >
                                                        { item.message }
                                                    </p>
                                                ) }

                                                { hasXml && item.xml && (
                                                    <div
                                                        className={ `mt-2 overflow-hidden rounded-md border ${isDark
                                                                ? "border-white/15 bg-[#000000]"
                                                                : "border-black/15 bg-[#fafafa]"
                                                            }` }
                                                    >
                                                        <div
                                                            className={ `flex items-center justify-between border-b px-2 py-1 text-[10px] font-mono ${isDark
                                                                    ? "border-white/10 text-[#888888]"
                                                                    : "border-black/10 text-[#666666]"
                                                                }` }
                                                        >
                                                            <span>XML</span>
                                                            <button
                                                                type="button"
                                                                onClick={ (e) => {
                                                                    e.stopPropagation();
                                                                    handleCopyXml(item.id, item.xml!);
                                                                } }
                                                                className={ `inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors ${isDark
                                                                        ? "hover:bg-white/10 hover:text-white"
                                                                        : "hover:bg-black/10 hover:text-black"
                                                                    }` }
                                                            >
                                                                { copiedId === item.id ? (
                                                                    <>
                                                                        <Check className="h-2.5 w-2.5" />
                                                                        <span>Copied</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Copy className="h-2.5 w-2.5" />
                                                                        <span>Copy</span>
                                                                    </>
                                                                ) }
                                                            </button>
                                                        </div>
                                                        <pre
                                                            className={ `max-h-36 overflow-auto p-2 font-mono text-[11px] leading-snug select-text ${isDark ? "text-[#e5e5e5]" : "text-[#171717]"
                                                                }` }
                                                        >
                                                            <code>{ formatXmlPreview(item.xml) }</code>
                                                        </pre>
                                                    </div>
                                                ) }
                                            </div>

                                            { item.dismissible && (
                                                <button
                                                    type="button"
                                                    onClick={ (e) => {
                                                        e.stopPropagation();
                                                        dismiss(item.id);
                                                    } }
                                                    aria-label="Dismiss"
                                                    className={ `rounded p-0.5 transition-colors ${isDark
                                                            ? "text-[#737373] hover:bg-white/10 hover:text-white"
                                                            : "text-[#737373] hover:bg-black/5 hover:text-black"
                                                        }` }
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            ) }
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        }) }
                    </AnimatePresence>
                </div>
            </div>
        </NotificationContext.Provider>
    );
}

export function useNotify(): NotifyApi {
    const ctx = useContext(NotificationContext);
    if (!ctx) {
        throw new Error("useNotify must be used within a NotificationProvider");
    }
    return ctx;
}

export const useNotification = useNotify;
