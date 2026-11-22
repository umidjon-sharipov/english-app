import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { NotificationProvider } from "@/components/notification-provider";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: {
        default: "English Studio — AI-Driven English Learning Ecosystem",
        template: "%s | English Studio",
    },
    description:
        "Ingliz tilini mukammal o'rganish uchun to'liq ekotizim: CEFR A1–C2 AI testlar, Reading, Speaking, Listening, Lug'at va interaktiv o'yinlar.",
    applicationName: "English Studio",
    keywords: [
        "English Studio",
        "IELTS",
        "CEFR",
        "AI English Learning",
        "Grammar Tests",
        "Reading Studio",
        "Speaking Studio",
        "Listening Studio",
    ],
    authors: [{ name: "Umidjon Sharipov", url: "https://github.com/umidjon-sharipov" }],
    creator: "Umidjon Sharipov",
    openGraph: {
        type: "website",
        locale: "uz_UZ",
        siteName: "English Studio",
        title: "English Studio — AI-Driven English Learning Ecosystem",
        description:
            "Grammatika, Reading, Speaking, Listening, Lug'at va Gamifikatsiyalashgan interaktiv o'yinlar — barchasi sun'iy intellekt tahlili bilan.",
    },
    twitter: {
        card: "summary_large_image",
        title: "English Studio — AI-Driven English Learning Ecosystem",
        description:
            "CEFR A1–C2 darajadagi AI testlar, Reading, Speaking, Listening va interaktiv o'yinlar ekotizimi.",
    },
    robots: {
        index: true,
        follow: true,
    },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html
            lang="uz"
            suppressHydrationWarning
            className={ `${geistSans.variable} ${geistMono.variable} h-full antialiased` }
        >
            <body className="min-h-full flex flex-col">
                <ThemeProvider defaultTheme="system">
                    <NotificationProvider>
                        { children }
                    </NotificationProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}