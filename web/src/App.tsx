import {
  Check,
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

type CreatedOrder = {
  id: number;
  orderCode: string;
  customerUrl: string;
  status: string;
  createdAt: string;
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
const latinDigits = "0123456789";
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";

function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)])
    .replace(/[٠-٩]/g, (digit) => latinDigits["٠١٢٣٤٥٦٧٨٩".indexOf(digit)])
    .replace(/\D/g, "");
}

function persianNumber(value: number | string) {
  const number = Number(value);
  return Number.isFinite(number) ? numberFormat.format(number) : "";
}

function newCreateKey(shopID: number) {
  const storageKey = `radif_create_key_${shopID}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const key = crypto.randomUUID();
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

function OrdersLaunch() {
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

function CreateOrderPage({ shop, onBusyChange }: { shop: Shop; onBusyChange: (busy: boolean) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [amount, setAmount] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);
  const [instagram, setInstagram] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [created, setCreated] = useState<CreatedOrder | null>(null);
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

  function chooseProduct(product: Product) {
    setSelected(product);
    setAmount(String(product.defaultPrice));
    setError("");
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
    if (!selected || !Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setAmountError("مبلغ سفارش را به‌صورت یک عدد بزرگ‌تر از صفر وارد کنید.");
      return;
    }
    setAmountError("");
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
          productId: selected.id,
          amount: numericAmount,
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

  function reset() {
    setSelected(null);
    setAmount("");
    setInstagram("");
    setNote("");
    setCreated(null);
    setError("");
    setAmountError("");
    const key = crypto.randomUUID();
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

        {copyState === "failed" && (
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
            <button className="secondary-button mt-3 w-full" type="button" onClick={() => copyLink(created)}>
              <Clipboard className="size-5" aria-hidden="true" />
              کپی دوباره
            </button>
          </div>
        )}

        <button className="primary-button mt-8 w-full" type="button" onClick={reset} disabled={pending}>
          <Plus className="size-5" aria-hidden="true" />
          ساخت سفارش دیگر
        </button>
        <NavLink className={`secondary-button mt-3 w-full ${pending ? "pointer-events-none opacity-45" : ""}`} aria-disabled={pending} to="/orders">رفتن به سفارش‌ها</NavLink>
      </section>
    );
  }

  return (
    <form onSubmit={submit}>
      <section className="page-content pb-8">
        <p className="page-kicker">{shop.name}</p>
        <h1 className="page-title">سفارش جدید</h1>
        <p className="mt-2 text-sm leading-7 text-ink/70">محصول را انتخاب کنید؛ مبلغ آماده است و لینک با یک لمس ساخته می‌شود.</p>

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
              const isSelected = selected?.id === product.id;
              return (
                <button
                  className={`product-choice ${isSelected ? "product-choice-selected" : ""}`}
                  key={product.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => chooseProduct(product)}
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
              );
            })}
          </div>
        </fieldset>

        {selected && (
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
        <button className="primary-button w-full" type="submit" disabled={!selected || pending || loading}>
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
          <Route path="/orders" element={<OrdersLaunch />} />
          <Route path="/orders/new" element={<CreateOrderPage key={selected.id} shop={selected} onBusyChange={setCreating} />} />
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

  useEffect(() => {
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
  }, []);

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
