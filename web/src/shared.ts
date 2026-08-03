export type Shop = {
  id: number;
  name: string;
  logoPath?: string;
  shortDescription?: string;
  instagramUsername?: string;
  whatsappNumber?: string;
  supportChannel?: "instagram" | "whatsapp";
  shareMessageTemplate?: string;
};

export type Me = {
  admin: { id: number; name: string; login: string };
  shops: Shop[];
};

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type Product = {
  id: number;
  name: string;
  imagePath: string;
  defaultPrice: number;
  shortDescription?: string;
  active: boolean;
};

export type CustomerDraft = {
  fullName: string;
  mobile: string;
  address: string;
  postalCode: string;
  note: string;
};

export type CreatedOrder = {
  id: number;
  orderCode: string;
  customerUrl: string;
  status: string;
  estimatedDeliveryDate: string;
  createdAt: string;
};

export type PublicOrder = {
  orderCode: string;
  shop: { name: string; logoPath?: string };
  items: { name: string; imagePath: string; quantity: number }[];
  amount: number;
  status: string;
  estimatedDeliveryDate: string;
  paymentCardNumber: string;
  paymentInstructions: string;
  customerSubmitted: boolean;
  customerSubmissionAllowed: boolean;
  receiptUploaded: boolean;
  shipmentTrackingCode?: string;
  updatedAt: string;
  history: { status: string; createdAt: string }[];
  customerSummary?: { fullName: string; mobile: string; addressPreview: string; postalCodeSuffix: string };
  support?: { channel: "instagram" | "whatsapp"; url: string; message: string };
};

export type OrderSummary = {
  id: number;
  orderCode: string;
  productSummary: string;
  customerFullName?: string;
  customerSubmitted: boolean;
  receiptUploaded: boolean;
  hasTrackingCode: boolean;
  amount: number;
  status: string;
  estimatedDeliveryDate: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminOrder = {
  id: number;
  orderCode: string;
  shop: { id: number; name: string };
  items: { name: string; imagePath: string; quantity: number; unitPrice: number }[];
  amount: number;
  status: string;
  estimatedDeliveryDate: string;
  instagramUsername: string;
  internalNote: string;
  customerFullName: string;
  customerMobile: string;
  customerAddress: string;
  customerPostalCode: string;
  customerNote: string;
  customerSubmitted: boolean;
  receiptUploaded: boolean;
  receiptUrl?: string;
  shipmentTrackingCode: string;
  customerUrl: string;
  createdAt: string;
  updatedAt: string;
  customerSubmittedAt?: string;
  history: { previousStatus?: string; newStatus: string; changedByAdminName?: string; createdAt: string }[];
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, options);
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
    throw new Error("ارتباط با ردیف برقرار نشد. اینترنت را بررسی و دوباره تلاش کنید.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.status === 401 && path !== "/api/session") window.dispatchEvent(new Event("radif:unauthorized"));
    throw new ApiError(response.status, body?.error ?? "ارتباط با ردیف برقرار نشد. دوباره تلاش کنید.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const numberFormat = new Intl.NumberFormat("fa-IR");
const dateFormat = new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeStyle: "short" });
const relativeTimeFormat = new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" });
const tehranDateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
const latinDigits = "0123456789";
export const persianDigits = "۰۱۲۳۴۵۶۷۸۹";

export const defaultShareMessageTemplate = "سلام، سفارش شما در فروشگاه {shopName} با کد {orderCode} ثبت شد.\n\nلطفاً برای تکمیل اطلاعات سفارش و ارسال رسید پرداخت، از لینک زیر استفاده کنید:\n{customerUrl}";
export const emptyCustomerDraft: CustomerDraft = { fullName: "", mobile: "", address: "", postalCode: "", note: "" };
export const publicStatusLabels: Record<string, string> = {
  waiting_info: "در انتظار اطلاعات شما",
  waiting_payment: "در انتظار تأیید پرداخت",
  paid: "پرداخت شده",
  preparing: "در حال آماده‌سازی",
  shipped: "ارسال شده",
  cancelled: "لغو شده",
};
export const adminStatusLabels: Record<string, string> = { ...publicStatusLabels, waiting_info: "در انتظار اطلاعات مشتری" };
export const statusStyles: Record<string, { rail: string; chip: string }> = {
  waiting_info: { rail: "border-saffron", chip: "bg-saffron/15 text-ink" },
  waiting_payment: { rail: "border-saffron", chip: "bg-saffron/15 text-ink" },
  paid: { rail: "border-teal", chip: "bg-teal/12 text-teal" },
  preparing: { rail: "border-ink", chip: "bg-ledger text-ink" },
  shipped: { rail: "border-teal", chip: "bg-teal text-white" },
  cancelled: { rail: "border-error", chip: "bg-error/10 text-error" },
};

export function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)])
    .replace(/[٠-٩]/g, (digit) => latinDigits["٠١٢٣٤٥٦٧٨٩".indexOf(digit)])
    .replace(/\D/g, "");
}

export function normalizeIranianMobile(value: string) {
  const digits = normalizeDigits(value);
  if (digits.startsWith("0098")) return `0${digits.slice(4)}`;
  if (digits.startsWith("98")) return `0${digits.slice(2)}`;
  return digits;
}

export function readCustomerDraft(token: string): CustomerDraft {
  try {
    const value = JSON.parse(localStorage.getItem(`radif_customer_draft_${token}`) ?? "null") as Partial<CustomerDraft> | null;
    return value && Object.values(value).every((field) => typeof field === "string")
      ? { ...emptyCustomerDraft, ...value }
      : emptyCustomerDraft;
  } catch {
    return emptyCustomerDraft;
  }
}

export function persianNumber(value: number | string) {
  const number = Number(value);
  return Number.isFinite(number) ? numberFormat.format(number) : "";
}

export function todayISO() {
  const parts = Object.fromEntries(tehranDateFormat.formatToParts().map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function persianDate(value: string) {
  return value ? dateFormat.format(new Date(`${value}T12:00:00Z`)) : "";
}

export function persianDateTime(value?: string) {
  return value ? dateTimeFormat.format(new Date(value)) : "";
}

export function relativeAge(value: string) {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return relativeTimeFormat.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeTimeFormat.format(hours, "hour");
  return relativeTimeFormat.format(Math.round(hours / 24), "day");
}

export function deliveryTiming(value: string) {
  const day = 86400000;
  const days = Math.round((new Date(`${value}T12:00:00Z`).getTime() - new Date(`${todayISO()}T12:00:00Z`).getTime()) / day);
  if (days < 0) return { days, label: `${persianNumber(-days)} روز عقب‌افتاده` };
  if (days === 0) return { days, label: "امروز" };
  if (days === 1) return { days, label: "فردا" };
  return { days, label: `${persianNumber(days)} روز دیگر` };
}

export function randomID() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
