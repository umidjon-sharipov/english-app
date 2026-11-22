import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account & Profile — English Studio",
  description:
    "Manage your English Studio profile, password, and saved accounts.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
