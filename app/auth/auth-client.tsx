"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowRightLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  Search,
  Sun,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useTheme, type ThemeSetting } from "@/components/theme-provider";
import { useNotify } from "@/components/notification-provider";
import {
  getStoredAccounts,
  removeStoredAccount,
  upsertStoredAccount,
  type StoredAccount,
} from "@/lib/multi-account";

type AuthMode = "login" | "register";
type FieldErrors = Partial<
  Record<"firstName" | "lastName" | "userName" | "email" | "password", string>
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

function mapServerErrorToFields(
  rawMsg: string,
  statusCode: number
): { fieldErrors: FieldErrors; bannerError: string | null } {
  const msg = (rawMsg || "").toLowerCase();
  const fieldErrors: FieldErrors = {};

  if (
    msg.includes("username") ||
    msg.includes("user name") ||
    msg.includes("band") ||
    msg.includes("taken") ||
    msg.includes("exists") ||
    statusCode === 409
  ) {
    fieldErrors.userName = rawMsg || "This username is already taken.";
  }

  if (msg.includes("password") || msg.includes("parol")) {
    fieldErrors.password = rawMsg || "Invalid password.";
  }

  if (msg.includes("email")) {
    fieldErrors.email = rawMsg || "Invalid email address.";
  }

  if (msg.includes("first") || msg.includes("ism")) {
    fieldErrors.firstName = rawMsg || "First name is required.";
  }

  if (
    (msg.includes("noto‘g‘ri") ||
      msg.includes("noto'g'ri") ||
      msg.includes("invalid") ||
      msg.includes("credentials")) &&
    !fieldErrors.userName &&
    !fieldErrors.password
  ) {
    fieldErrors.userName = "Check username or password.";
    fieldErrors.password = "Check username or password.";
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  return {
    fieldErrors,
    bannerError: hasFieldErrors ? null : rawMsg || "Authentication failed.",
  };
}

function AuthFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const notify = useNotify();

  const [mounted, setMounted] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<StoredAccount[]>([]);
  const [accountQuery, setAccountQuery] = useState("");
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const initialMode: AuthMode =
    searchParams.get("mode") === "register" ? "register" : "login";
  const redirectTo = searchParams.get("redirect") || "/";
  const prefillUser = searchParams.get("username") || "";
  const prefillEmail = searchParams.get("email") || "";
  const prefillFirstName = searchParams.get("firstName") || "";
  const prefillLastName = searchParams.get("lastName") || "";

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [firstName, setFirstName] = useState(prefillFirstName);
  const [lastName, setLastName] = useState(prefillLastName);
  const [userName, setUserName] = useState(prefillUser);
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    setMounted(true);
    setSavedAccounts(getStoredAccounts());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const trimmedUser = userName.trim();
    const baseTitle =
      mode === "register"
        ? "Sign Up — English Studio"
        : "Sign In — English Studio";
    const nextTitle = trimmedUser ? `${baseTitle} (@${trimmedUser})` : baseTitle;
    document.title = nextTitle;

    const desc =
      mode === "register"
        ? `Create an English Studio account${
            trimmedUser ? ` for @${trimmedUser}` : ""
          } to save practice sessions and progress.`
        : `Sign in to your English Studio workspace${
            trimmedUser ? ` as @${trimmedUser}` : ""
          } for Reading, Listening, Speaking, and vocabulary practice.`;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", desc);
  }, [mode, userName, redirectTo]);

  useEffect(() => {
    const qMode = searchParams.get("mode");
    if (qMode === "register" || qMode === "login") {
      setMode(qMode);
    }
    if (searchParams.get("username")) setUserName(searchParams.get("username")!);
    if (searchParams.get("email")) setEmail(searchParams.get("email")!);
    if (searchParams.get("firstName"))
      setFirstName(searchParams.get("firstName")!);
    if (searchParams.get("lastName")) setLastName(searchParams.get("lastName")!);
  }, [searchParams]);

  const filteredAccounts = useMemo(() => {
    const q = accountQuery.trim().toLowerCase();
    if (!q) return savedAccounts;
    return savedAccounts.filter(
      (a) =>
        a.userName.toLowerCase().includes(q) ||
        a.firstName.toLowerCase().includes(q) ||
        (a.lastName || "").toLowerCase().includes(q)
    );
  }, [savedAccounts, accountQuery]);

  const clearFieldError = (key: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setBannerError(null);
    setFieldErrors({});
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("mode", nextMode);
      window.history.replaceState(null, "", `/auth?${params.toString()}`);
    }
  };

  const handleQuickSwitchAccount = async (acc: StoredAccount) => {
    setSwitchingId(acc.id);
    try {
      const res = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: acc.token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        
        setMode("login");
        setUserName(acc.userName);
        setPassword("");
        notify.error(
          data?.error || `Session for @${acc.userName} expired. Enter password.`,
          { title: "Account Switch" }
        );
        setSwitchingId(null);
        return;
      }

      upsertStoredAccount({
        id: data.user?.id || acc.id,
        firstName: data.user?.firstName || acc.firstName,
        lastName: data.user?.lastName ?? acc.lastName ?? null,
        userName: data.user?.userName || acc.userName,
        email: data.user?.email ?? acc.email ?? null,
        avatarUrl: data.user?.avatarUrl ?? acc.avatarUrl ?? null,
        token: data.token || acc.token,
      });

      notify.success(`Switched to @${acc.userName}. Redirecting...`, {
        title: "Account Switched",
      });

      setTimeout(() => {
        router.push(redirectTo);
        router.refresh();
      }, 300);
    } catch {
      notify.error("Network error while switching account.", {
        title: "Account Switch",
      });
      setSwitchingId(null);
    }
  };

  const handleLogOutSavedAccount = async (acc: StoredAccount) => {
    
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (meRes.ok) {
        const meData = await meRes.json().catch(() => ({}));
        if (meData?.user?.id === acc.id) {
          await fetch("/api/auth/logout", { method: "POST" });
        }
      }
    } catch {
      // ignore
    }
    notify.info(`Logged out of @${acc.userName}`, { title: "Session" });
  };

  const handleDeleteSavedAccount = async (acc: StoredAccount) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Permanently delete account @${acc.userName} from database?`)
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
      
      notify.success(`Account @${acc.userName} deleted permanently.`, {
        title: "Account Deleted",
      });
    } catch {
      notify.error("Network error while deleting account.", {
        title: "Delete Account",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleGeneratePassword = () => {
    const pwd = generateStrongPassword(14);
    setPassword(pwd);
    setShowPassword(true);
    clearFieldError("password");
    notify.info("Generated a strong password.", { title: "Password" });
  };

  const handleCopyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopiedPass(true);
      notify.info("Password copied to clipboard.", { duration: 2000 });
      setTimeout(() => setCopiedPass(false), 1400);
    } catch {
      notify.error("Could not copy password.");
    }
  };

  const handleResetForm = () => {
    setFirstName("");
    setLastName("");
    setUserName("");
    setEmail("");
    setPassword("");
    setBannerError(null);
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerError(null);
    setFieldErrors({});

    const nextFieldErrors: FieldErrors = {};
    if (mode === "register" && !firstName.trim()) {
      nextFieldErrors.firstName = "First name is required.";
    }
    if (!userName.trim()) {
      nextFieldErrors.userName = "Username is required.";
    } else if (/\s/.test(userName.trim())) {
      nextFieldErrors.userName = "Username cannot contain spaces.";
    }
    if (!password) {
      nextFieldErrors.password = "Password is required.";
    } else if (password.length < 4) {
      nextFieldErrors.password = "Password must be at least 4 characters.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      const firstErr = Object.values(nextFieldErrors)[0]!;
      notify.error(firstErr, { title: "Validation" });
      return;
    }

    setLoading(true);

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? { userName: userName.trim(), password, rememberDevice }
          : {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              userName: userName.trim(),
              email: email.trim(),
              password,
              rememberDevice,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const messageText = data?.error || "Authentication failed.";
        const mapped = mapServerErrorToFields(messageText, res.status);
        setFieldErrors(mapped.fieldErrors);
        setBannerError(mapped.bannerError);
        notify.error(messageText, {
          title: mode === "login" ? "Sign In Failed" : "Sign Up Failed",
        });
        setLoading(false);
        return;
      }

      const activeUser = data?.user?.userName || userName.trim();
      if (data?.user && data?.token) {
        const updatedList = upsertStoredAccount({
          id: data.user.id,
          firstName: data.user.firstName || activeUser,
          lastName: data.user.lastName || null,
          userName: data.user.userName,
          email: data.user.email || null,
          avatarUrl: data.user.avatarUrl || null,
          token: data.token,
        });
        setSavedAccounts(updatedList);
      }

      notify.success(
        mode === "login"
          ? `Signed in as ${activeUser}. Redirecting...`
          : `Account created for ${activeUser}. Redirecting...`,
        {
          title: mode === "login" ? "Authenticated" : "Account Created",
        }
      );

      setTimeout(() => {
        router.push(redirectTo);
        router.refresh();
      }, 450);
    } catch {
      const netMsg = "Network error while reaching the server.";
      setBannerError(netMsg);
      notify.error(netMsg, { title: "Connection Error" });
      setLoading(false);
    }
  };

  const isDark = mounted ? resolvedTheme === "dark" : false;
  const activeTheme: ThemeSetting = mounted ? theme : "system";

  const pageBg = isDark
    ? "bg-[#000000] text-[#ededed]"
    : "bg-[#ffffff] text-[#171717]";

  const cardBg = isDark
    ? "bg-[#0a0a0a] border-white/15"
    : "bg-[#ffffff] border-black/15";

  const subtleBox = isDark
    ? "bg-[#111111] border-white/10"
    : "bg-[#fafafa] border-black/10";

  const mutedText = isDark ? "text-[#888888]" : "text-[#666666]";
  const labelText = isDark ? "text-[#b3b3b3]" : "text-[#404040]";

  const inputClass = (hasError?: boolean) =>
    `h-8 w-full rounded-md border px-2.5 text-xs outline-none transition-colors duration-150 ${
      hasError
        ? isDark
          ? "border-white bg-[#141414] text-white placeholder-[#666666]"
          : "border-black bg-[#f5f5f5] text-black placeholder-[#888888]"
        : isDark
          ? "border-white/15 bg-[#000000] text-white placeholder-[#555555] focus:border-white"
          : "border-black/15 bg-[#ffffff] text-black placeholder-[#999999] focus:border-black"
    }`;

  return (
    <div
      className={`min-h-screen flex flex-col justify-between px-4 py-6 transition-colors duration-200 ${pageBg}`}
    >
      {/* Top Bar */}
      <header className="mx-auto flex w-full max-w-[440px] items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-xs font-medium tracking-tight opacity-85 transition-opacity hover:opacity-100"
        >
          Workspace
        </button>

        {mounted && (
          <div
            role="group"
            aria-label="Theme switcher"
            className={`inline-flex items-center rounded-full border p-0.5 transition-colors duration-200 ${
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
                  className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-150 active:scale-90 ${
                    selected
                      ? isDark
                        ? "bg-white text-black"
                        : "bg-black text-white"
                      : isDark
                        ? "text-[#888888] hover:text-white"
                        : "text-[#666666] hover:text-black"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Main Column: Form ALWAYS on TOP, Saved Accounts on BOTTOM */}
      <main className="mx-auto my-6 w-full max-w-[440px] space-y-4">
        <div
          className={`rounded-lg border p-6 transition-colors duration-200 ${cardBg}`}
        >
          <div className="mb-5">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold tracking-tight">
                {mode === "login" ? "Sign in" : "Create account"}
              </h1>
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                  isDark
                    ? "border-white/15 text-[#888888]"
                    : "border-black/15 text-[#666666]"
                }`}
              >
                {mode}
              </span>
            </div>
            <p className={`mt-1 text-xs ${mutedText}`}>
              {mode === "login"
                ? "Sign in to add or switch accounts in this browser."
                : "Create an account and keep it ready in your account switcher."}
            </p>
          </div>

          <div
            className={`mb-5 grid grid-cols-2 rounded-md border p-0.5 text-xs font-medium ${
              isDark
                ? "border-white/15 bg-[#000000]"
                : "border-black/15 bg-[#fafafa]"
            }`}
          >
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`rounded-[5px] py-1.5 transition-all duration-150 active:scale-[0.98] ${
                mode === "login"
                  ? isDark
                    ? "bg-white text-black font-semibold"
                    : "bg-black text-white font-semibold"
                  : mutedText
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`rounded-[5px] py-1.5 transition-all duration-150 active:scale-[0.98] ${
                mode === "register"
                  ? isDark
                    ? "bg-white text-black font-semibold"
                    : "bg-black text-white font-semibold"
                  : mutedText
              }`}
            >
              Sign Up
            </button>
          </div>

          {bannerError && (
            <div
              role="alert"
              className={`mb-4 rounded-md border px-3 py-2 text-xs ${
                isDark
                  ? "border-white/30 bg-white/[0.05] text-white"
                  : "border-black/30 bg-black/[0.04] text-black"
              }`}
            >
              {bannerError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
            {mode === "register" && (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="firstName"
                    className={`mb-1 block text-[11px] font-medium ${labelText}`}
                  >
                    First name *
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      clearFieldError("firstName");
                    }}
                    placeholder="First name"
                    className={inputClass(Boolean(fieldErrors.firstName))}
                  />
                  {fieldErrors.firstName && (
                    <p
                      className={`mt-1 text-[11px] font-medium ${
                        isDark ? "text-white" : "text-black"
                      }`}
                    >
                      {fieldErrors.firstName}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="lastName"
                    className={`mb-1 block text-[11px] font-medium ${labelText}`}
                  >
                    Last name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      clearFieldError("lastName");
                    }}
                    placeholder="Optional"
                    className={inputClass(Boolean(fieldErrors.lastName))}
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="userName"
                className={`mb-1 block text-[11px] font-medium ${labelText}`}
              >
                Username *
              </label>
              <input
                id="userName"
                type="text"
                autoComplete="username"
                value={userName}
                onChange={(e) => {
                  setUserName(e.target.value);
                  clearFieldError("userName");
                  setBannerError(null);
                }}
                placeholder="username"
                className={inputClass(Boolean(fieldErrors.userName))}
              />
              {fieldErrors.userName && (
                <p
                  className={`mt-1 text-[11px] font-medium ${
                    isDark ? "text-white" : "text-black"
                  }`}
                >
                  {fieldErrors.userName}
                </p>
              )}
            </div>

            {mode === "register" && (
              <div>
                <label
                  htmlFor="email"
                  className={`mb-1 block text-[11px] font-medium ${labelText}`}
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError("email");
                  }}
                  placeholder="name@example.com"
                  className={inputClass(Boolean(fieldErrors.email))}
                />
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className={`text-[11px] font-medium ${labelText}`}
                >
                  Password *
                </label>
                <div className="flex items-center gap-1.5">
                  {mode === "register" && (
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${mutedText} ${
                        isDark
                          ? "hover:bg-white/10 hover:text-white"
                          : "hover:bg-black/10 hover:text-black"
                      }`}
                    >
                      <KeyRound className="h-2.5 w-2.5" />
                      Generate
                    </button>
                  )}
                  {password && (
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${mutedText} ${
                        isDark
                          ? "hover:bg-white/10 hover:text-white"
                          : "hover:bg-black/10 hover:text-black"
                      }`}
                    >
                      {copiedPass ? (
                        <>
                          <Check className="h-2.5 w-2.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-2.5 w-2.5" />
                          Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="relative flex items-center">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError("password");
                    setBannerError(null);
                  }}
                  placeholder="••••••••••••"
                  className={`${inputClass(Boolean(fieldErrors.password))} pr-8`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className={`absolute right-2 rounded p-0.5 transition-colors ${mutedText} ${
                    isDark ? "hover:text-white" : "hover:text-black"
                  }`}
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

              {fieldErrors.password && (
                <p
                  className={`mt-1 text-[11px] font-medium ${
                    isDark ? "text-white" : "text-black"
                  }`}
                >
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-0.5 text-[11px]">
              <label className="flex cursor-pointer items-center gap-1.5 select-none">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className={`h-3.5 w-3.5 rounded ${
                    isDark ? "accent-white" : "accent-black"
                  }`}
                />
                <span className={mutedText}>Keep session active</span>
              </label>

              <button
                type="button"
                onClick={handleResetForm}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${mutedText} ${
                  isDark
                    ? "hover:bg-white/10 hover:text-white"
                    : "hover:bg-black/10 hover:text-black"
                }`}
              >
                <RotateCcw className="h-3 w-3" />
                Clear
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`group mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
                isDark
                  ? "bg-white text-black hover:bg-[#e5e5e5]"
                  : "bg-black text-white hover:bg-[#222222]"
              }`}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <span>{mode === "login" ? "Sign In" : "Create Account"}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <div
            className={`mt-5 flex items-center justify-between border-t pt-3 text-[11px] ${
              isDark
                ? "border-white/10 text-[#777777]"
                : "border-black/10 text-[#777777]"
            }`}
          >
            <span>Multi-Account JWT</span>
            <span className="truncate font-mono text-[10px] max-w-[190px]">
              {redirectTo}
            </span>
          </div>
        </div>

        {/* Saved Accounts Below Form (scrollable even with thousands of accounts) */}
        {mounted && savedAccounts.length > 0 && (
          <div className={`rounded-lg border p-4 ${cardBg}`}>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className={`font-mono text-[10px] uppercase ${mutedText}`}>
                Saved Accounts ({savedAccounts.length})
              </span>
              <button
                type="button"
                onClick={handleResetForm}
                className={`inline-flex items-center gap-1 text-[11px] ${mutedText} ${
                  isDark ? "hover:text-white" : "hover:text-black"
                }`}
              >
                <UserPlus className="h-3 w-3" />
                <span>Reset form</span>
              </button>
            </div>

            {savedAccounts.length > 3 && (
              <div className="relative mb-2.5">
                <Search
                  className={`pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 ${mutedText}`}
                />
                <input
                  type="text"
                  value={accountQuery}
                  onChange={(e) => setAccountQuery(e.target.value)}
                  placeholder="Search saved username or name..."
                  className={`${inputClass(false)} pl-8`}
                />
              </div>
            )}

            <div className="max-h-60 space-y-1.5 overflow-y-auto pr-0.5">
              {filteredAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 ${subtleBox}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {acc.avatarUrl ? (
                      <img
                        src={acc.avatarUrl}
                        alt={acc.userName}
                        className="h-7 w-7 shrink-0 rounded-full object-cover border border-white/15"
                      />
                    ) : (
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-semibold uppercase ${
                          isDark
                            ? "border-white/20 bg-black text-white"
                            : "border-black/20 bg-white text-black"
                        }`}
                      >
                        {(acc.firstName || acc.userName || "U").slice(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        {acc.firstName} {acc.lastName || ""}
                      </p>
                      <p className={`truncate font-mono text-[10px] ${mutedText}`}>
                        @{acc.userName}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={switchingId === acc.id}
                      onClick={() => handleQuickSwitchAccount(acc)}
                      className={`inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] font-medium transition-colors ${
                        isDark
                          ? "border-white/20 bg-white text-black hover:bg-[#e5e5e5]"
                          : "border-black/20 bg-black text-white hover:bg-[#222222]"
                      }`}
                    >
                      {switchingId === acc.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <ArrowRightLeft className="h-2.5 w-2.5" />
                          <span>Switch</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLogOutSavedAccount(acc)}
                      title="Log out this account"
                      className={`flex h-6 w-6 items-center justify-center rounded border transition-colors ${
                        isDark
                          ? "border-white/15 bg-[#0a0a0a] hover:border-white/35"
                          : "border-black/15 bg-white hover:border-black/35"
                      }`}
                    >
                      <LogOut className="h-3 w-3" />
                    </button>

                    <button
                      type="button"
                      disabled={deletingId === acc.id}
                      onClick={() => handleDeleteSavedAccount(acc)}
                      title="Delete account permanently"
                      className={`flex h-6 w-6 items-center justify-center rounded border transition-colors ${
                        isDark
                          ? "border-white/15 bg-[#0a0a0a] hover:border-white/35"
                          : "border-black/15 bg-white hover:border-black/35"
                      }`}
                    >
                      {deletingId === acc.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Bar */}
      <footer
        className={`mx-auto flex w-full max-w-[440px] items-center justify-between text-[11px] ${mutedText}`}
      >
        <span>{mode === "login" ? "New here?" : "Already registered?"}</span>
        <button
          type="button"
          onClick={() => switchMode(mode === "login" ? "register" : "login")}
          className={`font-medium underline-offset-2 hover:underline ${
            isDark ? "text-[#cccccc]" : "text-[#333333]"
          }`}
        >
          {mode === "login" ? "Create account" : "Sign in"}
        </button>
      </footer>
    </div>
  );
}

export default function AuthClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      }
    >
      <AuthFormContent />
    </Suspense>
  );
}
