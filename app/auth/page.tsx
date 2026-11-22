import type { Metadata } from "next";
import AuthClient from "./auth-client";

export const metadata: Metadata = {
  title: "Authentication — English Studio",
  description:
    "Sign in or create an account in English Studio to save Reading, Listening, Speaking, and vocabulary practice progress.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthPage() {
  return <AuthClient />;
}
