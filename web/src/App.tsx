import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  CalendarDays,
  ChevronDown,
  Clipboard,
  ClipboardCheck,
  ClipboardList,
  Eye,
  EyeOff,
  ImagePlus,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Share2,
  Store,
  Search,
  Truck,
  Upload,
  UserRound,
  ZoomIn,
} from "lucide-react";
import { DayPicker } from "@daypicker/persian";
import Cropper, { type Area } from "react-easy-crop";
import { useDeferredValue, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";

type Shop = {
  id: number;
  name: string;
  logoPath?: string;
  shortDescription?: string;
};

type Me = {
  admin: { id: number; name: string; login: string };
  shops: Shop[];
};

type Product = {
  id: number;
  name: string;
  imagePath: string;
  defaultPrice: number;
  shortDescription?: string;
  active: boolean;
};

type SelectedItem = {
  product: Product;
  quantity: number;
};

type CreatedOrder = {
  id: number;
  orderCode: string;
  customerUrl: string;
  status: string;
  estimatedDeliveryDate: string;
  createdAt: string;
};

type PublicOrder = {
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
};

type OrderSummary = {
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
};

type AdminOrder = {
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

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
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
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";

function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)])
    .replace(/[٠-٩]/g, (digit) => latinDigits["٠١٢٣٤٥٦٧٨٩".indexOf(digit)])
    .replace(/\D/g, "");
}

function normalizeIranianMobile(value: string) {
  const digits = normalizeDigits(value);
  if (digits.startsWith("0098")) return `0${digits.slice(4)}`;
  if (digits.startsWith("98")) return `0${digits.slice(2)}`;
  return digits;
}

type CustomerDraft = {
  fullName: string;
  mobile: string;
  address: string;
  postalCode: string;
  note: string;
};

const emptyCustomerDraft: CustomerDraft = { fullName: "", mobile: "", address: "", postalCode: "", note: "" };

function readCustomerDraft(token: string): CustomerDraft {
  try {
    const value = JSON.parse(localStorage.getItem(`radif_customer_draft_${token}`) ?? "null") as Partial<CustomerDraft> | null;
    return value && Object.values(value).every((field) => typeof field === "string")
      ? { ...emptyCustomerDraft, ...value }
      : emptyCustomerDraft;
  } catch {
    return emptyCustomerDraft;
  }
}

function persianNumber(value: number | string) {
  const number = Number(value);
  return Number.isFinite(number) ? numberFormat.format(number) : "";
}

function todayISO() {
  const parts = Object.fromEntries(tehranDateFormat.formatToParts().map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function persianDate(value: string) {
  return value ? dateFormat.format(new Date(`${value}T12:00:00Z`)) : "";
}

function persianDateTime(value?: string) {
  return value ? dateTimeFormat.format(new Date(value)) : "";
}

function relativeAge(value: string) {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return relativeTimeFormat.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeTimeFormat.format(hours, "hour");
  return relativeTimeFormat.format(Math.round(hours / 24), "day");
}

function deliveryTiming(value: string) {
  const day = 86400000;
  const days = Math.round((new Date(`${value}T12:00:00Z`).getTime() - new Date(`${todayISO()}T12:00:00Z`).getTime()) / day);
  if (days < 0) return { days, label: `${persianNumber(-days)} روز عقب‌افتاده` };
  if (days === 0) return { days, label: "امروز" };
  if (days === 1) return { days, label: "فردا" };
  return { days, label: `${persianNumber(days)} روز دیگر` };
}

function dateFromISO(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateToISO(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function DeliveryDateSelect({ id, value, onChange, invalid, describedBy }: { id: string; value: string; onChange: (value: string) => void; invalid?: boolean; describedBy?: string }) {
  const [open, setOpen] = useState(false);
  const selected = dateFromISO(value);
  const today = dateFromISO(todayISO())!;
  const endMonth = new Date(today);
  endMonth.setFullYear(endMonth.getFullYear() + 2);

  return (
    <div>
      <button id={id} className="field flex items-center justify-between gap-3 text-right font-bold" type="button" onClick={() => setOpen((current) => !current)} aria-controls={`${id}-calendar`} aria-describedby={describedBy} aria-expanded={open} aria-invalid={invalid}>
        <span className={selected ? "text-ink" : "text-ink/60"}>{selected ? persianDate(value) : "انتخاب تاریخ"}</span>
        <CalendarDays className="size-5 shrink-0 text-teal" aria-hidden="true" />
      </button>
      {open && (
        <div id={`${id}-calendar`} className="delivery-calendar mt-2 rounded-2xl border border-ledger bg-white p-3 shadow-sm" role="region" aria-label="تقویم تاریخ تحویل">
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={selected ?? today}
            startMonth={today}
            endMonth={endMonth}
            disabled={{ before: today }}
            onSelect={(day) => {
              if (!day) return;
              onChange(dateToISO(day));
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ReceiptPicker({ id, file, onChange }: { id: string; file: File | null; onChange: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview("");
      if (input.current) input.current.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <input ref={input} id={id} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
      {!file ? (
        <button className="secondary-button w-full" type="button" onClick={() => input.current?.click()}>
          <Upload className="size-5" aria-hidden="true" />
          انتخاب تصویر رسید
        </button>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-teal/30 bg-teal/5">
          <img className="h-48 w-full bg-ledger object-contain" src={preview} alt="پیش‌نمایش رسید انتخاب‌شده" />
          <div className="p-3">
            <p className="truncate text-sm font-bold" dir="auto">{file.name}</p>
            <p className="mt-1 text-xs text-ink/60">{(file.size / 1048576).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} مگابایت</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="secondary-button min-h-11 px-3 text-sm" type="button" onClick={() => input.current?.click()}>تغییر تصویر</button>
              <button className="secondary-button min-h-11 px-3 text-sm text-error" type="button" onClick={() => onChange(null)}>حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function randomID() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function newCreateKey(shopID: number) {
  const storageKey = `radif_create_key_${shopID}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const key = randomID();
  sessionStorage.setItem(storageKey, key);
  return key;
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img className="size-12 rounded-2xl" src="/icons/icon-96.png" alt="" />
      <div>
        <p className="text-2xl font-black leading-none">ردیف</p>
        <p className="mt-1 text-sm text-ink/70">دفتر آرام سفارش‌های شما</p>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="app-viewport grid place-items-center px-6 text-ink">
      <div className="text-center" role="status">
        <LoaderCircle className="mx-auto size-7 animate-spin text-teal" aria-hidden="true" />
        <p className="mt-3 text-sm text-ink/70">در حال آماده‌کردن ردیف…</p>
      </div>
    </div>
  );
}

function ErrorNotice({ children, retry }: { children: ReactNode; retry?: () => void }) {
  return (
    <div className="rounded-2xl border border-error/25 bg-error/8 p-4 text-sm leading-7 text-error" role="alert">
      <p>{children}</p>
      {retry && (
        <button className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold" onClick={retry} type="button">
          <RotateCcw className="size-4" aria-hidden="true" />
          تلاش دوباره
        </button>
      )}
    </div>
  );
}

function LandingPage() {
  return (
    <div className="landing-page text-ink">
      <header className="landing-header">
        <NavLink className="landing-brand" to="/" aria-label="ردیف، صفحه اصلی">
          <Brand />
        </NavLink>
        <NavLink className="landing-login" to="/login">ورود کاربران</NavLink>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">دفتر سفارش فروشگاه‌های اینستاگرامی</p>
            <h1>فروش در دایرکت؛<br />سفارش در <span>ردیف</span></h1>
            <p className="landing-lead">بعد از قطعی‌شدن خرید، سفارش را بساز، لینک را در دایرکت بفرست و آدرس، رسید و وضعیت ارسال را یک‌جا نگه دار.</p>
            <div className="landing-actions">
              <a className="landing-pilot-button" href="https://wa.me/989362507047" target="_blank" rel="noreferrer" aria-describedby="pilot-status">
                <MessageCircle className="size-5" aria-hidden="true" />
                درخواست پایلوت در واتساپ
              </a>
              <a className="landing-text-link" href="#how-it-works">
                دیدن روند کار
                <ArrowLeft className="size-4" aria-hidden="true" />
              </a>
            </div>
            <p id="pilot-status" className="landing-pilot-note">دسترسی آزمایشی ۱۴ روزه برای تعداد محدودی فروشگاه</p>
          </div>

          <div className="landing-ledger" aria-label="نمایی از روند ثبت و پیگیری سفارش در ردیف">
            <div className="landing-ledger-heading">
              <span>امروز در ردیف</span>
              <span>۳ سفارش</span>
            </div>
            <div className="landing-message">
              <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
              <p>خرید قطعی شد؛ لینک سفارش را بفرست.</p>
            </div>
            <div className="landing-slip landing-slip-saffron">
              <span className="landing-slip-icon"><Package aria-hidden="true" /></span>
              <span><small>سفارش جدید</small><strong>شمع موج × ۲</strong></span>
              <span className="landing-slip-state">ساخته شد</span>
            </div>
            <div className="landing-slip landing-slip-teal">
              <span className="landing-slip-icon"><ClipboardCheck aria-hidden="true" /></span>
              <span><small>لینک مشتری</small><strong>اطلاعات و رسید ثبت شد</strong></span>
              <span className="landing-slip-state">کامل</span>
            </div>
            <div className="landing-slip landing-slip-ink">
              <span className="landing-slip-icon"><Truck aria-hidden="true" /></span>
              <span><small>وضعیت سفارش</small><strong>آماده ارسال</strong></span>
              <span className="landing-slip-state">امروز</span>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="landing-section landing-process">
          <div className="landing-section-heading">
            <p className="landing-eyebrow">یک مسیر کوتاه و واقعی</p>
            <h2>از دایرکت تا ارسال، در سه قدم</h2>
            <p>ردیف جای گفت‌وگوی فروش را نمی‌گیرد؛ فقط بعد از خرید، سفارش را از میان پیام‌ها بیرون می‌آورد.</p>
          </div>
          <ol className="landing-steps">
            <li>
              <span className="landing-step-number">۱</span>
              <MessageCircle aria-hidden="true" />
              <h3>خرید را نهایی کن</h3>
              <p>مثل همیشه در دایرکت با مشتری گفت‌وگو کن و خرید را قطعی کن.</p>
            </li>
            <li>
              <span className="landing-step-number">۲</span>
              <Clipboard aria-hidden="true" />
              <h3>لینک سفارش را بفرست</h3>
              <p>محصول و تاریخ تحویل را انتخاب کن؛ ردیف لینک مشتری را آماده می‌کند.</p>
            </li>
            <li>
              <span className="landing-step-number">۳</span>
              <ClipboardList aria-hidden="true" />
              <h3>همه‌چیز را یک‌جا ببین</h3>
              <p>مشتری بدون ساخت حساب، اطلاعات و رسید را ثبت می‌کند و وضعیت را می‌بیند.</p>
            </li>
          </ol>
        </section>

        <section className="landing-section landing-proof">
          <div className="landing-order-preview" aria-label="نمای نمونه فهرست سفارش‌های ردیف">
            <div className="landing-preview-header">
              <span className="landing-preview-logo"><Store aria-hidden="true" /></span>
              <span><small>نمای نمونه فروشگاه</small><strong>خانه آبی</strong></span>
              <span className="landing-preview-brand">ردیف</span>
            </div>
            <div className="landing-preview-title">
              <span><small>خانه آبی</small><strong>سفارش‌ها</strong></span>
              <span>۳ فعال</span>
            </div>
            <div className="landing-preview-orders">
              <article className="landing-preview-order landing-preview-order-saffron">
                <span><small>ردیف ۱۴۰۵ · امروز</small><strong>گلدان صدف</strong><em>اطلاعات مشتری ثبت نشده</em></span>
                <b>در انتظار مشتری</b>
              </article>
              <article className="landing-preview-order landing-preview-order-teal">
                <span><small>ردیف ۱۴۰۴ · دیروز</small><strong>شمع موج × ۲</strong><em>رسید پرداخت ثبت شده</em></span>
                <b>آماده‌سازی</b>
              </article>
              <article className="landing-preview-order landing-preview-order-ink">
                <span><small>ردیف ۱۴۰۳ · ۲ روز پیش</small><strong>آباژور چوبی</strong><em>کد رهگیری دارد</em></span>
                <b>ارسال شده</b>
              </article>
            </div>
          </div>

          <div className="landing-proof-copy">
            <p className="landing-eyebrow">هر سفارش، سر جای خودش</p>
            <h2>دایرکت برای گفتگو می‌ماند، نه بایگانی.</h2>
            <p>دیگر برای پیدا کردن آدرس یا رسید میان پیام‌ها نگرد. هر چیزی که برای آماده‌کردن و فرستادن سفارش لازم است، کنار همان سفارش می‌ماند.</p>
            <ul>
              <li><Check aria-hidden="true" />آدرس و رسید کنار مشخصات سفارش</li>
              <li><Check aria-hidden="true" />وضعیت روشن از انتظار تا ارسال</li>
              <li><Check aria-hidden="true" />پیگیری مشتری از همان لینک، بدون حساب</li>
            </ul>
          </div>
        </section>

        <section className="landing-cta">
          <div>
            <p className="landing-eyebrow">پایلوت ردیف</p>
            <h2>۱۴ روز با سفارش‌های واقعی امتحانش کن.</h2>
            <div className="landing-client-proof">
              <img className="landing-client-logo" src="/images/miroki.jpg" alt="" />
              <p><strong>میروکی، فروشگاه آنلاین دنج</strong><span>ردیف به میروکی کمک می‌کند سفارش‌های اینستاگرامی چراغ‌های پرینت سه‌بعدی را یک‌جا مدیریت کند.</span></p>
            </div>
          </div>
          <div className="landing-cta-action">
            <a className="landing-pilot-button" href="https://wa.me/989362507047" target="_blank" rel="noreferrer">
              <MessageCircle className="size-5" aria-hidden="true" />
              درخواست پایلوت در واتساپ
            </a>
            <span>دسترسی آزمایشی ۱۴ روزه برای تعداد محدودی فروشگاه</span>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p><strong>ردیف</strong> · ساخته‌شده برای فروشگاه‌های کوچک اینستاگرامی</p>
        <div className="landing-footer-links">
          <a href="https://wa.me/989362507047" target="_blank" rel="noreferrer">واتساپ</a>
          <NavLink to="/login">ورود کاربران</NavLink>
        </div>
      </footer>
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: (me: Me) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api<void>("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const me = await api<Me>("/api/me");
      onLogin(me);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : "/orders/new", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ورود انجام نشد. دوباره تلاش کنید.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="app-viewport flex min-h-dvh flex-col px-6 pb-8 pt-[max(2rem,env(safe-area-inset-top))] text-ink sm:min-h-[760px] sm:px-8 sm:pt-12">
      <Brand />
      <div className="my-auto py-12">
        <div className="border-r-4 border-teal pr-5">
          <h1 className="text-[2rem] font-black leading-[1.65]">هر سفارش، سر جای خودش.</h1>
          <p className="mt-1 text-sm leading-7 text-ink/70">برای ساخت و پیگیری سفارش‌ها وارد شوید.</p>
        </div>

        <form className="mt-10 space-y-5" onSubmit={submit}>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">نام کاربری</span>
            <input
              className="field"
              autoComplete="username"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">رمز عبور</span>
            <span className="relative block">
              <input
                className="field pl-14"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="absolute inset-y-0 left-0 grid w-12 place-items-center text-ink/70"
                type="button"
                aria-label={showPassword ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </span>
          </label>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <button className="primary-button w-full" disabled={pending} type="submit">
            {pending && <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />}
            {pending ? "در حال ورود…" : "ورود به ردیف"}
          </button>
        </form>
      </div>
      <p className="text-center text-xs text-ink/70">نسخه آزمایشی ردیف</p>
    </div>
  );
}

function ShopSwitcher({ shops, selected, onChange, disabled }: { shops: Shop[]; selected: Shop; onChange: (id: number) => void; disabled: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-ledger bg-paper/95 px-5 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-ledger text-ink">
          <Store className="size-5" aria-hidden="true" />
          {selected.logoPath && <img className="absolute inset-0 size-full object-cover" src={selected.logoPath} alt="" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-ink/70">فروشگاه فعال</p>
          <div className="relative -mr-2 mt-0.5">
            <select
              className="min-h-8 w-full appearance-none bg-transparent px-2 pl-8 text-base font-black text-ink"
              aria-label="انتخاب فروشگاه"
              disabled={disabled}
              value={selected.id}
              onChange={(event) => onChange(Number(event.target.value))}
            >
              {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
            </select>
            {shops.length > 1 && <ChevronDown className="pointer-events-none absolute left-1 top-1 size-5 text-ink/70" aria-hidden="true" />}
          </div>
        </div>
        <span className="text-xl font-black tracking-tight">ردیف</span>
      </div>
    </header>
  );
}

const navigation = [
  { to: "/orders", label: "سفارش‌ها", icon: ClipboardList },
  { to: "/orders/new", label: "سفارش جدید", icon: Plus },
  { to: "/products", label: "محصول‌ها", icon: Package },
  { to: "/account", label: "حساب", icon: UserRound },
];

function BottomNavigation({ disabled }: { disabled: boolean }) {
  return (
    <nav className="bottom-navigation" aria-label="ناوبری اصلی">
      {navigation.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""} ${disabled ? "pointer-events-none opacity-45" : ""}`}
          aria-disabled={disabled}
          onClick={(event) => { if (disabled) event.preventDefault(); }}
          end={to !== "/products"}
        >
          <Icon className="size-5" strokeWidth={2} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function OrdersPage({ shop }: { shop: Shop }) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const delivery = params.get("delivery") ?? "";
  const sort = params.get("sort") ?? "due";
  const deferredSearch = useDeferredValue(search);

  function setFilter(name: "q" | "status" | "delivery" | "sort", value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next, { replace: true });
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ shopId: String(shop.id) });
    if (deferredSearch) query.set("q", deferredSearch);
    if (status) query.set("status", status);
    if (delivery) query.set("delivery", delivery);
    if (sort !== "due") query.set("sort", sort);
    api<{ orders: OrderSummary[] }>(`/api/orders?${query}`, { signal: controller.signal })
      .then((response) => setOrders(response.orders))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "سفارش‌ها دریافت نشدند.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [deferredSearch, delivery, shop.id, sort, status, reload]);

  return (
    <section className="page-content">
      <p className="page-kicker">{shop.name}</p>
      <h1 className="page-title">سفارش‌ها</h1>
      <label className="relative mt-5 block">
        <Search className="pointer-events-none absolute right-4 top-4 size-5 text-ink/55" aria-hidden="true" />
        <input className="field pr-12!" type="search" value={search} onChange={(event) => setFilter("q", event.target.value)} placeholder="نام، موبایل، کد سفارش یا اینستاگرام" aria-label="جستجوی سفارش" />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold ${delivery === "soon" ? "border-teal bg-teal text-white" : "border-ledger bg-white text-ink"}`} type="button" aria-pressed={delivery === "soon"} onClick={() => setFilter("delivery", delivery === "soon" ? "" : "soon")}>
          <CalendarDays className="size-5 shrink-0" aria-hidden="true" />
          تحویل تا ۷ روز آینده
        </button>
        <select className="field min-h-12 px-3 text-sm font-bold" value={sort} onChange={(event) => setFilter("sort", event.target.value === "due" ? "" : event.target.value)} aria-label="ترتیب سفارش‌ها">
          <option value="due">نزدیک‌ترین تحویل</option>
          <option value="recent">جدیدترین</option>
          <option value="amount">بیشترین مبلغ</option>
        </select>
      </div>
      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-2" aria-label="فیلتر وضعیت">
        {["", ...Object.keys(adminStatusLabels)].map((value) => (
          <button className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold ${status === value ? "border-ink bg-ink text-white" : "border-ledger bg-white text-ink"}`} key={value || "all"} type="button" onClick={() => setFilter("status", value)}>
            {value ? adminStatusLabels[value] : "همه"}
          </button>
        ))}
      </div>
      {loading && <div className="grid min-h-40 place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت سفارش‌ها" /></div>}
      {!loading && error && <div className="mt-5"><ErrorNotice retry={() => setReload((value) => value + 1)}>{error}</ErrorNotice></div>}
      {!loading && !error && orders.length > 0 && (
        <div className="mt-4 space-y-3">
          {orders.map((order) => {
            const timing = deliveryTiming(order.estimatedDeliveryDate);
            return <NavLink className={`block rounded-2xl border-r-4 bg-white p-4 text-ink no-underline shadow-sm ${statusStyles[order.status]?.rail ?? "border-ink"}`} key={order.id} to={`/orders/${order.id}${params.toString() ? `?${params}` : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink/70">{order.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])} · {relativeAge(order.createdAt)}</p>
                  <p className="mt-1 truncate font-black">{order.productSummary}</p>
                  <p className={`mt-1 truncate text-sm font-bold ${order.customerSubmitted ? "text-ink/75" : "text-error"}`}>{order.customerSubmitted ? order.customerFullName : "اطلاعات مشتری ثبت نشده"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusStyles[order.status]?.chip ?? "bg-ledger"}`}>{adminStatusLabels[order.status] ?? order.status}</span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-ledger pt-3 text-sm">
                <span><span className="block text-xs text-ink/70">تحویل</span><strong>{persianDate(order.estimatedDeliveryDate)}</strong>{!(["shipped", "cancelled"].includes(order.status)) && <span className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-xs font-bold ${timing.days < 0 ? "bg-error/10 text-error" : timing.days <= 7 ? "bg-saffron/15 text-ink" : "bg-ledger text-ink/70"}`}>{timing.label}</span>}</span>
                <span className="text-left"><strong>{persianNumber(order.amount)} تومان</strong><span className="mt-1 flex justify-end gap-2 text-xs text-ink/65">{order.receiptUploaded && <span>رسید دارد</span>}{order.hasTrackingCode && <span>کد رهگیری دارد</span>}</span></span>
              </div>
            </NavLink>;
          })}
        </div>
      )}
      {!loading && !error && orders.length === 0 && (
        <div className="flex min-h-72 flex-col justify-center text-center">
          <ClipboardList className="mx-auto size-10 text-teal" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-black">{search || status || delivery ? "سفارشی با این فیلتر پیدا نشد" : "هنوز سفارشی ساخته نشده"}</h2>
          <p className="mt-2 text-sm text-ink/70">{search || status || delivery ? "عبارت جستجو یا فیلترها را تغییر دهید." : "از سفارش جدید شروع کنید."}</p>
          {search || status || delivery ? <button className="secondary-button mx-auto mt-6" type="button" onClick={() => setParams(sort === "due" ? {} : { sort })}>نمایش همه سفارش‌ها</button> : <NavLink className="primary-button mx-auto mt-6" to="/orders/new"><Plus className="size-5" />ساخت سفارش جدید</NavLink>}
        </div>
      )}
    </section>
  );
}

function AccountPage({ me, onLogout }: { me: Me; onLogout: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setPending(true);
    setError("");
    try {
      await onLogout();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "خروج انجام نشد. دوباره تلاش کنید.");
      setPending(false);
    }
  }

  return (
    <section className="page-content">
      <p className="page-kicker">حساب</p>
      <h1 className="page-title">{me.admin.name}</h1>
      <div className="mt-7 rounded-3xl border border-ledger bg-white p-5 shadow-sm">
        <p className="text-xs font-bold text-ink/70">نام کاربری</p>
        <p className="mt-1 font-bold" dir="ltr">{me.admin.login}</p>
        <div className="my-5 h-px bg-ledger" />
        <p className="text-xs font-bold text-ink/70">فروشگاه‌های فعال</p>
        <p className="mt-1 font-bold">{persianNumber(me.shops.length)} فروشگاه</p>
      </div>
      {error && <div className="mt-4"><ErrorNotice>{error}</ErrorNotice></div>}
      <button className="secondary-button mt-6 w-full text-error" type="button" onClick={logout} disabled={pending}>
        {pending ? <LoaderCircle className="size-5 animate-spin" /> : <LogOut className="size-5" />}
        {pending ? "در حال خروج…" : "خروج از حساب"}
      </button>
    </section>
  );
}

function ProductImage({ product }: { product: Product }) {
  return (
    <span className="relative grid size-[4.5rem] shrink-0 place-items-center overflow-hidden rounded-2xl bg-ledger text-ink/70">
      <Package className="size-6" aria-hidden="true" />
      <img
        className="absolute inset-0 size-full object-cover"
        src={product.imagePath}
        alt=""
        onError={(event) => { event.currentTarget.style.display = "none"; }}
      />
    </span>
  );
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function cropProductImage(source: string, area: Area) {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1200;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تصویر برش نخورد.");
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, 1200, 1200);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error("مرورگر نتوانست تصویر WebP بسازد.");
  return new File([blob], "product.webp", { type: "image/webp" });
}

function ProductImageEditor({ existing, file, onChange, onCroppingChange }: { existing?: string; file: File | null; onChange: (file: File | null) => void; onCroppingChange: (cropping: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => {
    onCroppingChange(Boolean(source));
    return () => onCroppingChange(false);
  }, [onCroppingChange, source]);

  function choose(selected?: File) {
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setError("تصویر باید JPEG، PNG یا WebP باشد.");
      return;
    }
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(selected));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setError("");
  }

  async function finishCrop() {
    if (!source || !area) return;
    setWorking(true);
    setError("");
    try {
      onChange(await cropProductImage(source, area));
      URL.revokeObjectURL(source);
      setSource("");
      if (input.current) input.current.value = "";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تصویر برش نخورد.");
    } finally {
      setWorking(false);
    }
  }

  function cancelCrop() {
    URL.revokeObjectURL(source);
    setSource("");
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <input ref={input} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choose(event.target.files?.[0])} />
      {source ? (
        <div className="product-crop-shell">
          <div className="product-crop-stage" dir="ltr">
            <Cropper image={source} crop={crop} zoom={zoom} aspect={1} cropShape="rect" showGrid onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} />
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm font-black">
            <ZoomIn className="size-5 shrink-0 text-teal" aria-hidden="true" />
            <span className="sr-only">بزرگ‌نمایی تصویر</span>
            <input className="product-zoom" type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="secondary-button" type="button" disabled={working} onClick={cancelCrop}>انصراف</button>
            <button className="primary-button" type="button" disabled={working || !area} onClick={finishCrop}>{working ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}{working ? "در حال آماده‌سازی…" : "ثبت برش"}</button>
          </div>
        </div>
      ) : (preview || existing) ? (
        <div className="product-image-preview">
          <img src={preview || existing} alt="پیش‌نمایش تصویر محصول" />
          <div className="p-3">
            <button className="secondary-button w-full" type="button" onClick={() => input.current?.click()}><ImagePlus className="size-5" />تغییر و برش تصویر</button>
            {file && existing && <button className="mt-3 w-full text-sm font-black text-ink/65" type="button" onClick={() => onChange(null)}>بازگشت به تصویر فعلی</button>}
          </div>
        </div>
      ) : (
        <button className="product-image-empty" type="button" onClick={() => input.current?.click()}>
          <span className="grid size-12 place-items-center rounded-2xl bg-teal text-white"><ImagePlus className="size-6" /></span>
          <span><strong className="block">انتخاب و برش تصویر</strong><small className="mt-1 block text-ink/65">خروجی مربع و مناسب نمایش محصول است</small></span>
        </button>
      )}
      {error && <p className="mt-2 text-sm font-bold text-error" role="alert">{error}</p>}
    </div>
  );
}

function sortProducts(products: Product[]) {
  return [...products].sort((a, b) => Number(b.active) - Number(a.active) || b.id - a.id);
}

function ProductsPage({ shop }: { shop: Shop }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState<number>();

  function loadProducts() {
    setLoading(true);
    setError("");
    api<{ products: Product[] }>(`/api/shops/${shop.id}/products?includeInactive=true`)
      .then((response) => setProducts(response.products))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "محصول‌ها دریافت نشدند."))
      .finally(() => setLoading(false));
  }

  useEffect(loadProducts, [shop.id]);

  async function changeActive(product: Product) {
    setChanging(product.id);
    setError("");
    try {
      if (product.active) {
        await api<void>(`/api/shops/${shop.id}/products/${product.id}`, { method: "DELETE" });
      } else {
        await api<Product>(`/api/shops/${shop.id}/products/${product.id}/activate`, { method: "POST" });
      }
      setProducts((current) => sortProducts(current.map((item) => item.id === product.id ? { ...item, active: !product.active } : item)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "وضعیت محصول تغییر نکرد.");
    } finally {
      setChanging(undefined);
    }
  }

  const activeCount = products.filter((product) => product.active).length;
  return (
    <section className="page-content">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="page-kicker">{shop.name}</p>
          <h1 className="page-title">محصول‌ها</h1>
          {!loading && <p className="mt-2 text-sm font-bold text-ink/65">{persianNumber(activeCount)} فعال از {persianNumber(products.length)} محصول</p>}
        </div>
        <NavLink className="grid size-12 shrink-0 place-items-center rounded-2xl bg-saffron text-ink shadow-sm" to="/products/new" aria-label="محصول جدید"><Plus className="size-6" strokeWidth={2.5} /></NavLink>
      </div>

      {loading && <div className="mt-8 grid min-h-48 place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت محصول‌ها" /></div>}
      {error && <div className="mt-6"><ErrorNotice retry={loadProducts}>{error}</ErrorNotice></div>}
      {!loading && !error && products.length === 0 && (
        <div className="mt-8 rounded-3xl border border-ledger bg-white p-7 text-center">
          <Package className="mx-auto size-9 text-teal" />
          <h2 className="mt-4 text-lg font-black">اولین محصول را بسازید</h2>
          <p className="mt-2 text-sm leading-7 text-ink/65">نام، قیمت و تصویر را یک‌بار ثبت کنید تا ساخت سفارش سریع‌تر شود.</p>
          <NavLink className="primary-button mt-6 w-full" to="/products/new"><Plus className="size-5" />ساخت محصول</NavLink>
        </div>
      )}
      <div className="mt-7 space-y-3" aria-live="polite">
        {products.map((product, index) => (
          <div key={product.id}>
            {!product.active && (index === 0 || products[index - 1].active) && <p className="archive-divider">بایگانی‌شده‌ها</p>}
            <div className={`manage-product-card ${product.active ? "" : "manage-product-card-archived"}`}>
              <div className="flex items-center gap-3 p-3">
                <ProductImage product={product} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><h2 className="truncate font-black">{product.name}</h2>{product.active && <span className="size-2 shrink-0 rounded-full bg-teal" aria-label="فعال" />}</div>
                  {product.shortDescription && <p className="mt-1 truncate text-xs text-ink/60">{product.shortDescription}</p>}
                  <p className="mt-2 text-sm font-black text-teal">{persianNumber(product.defaultPrice)} تومان</p>
                </div>
              </div>
              <div className="grid grid-cols-2 border-t border-ledger/80">
                <NavLink className="manage-product-action border-l border-ledger/80" to={`/products/${product.id}/edit`}><Pencil className="size-4" />ویرایش</NavLink>
                <button className={`manage-product-action ${product.active ? "text-error" : "text-teal"}`} type="button" disabled={changing === product.id} onClick={() => changeActive(product)}>
                  {changing === product.id ? <LoaderCircle className="size-4 animate-spin" /> : product.active ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}
                  {product.active ? "بایگانی" : "فعال‌سازی دوباره"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductFormPage({ shop, mode }: { shop: Shop; mode: "create" | "edit" }) {
  const { productID } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product>();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [pending, setPending] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "edit") return;
    const controller = new AbortController();
    setLoading(true);
    api<{ products: Product[] }>(`/api/shops/${shop.id}/products?includeInactive=true`, { signal: controller.signal })
      .then((response) => {
        const found = response.products.find((item) => item.id === Number(productID));
        if (!found) throw new ApiError(404, "محصول پیدا نشد.");
        setProduct(found);
        setName(found.name);
        setPrice(String(found.defaultPrice));
        setDescription(found.shortDescription ?? "");
      })
      .catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "محصول دریافت نشد."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mode, productID, shop.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (cropping) {
      setError("برش تصویر را ثبت یا لغو کنید.");
      return;
    }
    const numericPrice = Number(price);
    if (!name.trim() || !Number.isSafeInteger(numericPrice) || numericPrice <= 0 || (mode === "create" && !image)) {
      setError("نام، قیمت صحیح و تصویر محصول را کامل کنید.");
      return;
    }
    const form = new FormData();
    form.set("name", name.trim());
    form.set("defaultPrice", String(numericPrice));
    form.set("shortDescription", description.trim());
    if (image) form.set("image", image);
    setPending(true);
    setError("");
    try {
      const path = mode === "create" ? `/api/shops/${shop.id}/products` : `/api/shops/${shop.id}/products/${productID}`;
      await api<Product>(path, { method: mode === "create" ? "POST" : "PATCH", body: form });
      navigate("/products", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "محصول ذخیره نشد.");
    } finally {
      setPending(false);
    }
  }

  if (loading) return <div className="page-content grid min-h-72 place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت محصول" /></div>;
  if (mode === "edit" && !product) return <section className="page-content"><NavLink className="mb-5 inline-flex min-h-11 items-center gap-2 font-black text-teal" to="/products"><ArrowRight className="size-5" />بازگشت به محصول‌ها</NavLink><ErrorNotice>{error || "محصول پیدا نشد."}</ErrorNotice></section>;
  return (
    <form className="page-content" onSubmit={submit}>
      <NavLink className="mb-5 inline-flex min-h-11 items-center gap-2 font-black text-teal" to="/products"><ArrowRight className="size-5" />بازگشت به محصول‌ها</NavLink>
      <p className="page-kicker">{shop.name}</p>
      <h1 className="page-title">{mode === "create" ? "محصول تازه" : "ویرایش محصول"}</h1>
      <p className="mt-2 text-sm leading-7 text-ink/65">تصویر مربع در سفارش مدیر و صفحه مشتری نمایش داده می‌شود.</p>

      <div className="mt-7"><ProductImageEditor existing={product?.imagePath} file={image} onChange={setImage} onCroppingChange={setCropping} /></div>
      <div className="mt-7 space-y-5">
        <label className="block" htmlFor="product-name"><span className="mb-2 block text-sm font-black">نام محصول</span><input id="product-name" className="field" value={name} maxLength={150} required onChange={(event) => setName(event.target.value)} placeholder="مثلاً شمع موج" /></label>
        <label className="block" htmlFor="product-price"><span className="mb-2 block text-sm font-black">قیمت پیش‌فرض</span><span className="relative block"><input id="product-price" className="field pl-20 text-lg font-black" inputMode="numeric" value={price.replace(/\d/g, (digit) => persianDigits[Number(digit)])} required onChange={(event) => setPrice(normalizeDigits(event.target.value))} /><span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-bold text-ink/60">تومان</span></span></label>
        <label className="block" htmlFor="product-description"><span className="mb-2 block text-sm font-black">توضیح کوتاه <span className="font-medium text-ink/50">(اختیاری)</span></span><textarea id="product-description" className="field min-h-28 resize-y py-3" value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} placeholder="نکته‌ای که موقع انتخاب محصول کمک می‌کند" /></label>
      </div>
      {error && <div className="mt-5"><ErrorNotice>{error}</ErrorNotice></div>}
      <button className="primary-button mt-7 w-full" type="submit" disabled={pending || cropping || !name.trim() || !price || (mode === "create" && !image)}>{pending ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}{pending ? "در حال ذخیره…" : mode === "create" ? "ساخت محصول" : "ذخیره تغییرات"}</button>
    </form>
  );
}

const publicStatusLabels: Record<string, string> = {
  waiting_info: "در انتظار اطلاعات شما",
  waiting_payment: "در انتظار تأیید پرداخت",
  paid: "پرداخت شده",
  preparing: "در حال آماده‌سازی",
  shipped: "ارسال شده",
  cancelled: "لغو شده",
};

const adminStatusLabels: Record<string, string> = { ...publicStatusLabels, waiting_info: "در انتظار اطلاعات مشتری" };
const statusStyles: Record<string, { rail: string; chip: string }> = {
  waiting_info: { rail: "border-saffron", chip: "bg-saffron/15 text-ink" },
  waiting_payment: { rail: "border-saffron", chip: "bg-saffron/15 text-ink" },
  paid: { rail: "border-teal", chip: "bg-teal/12 text-teal" },
  preparing: { rail: "border-ink", chip: "bg-ledger text-ink" },
  shipped: { rail: "border-teal", chip: "bg-teal text-white" },
  cancelled: { rail: "border-error", chip: "bg-error/10 text-error" },
};

function PublicOrderPage() {
  const { token = "" } = useParams();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<CustomerDraft>(() => readCustomerDraft(token));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CustomerDraft, string>>>({});
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const [pending, setPending] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setOrder(null);
    api<PublicOrder>(`/api/o/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(setOrder)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "سفارش دریافت نشد.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, reload]);

  useEffect(() => {
    setDraft(readCustomerDraft(token));
    setFieldErrors({});
    setReceipt(null);
    setReceiptError("");
  }, [token]);

  useEffect(() => {
    if (!order || order.customerSubmitted) return;
    try {
      localStorage.setItem(`radif_customer_draft_${token}`, JSON.stringify(draft));
    } catch {
      // Local storage may be unavailable in restricted in-app browsers; the controlled form still preserves errors.
    }
  }, [draft, order, token]);

  function updateDraft(field: keyof CustomerDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function copyPaymentCardNumber() {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.paymentCardNumber);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function submitDetails(event: FormEvent) {
    event.preventDefault();
    const normalizedMobile = normalizeIranianMobile(draft.mobile);
    const normalizedPostalCode = normalizeDigits(draft.postalCode);
    const errors: Partial<Record<keyof CustomerDraft, string>> = {};
    if (!draft.fullName.trim()) errors.fullName = "نام و نام خانوادگی را وارد کنید.";
    if (!/^09\d{9}$/.test(normalizedMobile)) errors.mobile = "شماره موبایل معتبر ایرانی وارد کنید.";
    if (!draft.address.trim()) errors.address = "نشانی کامل را وارد کنید.";
    if (normalizedPostalCode && !/^\d{10}$/.test(normalizedPostalCode)) errors.postalCode = "کد پستی باید ۱۰ رقم باشد.";
    if (!receipt) setReceiptError("تصویر رسید پرداخت را انتخاب کنید.");
    if (Object.keys(errors).length || !receipt) {
      setFieldErrors(errors);
      return;
    }
    const form = new FormData();
    form.set("fullName", draft.fullName.trim());
    form.set("mobile", normalizedMobile);
    form.set("address", draft.address.trim());
    form.set("postalCode", normalizedPostalCode);
    form.set("note", draft.note.trim());
    form.set("receipt", receipt);
    setPending(true);
    setError("");
    try {
      const updated = await api<PublicOrder>(`/api/o/${encodeURIComponent(token)}/details`, { method: "POST", body: form });
      try { localStorage.removeItem(`radif_customer_draft_${token}`); } catch { /* Draft storage is optional. */ }
      setOrder(updated);
      setReceipt(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "اطلاعات ثبت نشد. دوباره تلاش کنید.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="app-viewport min-h-dvh px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] text-ink sm:min-h-[760px] sm:px-6">
      <a className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-ink/60 no-underline transition-colors hover:text-teal" href="/" target="_blank" rel="noreferrer" aria-label="درباره ردیف">
        <ClipboardList className="size-4" aria-hidden="true" />
        ساخته‌شده با <strong className="text-ink/80">ردیف</strong>
      </a>
      {loading && <div className="grid min-h-[60dvh] place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت سفارش" /></div>}
      {error && <div className="mt-10"><ErrorNotice retry={() => setReload((value) => value + 1)}>{error}</ErrorNotice></div>}
      {order && (
        <main className="mt-6">
          <header className="text-center">
            <span className="relative mx-auto grid size-20 place-items-center overflow-hidden rounded-[1.75rem] bg-ledger shadow-sm ring-4 ring-white">
              <Store className="size-7" aria-hidden="true" />
              {order.shop.logoPath && <img className="absolute inset-0 size-full object-cover" src={order.shop.logoPath} alt="" />}
            </span>
            <h1 className="mt-4 text-2xl font-black">{order.shop.name}</h1>
            <p className="mt-1 text-xs font-bold text-ink/60">سفارش {order.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])}</p>
          </header>

          <section className="mt-7 border-r-4 border-teal bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-bold text-ink/70">وضعیت سفارش</p>
            <p className="mt-1 text-lg font-black text-teal">{publicStatusLabels[order.status] ?? order.status}</p>
            {order.status === "waiting_payment" && <p className="mt-2 text-sm text-ink/70">فروشگاه در حال بررسی رسید پرداخت شماست.</p>}
            {order.customerSubmitted && <p className="mt-2 text-xs text-ink/60">آخرین به‌روزرسانی: {persianDateTime(order.updatedAt)}</p>}
          </section>

          <section className="mt-4 rounded-3xl border border-saffron/45 bg-saffron/10 p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-saffron text-ink"><CalendarDays className="size-5" aria-hidden="true" /></span>
              <div>
                <p className="text-xs font-bold text-ink/70">تاریخ تحویل</p>
                <p className="mt-1 text-lg font-black">{persianDate(order.estimatedDeliveryDate)}</p>
              </div>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-black">محصول‌ها</h2>
            <div className="mt-3 divide-y divide-ledger overflow-hidden rounded-3xl border border-ledger bg-white">
              {order.items.map((item) => (
                <div className="flex items-center gap-3 p-3" key={item.name}>
                  <span className="relative grid size-14 place-items-center overflow-hidden rounded-2xl bg-ledger"><Package className="size-5" aria-hidden="true" /><img className="absolute inset-0 size-full object-cover" src={item.imagePath} alt="" /></span>
                  <p className="min-w-0 flex-1 font-bold">{item.name}</p>
                  <span className="text-sm font-black text-teal">{persianNumber(item.quantity)} عدد</span>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-5 flex items-center justify-between rounded-2xl bg-ledger/70 px-4 py-3">
            <span className="text-sm font-bold">مبلغ سفارش</span>
            <strong>{persianNumber(order.amount)} تومان</strong>
          </div>

          <section className="mt-6 rounded-3xl border border-ledger bg-white p-5">
            <h2 className="text-sm font-black">اطلاعات پرداخت فروشگاه</h2>
            <p className="mt-2 text-sm leading-7 text-ink/70">مبلغ سفارش را به شماره کارت زیر واریز کنید.</p>
            <button className="mt-3 flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border-2 border-saffron/60 bg-saffron/10 px-4 py-3 text-ink" type="button" onClick={copyPaymentCardNumber}>
              <span className="text-right">
                <span className="block text-xs font-bold text-ink/60">شماره کارت</span>
                <strong className="mt-1 block select-all text-lg tracking-wider" dir="ltr">{order.paymentCardNumber.match(/.{1,4}/g)?.join(" ")}</strong>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-sm font-black text-teal">
                {copyState === "copied" ? <ClipboardCheck className="size-5" aria-hidden="true" /> : <Clipboard className="size-5" aria-hidden="true" />}
                {copyState === "copied" ? "کپی شد" : "کپی"}
              </span>
            </button>
            <p className="mt-3 whitespace-pre-wrap text-sm font-bold leading-7 text-ink/80">{order.paymentInstructions}</p>
            {copyState === "failed" && <p className="mt-2 text-sm text-error" role="alert">کپی خودکار ممکن نشد؛ شماره کارت بالا را نگه دارید و انتخاب کنید.</p>}
          </section>

          {order.customerSubmissionAllowed && (
            <form className="mt-8 space-y-5" onSubmit={submitDetails} noValidate>
              <div>
                <h2 className="text-xl font-black">اطلاعات تحویل</h2>
                <p className="mt-1 text-sm leading-7 text-ink/70">پس از ثبت، اطلاعات برای شما قفل می‌شود و فروشگاه سفارش را بررسی می‌کند.</p>
              </div>
              <label className="block" htmlFor="customer-name">
                <span className="mb-2 block text-sm font-bold">نام و نام خانوادگی</span>
                <input id="customer-name" className="field" autoComplete="name" value={draft.fullName} onChange={(event) => updateDraft("fullName", event.target.value)} aria-invalid={Boolean(fieldErrors.fullName)} aria-describedby={fieldErrors.fullName ? "customer-name-error" : undefined} />
                {fieldErrors.fullName && <span id="customer-name-error" className="mt-2 block text-sm text-error" role="alert">{fieldErrors.fullName}</span>}
              </label>
              <label className="block" htmlFor="customer-mobile">
                <span className="mb-2 block text-sm font-bold">شماره موبایل</span>
                <input id="customer-mobile" className="field" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="09123456789" value={draft.mobile} onChange={(event) => updateDraft("mobile", event.target.value)} aria-invalid={Boolean(fieldErrors.mobile)} aria-describedby={fieldErrors.mobile ? "customer-mobile-error" : undefined} />
                {fieldErrors.mobile && <span id="customer-mobile-error" className="mt-2 block text-sm text-error" role="alert">{fieldErrors.mobile}</span>}
              </label>
              <label className="block" htmlFor="customer-address">
                <span className="mb-2 block text-sm font-bold">نشانی کامل</span>
                <textarea id="customer-address" className="field min-h-32 py-3" autoComplete="street-address" value={draft.address} onChange={(event) => updateDraft("address", event.target.value)} aria-invalid={Boolean(fieldErrors.address)} aria-describedby={fieldErrors.address ? "customer-address-error" : undefined} />
                {fieldErrors.address && <span id="customer-address-error" className="mt-2 block text-sm text-error" role="alert">{fieldErrors.address}</span>}
              </label>
              <label className="block" htmlFor="customer-postal-code">
                <span className="mb-2 block text-sm font-bold">کد پستی <span className="font-normal text-ink/60">(اختیاری)</span></span>
                <input id="customer-postal-code" className="field" inputMode="numeric" autoComplete="postal-code" dir="ltr" value={draft.postalCode} onChange={(event) => updateDraft("postalCode", event.target.value)} aria-invalid={Boolean(fieldErrors.postalCode)} aria-describedby={fieldErrors.postalCode ? "customer-postal-error" : undefined} />
                {fieldErrors.postalCode && <span id="customer-postal-error" className="mt-2 block text-sm text-error" role="alert">{fieldErrors.postalCode}</span>}
              </label>
              <label className="block" htmlFor="customer-note">
                <span className="mb-2 block text-sm font-bold">یادداشت برای فروشگاه <span className="font-normal text-ink/60">(اختیاری)</span></span>
                <textarea id="customer-note" className="field min-h-24 py-3" value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} />
              </label>
              <div>
                <span className="mb-2 block text-sm font-bold">تصویر رسید پرداخت</span>
                <ReceiptPicker id="customer-receipt" file={receipt} onChange={(file) => { setReceipt(file); setReceiptError(""); }} />
                {receiptError && <span className="mt-2 block text-sm text-error" role="alert">{receiptError}</span>}
                <span className="mt-2 block text-xs leading-6 text-ink/65">بارگذاری رسید به معنی تأیید پرداخت نیست؛ فروشگاه آن را بررسی می‌کند.</span>
              </div>
              {error && <ErrorNotice>{error}</ErrorNotice>}
              <button className="primary-button w-full" type="submit" disabled={pending}>
                {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}
                {pending ? "در حال ثبت…" : "ثبت اطلاعات و ارسال رسید"}
              </button>
            </form>
          )}

          {!order.customerSubmitted && !order.customerSubmissionAllowed && (
            <section className="mt-7 rounded-3xl border border-error/25 bg-error/8 p-5">
              <h2 className="font-black">ثبت اطلاعات این سفارش بسته شده است</h2>
              <p className="mt-2 text-sm leading-7 text-ink/70">برای پیگیری یا اصلاح سفارش با فروشگاه تماس بگیرید.</p>
            </section>
          )}

          {order.customerSubmitted && (
            <section className="mt-7 rounded-3xl border border-teal/25 bg-teal/8 p-5" aria-live="polite">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-teal text-white"><Check className="size-5" aria-hidden="true" /></span>
                <div><h2 className="font-black">اطلاعات تحویل ثبت شد</h2><p className="mt-1 text-sm text-ink/70">فروشگاه سفارش شما را بررسی می‌کند.</p></div>
              </div>
              <p className="mt-4 border-t border-teal/15 pt-4 text-sm font-bold">{order.receiptUploaded ? "رسید پرداخت بارگذاری شده است." : "هنوز رسیدی بارگذاری نشده است."}</p>
              {order.customerSummary && (
                <dl className="mt-4 grid gap-3 border-t border-teal/15 pt-4 text-sm">
                  <div><dt className="text-xs font-bold text-ink/60">گیرنده</dt><dd className="mt-1 font-bold">{order.customerSummary.fullName}</dd></div>
                  <div><dt className="text-xs font-bold text-ink/60">شماره ثبت‌شده</dt><dd className="mt-1 font-bold" dir="ltr">{order.customerSummary.mobile}</dd></div>
                  <div><dt className="text-xs font-bold text-ink/60">نشانی ثبت‌شده</dt><dd className="mt-1 font-bold">{order.customerSummary.addressPreview}</dd></div>
                  {order.customerSummary.postalCodeSuffix && <div><dt className="text-xs font-bold text-ink/60">پایان کد پستی</dt><dd className="mt-1 font-bold" dir="ltr">••••••{order.customerSummary.postalCodeSuffix}</dd></div>}
                </dl>
              )}
            </section>
          )}

          {order.customerSubmitted && order.history.length > 0 && (
            <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
              <h2 className="font-black">روند سفارش</h2>
              <ol className="mt-4 border-r-2 border-ledger pr-5">
                {order.history.map((entry, index) => (
                  <li className="relative pb-5 last:pb-0" key={`${entry.createdAt}-${index}`}>
                    <span className="absolute -right-[1.7rem] top-1 size-3 rounded-full bg-teal" />
                    <p className="font-bold">{publicStatusLabels[entry.status] ?? entry.status}</p>
                    <p className="mt-1 text-xs text-ink/60">{persianDateTime(entry.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {order.customerSubmitted && order.shipmentTrackingCode && (
            <section className="mt-5 rounded-3xl border border-saffron/45 bg-saffron/10 p-5">
              <p className="text-xs font-bold text-ink/70">کد رهگیری مرسوله</p>
              <p className="mt-2 break-all text-left text-lg font-black" dir="ltr">{order.shipmentTrackingCode}</p>
              <CopyButton value={order.shipmentTrackingCode} label="کپی کد رهگیری" />
            </section>
          )}

        </main>
      )}
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return <button className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-black text-teal" type="button" onClick={copy}><Clipboard className="size-4" aria-hidden="true" />{copied ? "کپی شد" : label}</button>;
}

function AdminOrderPage() {
  const { orderID = "" } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [tracking, setTracking] = useState("");
  const [customer, setCustomer] = useState<CustomerDraft>(emptyCustomerDraft);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"" | "status" | "date" | "tracking" | "customer">("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOrder(null);
    setError("");
    api<AdminOrder>(`/api/orders/${encodeURIComponent(orderID)}`, { signal: controller.signal })
      .then((response) => {
        setOrder(response);
        setDate(response.estimatedDeliveryDate);
        setStatus(response.status);
        setTracking(response.shipmentTrackingCode);
        setCustomer({ fullName: response.customerFullName, mobile: response.customerMobile, address: response.customerAddress, postalCode: response.customerPostalCode, note: response.customerNote });
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "سفارش دریافت نشد.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [orderID]);

  async function saveChanges(section: "status" | "date" | "tracking" | "customer", changes: Record<string, string>) {
    if (!order) return;
    setSaving(section);
    setError("");
    try {
      const response = await api<AdminOrder>(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      setOrder(response);
      setDate(response.estimatedDeliveryDate);
      setStatus(response.status);
      setTracking(response.shipmentTrackingCode);
      setCustomer({ fullName: response.customerFullName, mobile: response.customerMobile, address: response.customerAddress, postalCode: response.customerPostalCode, note: response.customerNote });
      if (section === "customer") setEditingCustomer(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تغییرات ذخیره نشد.");
    } finally {
      setSaving("");
    }
  }

  function saveCustomer(event: FormEvent) {
    event.preventDefault();
    const mobile = normalizeIranianMobile(customer.mobile);
    const postalCode = normalizeDigits(customer.postalCode);
    if (!customer.fullName.trim() || !customer.address.trim() || !/^09\d{9}$/.test(mobile) || (postalCode !== "" && !/^\d{10}$/.test(postalCode))) {
      setError("نام، شماره موبایل، نشانی و کد پستی را بررسی کنید.");
      return;
    }
    void saveChanges("customer", { customerFullName: customer.fullName, customerMobile: mobile, customerAddress: customer.address, customerPostalCode: postalCode, customerNote: customer.note });
  }

  function cancelCustomerEdit() {
    if (!order) return;
    setCustomer({ fullName: order.customerFullName, mobile: order.customerMobile, address: order.customerAddress, postalCode: order.customerPostalCode, note: order.customerNote });
    setEditingCustomer(false);
  }

  if (loading) return <div className="grid min-h-[65dvh] place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت سفارش" /></div>;
  if (!order) return <section className="page-content"><ErrorNotice>{error || "سفارش پیدا نشد."}</ErrorNotice></section>;

  return (
    <section className="page-content">
      <NavLink className="inline-flex min-h-11 items-center text-sm font-black text-teal" to={`/orders${location.search}`}>بازگشت به سفارش‌ها</NavLink>
      <p className="page-kicker mt-2">{order.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])} · {order.shop.name}</p>
      <h1 className="page-title">عملیات سفارش</h1>
      {error && <div className="mt-4"><ErrorNotice>{error}</ErrorNotice></div>}

      <section className={`mt-5 rounded-3xl border-r-4 bg-white p-5 shadow-sm ${statusStyles[order.status]?.rail ?? "border-ink"}`}>
        <label className="text-sm font-black" htmlFor="admin-order-status">وضعیت سفارش</label>
        <select id="admin-order-status" className="field mt-2" value={status} onChange={(event) => setStatus(event.target.value)}>
          {Object.entries(adminStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="primary-button mt-3 w-full" type="button" onClick={() => saveChanges("status", { status })} disabled={Boolean(saving) || status === order.status}>
          {saving === "status" && <LoaderCircle className="size-5 animate-spin" />}{saving === "status" ? "در حال ذخیره…" : "ثبت وضعیت"}
        </button>
      </section>

      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <div className="flex items-center justify-between"><h2 className="font-black">مشتری و تحویل</h2>{order.customerSubmitted && !editingCustomer && <button className="min-h-11 px-2 text-sm font-black text-teal" type="button" onClick={() => setEditingCustomer(true)}>اصلاح اطلاعات</button>}</div>
        {!order.customerSubmitted && <p className="mt-3 text-sm font-bold text-error">مشتری هنوز اطلاعات تحویل را ثبت نکرده است.</p>}
        {order.customerSubmitted && !editingCustomer && (
          <div className="mt-3 space-y-4 text-sm">
            <div><p className="text-xs font-bold text-ink/60">نام مشتری</p><p className="mt-1 font-black">{order.customerFullName}</p></div>
            <div><p className="text-xs font-bold text-ink/60">شماره موبایل</p><div className="flex items-center justify-between gap-2"><span dir="ltr" className="font-bold">{order.customerMobile}</span><CopyButton value={order.customerMobile} label="کپی" /></div></div>
            <div><p className="text-xs font-bold text-ink/60">نشانی</p><p className="mt-1 whitespace-pre-wrap leading-7">{order.customerAddress}</p><CopyButton value={order.customerAddress} label="کپی نشانی" /></div>
            {order.customerPostalCode && <div><p className="text-xs font-bold text-ink/60">کد پستی</p><p className="mt-1 font-bold" dir="ltr">{order.customerPostalCode}</p></div>}
            {order.customerNote && <div><p className="text-xs font-bold text-ink/60">یادداشت مشتری</p><p className="mt-1 whitespace-pre-wrap leading-7">{order.customerNote}</p></div>}
          </div>
        )}
        {order.customerSubmitted && editingCustomer && (
          <form className="mt-3 space-y-3" onSubmit={saveCustomer}>
            <input className="field" value={customer.fullName} onChange={(event) => setCustomer({ ...customer, fullName: event.target.value })} aria-label="نام مشتری" />
            <input className="field" type="tel" dir="ltr" value={customer.mobile} onChange={(event) => setCustomer({ ...customer, mobile: event.target.value })} aria-label="شماره موبایل مشتری" />
            <textarea className="field min-h-28 py-3" value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} aria-label="نشانی مشتری" />
            <input className="field" inputMode="numeric" dir="ltr" value={customer.postalCode} onChange={(event) => setCustomer({ ...customer, postalCode: event.target.value })} aria-label="کد پستی" placeholder="کد پستی اختیاری" />
            <textarea className="field min-h-20 py-3" value={customer.note} onChange={(event) => setCustomer({ ...customer, note: event.target.value })} aria-label="یادداشت مشتری" placeholder="یادداشت اختیاری" />
            <div className="grid grid-cols-2 gap-2"><button className="secondary-button" type="button" onClick={cancelCustomerEdit}>انصراف</button><button className="primary-button" disabled={Boolean(saving)}>{saving === "customer" ? "در حال ذخیره…" : "ذخیره"}</button></div>
          </form>
        )}
      </section>

      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <h2 className="font-black">رسید پرداخت</h2>
        {order.receiptUploaded && order.receiptUrl ? <><img className="mt-4 max-h-96 w-full rounded-2xl bg-ledger object-contain" src={order.receiptUrl} alt="رسید پرداخت مشتری" /><a className="secondary-button mt-3 w-full" href={order.receiptUrl} target="_blank" rel="noreferrer">نمایش در اندازه کامل</a></> : <p className="mt-3 text-sm text-ink/65">رسیدی بارگذاری نشده است.</p>}
      </section>

      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <h2 className="font-black">محصول‌ها و مبلغ</h2>
        <div className="mt-3 divide-y divide-ledger">{order.items.map((item) => <div className="flex items-center justify-between gap-3 py-3" key={item.name}><span className="font-bold">{item.name} × {persianNumber(item.quantity)}</span><span className="text-sm">{persianNumber(item.unitPrice)} تومان</span></div>)}</div>
        <div className="mt-3 flex justify-between border-t border-ink/15 pt-4"><span className="font-bold">مبلغ سفارش</span><strong>{persianNumber(order.amount)} تومان</strong></div>
      </section>

      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <h2 className="font-black">تحویل و ارسال</h2>
        <p className="mt-4 text-sm font-bold">تاریخ تحویل</p>
        <div className="mt-2"><DeliveryDateSelect id="order-delivery-date" value={date} onChange={setDate} /></div>
        <p className="mt-2 text-sm text-ink/70">{date ? persianDate(date) : "تاریخ را انتخاب کنید."}</p>
        <button className="secondary-button mt-3 w-full" type="button" onClick={() => saveChanges("date", { estimatedDeliveryDate: date })} disabled={Boolean(saving) || !date || date === order.estimatedDeliveryDate}>{saving === "date" ? "در حال ذخیره…" : "ذخیره تاریخ"}</button>
        <label className="mt-5 block text-sm font-bold" htmlFor="tracking-code">کد رهگیری مرسوله</label>
        <input id="tracking-code" className="field mt-2" dir="ltr" value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="اختیاری" />
        {tracking && <div className="mt-1 text-left"><CopyButton value={tracking} label="کپی کد رهگیری" /></div>}
        <button className="secondary-button mt-2 w-full" type="button" onClick={() => saveChanges("tracking", { shipmentTrackingCode: tracking })} disabled={Boolean(saving) || tracking === order.shipmentTrackingCode}>{saving === "tracking" ? "در حال ذخیره…" : "ذخیره کد رهگیری"}</button>
      </section>

      <section className="mt-5 rounded-3xl border border-saffron/40 bg-saffron/8 p-5">
        <h2 className="font-black">اطلاعات داخلی</h2>
        <div className="mt-3 text-sm"><p className="text-xs font-bold text-ink/60">اینستاگرام</p><p className="mt-1 font-bold" dir="ltr">{order.instagramUsername ? `@${order.instagramUsername}` : "ثبت نشده"}</p></div>
        <div className="mt-4"><p className="text-xs font-bold text-ink/60">یادداشت داخلی</p><p className="mt-1 whitespace-pre-wrap text-sm leading-7">{order.internalNote || "یادداشتی ثبت نشده است."}</p></div>
      </section>

      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <h2 className="font-black">لینک مشتری</h2>
        <p className="mt-3 break-all text-left text-xs" dir="ltr">{order.customerUrl}</p>
        <CopyButton value={order.customerUrl} label="کپی لینک مشتری" />
      </section>

      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <h2 className="font-black">تاریخچه وضعیت</h2>
        <ol className="mt-4 border-r-2 border-ledger pr-5">{order.history.map((entry, index) => <li className="relative pb-5 last:pb-0" key={`${entry.createdAt}-${index}`}><span className="absolute -right-[1.7rem] top-1 size-3 rounded-full bg-teal" /><p className="font-bold">{adminStatusLabels[entry.newStatus] ?? entry.newStatus}</p><p className="mt-1 text-xs text-ink/60">{persianDateTime(entry.createdAt)}{entry.changedByAdminName ? ` · ${entry.changedByAdminName}` : ""}</p></li>)}</ol>
        <p className="mt-5 border-t border-ledger pt-4 text-xs text-ink/60">ساخته‌شده: {persianDateTime(order.createdAt)} · آخرین تغییر: {persianDateTime(order.updatedAt)}</p>
      </section>
    </section>
  );
}

function CreateOrderPage({ shop, onBusyChange }: { shop: Shop; onBusyChange: (busy: boolean) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [amount, setAmount] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [instagram, setInstagram] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [deliveryDateError, setDeliveryDateError] = useState("");
  const [created, setCreated] = useState<CreatedOrder | null>(null);
  const [editingDeliveryDate, setEditingDeliveryDate] = useState(false);
  const [updatedDeliveryDate, setUpdatedDeliveryDate] = useState("");
  const [deliveryUpdatePending, setDeliveryUpdatePending] = useState(false);
  const [deliveryUpdateError, setDeliveryUpdateError] = useState("");
  const [copyState, setCopyState] = useState<"copying" | "copied" | "failed">("copying");
  const startedAt = useRef(performance.now());
  const [createKey, setCreateKey] = useState(() => newCreateKey(shop.id));
  const canShare = typeof navigator.share === "function";

  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  useEffect(() => {
    if (!pending) return;
    const preventExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventExit);
    return () => window.removeEventListener("beforeunload", preventExit);
  }, [pending]);

  function loadProducts() {
    setLoading(true);
    setLoadError("");
    api<{ products: Product[] }>(`/api/shops/${shop.id}/products`)
      .then((response) => setProducts(response.products))
      .catch((reason) => setLoadError(reason instanceof Error ? reason.message : "محصول‌ها دریافت نشدند."))
      .finally(() => setLoading(false));
  }

  useEffect(loadProducts, [shop.id]);

  function updateItems(next: SelectedItem[]) {
    setItems(next);
    setAmount(String(next.reduce((total, item) => total + item.product.defaultPrice * item.quantity, 0)));
    setAmountError("");
    setError("");
  }

  function toggleProduct(product: Product) {
    const exists = items.some((item) => item.product.id === product.id);
    updateItems(exists ? items.filter((item) => item.product.id !== product.id) : [...items, { product, quantity: 1 }]);
  }

  function changeQuantity(productID: number, change: number) {
    updateItems(items.map((item) => item.product.id === productID ? { ...item, quantity: Math.min(99, Math.max(1, item.quantity + change)) } : item));
  }

  async function recordCopy(order: CreatedOrder) {
    const path = `/api/orders/${order.id}/link-copied`;
    try {
      await api<void>(path, { method: "POST" });
    } catch {
      navigator.sendBeacon(path);
    }
  }

  function shareMessage(order: CreatedOrder) {
    return `سلام، سفارش شما در فروشگاه ${shop.name} با کد ${order.orderCode} ثبت شد.\n\nلطفاً برای تکمیل اطلاعات سفارش و ارسال رسید پرداخت، از لینک زیر استفاده کنید:\n${order.customerUrl}`;
  }

  async function copyLink(order: CreatedOrder) {
    setCopyState("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(order.customerUrl);
      setCopyState("copied");
      await recordCopy(order).catch(() => undefined);
    } catch {
      setCopyState("failed");
    }
  }

  async function shareOrder(order: CreatedOrder) {
    if (!canShare) {
      await copyLink(order);
      return;
    }
    try {
      await navigator.share({ text: shareMessage(order) });
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      await copyLink(order);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!items.length || !Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setAmountError("مبلغ سفارش را به‌صورت یک عدد بزرگ‌تر از صفر وارد کنید.");
      return;
    }
    if (!deliveryDate || deliveryDate < todayISO()) {
      setDeliveryDateError("تاریخ تحویل را برای امروز یا یکی از روزهای بعد انتخاب کنید.");
      return;
    }
    setAmountError("");
    setDeliveryDateError("");
    setPending(true);
    onBusyChange(true);
    setError("");
    let resolveReserved: ((value: Blob) => void) | undefined;
    let rejectReserved: ((reason?: unknown) => void) | undefined;
    let reservedCopy: Promise<void> | undefined;
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        const content = new Promise<Blob>((resolve, reject) => {
          resolveReserved = resolve;
          rejectReserved = reject;
        });
        reservedCopy = navigator.clipboard.write([new ClipboardItem({ "text/plain": content })]);
        void reservedCopy.catch(() => undefined);
      } catch {
        reservedCopy = undefined;
      }
    }
    try {
      const order = await api<CreatedOrder>("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createKey,
          shopId: shop.id,
          items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
          amount: numericAmount,
          estimatedDeliveryDate: deliveryDate,
          instagramUsername: instagram,
          internalNote: note,
          elapsedMs: Math.round(performance.now() - startedAt.current),
        }),
      });
      sessionStorage.removeItem(`radif_create_key_${shop.id}`);
      setCreated(order);
      if (reservedCopy && resolveReserved) {
        resolveReserved(new Blob([order.customerUrl], { type: "text/plain" }));
        try {
          await reservedCopy;
          setCopyState("copied");
          await recordCopy(order).catch(() => undefined);
        } catch {
          await copyLink(order);
        }
      } else {
        await copyLink(order);
      }
    } catch (reason) {
      rejectReserved?.(reason);
      setError(reason instanceof Error ? reason.message : "سفارش ساخته نشد. دوباره تلاش کنید.");
    } finally {
      setPending(false);
      onBusyChange(false);
    }
  }

  async function saveDeliveryDate() {
    if (!created || !updatedDeliveryDate || updatedDeliveryDate < todayISO()) {
      setDeliveryUpdateError("تاریخ تحویل را برای امروز یا یکی از روزهای بعد انتخاب کنید.");
      return;
    }
    setDeliveryUpdatePending(true);
    setDeliveryUpdateError("");
    try {
      const response = await api<{ estimatedDeliveryDate: string }>(`/api/orders/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatedDeliveryDate: updatedDeliveryDate }),
      });
      setCreated({ ...created, estimatedDeliveryDate: response.estimatedDeliveryDate });
      setEditingDeliveryDate(false);
    } catch (reason) {
      setDeliveryUpdateError(reason instanceof Error ? reason.message : "تاریخ تحویل تغییر نکرد.");
    } finally {
      setDeliveryUpdatePending(false);
    }
  }

  function reset() {
    setItems([]);
    setAmount("");
    setDeliveryDate("");
    setInstagram("");
    setNote("");
    setCreated(null);
    setError("");
    setAmountError("");
    setDeliveryDateError("");
    setEditingDeliveryDate(false);
    setDeliveryUpdateError("");
    const key = randomID();
    sessionStorage.setItem(`radif_create_key_${shop.id}`, key);
    setCreateKey(key);
    startedAt.current = performance.now();
  }

  if (created) {
    return (
      <section className="page-content flex min-h-[70dvh] flex-col justify-center" aria-live="polite">
        <span className="grid size-16 place-items-center rounded-3xl bg-teal text-white">
          <ClipboardCheck className="size-8" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <p className="page-kicker mt-6">{created.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])}</p>
        <h1 className="page-title mt-1">سفارش ساخته شد</h1>
        <p className="mt-3 leading-7 text-ink/70">
          {copyState === "copied" && "لینک مشتری کپی شد و آماده فرستادن در دایرکت است."}
          {copyState === "copying" && "در حال کپی‌کردن لینک مشتری…"}
          {copyState === "failed" && "کپی خودکار در این مرورگر انجام نشد. لینک را از کادر زیر کپی کنید."}
        </p>

        <div className="mt-5 rounded-2xl bg-ledger/70 p-4">
          <div className="flex items-center gap-3">
            <CalendarDays className="size-5 shrink-0 text-teal" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink/70">تاریخ تحویل</p>
              <p className="mt-1 font-black">{persianDate(created.estimatedDeliveryDate)}</p>
            </div>
            {!editingDeliveryDate && (
              <button className="min-h-11 px-2 text-sm font-black text-teal" type="button" onClick={() => { setUpdatedDeliveryDate(created.estimatedDeliveryDate); setEditingDeliveryDate(true); }}>تغییر</button>
            )}
          </div>
          {editingDeliveryDate && (
            <div className="mt-4 border-t border-ink/10 pt-4">
              <p className="text-sm font-bold">تاریخ جدید</p>
              <div className="mt-2"><DeliveryDateSelect id="updated-delivery-date" value={updatedDeliveryDate} onChange={setUpdatedDeliveryDate} /></div>
              {deliveryUpdateError && <p className="mt-2 text-sm font-bold text-error" role="alert">{deliveryUpdateError}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="secondary-button" type="button" onClick={() => setEditingDeliveryDate(false)} disabled={deliveryUpdatePending}>انصراف</button>
                <button className="primary-button" type="button" onClick={saveDeliveryDate} disabled={deliveryUpdatePending}>
                  {deliveryUpdatePending ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : "ذخیره تاریخ"}
                </button>
              </div>
            </div>
          )}
        </div>

        {canShare && (
          <button className="primary-button mt-6 w-full" type="button" onClick={() => shareOrder(created)}>
            <Share2 className="size-5" aria-hidden="true" />
            اشتراک‌گذاری پیام
          </button>
        )}

        <div className={`${canShare ? "mt-3" : "mt-6"} rounded-3xl border border-saffron/50 bg-saffron/10 p-4`}>
          <label className="text-sm font-bold" htmlFor="customer-link">لینک مشتری</label>
          <input
            id="customer-link"
            className="field mt-2 text-left text-sm"
            dir="ltr"
            readOnly
            value={created.customerUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button className="secondary-button mt-3 w-full" type="button" onClick={() => copyLink(created)} disabled={copyState === "copying"}>
            {copyState === "copying" ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Clipboard className="size-5" aria-hidden="true" />}
            {copyState === "copying" ? "در حال کپی…" : "کپی لینک"}
          </button>
        </div>

        <button className="secondary-button mt-8 w-full" type="button" onClick={reset} disabled={pending}>
          <Plus className="size-5" aria-hidden="true" />
          ساخت سفارش دیگر
        </button>
        <NavLink className={`secondary-button mt-3 w-full ${pending ? "pointer-events-none opacity-45" : ""}`} aria-disabled={pending} to={`/orders/${created.id}`}>مشاهده و ویرایش سفارش</NavLink>
        <NavLink className={`secondary-button mt-3 w-full ${pending ? "pointer-events-none opacity-45" : ""}`} aria-disabled={pending} to="/orders">رفتن به سفارش‌ها</NavLink>
      </section>
    );
  }

  return (
    <form onSubmit={submit}>
      <section className="page-content pb-8">
        <p className="page-kicker">{shop.name}</p>
        <h1 className="page-title">سفارش جدید</h1>
        <p className="mt-2 text-sm leading-7 text-ink/70">یک یا چند محصول را انتخاب کنید؛ مبلغ آماده است و لینک با یک لمس ساخته می‌شود.</p>

        <fieldset className="mt-7">
          <legend className="text-sm font-black">انتخاب محصول</legend>
          {loading && (
            <div className="mt-3 flex min-h-28 items-center justify-center rounded-3xl bg-ledger/55" role="status">
              <LoaderCircle className="size-6 animate-spin text-teal" aria-hidden="true" />
              <span className="mr-2 text-sm text-ink/70">در حال دریافت محصول‌ها…</span>
            </div>
          )}
          {loadError && <div className="mt-3"><ErrorNotice retry={loadProducts}>{loadError}</ErrorNotice></div>}
          {!loading && !loadError && products.length === 0 && (
            <div className="mt-3 rounded-3xl border border-ledger bg-white p-6 text-center">
              <Package className="mx-auto size-7 text-ink/70" aria-hidden="true" />
              <p className="mt-3 font-bold">محصول فعالی پیدا نشد</p>
              <p className="mt-1 text-sm leading-7 text-ink/70">برای این فروشگاه هنوز محصولی آماده ثبت سفارش نیست.</p>
            </div>
          )}
          <div className="mt-3 space-y-3">
            {products.map((product) => {
              const selectedItem = items.find((item) => item.product.id === product.id);
              const isSelected = Boolean(selectedItem);
              return (
                <div
                  className={`product-choice product-choice-multi ${isSelected ? "product-choice-selected" : ""}`}
                  key={product.id}
                >
                  <button
                    className="product-choice-main"
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleProduct(product)}
                  >
                    <ProductImage product={product} />
                    <span className="min-w-0 flex-1 text-right">
                      <span className="block font-black">{product.name}</span>
                      {product.shortDescription && <span className="mt-0.5 block truncate text-xs text-ink/70">{product.shortDescription}</span>}
                      <span className="mt-2 block text-sm font-bold text-teal">{persianNumber(product.defaultPrice)} تومان</span>
                    </span>
                    <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${isSelected ? "border-saffron bg-saffron" : "border-ink/20"}`}>
                      {isSelected && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
                    </span>
                  </button>
                  {selectedItem && (
                    <div className="flex items-center justify-between border-t border-saffron/35 px-4 py-2.5">
                      <span className="text-sm font-bold">تعداد</span>
                      <span className="flex items-center gap-2" aria-label={`تعداد ${product.name}`}>
                        <button className="quantity-button" type="button" onClick={() => changeQuantity(product.id, -1)} disabled={selectedItem.quantity === 1} aria-label={`کم‌کردن تعداد ${product.name}`}>−</button>
                        <span className="min-w-7 text-center font-black" aria-live="polite">{persianNumber(selectedItem.quantity)}</span>
                        <button className="quantity-button" type="button" onClick={() => changeQuantity(product.id, 1)} disabled={selectedItem.quantity === 99} aria-label={`زیادکردن تعداد ${product.name}`}>+</button>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {items.length > 0 && (
            <p className="mt-3 text-sm font-bold text-teal" aria-live="polite">
              {persianNumber(items.reduce((total, item) => total + item.quantity, 0))} قلم از {persianNumber(items.length)} محصول انتخاب شده
            </p>
          )}
        </fieldset>

        {items.length > 0 && (
          <div className="creation-fields mt-7">
            <label className="block" htmlFor="amount">
              <span className="mb-2 block text-sm font-black">مبلغ سفارش</span>
              <span className="relative block">
                <input
                  id="amount"
                  className="field pl-20 text-lg font-black"
                  inputMode="numeric"
                  value={amountFocused ? amount.replace(/\d/g, (digit) => persianDigits[Number(digit)]) : persianNumber(amount)}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  onChange={(event) => setAmount(normalizeDigits(event.target.value))}
                  aria-describedby={amountError ? "amount-unit amount-error" : "amount-unit"}
                  aria-invalid={Boolean(amountError)}
                  required
                />
                <span id="amount-unit" className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-bold text-ink/70">تومان</span>
              </span>
              {amountError && <span id="amount-error" className="mt-2 block text-sm font-bold text-error" role="alert">{amountError}</span>}
            </label>

            <div className="mt-5">
              <span className="mb-2 block text-sm font-black">تاریخ تحویل</span>
              <DeliveryDateSelect
                id="delivery-date"
                value={deliveryDate}
                onChange={(value) => { setDeliveryDate(value); setDeliveryDateError(""); }}
                describedBy={deliveryDateError ? "delivery-date-preview delivery-date-error" : "delivery-date-preview"}
                invalid={Boolean(deliveryDateError)}
              />
              <span id="delivery-date-preview" className="mt-2 block text-sm text-ink/70">
                {deliveryDate ? `تحویل: ${persianDate(deliveryDate)}` : "تاریخ وعده‌داده‌شده به مشتری را انتخاب کنید."}
              </span>
              {deliveryDateError && <span id="delivery-date-error" className="mt-2 block text-sm font-bold text-error" role="alert">{deliveryDateError}</span>}
            </div>

            <details className="mt-5 rounded-3xl border border-ledger bg-white">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-bold">
                <span>جزئیات اختیاری</span>
                <ChevronDown className="details-chevron size-5 text-ink/70" aria-hidden="true" />
              </summary>
              <div className="space-y-5 border-t border-ledger p-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold">نام کاربری اینستاگرام</span>
                  <span className="relative block">
                    <input
                      className="field pl-8! text-left"
                      dir="ltr"
                      autoComplete="off"
                      maxLength={101}
                      value={instagram}
                      onChange={(event) => setInstagram(event.target.value)}
                      placeholder="username"
                    />
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink/70">@</span>
                  </span>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold">یادداشت داخلی</span>
                  <textarea
                    className="field min-h-24 resize-y py-3"
                    maxLength={1000}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="مثلاً رنگ یا هماهنگی انجام‌شده در دایرکت"
                  />
                  <span className="mt-1 block text-xs text-ink/70">این یادداشت به مشتری نشان داده نمی‌شود.</span>
                </label>
              </div>
            </details>
          </div>
        )}

        {error && <div className="mt-5"><ErrorNotice>{error}</ErrorNotice></div>}
      </section>

      <div className="create-action">
        <button className="primary-button w-full" type="submit" disabled={!items.length || !deliveryDate || pending || loading}>
          {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Clipboard className="size-5" aria-hidden="true" />}
          {pending ? "در حال ساخت سفارش…" : "ساخت و کپی لینک"}
        </button>
      </div>
    </form>
  );
}

function AdminApp({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const savedID = Number(localStorage.getItem("radif_shop_id"));
  const [shopID, setShopID] = useState(me.shops.some((shop) => shop.id === savedID) ? savedID : me.shops[0]?.id);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (!me.shops.length) {
    return (
      <div className="app-viewport grid place-items-center px-6 text-center text-ink">
        <div>
          <Store className="mx-auto size-9 text-ink/70" />
          <h1 className="mt-4 text-xl font-black">فروشگاه فعالی ندارید</h1>
          <p className="mt-2 text-sm leading-7 text-ink/70">برای ادامه، اطلاعات فروشگاه باید در داده‌های اولیه فعال شود.</p>
          <button className="secondary-button mx-auto mt-6" onClick={async () => { await api<void>("/api/session", { method: "DELETE" }); onLogout(); navigate("/login", { replace: true }); }}>خروج از حساب</button>
        </div>
      </div>
    );
  }

  const selected = me.shops.find((shop) => shop.id === shopID) ?? me.shops[0];
  function changeShop(id: number) {
    setShopID(id);
    localStorage.setItem("radif_shop_id", String(id));
    navigate(location.pathname.startsWith("/products") ? "/products" : "/orders");
  }
  async function logout() {
    await api<void>("/api/session", { method: "DELETE" });
    onLogout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-viewport relative min-h-dvh text-ink sm:min-h-[760px]">
      <ShopSwitcher shops={me.shops} selected={selected} onChange={changeShop} disabled={creating} />
      <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <Routes>
          <Route path="/orders" element={<OrdersPage shop={selected} />} />
          <Route path="/orders/new" element={<CreateOrderPage key={selected.id} shop={selected} onBusyChange={setCreating} />} />
          <Route path="/orders/:orderID" element={<AdminOrderPage />} />
          <Route path="/products" element={<ProductsPage key={selected.id} shop={selected} />} />
          <Route path="/products/new" element={<ProductFormPage key={selected.id} shop={selected} mode="create" />} />
          <Route path="/products/:productID/edit" element={<ProductFormPage key={`${selected.id}-${location.pathname}`} shop={selected} mode="edit" />} />
          <Route path="/account" element={<AccountPage me={me} onLogout={logout} />} />
          <Route path="*" element={<Navigate to="/orders/new" replace />} />
        </Routes>
      </main>
      <BottomNavigation disabled={creating} />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<{ state: "loading" } | { state: "guest" } | { state: "ready"; me: Me }>({ state: "loading" });
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const isPublicOrder = location.pathname.startsWith("/o/");

  useEffect(() => {
    if (isLanding || isPublicOrder) return;
    const controller = new AbortController();
    const unauthorized = () => setSession({ state: "guest" });
    window.addEventListener("radif:unauthorized", unauthorized);
    api<Me>("/api/me", { signal: controller.signal })
      .then((me) => setSession({ state: "ready", me }))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setSession({ state: "guest" });
      });
    return () => {
      controller.abort();
      window.removeEventListener("radif:unauthorized", unauthorized);
    };
  }, [isLanding, isPublicOrder]);

  if (isLanding) return <LandingPage />;

  if (isPublicOrder) {
    return <Routes><Route path="/o/:token" element={<PublicOrderPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
  }

  if (session.state === "loading") return <LoadingScreen />;
  if (session.state === "guest") {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={(me) => setSession({ state: "ready", me })} />} />
        <Route path="*" element={<Navigate to="/login" state={{ from: location.pathname }} replace />} />
      </Routes>
    );
  }
  if (location.pathname === "/login") return <Navigate to="/orders/new" replace />;
  return <AdminApp me={session.me} onLogout={() => setSession({ state: "guest" })} />;
}
