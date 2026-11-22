export interface StoredAccount {
  id: string;
  firstName: string;
  lastName?: string | null;
  userName: string;
  email?: string | null;
  avatarUrl?: string | null;
  token: string;
  addedAt: number;
}

const ACCOUNTS_KEY = "english_studio_accounts_v1";

export function getStoredAccounts(): StoredAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function upsertStoredAccount(
  account: Omit<StoredAccount, "addedAt">
): StoredAccount[] {
  if (typeof window === "undefined") return [];
  const current = getStoredAccounts();
  const filtered = current.filter(
    (item) => item.id !== account.id && item.userName !== account.userName
  );
  const next: StoredAccount[] = [
    { ...account, addedAt: Date.now() },
    ...filtered,
  ];
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function updateStoredAccountMeta(
  userId: string,
  patch: Partial<
    Pick<
      StoredAccount,
      "firstName" | "lastName" | "userName" | "email" | "avatarUrl" | "token"
    >
  >
): StoredAccount[] {
  if (typeof window === "undefined") return [];
  const current = getStoredAccounts();
  const next = current.map((item) =>
    item.id === userId ? { ...item, ...patch } : item
  );
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function removeStoredAccount(userId: string): StoredAccount[] {
  if (typeof window === "undefined") return [];
  const next = getStoredAccounts().filter((item) => item.id !== userId);
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearAllStoredAccounts(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACCOUNTS_KEY);
  } catch {
    // ignore
  }
}
