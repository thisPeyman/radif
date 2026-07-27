import {
  Check,
  CalendarDays,
  ChevronDown,
  Clipboard,
  ClipboardCheck,
  ClipboardList,
  Eye,
  EyeOff,
  LoaderCircle,
  LogOut,
  Package,
  Plus,
  RotateCcw,
  Store,
  Upload,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
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
  paymentInstructions: string;
  customerSubmitted: boolean;
  receiptUploaded: boolean;
  receiptUploadAllowed: boolean;
  shipmentTrackingCode?: string;
  updatedAt: string;
};

type AdminOrder = Pick<PublicOrder, "orderCode" | "items" | "amount" | "status" | "estimatedDeliveryDate"> & { id: number };
type OrderSummary = Omit<AdminOrder, "items"> & { productSummary: string };

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
const tehranDateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
const persianDatePartsFormat = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" });
const latinDigits = "0123456789";
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const persianMonths = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

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

type DateChoice = { iso: string; year: number; month: number; day: number };

function dateChoice(iso: string): DateChoice {
  const parts = Object.fromEntries(persianDatePartsFormat.formatToParts(new Date(`${iso}T12:00:00Z`)).map((part) => [part.type, part.value]));
  return { iso, year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

const deliveryDateStart = new Date(`${todayISO()}T12:00:00Z`);
// ponytail: two years covers delivery promises; extend this range if long-term preorders appear.
const deliveryDateChoices = Array.from({ length: 731 }, (_, offset) => {
  const date = new Date(deliveryDateStart);
  date.setUTCDate(date.getUTCDate() + offset);
  return dateChoice(date.toISOString().slice(0, 10));
});

function DeliveryDateSelect({ id, value, onChange, invalid, describedBy }: { id: string; value: string; onChange: (value: string) => void; invalid?: boolean; describedBy?: string }) {
  const initial = value ? dateChoice(value) : null;
  const [year, setYear] = useState(initial?.year.toString() ?? "");
  const [month, setMonth] = useState(initial?.month.toString() ?? "");
  const [day, setDay] = useState(initial?.day.toString() ?? "");
  const choices = value && !deliveryDateChoices.some((choice) => choice.iso === value) ? [dateChoice(value), ...deliveryDateChoices] : deliveryDateChoices;
  const years = [...new Set(choices.map((choice) => choice.year))];
  const months = [...new Set(choices.filter((choice) => choice.year === Number(year)).map((choice) => choice.month))];
  const days = choices.filter((choice) => choice.year === Number(year) && choice.month === Number(month)).map((choice) => choice.day);

  useEffect(() => {
    const selected = value ? dateChoice(value) : null;
    setYear(selected?.year.toString() ?? "");
    setMonth(selected?.month.toString() ?? "");
    setDay(selected?.day.toString() ?? "");
  }, [value]);

  function selectDay(nextDay: string) {
    setDay(nextDay);
    const selected = choices.find((choice) => choice.year === Number(year) && choice.month === Number(month) && choice.day === Number(nextDay));
    onChange(selected?.iso ?? "");
  }

  return (
    <div id={id} className="grid grid-cols-3 gap-2" role="group" aria-label="تاریخ تخمینی تحویل" aria-describedby={describedBy}>
      <select className="field px-2" value={year} onChange={(event) => { setYear(event.target.value); setMonth(""); setDay(""); }} aria-label="سال" aria-invalid={invalid}>
        <option value="">سال</option>
        {years.map((option) => <option key={option} value={option}>{persianNumber(option)}</option>)}
      </select>
      <select className="field px-2" value={month} disabled={!year} onChange={(event) => { setMonth(event.target.value); setDay(""); }} aria-label="ماه" aria-invalid={invalid}>
        <option value="">ماه</option>
        {months.map((option) => <option key={option} value={option}>{persianMonths[option - 1]}</option>)}
      </select>
      <select className="field px-2" value={day} disabled={!month} onChange={(event) => selectDay(event.target.value)} aria-label="روز" aria-invalid={invalid}>
        <option value="">روز</option>
        {days.map((option) => <option key={option} value={option}>{persianNumber(option)}</option>)}
      </select>
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
      <span className="grid size-12 place-items-center rounded-2xl bg-saffron text-ink shadow-sm">
        <ClipboardList aria-hidden="true" strokeWidth={1.8} />
      </span>
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
          end
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

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ orders: OrderSummary[] }>(`/api/orders?shopId=${shop.id}`, { signal: controller.signal })
      .then((response) => setOrders(response.orders))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "سفارش‌ها دریافت نشدند.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [shop.id, reload]);

  if (loading) return <div className="grid min-h-[65dvh] place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت سفارش‌ها" /></div>;
  if (error) return <section className="page-content"><ErrorNotice retry={() => setReload((value) => value + 1)}>{error}</ErrorNotice></section>;
  if (orders.length > 0) {
    return (
      <section className="page-content">
        <p className="page-kicker">{shop.name}</p>
        <h1 className="page-title">سفارش‌ها</h1>
        <div className="mt-6 space-y-3">
          {orders.map((order) => (
            <NavLink className="block border-r-4 border-teal rounded-2xl bg-white p-4 shadow-sm no-underline text-ink" key={order.id} to={`/orders/${order.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink/70">{order.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])}</p>
                  <p className="mt-1 truncate font-black">{order.productSummary}</p>
                </div>
                <span className="rounded-full bg-ledger px-3 py-1 text-xs font-bold text-teal">{statusLabels[order.status] ?? order.status}</span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-ledger pt-3 text-sm">
                <span><span className="block text-xs text-ink/70">تحویل تخمینی</span><strong>{persianDate(order.estimatedDeliveryDate)}</strong></span>
                <strong>{persianNumber(order.amount)} تومان</strong>
              </div>
            </NavLink>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="page-content flex min-h-[65dvh] flex-col justify-center text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-ledger text-teal">
        <ClipboardList className="size-8" strokeWidth={1.7} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-black">سفارش‌ها، مرتب و یک‌جا</h1>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-7 text-ink/70">از سفارش جدید شروع کنید؛ لینک مشتری همان لحظه آماده می‌شود.</p>
      <NavLink className="primary-button mx-auto mt-7" to="/orders/new">
        <Plus className="size-5" aria-hidden="true" />
        ساخت سفارش جدید
      </NavLink>
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

const statusLabels: Record<string, string> = {
  waiting_info: "در انتظار اطلاعات شما",
  waiting_payment: "در انتظار پرداخت",
  paid: "پرداخت شده",
  preparing: "در حال آماده‌سازی",
  shipped: "ارسال شده",
  cancelled: "لغو شده",
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
  const [laterReceipt, setLaterReceipt] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [receiptPending, setReceiptPending] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const laterReceiptInput = useRef<HTMLInputElement>(null);

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
    setLaterReceipt(null);
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

  async function copyPaymentInstructions() {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.paymentInstructions);
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
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    const form = new FormData();
    form.set("fullName", draft.fullName.trim());
    form.set("mobile", normalizedMobile);
    form.set("address", draft.address.trim());
    form.set("postalCode", normalizedPostalCode);
    form.set("note", draft.note.trim());
    if (receipt) form.set("receipt", receipt);
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

  async function submitLaterReceipt(event: FormEvent) {
    event.preventDefault();
    if (!laterReceipt) return;
    const form = new FormData();
    form.set("receipt", laterReceipt);
    setReceiptPending(true);
    setError("");
    try {
      const updated = await api<PublicOrder>(`/api/o/${encodeURIComponent(token)}/receipt`, { method: "POST", body: form });
      setOrder(updated);
      setLaterReceipt(null);
      if (laterReceiptInput.current) laterReceiptInput.current.value = "";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "رسید بارگذاری نشد. دوباره تلاش کنید.");
    } finally {
      setReceiptPending(false);
    }
  }

  return (
    <div className="app-viewport min-h-dvh px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] text-ink sm:min-h-[760px] sm:px-6">
      <Brand />
      {loading && <div className="grid min-h-[60dvh] place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت سفارش" /></div>}
      {error && <div className="mt-10"><ErrorNotice retry={() => setReload((value) => value + 1)}>{error}</ErrorNotice></div>}
      {order && (
        <main className="mt-10">
          <div className="flex items-center gap-3">
            <span className="relative grid size-12 place-items-center overflow-hidden rounded-2xl bg-ledger">
              <Store className="size-5" aria-hidden="true" />
              {order.shop.logoPath && <img className="absolute inset-0 size-full object-cover" src={order.shop.logoPath} alt="" />}
            </span>
            <div>
              <p className="text-xs font-bold text-ink/70">{order.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])}</p>
              <h1 className="text-xl font-black">سفارش از {order.shop.name}</h1>
            </div>
          </div>

          <section className="mt-7 border-r-4 border-teal bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-bold text-ink/70">وضعیت سفارش</p>
            <p className="mt-1 text-lg font-black text-teal">{statusLabels[order.status] ?? order.status}</p>
          </section>

          <section className="mt-4 rounded-3xl border border-saffron/45 bg-saffron/10 p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-saffron text-ink"><CalendarDays className="size-5" aria-hidden="true" /></span>
              <div>
                <p className="text-xs font-bold text-ink/70">تاریخ تخمینی تحویل</p>
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
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink/80">{order.paymentInstructions}</p>
            <button className="secondary-button mt-4 w-full" type="button" onClick={copyPaymentInstructions}>
              {copyState === "copied" ? <ClipboardCheck className="size-5" aria-hidden="true" /> : <Clipboard className="size-5" aria-hidden="true" />}
              {copyState === "copied" ? "کپی شد" : "کپی اطلاعات پرداخت"}
            </button>
            {copyState === "failed" && <p className="mt-2 text-sm text-error" role="alert">کپی خودکار ممکن نشد؛ متن بالا را انتخاب و کپی کنید.</p>}
          </section>

          {!order.customerSubmitted && (
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
              <label className="block" htmlFor="customer-receipt">
                <span className="mb-2 block text-sm font-bold">تصویر رسید <span className="font-normal text-ink/60">(اختیاری)</span></span>
                <input id="customer-receipt" className="field py-3" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} />
                <span className="mt-2 block text-xs leading-6 text-ink/65">بارگذاری رسید به معنی تأیید پرداخت نیست؛ فروشگاه آن را بررسی می‌کند.</span>
              </label>
              {error && <ErrorNotice>{error}</ErrorNotice>}
              <button className="primary-button w-full" type="submit" disabled={pending}>
                {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}
                {pending ? "در حال ثبت…" : "ثبت اطلاعات تحویل"}
              </button>
            </form>
          )}

          {order.customerSubmitted && (
            <section className="mt-7 rounded-3xl border border-teal/25 bg-teal/8 p-5" aria-live="polite">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-teal text-white"><Check className="size-5" aria-hidden="true" /></span>
                <div><h2 className="font-black">اطلاعات تحویل ثبت شد</h2><p className="mt-1 text-sm text-ink/70">فروشگاه سفارش شما را بررسی می‌کند.</p></div>
              </div>
              <p className="mt-4 border-t border-teal/15 pt-4 text-sm font-bold">{order.receiptUploaded ? "رسید پرداخت بارگذاری شده است." : "هنوز رسیدی بارگذاری نشده است."}</p>
            </section>
          )}

          {order.receiptUploadAllowed && (
            <form className="mt-5 rounded-3xl border border-ledger bg-white p-5" onSubmit={submitLaterReceipt}>
              <h2 className="font-black">بارگذاری رسید پرداخت</h2>
              <p className="mt-1 text-sm leading-7 text-ink/70">می‌توانید تصویر رسید را بعداً هم بفرستید. رسید پس از بررسی فروشگاه تأیید می‌شود.</p>
              <input ref={laterReceiptInput} className="field mt-4 py-3" type="file" required accept="image/jpeg,image/png,image/webp" onChange={(event) => setLaterReceipt(event.target.files?.[0] ?? null)} aria-label="تصویر رسید پرداخت" />
              {error && <div className="mt-4"><ErrorNotice>{error}</ErrorNotice></div>}
              <button className="secondary-button mt-4 w-full" type="submit" disabled={!laterReceipt || receiptPending}>
                {receiptPending ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Upload className="size-5" aria-hidden="true" />}
                {receiptPending ? "در حال بارگذاری…" : "بارگذاری رسید"}
              </button>
            </form>
          )}
        </main>
      )}
    </div>
  );
}

function AdminOrderPage() {
  const { orderID = "" } = useParams();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOrder(null);
    setError("");
    api<AdminOrder>(`/api/orders/${encodeURIComponent(orderID)}`, { signal: controller.signal })
      .then((response) => { setOrder(response); setDate(response.estimatedDeliveryDate); })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "سفارش دریافت نشد.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [orderID]);

  async function saveDate() {
    if (!order || !date || date < todayISO()) {
      setError("تاریخ تحویل را برای امروز یا یکی از روزهای بعد انتخاب کنید.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await api<{ estimatedDeliveryDate: string }>(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatedDeliveryDate: date }),
      });
      setOrder({ ...order, estimatedDeliveryDate: response.estimatedDeliveryDate });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تاریخ تحویل تغییر نکرد.");
    } finally {
      setPending(false);
    }
  }

  if (loading) return <div className="grid min-h-[65dvh] place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت سفارش" /></div>;
  if (!order) return <section className="page-content"><ErrorNotice>{error || "سفارش پیدا نشد."}</ErrorNotice></section>;

  return (
    <section className="page-content">
      <p className="page-kicker">{order.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])}</p>
      <h1 className="page-title">جزئیات سفارش</h1>
      <div className="mt-6 rounded-3xl border border-ledger bg-white p-5">
        <p className="text-sm font-black">تاریخ تخمینی تحویل</p>
        <div className="mt-2"><DeliveryDateSelect id="order-delivery-date" value={date} onChange={setDate} /></div>
        <p className="mt-2 text-sm text-ink/70">{date ? persianDate(date) : "تاریخ را انتخاب کنید."}</p>
        {error && <div className="mt-3"><ErrorNotice>{error}</ErrorNotice></div>}
        <button className="primary-button mt-4 w-full" type="button" onClick={saveDate} disabled={pending || date === order.estimatedDeliveryDate}>
          {pending && <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />}
          {pending ? "در حال ذخیره…" : "ذخیره تاریخ تحویل"}
        </button>
      </div>
      <div className="mt-5 flex items-center justify-between rounded-2xl bg-ledger/70 px-4 py-3">
        <span className="text-sm font-bold">مبلغ سفارش</span>
        <strong>{persianNumber(order.amount)} تومان</strong>
      </div>
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
              <p className="text-xs font-bold text-ink/70">تاریخ تخمینی تحویل</p>
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

        <div className="mt-6 rounded-3xl border border-saffron/50 bg-saffron/10 p-4">
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

        <button className="primary-button mt-8 w-full" type="button" onClick={reset} disabled={pending}>
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
              <span className="mb-2 block text-sm font-black">تاریخ تخمینی تحویل</span>
              <DeliveryDateSelect
                id="delivery-date"
                value={deliveryDate}
                onChange={(value) => { setDeliveryDate(value); setDeliveryDateError(""); }}
                describedBy={deliveryDateError ? "delivery-date-preview delivery-date-error" : "delivery-date-preview"}
                invalid={Boolean(deliveryDateError)}
              />
              <span id="delivery-date-preview" className="mt-2 block text-sm text-ink/70">
                {deliveryDate ? `تحویل تخمینی: ${persianDate(deliveryDate)}` : "تاریخ وعده‌داده‌شده به مشتری را انتخاب کنید."}
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
                      className="field pl-10 text-left"
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
    navigate("/orders");
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
  const isPublicOrder = location.pathname.startsWith("/o/");

  useEffect(() => {
    if (isPublicOrder) return;
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
  }, [isPublicOrder]);

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
