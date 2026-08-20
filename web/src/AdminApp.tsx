import { ChartColumn, ChevronDown, ClipboardList, Download, Package, Plus, Store, UserRound, X } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router";
import { LoadingScreen } from "./components";
import { api, persianNumber, type BeforeInstallPromptEvent, type Me, type Shop } from "./shared";

const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const CreateOrderPage = lazy(() => import("./pages/CreateOrderPage"));
const HistoricalOrderPage = lazy(() => import("./pages/HistoricalOrderPage"));
const AdminOrderPage = lazy(() => import("./pages/AdminOrderPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const ProductFormPage = lazy(() => import("./pages/ProductFormPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const ReportPage = lazy(() => import("./pages/ReportPage"));

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
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
  { to: "/report", label: "گزارش", icon: ChartColumn },
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

function InstallPrompt({ event, onDone }: { event: BeforeInstallPromptEvent | null; onDone: () => void }) {
  const [dismissed, setDismissed] = useState(() => Date.now() - Number(localStorage.getItem("radif_install_dismissed_at")) < 7 * 24 * 60 * 60 * 1000);
  const ios = isIOS();
  if (dismissed || isStandalone() || (!event && !ios)) return null;
  function dismiss() {
    localStorage.setItem("radif_install_dismissed_at", String(Date.now()));
    setDismissed(true);
  }
  async function install() {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "dismissed") dismiss();
    onDone();
  }
  return (
    <aside className="install-prompt" aria-label="نصب اپلیکیشن ردیف">
      <button className="grid size-10 shrink-0 place-items-center rounded-xl text-ink/60" type="button" onClick={dismiss} aria-label="بستن پیشنهاد نصب">
        <X className="size-5" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-black">ردیف را روی گوشی نصب کنید</p>
        <p className="mt-1 text-xs leading-6 text-ink/70">
          {event ? "دسترسی سریع‌تر و نمایش تمام‌صفحه، بدون نیاز به باز کردن مرورگر." : "در Safari روی اشتراک‌گذاری بزنید و «افزودن به صفحه اصلی» را انتخاب کنید."}
        </p>
        {event && (
          <button className="primary-button mt-3 min-h-11! px-4! text-sm" type="button" onClick={install}>
            <Download className="size-4" aria-hidden="true" />
            نصب ردیف
          </button>
        )}
      </div>
    </aside>
  );
}

export default function AdminApp({ me, installPrompt, onInstallDone, onShopUpdated, onLogout }: {
  me: Me;
  installPrompt: BeforeInstallPromptEvent | null;
  onInstallDone: () => void;
  onShopUpdated: (shop: Shop) => void;
  onLogout: () => void;
}) {
  const savedID = Number(localStorage.getItem("radif_shop_id"));
  const [shopID, setShopID] = useState(me.shops.some((shop) => shop.id === savedID) ? savedID : me.shops[0]?.id);
  const [creating, setCreating] = useState(false);
  const [readOnlyMessage, setReadOnlyMessage] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (!me.shops.length) {
    return (
      <div className="app-viewport grid place-items-center px-6 text-center text-ink">
        <div>
          <Store className="mx-auto size-9 text-ink/70" />
          <h1 className="mt-4 text-xl font-black">فروشگاه فعالی ندارید</h1>
          <p className="mt-2 text-sm leading-7 text-ink/70">برای ادامه، اطلاعات فروشگاه باید در داده‌های اولیه فعال شود.</p>
          <button
            className="secondary-button mx-auto mt-6"
            onClick={async () => {
              await api<void>("/api/session", { method: "DELETE" });
              onLogout();
              navigate("/login", { replace: true });
            }}
          >
            خروج از حساب
          </button>
        </div>
      </div>
    );
  }

  const selected = me.shops.find((shop) => shop.id === shopID) ?? me.shops[0];
  function changeShop(id: number) {
    setShopID(id);
    localStorage.setItem("radif_shop_id", String(id));
    navigate(location.pathname.startsWith("/products") ? "/products" : location.pathname === "/report" ? "/report" : "/orders");
  }
  async function logout() {
    await api<void>("/api/session", { method: "DELETE" });
    onLogout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-viewport relative min-h-dvh text-ink sm:min-h-[760px]">
      <ShopSwitcher shops={me.shops} selected={selected} onChange={changeShop} disabled={creating} />
      {selected.subscriptionState === "inactive" ? <aside className="mx-5 mt-4 rounded-2xl bg-error/10 p-3 text-sm font-bold text-error">دوره آزمایشی تمام شده. <a className="underline underline-offset-4" href="https://wa.me/989362507047" target="_blank" rel="noreferrer">فعال‌سازی در واتساپ</a></aside> : selected.subscriptionState === "trial" ? <aside className="mx-5 mt-4 rounded-2xl bg-saffron/15 p-3 text-sm font-bold text-ink">{persianNumber(selected.trialDaysRemaining ?? 0)} روز تا پایان دوره‌ی آزمایشی.</aside> : null}
      {readOnlyMessage && <p className="mx-5 mt-3 text-center text-sm font-bold text-error">برای انجام تغییرات، دسترسی فروشگاه را از واتساپ فعال کنید.</p>}
      <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]" onSubmitCapture={(event) => { if (selected.subscriptionState === "inactive") { event.preventDefault(); setReadOnlyMessage(true); } }} onClickCapture={(event) => { const button = (event.target as HTMLElement).closest("button"); if (selected.subscriptionState === "inactive" && button && !button.hasAttribute("data-allow-inactive")) { event.preventDefault(); event.stopPropagation(); setReadOnlyMessage(true); } }}>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/orders" element={<OrdersPage shop={selected} />} />
            <Route path="/orders/new" element={<CreateOrderPage key={selected.id} shop={selected} onBusyChange={setCreating} />} />
            <Route path="/orders/import" element={<HistoricalOrderPage key={selected.id} shop={selected} onBusyChange={setCreating} />} />
            <Route path="/orders/:orderID" element={<AdminOrderPage shops={me.shops} />} />
            <Route path="/products" element={<ProductsPage key={selected.id} shop={selected} />} />
            <Route path="/products/new" element={<ProductFormPage key={selected.id} shop={selected} mode="create" />} />
            <Route path="/products/:productID/edit" element={<ProductFormPage key={`${selected.id}-${location.pathname}`} shop={selected} mode="edit" />} />
            <Route path="/report" element={<ReportPage key={selected.id} shop={selected} />} />
            <Route path="/account" element={<AccountPage me={me} shop={selected} onShopUpdated={onShopUpdated} onLogout={logout} />} />
            <Route path="*" element={<Navigate to="/orders/new" replace />} />
          </Routes>
        </Suspense>
      </main>
      <InstallPrompt event={installPrompt} onDone={onInstallDone} />
      <BottomNavigation disabled={creating} />
    </div>
  );
}
