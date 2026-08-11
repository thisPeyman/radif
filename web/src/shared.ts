import { format } from "date-fns-jalali";

export type Shop = {
  id: number;
  name: string;
  logoPath?: string;
  shortDescription?: string;
  instagramUsername?: string;
  whatsappNumber?: string;
  supportChannel?: "instagram" | "whatsapp";
  shareMessageTemplate?: string;
  paymentCards: PaymentCard[];
};

export type PaymentCard = {
  id: number;
  cardNumber: string;
  iban: string;
  paymentInstructions: string;
  active: boolean;
};

export const salesChannels = ["instagram", "whatsapp", "telegram", "bale", "other"] as const;
export type SalesChannel = (typeof salesChannels)[number];
export const salesChannelLabels: Record<SalesChannel, string> = {
  instagram: "اینستاگرام",
  whatsapp: "واتساپ",
  telegram: "تلگرام",
  bale: "بله",
  other: "سایر",
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
  initialPaymentAmount?: number;
  finalPaymentAmount?: number;
};

export type PublicOrder = {
  orderCode: string;
  shop: { name: string; logoPath?: string };
  items: { name: string; imagePath: string; quantity: number }[];
  amount: number;
  initialPaymentAmount?: number;
  finalPaymentAmount?: number;
  status: string;
  estimatedDeliveryDate: string;
  paymentCardNumber: string;
  paymentIban: string;
  paymentInstructions: string;
  customerSubmitted: boolean;
  customerSubmissionAllowed: boolean;
  receiptUploaded: boolean;
  finalPaymentRequested: boolean;
  finalPaymentCardNumber?: string;
  finalPaymentIban?: string;
  finalPaymentInstructions?: string;
  finalReceiptUploaded: boolean;
  finalPaymentConfirmed: boolean;
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
  initialPaymentAmount?: number;
  finalPaymentRequested: boolean;
  finalReceiptUploaded: boolean;
  finalPaymentConfirmed: boolean;
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
  initialPaymentAmount?: number;
  finalPaymentAmount?: number;
  status: string;
  estimatedDeliveryDate: string;
  salesChannel: SalesChannel;
  conversationReference: string;
  internalNote: string;
  customerFullName: string;
  customerMobile: string;
  customerAddress: string;
  customerPostalCode: string;
  customerNote: string;
  customerSubmitted: boolean;
  receiptUploaded: boolean;
  receiptUrl?: string;
  finalPaymentRequested: boolean;
  finalPaymentRequestedAt?: string;
  finalPaymentCardNumber: string;
  finalPaymentIban: string;
  finalPaymentInstructions: string;
  finalReceiptUploaded: boolean;
  finalReceiptUrl?: string;
  finalPaymentConfirmed: boolean;
  finalPaymentConfirmedAt?: string;
  finalPaymentConfirmedByAdminName?: string;
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

export type PilotFailureReason = "client_validation" | "conflict" | "request" | "network" | "server";

export function pilotFailureReason(reason: unknown): PilotFailureReason {
  if (!(reason instanceof ApiError)) return "network";
  if (reason.status === 409) return "conflict";
  if (reason.status >= 500) return "server";
  return "request";
}

export function sendPilotEvent(path: string, event: Record<string, string>) {
  const body = JSON.stringify(event);
  const fallback = () => {
    try { navigator.sendBeacon(path, new Blob([body], { type: "application/json" })); } catch { /* Best-effort pilot signal. */ }
  };
  void fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).then((response) => { if (response.status === 429 || response.status >= 500) fallback(); }).catch(fallback);
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

export function readLastSalesChannel(): SalesChannel {
  try {
    const value = localStorage.getItem("radif_sales_channel");
    return salesChannels.includes(value as SalesChannel) ? value as SalesChannel : "instagram";
  } catch {
    return "instagram";
  }
}

export function rememberSalesChannel(value: SalesChannel) {
  try { localStorage.setItem("radif_sales_channel", value); } catch { /* Storage may be unavailable in embedded browsers. */ }
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

export function orderShareMessage(
  shop: Pick<Shop, "name" | "shareMessageTemplate">,
  order: Pick<CreatedOrder, "orderCode" | "customerUrl" | "estimatedDeliveryDate">,
  amount: number,
) {
  const values: Record<string, string> = {
    "{shopName}": shop.name,
    "{orderCode}": order.orderCode,
    "{customerUrl}": order.customerUrl,
    "{amount}": `${persianNumber(amount)} تومان`,
    "{deliveryDate}": persianDate(order.estimatedDeliveryDate),
  };
  return (shop.shareMessageTemplate || defaultShareMessageTemplate).replace(/\{(?:shopName|orderCode|customerUrl|amount|deliveryDate)\}/g, (placeholder) => values[placeholder]);
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

// ponytail: annual list; add each new Jalali year's official dates when published.
const IRANIAN_HOLIDAYS = new Set([
  "1405-01-01",
  "1405-01-02",
  "1405-01-03",
  "1405-01-04",
  "1405-01-12",
  "1405-01-13",
  "1405-01-25",
  "1405-03-06",
  "1405-03-14",
  "1405-03-15",
  "1405-04-03",
  "1405-04-04",
  "1405-05-13",
  "1405-05-21",
  "1405-05-22",
  "1405-05-30",
  "1405-06-08",
  "1405-08-22",
  "1405-10-02",
  "1405-10-16",
  "1405-11-04",
  "1405-11-22",
  "1405-12-09",
  "1405-12-19",
  "1405-12-20",
  "1405-12-29",
]);

export function isWorkingDay(iso: string) {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  if (day === 4 || day === 5) return false;
  return !IRANIAN_HOLIDAYS.has(format(new Date(`${iso}T12:00:00Z`), "yyyy-MM-dd"));
}

export function addWorkingDays(iso: string, count: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  let remaining = count;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const candidate = date.toISOString().slice(0, 10);
    if (isWorkingDay(candidate)) remaining--;
  }
  return date.toISOString().slice(0, 10);
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
