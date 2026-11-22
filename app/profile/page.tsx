"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  Camera,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Save,
  Search,
  Shield,
  Sun,
  Trash2,
  User,
} from "lucide-react";
import { useTheme, type ThemeSetting } from "@/components/theme-provider";
import { useNotify } from "@/components/notification-provider";
import {
  clearAllStoredAccounts,
  getStoredAccounts,
  removeStoredAccount,
  updateStoredAccountMeta,
  upsertStoredAccount,
  type StoredAccount,
} from "@/lib/multi-account";

interface SessionUser {
  id: string;
  firstName: string;
  lastName?: string | null;
  userName: string;
  email?: string | null;
  avatarUrl?: string | null;
}

type ProfileFieldErrors = Partial<
  Record<"firstName" | "lastName" | "userName" | "email", string>
>;

function generateStrongPassword(length = 14) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let result = "";
  const arr = new Uint32Array(length);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < length; i++) {
      result += chars[arr[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return result;
}

export default function ProfilePage() {
  const router = useRouter();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const notify = useNotify();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Avatar state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Profile form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [copiedNewPass, setCopiedNewPass] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setAccounts(getStoredAccounts());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (user) {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
      document.title = `${fullName} (@${user.userName}) — English Studio`;
    } else if (!loading) {
      document.title = "Account & Profile — English Studio";
    }
  }, [user, loading]);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) {
        setUser(null);
        setLoading(false);
        return;
      }
      const data = await res.json();
      const me: SessionUser | null = data?.user || null;
      setUser(me);
      if (me) {
        setFirstName(me.firstName || "");
        setLastName(me.lastName || "");
        setUserName(me.userName || "");
        setEmail(me.email || "");

        if (data?.token) {
          const updated = upsertStoredAccount({
            id: me.id,
            firstName: me.firstName,
            lastName: me.lastName || null,
            userName: me.userName,
            email: me.email || null,
            avatarUrl: me.avatarUrl || null,
            token: data.token,
          });
          setAccounts(updated);
        } else {
          setAccounts(getStoredAccounts());
        }
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const visibleAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.userName.toLowerCase().includes(q) ||
        a.firstName.toLowerCase().includes(q) ||
        (a.lastName || "").toLowerCase().includes(q)
    );
  }, [accounts, accountSearch]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);

      const res = await fetch("/api/auth/avatar", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data?.error || "Could not upload avatar.", {
          title: "Avatar",
        });
        return;
      }

      const nextUrl: string | null = data?.avatarUrl || null;
      setUser((prev) => (prev ? { ...prev, avatarUrl: nextUrl } : prev));
      const updated = updateStoredAccountMeta(user.id, { avatarUrl: nextUrl });
      setAccounts(updated);
      notify.success("Profile photo updated.", { title: "Avatar" });
      router.refresh();
    } catch {
      notify.error("Network error while uploading avatar.", { title: "Avatar" });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const res = await fetch("/api/auth/avatar", { method: "DELETE" });
      if (!res.ok) {
        notify.error("Could not remove avatar.", { title: "Avatar" });
        return;
      }
      setUser((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
      const updated = updateStoredAccountMeta(user.id, { avatarUrl: null });
      setAccounts(updated);
      notify.info("Profile photo removed.", { title: "Avatar" });
      router.refresh();
    } catch {
      notify.error("Network error while removing avatar.", { title: "Avatar" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const clearFieldErr = (key: keyof ProfileFieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileError(null);
    setFieldErrors({});

    const nextErrs: ProfileFieldErrors = {};
    if (!firstName.trim()) {
      nextErrs.firstName = "First name is required.";
    }
    if (!userName.trim() || userName.trim().length < 3) {
      nextErrs.userName = "Username must be at least 3 characters.";
    } else if (/\s/.test(userName.trim())) {
      nextErrs.userName = "Username cannot contain spaces.";
    }

    if (Object.keys(nextErrs).length > 0) {
      setFieldErrors(nextErrs);
      notify.error(Object.values(nextErrs)[0]!, { title: "Profile" });
      return;
    }

    setSavingProfile(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          userName: userName.trim(),
          email: email.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || "Failed to update profile.";
        if (
          data?.field &&
          ["firstName", "lastName", "userName", "email"].includes(data.field)
        ) {
          setFieldErrors({ [data.field]: msg });
        } else {
          setProfileError(msg);
        }
        notify.error(msg, { title: "Profile" });
        setSavingProfile(false);
        return;
      }

      const updatedUser: SessionUser = {
        ...data.user,
        avatarUrl: data.user?.avatarUrl ?? user.avatarUrl ?? null,
      };
      setUser(updatedUser);
      const nextAccounts = updateStoredAccountMeta(updatedUser.id, {
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName || null,
        userName: updatedUser.userName,
        email: updatedUser.email || null,
        avatarUrl: updatedUser.avatarUrl ?? null,
        ...(data.token ? { token: data.token } : {}),
      });
      setAccounts(nextAccounts);
      notify.success("Profile details updated.", { title: "Profile" });
      router.refresh();
    } catch {
      setProfileError("Network error while updating profile.");
      notify.error("Network error while updating profile.", { title: "Profile" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleGenerateNewPassword = () => {
    const pwd = generateStrongPassword(14);
    setNewPassword(pwd);
    setConfirmPassword(pwd);
    setShowPasswords(true);
    setPasswordError(null);
    notify.info("Generated a strong new password.", { title: "Security" });
  };

  const handleCopyNewPassword = async () => {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopiedNewPass(true);
      notify.info("New password copied.", { duration: 1800 });
      setTimeout(() => setCopiedNewPass(false), 1400);
    } catch {
      notify.error("Could not copy password.");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError("New password must be at least 4 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || "Could not change password.";
        setPasswordError(msg);
        notify.error(msg, { title: "Security" });
        setSavingPassword(false);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify.success("Password updated successfully.", { title: "Security" });
    } catch {
      setPasswordError("Network error while updating password.");
      notify.error("Network error while updating password.", {
        title: "Security",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSwitchAccount = async (acc: StoredAccount) => {
    if (user?.id === acc.id) return;
    setSwitchingId(acc.id);
    try {
      const res = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: acc.token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data?.error || "Session expired. Sign in again.", {
          title: "Switch Account",
        });
        
        setSwitchingId(null);
        router.push(
          `/auth?mode=login&username=${encodeURIComponent(
            acc.userName
          )}&redirect=/profile`
        );
        return;
      }

      notify.success(`Switched to @${acc.userName}`, {
        title: "Account Switched",
      });
      await fetchProfile();
      router.refresh();
    } catch {
      notify.error("Failed to switch account.", { title: "Switch Account" });
    } finally {
      setSwitchingId(null);
    }
  };

  // Log out ONLY this specific account
  const handleLogOutSpecificAccount = async (acc: StoredAccount) => {
    

    if (user?.id === acc.id) {
      if (remaining.length > 0) {
        notify.info(`Logged out of @${acc.userName}. Switching...`, {
          title: "Session",
        });
        await handleSwitchAccount(remaining[0]);
      } else {
        await fetch("/api/auth/logout", { method: "POST" });
        setUser(null);
        notify.info(`Logged out of @${acc.userName}`, { title: "Session" });
      }
    } else {
      notify.info(`Logged out of @${acc.userName}`, { title: "Session" });
    }
  };

  // Delete this specific account permanently from DB & local storage
  const handleDeleteSpecificAccount = async (acc: StoredAccount) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Delete account @${acc.userName} permanently? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(acc.id);
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: acc.id, token: acc.token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data?.error || "Could not delete account.", {
          title: "Delete Account",
        });
        setDeletingId(null);
        return;
      }

      
      notify.success(`Deleted account @${acc.userName}`, {
        title: "Account Deleted",
      });

      if (user?.id === acc.id) {
        if (remaining.length > 0) {
          await handleSwitchAccount(remaining[0]);
        } else {
          setUser(null);
        }
      }
    } catch {
      notify.error("Network error while deleting account.", {
        title: "Delete Account",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSignOutAll = async () => {
    clearAllStoredAccounts();
    setAccounts([]);
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    notify.success("Signed out of all accounts.", { title: "Session" });
    router.push("/auth?mode=login&redirect=/");
  };

  const isDark = mounted ? resolvedTheme === "dark" : false;
  const activeTheme: ThemeSetting = mounted ? theme : "system";

  const pageBg = isDark
    ? "bg-[#000000] text-[#ededed]"
    : "bg-[#ffffff] text-[#171717]";
  const cardBg = isDark
    ? "bg-[#0a0a0a] border-white/15"
    : "bg-[#ffffff] border-black/15";
  const subtleBg = isDark
    ? "bg-[#111111] border-white/10"
    : "bg-[#fafafa] border-black/10";
  const mutedText = isDark ? "text-[#888888]" : "text-[#666666]";
  const labelText = isDark ? "text-[#b3b3b3]" : "text-[#404040]";
  const primaryBtn = isDark
    ? "bg-white text-black hover:bg-[#e5e5e5]"
    : "bg-black text-white hover:bg-[#222222]";
  const secondaryBtn = isDark
    ? "border-white/15 bg-[#0a0a0a] text-[#ededed] hover:border-white/35 hover:bg-white/[0.04]"
    : "border-black/15 bg-[#ffffff] text-[#171717] hover:border-black/35 hover:bg-black/[0.03]";

  const inputCls = (hasError?: boolean) =>
    `h-8 w-full rounded-md border px-2.5 text-xs outline-none transition-colors ${
      hasError
        ? isDark
          ? "border-white bg-[#141414] text-white placeholder-[#666666]"
          : "border-black bg-[#f5f5f5] text-black placeholder-[#888888]"
        : isDark
          ? "border-white/15 bg-[#000000] text-white placeholder-[#555555] focus:border-white"
          : "border-black/15 bg-[#ffffff] text-black placeholder-[#999999] focus:border-black"
    }`;

  const displayFullName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ")
    : "Account & Profile";
  const remaining: StoredAccount[] = [];


  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${pageBg}`}
    >
      {/* Top Bar */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md ${
          isDark
            ? "border-white/10 bg-[#000000]/85"
            : "border-black/10 bg-[#ffffff]/85"
        }`}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => router.push("/")}
              className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${secondaryBtn}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Workspace</span>
            </button>
            <span className="truncate text-sm font-semibold tracking-tight">
              {displayFullName}
            </span>
          </div>

          {mounted && (
            <div
              role="group"
              aria-label="Theme"
              className={`inline-flex shrink-0 items-center rounded-full border p-0.5 ${
                isDark
                  ? "border-white/15 bg-[#0a0a0a]"
                  : "border-black/15 bg-[#fafafa]"
              }`}
            >
              {(
                [
                  { id: "light", label: "Light", Icon: Sun },
                  { id: "system", label: "System", Icon: Monitor },
                  { id: "dark", label: "Dark", Icon: Moon },
                ] as const
              ).map(({ id, label, Icon }) => {
                const selected = activeTheme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    title={label}
                    aria-label={label}
                    className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                      selected
                        ? isDark
                          ? "bg-white text-black"
                          : "bg-black text-white"
                        : `${mutedText} ${
                            isDark ? "hover:text-white" : "hover:text-black"
                          }`
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !user ? (
          <div
            className={`mx-auto max-w-md rounded-lg border p-6 text-center ${cardBg}`}
          >
            <h1 className="text-base font-semibold">No active session</h1>
            <p className={`mt-1 text-xs ${mutedText}`}>
              Sign in or choose one of your saved accounts below.
            </p>

            {accounts.length > 0 && (
              <div className="mt-4 space-y-2 text-left">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${subtleBg}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        {acc.firstName} {acc.lastName || ""}
                      </p>
                      <p className={`truncate font-mono text-[11px] ${mutedText}`}>
                        @{acc.userName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={switchingId === acc.id}
                        onClick={() => handleSwitchAccount(acc)}
                        className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium ${primaryBtn}`}
                      >
                        {switchingId === acc.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <span>Switch</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLogOutSpecificAccount(acc)}
                        title="Log out"
                        className={`flex h-7 w-7 items-center justify-center rounded-md border ${secondaryBtn}`}
                      >
                        <LogOut className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === acc.id}
                        onClick={() => handleDeleteSpecificAccount(acc)}
                        title="Delete account"
                        className={`flex h-7 w-7 items-center justify-center rounded-md border ${secondaryBtn}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => router.push("/auth?mode=login&redirect=/profile")}
              className={`mt-4 inline-flex h-8 items-center justify-center rounded-md px-4 text-xs font-medium ${primaryBtn}`}
            >
              Sign In / Add Account
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left Column: Avatar Card + Multi-Account Manager */}
            <section className="space-y-5 lg:col-span-5">
              {/* Avatar Upload Card */}
              <div className={`rounded-lg border p-5 ${cardBg}`}>
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={displayFullName}
                        className="h-16 w-16 rounded-full object-cover border border-white/15"
                      />
                    ) : (
                      <div
                        className={`flex h-16 w-16 items-center justify-center rounded-full border font-mono text-base font-semibold uppercase ${
                          isDark
                            ? "border-white/20 bg-[#111111] text-white"
                            : "border-black/20 bg-[#fafafa] text-black"
                        }`}
                      >
                        {(user.firstName || user.userName || "U").slice(0, 2)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold tracking-tight">
                      {displayFullName}
                    </h2>
                    <p className={`truncate font-mono text-xs ${mutedText}`}>
                      @{user.userName}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={uploadingAvatar}
                        onClick={() => fileInputRef.current?.click()}
                        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${primaryBtn}`}
                      >
                        {uploadingAvatar ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Camera className="h-3.5 w-3.5" />
                        )}
                        <span>{user.avatarUrl ? "Change Photo" : "Upload Photo"}</span>
                      </button>

                      {user.avatarUrl && (
                        <button
                          type="button"
                          disabled={uploadingAvatar}
                          onClick={handleRemoveAvatar}
                          className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors ${secondaryBtn}`}
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Multi-Account Switcher */}
              <div className={`rounded-lg border p-5 ${cardBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">
                      Accounts ({accounts.length})
                    </h2>
                    <p className={`mt-0.5 text-xs ${mutedText}`}>
                      Switch, log out, or delete individual accounts.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      router.push("/auth?mode=login&redirect=/profile")
                    }
                    className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors ${primaryBtn}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {accounts.length > 3 && (
                  <div className="relative mt-3">
                    <Search
                      className={`pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 ${mutedText}`}
                    />
                    <input
                      type="text"
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      placeholder="Filter accounts..."
                      className={`${inputCls(false)} pl-8`}
                    />
                  </div>
                )}

                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-0.5">
                  {visibleAccounts.map((acc) => {
                    const isCurrent = acc.id === user.id;
                    return (
                      <div
                        key={acc.id}
                        className={`flex items-center justify-between gap-2 rounded-md border p-2.5 transition-colors ${
                          isCurrent
                            ? isDark
                              ? "border-white bg-white/[0.06]"
                              : "border-black bg-black/[0.04]"
                            : subtleBg
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          {acc.avatarUrl ? (
                            <img
                              src={acc.avatarUrl}
                              alt={acc.userName}
                              className="h-8 w-8 shrink-0 rounded-full object-cover border border-white/15"
                            />
                          ) : (
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold uppercase ${
                                isCurrent
                                  ? isDark
                                    ? "border-white bg-white text-black"
                                    : "border-black bg-black text-white"
                                  : isDark
                                    ? "border-white/20 bg-black text-white"
                                    : "border-black/20 bg-white text-black"
                              }`}
                            >
                              {(acc.firstName || acc.userName || "U").slice(
                                0,
                                2
                              )}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-xs font-medium">
                                {acc.firstName} {acc.lastName || ""}
                              </p>
                              {isCurrent && (
                                <span
                                  className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                                    isDark
                                      ? "bg-white text-black font-semibold"
                                      : "bg-black text-white font-semibold"
                                  }`}
                                >
                                  Active
                                </span>
                              )}
                            </div>
                            <p
                              className={`truncate font-mono text-[11px] ${mutedText}`}
                            >
                              @{acc.userName}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          {!isCurrent && (
                            <button
                              type="button"
                              disabled={switchingId === acc.id}
                              onClick={() => handleSwitchAccount(acc)}
                              title="Switch to this account"
                              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors ${secondaryBtn}`}
                            >
                              {switchingId === acc.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <ArrowRightLeft className="h-3 w-3" />
                                  <span>Switch</span>
                                </>
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleLogOutSpecificAccount(acc)}
                            title={`Log out @${acc.userName}`}
                            aria-label={`Log out @${acc.userName}`}
                            className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${secondaryBtn}`}
                          >
                            <LogOut className="h-3 w-3" />
                          </button>

                          <button
                            type="button"
                            disabled={deletingId === acc.id}
                            onClick={() => handleDeleteSpecificAccount(acc)}
                            title={`Delete @${acc.userName}`}
                            aria-label={`Delete @${acc.userName}`}
                            className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${secondaryBtn}`}
                          >
                            {deletingId === acc.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 border-inherit">
                  <button
                    type="button"
                    onClick={() =>
                      router.push("/auth?mode=register&redirect=/profile")
                    }
                    className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium ${secondaryBtn}`}
                  >
                    <User className="h-3 w-3" />
                    <span>New Account</span>
                  </button>

                  {accounts.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSignOutAll}
                      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium ${secondaryBtn}`}
                    >
                      <LogOut className="h-3 w-3" />
                      <span>Log Out All</span>
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Right Column: Edit Profile & Security */}
            <section className="space-y-6 lg:col-span-7">
              <form
                onSubmit={handleSaveProfile}
                noValidate
                className={`rounded-lg border p-5 ${cardBg}`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">
                      Profile Information
                    </h2>
                    <p className={`mt-0.5 text-xs ${mutedText}`}>
                      Update your name, username, or shared email.
                    </p>
                  </div>
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                      isDark
                        ? "border-white/15 text-[#888888]"
                        : "border-black/15 text-[#666666]"
                    }`}
                  >
                    @{user.userName}
                  </span>
                </div>

                {profileError && (
                  <div
                    className={`mb-3 rounded-md border px-3 py-2 text-xs ${
                      isDark
                        ? "border-white/30 bg-white/[0.05] text-white"
                        : "border-black/30 bg-black/[0.04] text-black"
                    }`}
                  >
                    {profileError}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="pFirstName"
                      className={`mb-1 block text-[11px] font-medium ${labelText}`}
                    >
                      First name *
                    </label>
                    <input
                      id="pFirstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        clearFieldErr("firstName");
                      }}
                      className={inputCls(Boolean(fieldErrors.firstName))}
                    />
                    {fieldErrors.firstName && (
                      <p className="mt-1 text-[11px] font-medium">
                        {fieldErrors.firstName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="pLastName"
                      className={`mb-1 block text-[11px] font-medium ${labelText}`}
                    >
                      Last name
                    </label>
                    <input
                      id="pLastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        clearFieldErr("lastName");
                      }}
                      placeholder="Optional"
                      className={inputCls(Boolean(fieldErrors.lastName))}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="pUserName"
                      className={`mb-1 block text-[11px] font-medium ${labelText}`}
                    >
                      Username *
                    </label>
                    <input
                      id="pUserName"
                      type="text"
                      value={userName}
                      onChange={(e) => {
                        setUserName(e.target.value);
                        clearFieldErr("userName");
                      }}
                      className={inputCls(Boolean(fieldErrors.userName))}
                    />
                    {fieldErrors.userName && (
                      <p className="mt-1 text-[11px] font-medium">
                        {fieldErrors.userName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="pEmail"
                      className={`mb-1 block text-[11px] font-medium ${labelText}`}
                    >
                      Email
                    </label>
                    <input
                      id="pEmail"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldErr("email");
                      }}
                      placeholder="name@example.com"
                      className={inputCls(Boolean(fieldErrors.email))}
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3.5 text-xs font-medium transition-colors disabled:opacity-50 ${primaryBtn}`}
                  >
                    {savingProfile ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>

              <form
                onSubmit={handleChangePassword}
                noValidate
                className={`rounded-lg border p-5 ${cardBg}`}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                      <Shield className="h-3.5 w-3.5" />
                      <span>Change Password</span>
                    </h2>
                    <p className={`mt-0.5 text-xs ${mutedText}`}>
                      Verify your current password before setting a new one.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleGenerateNewPassword}
                      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] ${secondaryBtn}`}
                    >
                      <KeyRound className="h-3 w-3" />
                      <span>Generate</span>
                    </button>

                    {newPassword && (
                      <button
                        type="button"
                        onClick={handleCopyNewPassword}
                        className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] ${secondaryBtn}`}
                      >
                        {copiedNewPass ? (
                          <>
                            <Check className="h-3 w-3" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowPasswords((v) => !v)}
                      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] ${secondaryBtn}`}
                    >
                      {showPasswords ? (
                        <>
                          <EyeOff className="h-3 w-3" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" />
                          <span>Show</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {passwordError && (
                  <div
                    className={`mb-3 rounded-md border px-3 py-2 text-xs ${
                      isDark
                        ? "border-white/30 bg-white/[0.05] text-white"
                        : "border-black/30 bg-black/[0.04] text-black"
                    }`}
                  >
                    {passwordError}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="curPass"
                      className={`mb-1 block text-[11px] font-medium ${labelText}`}
                    >
                      Current password *
                    </label>
                    <input
                      id="curPass"
                      type={showPasswords ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className={inputCls(false)}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="newPass"
                      className={`mb-1 block text-[11px] font-medium ${labelText}`}
                    >
                      New password *
                    </label>
                    <input
                      id="newPass"
                      type={showPasswords ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className={inputCls(false)}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="confPass"
                      className={`mb-1 block text-[11px] font-medium ${labelText}`}
                    >
                      Confirm new *
                    </label>
                    <input
                      id="confPass"
                      type={showPasswords ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className={inputCls(false)}
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3.5 text-xs font-medium transition-colors disabled:opacity-50 ${primaryBtn}`}
                  >
                    {savingPassword ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    <span>Update Password</span>
                  </button>
                </div>
              </form>

              {/* Danger / Account Actions Card */}
              <div className={`rounded-lg border p-5 ${cardBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">
                      Current Account Actions
                    </h2>
                    <p className={`mt-0.5 text-xs ${mutedText}`}>
                      Log out of @{user.userName} or delete this account
                      permanently.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleLogOutSpecificAccount({
                          id: user.id,
                          firstName: user.firstName,
                          lastName: user.lastName,
                          userName: user.userName,
                          email: user.email,
                          avatarUrl: user.avatarUrl,
                          token: "",
                          addedAt: Date.now(),
                        })
                      }
                      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${secondaryBtn}`}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Log Out</span>
                    </button>

                    <button
                      type="button"
                      disabled={deletingId === user.id}
                      onClick={() =>
                        handleDeleteSpecificAccount({
                          id: user.id,
                          firstName: user.firstName,
                          lastName: user.lastName,
                          userName: user.userName,
                          email: user.email,
                          avatarUrl: user.avatarUrl,
                          token: "",
                          addedAt: Date.now(),
                        })
                      }
                      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-50 ${primaryBtn}`}
                    >
                      {deletingId === user.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span>Delete Account</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
