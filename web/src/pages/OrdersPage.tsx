import { Archive, ChevronDown, ClipboardList, LoaderCircle, Plus, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { NavLink, useSearchParams } from "react-router";
import { ErrorNotice } from "../components";
import { adminStatusLabels, api, deliveryTiming, persianDate, persianDigits, persianNumber, relativeAge, statusStyles, type OrderSummary, type Shop } from "../shared";

export default function OrdersPage({ shop }: { shop: Shop }) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [activeCount, setActiveCount] = useState<number>();
  const [archivedCount, setArchivedCount] = useState(0);
  const [reload, setReload] = useState(0);
  const listRequest = useRef(0);
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "archive" ? "archive" : "active";
  const search = params.get("q") ?? "";
  const normalizedSearch = search.trim();
  const status = params.get("status") ?? "";
  const deferredSearch = useDeferredValue(normalizedSearch);
  const activeStatuses = ["waiting_info", "waiting_payment", "paid", "preparing"];
  const archiveStatuses = ["shipped", "cancelled"];
  const requestedSort = params.get("sort");
  const allowedSorts = normalizedSearch ? ["due", "updated", "recent", "amount"] : view === "archive" ? ["updated", "recent", "amount"] : ["due", "recent", "amount"];
  const queryAllowedSorts = deferredSearch ? ["due", "updated", "recent", "amount"] : view === "archive" ? ["updated", "recent", "amount"] : ["due", "recent", "amount"];
  const defaultSort = normalizedSearch || view === "archive" ? "updated" : "due";
  const queryDefaultSort = deferredSearch || view === "archive" ? "updated" : "due";
  const querySort = requestedSort && queryAllowedSorts.includes(requestedSort) ? requestedSort : queryDefaultSort;
  const sort = requestedSort && allowedSorts.includes(requestedSort) ? requestedSort : defaultSort;
  const invalidSort = Boolean(requestedSort && !allowedSorts.includes(requestedSort));
  const shownStatuses = normalizedSearch ? Object.keys(adminStatusLabels) : view === "archive" ? archiveStatuses : activeStatuses;
  const invalidStatus = Boolean(status && !shownStatuses.includes(status));

  useEffect(() => {
    if (!params.has("delivery") && !invalidSort && !invalidStatus) return;
    const next = new URLSearchParams(params);
    next.delete("delivery");
    if (invalidSort) next.delete("sort");
    if (invalidStatus) next.delete("status");
    setParams(next, { replace: true });
  }, [invalidSort, invalidStatus, params, setParams]);

  function setFilter(name: "q" | "status" | "sort", value: string) {
    const next = new URLSearchParams(params);
    if (value && (name !== "q" || value.trim())) next.set(name, value); else next.delete(name);
    if (name === "q" && !value.trim()) {
      const allowed = view === "archive" ? archiveStatuses : activeStatuses;
      if (status && !allowed.includes(status)) next.delete("status");
      if (view === "archive" && next.get("sort") === "due") next.delete("sort");
      if (view === "active" && next.get("sort") === "updated") next.delete("sort");
    }
    setParams(next, { replace: true });
  }

  function setView(nextView: "active" | "archive") {
    const next = new URLSearchParams(params);
    if (nextView === "archive") next.set("view", "archive"); else next.delete("view");
    next.delete("status");
    next.delete("delivery");
    next.delete("sort");
    setParams(next, { replace: true });
  }

  function clearFilters() { setParams(view === "archive" ? { view: "archive" } : {}, { replace: true }); }

  function orderQuery(offset = 0) {
    const query = new URLSearchParams({ shopId: String(shop.id), view: deferredSearch ? "all" : view, sort: querySort });
    if (deferredSearch) query.set("q", deferredSearch);
    if (status && !invalidStatus) query.set("status", status);
    if (offset) query.set("offset", String(offset));
    return query;
  }

  useEffect(() => {
    const controller = new AbortController();
    const request = ++listRequest.current;
    setLoading(true);
    setLoadingMore(false);
    setError("");
    setOrders([]);
    setHasMore(false);
    setActiveCount(undefined);
    setArchivedCount(0);
    api<{ orders: OrderSummary[]; hasMore: boolean; activeCount: number; archivedCount: number }>(`/api/orders?${orderQuery()}`, { signal: controller.signal })
      .then((response) => {
        if (request !== listRequest.current) return;
        setOrders(response.orders);
        setHasMore(response.hasMore);
        setActiveCount(response.activeCount);
        setArchivedCount(response.archivedCount);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        if (request !== listRequest.current) return;
        setError(reason instanceof Error ? reason.message : "سفارش‌ها دریافت نشدند.");
      })
      .finally(() => { if (!controller.signal.aborted && request === listRequest.current) setLoading(false); });
    return () => { controller.abort(); if (request === listRequest.current) listRequest.current++; };
  }, [deferredSearch, querySort, shop.id, status, view, reload]);

  async function loadMore() {
    const request = listRequest.current;
    setLoadingMore(true);
    setError("");
    try {
      const response = await api<{ orders: OrderSummary[]; hasMore: boolean; activeCount: number; archivedCount: number }>(`/api/orders?${orderQuery(orders.length)}`);
      if (request !== listRequest.current) return;
      setOrders((current) => [...current, ...response.orders]);
      setHasMore(response.hasMore);
      setActiveCount(response.activeCount);
      setArchivedCount(response.archivedCount);
    } catch (reason) {
      if (request !== listRequest.current) return;
      setError(reason instanceof Error ? reason.message : "سفارش‌های بیشتر دریافت نشدند.");
    } finally {
      if (request === listRequest.current) setLoadingMore(false);
    }
  }

  const compact = Boolean(normalizedSearch) || view === "archive";
  const filtered = Boolean(normalizedSearch || (status && !invalidStatus));
  const emptyDescription = filtered
    ? "عبارت جستجو یا فیلترها را تغییر دهید."
    : view === "archive"
      ? "سفارش‌های ارسال‌شده و لغوشده اینجا می‌آیند."
      : archivedCount > 0
        ? "فعلاً سفارش در جریانی ندارید."
        : "از سفارش جدید شروع کنید.";

  return (
    <section className="page-content">
      <p className="page-kicker">{shop.name}</p>
      <h1 className="page-title">سفارش‌ها</h1>
      <div className="relative mt-5 rounded-2xl border border-ledger bg-white shadow-sm transition focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/10">
        <Search className="pointer-events-none absolute right-4 top-4 size-5 text-ink/70" aria-hidden="true" />
        <input
          className="min-h-13 w-full bg-transparent pr-12 pl-12 text-sm font-bold text-ink outline-none placeholder:font-medium placeholder:text-ink/70"
          type="text"
          role="searchbox"
          value={search}
          onChange={(event) => setFilter("q", event.target.value)}
          placeholder="نام، موبایل، کد سفارش یا مرجع گفتگو"
          aria-label="جستجوی سفارش"
        />
        {search && (
          <button
            className="absolute inset-y-0 left-1 grid w-11 place-items-center rounded-xl text-ink/70 transition hover:text-ink focus-visible:outline-2 focus-visible:outline-teal"
            type="button"
            onClick={() => setFilter("q", "")}
            aria-label="پاک‌کردن جستجو"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {normalizedSearch ? (
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-teal/20 bg-teal/8 px-4 text-sm font-bold text-teal">
          <span className="flex items-center gap-2"><Search className="size-4" aria-hidden="true" />نتایج از در جریان و بایگانی</span>
          <button className="min-h-9 shrink-0 rounded-xl px-2 text-xs font-black focus-visible:outline-2 focus-visible:outline-teal" type="button" onClick={() => setFilter("q", "")}>پاک کردن</button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-[1.35rem] border border-ink/10 bg-white p-1.5 shadow-sm" role="group" aria-label="نمای سفارش‌ها">
          <button
            className={
              "flex min-h-12 items-center justify-center gap-2 rounded-2xl px-2 text-sm font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal "
              + (view === "active" ? "bg-ink text-white shadow-md" : "text-ink/70 hover:bg-ledger/60 hover:text-ink")
            }
            type="button"
            aria-pressed={view === "active"}
            onClick={() => setView("active")}
          >
            در جریان
            {activeCount !== undefined && (
              <span className={`rounded-full px-2 py-0.5 text-xs ${view === "active" ? "bg-saffron text-ink" : "bg-ledger text-ink/70"}`}>
                {persianNumber(activeCount)}
              </span>
            )}
          </button>
          <button
            className={
              "flex min-h-12 items-center justify-center rounded-2xl px-2 text-sm font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal "
              + (view === "archive" ? "bg-ink text-white shadow-md" : "text-ink/70 hover:bg-ledger/60 hover:text-ink")
            }
            type="button"
            aria-pressed={view === "archive"}
            onClick={() => setView("archive")}
          >
            بایگانی
          </button>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 border-b border-ledger pb-3">
        <div className="min-w-0">
          <p className="text-sm font-black">{normalizedSearch ? "نتایج جستجو" : view === "archive" ? "سفارش‌های پایان‌یافته" : "صف سفارش‌های در جریان"}</p>
          <p className="mt-0.5 truncate text-xs font-bold text-ink/70">{status ? adminStatusLabels[status] : "همه وضعیت‌ها"}</p>
        </div>
        <div className="relative shrink-0">
          <select
            className={
              "min-h-11 appearance-none rounded-xl border border-ledger bg-white py-2 pr-3 pl-9 text-sm font-black text-ink "
              + "outline-none transition focus:border-teal focus:ring-3 focus:ring-teal/10"
            }
            value={sort}
            onChange={(event) => setFilter("sort", event.target.value === defaultSort ? "" : event.target.value)}
            aria-label="ترتیب سفارش‌ها"
          >
            {(view === "active" || normalizedSearch) && <option value="due">نزدیک‌ترین تحویل</option>}
            {(view === "archive" || normalizedSearch) && <option value="updated">آخرین تغییر</option>}
            <option value="recent">جدیدترین سفارش</option>
            <option value="amount">بیشترین مبلغ</option>
          </select>
          <ChevronDown className="pointer-events-none absolute left-3 top-3.5 size-4 text-ink/70" aria-hidden="true" />
        </div>
      </div>
      <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 py-1.5" role="group" aria-label="فیلتر وضعیت">
        {["", ...shownStatuses].map((value) => (
          <button
            className={
              "min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal "
              + (status === value ? "border-ink bg-ink text-white shadow-sm" : "border-ledger bg-white text-ink/70 hover:border-ink/30 hover:text-ink")
            }
            key={value || "all"}
            type="button"
            aria-pressed={status === value}
            onClick={() => setFilter("status", value)}
          >
            {value ? adminStatusLabels[value] : "همه"}
          </button>
        ))}
      </div>
      {loading && <div className="grid min-h-40 place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت سفارش‌ها" /></div>}
      {!loading && error && <div className="mt-5"><ErrorNotice retry={() => setReload((value) => value + 1)}>{error}</ErrorNotice></div>}
      {!loading && orders.length > 0 && (
        <div className="mt-4 space-y-3">
          {orders.map((order) => {
            const paymentLabel = !order.initialPaymentAmount
              ? ""
              : order.finalPaymentConfirmed
                ? "تسویه دو مرحله‌ای"
                : order.finalReceiptUploaded
                  ? "رسید نهایی آماده بررسی"
                  : order.finalPaymentRequested
                    ? "منتظر رسید نهایی"
                    : "پرداخت دو مرحله‌ای";
            if (compact) {
              return (
                <NavLink
                  className={`block rounded-2xl border-r-4 bg-white p-4 text-ink no-underline shadow-sm ${statusStyles[order.status]?.rail ?? "border-ink"}`}
                  key={order.id}
                  to={`/orders/${order.id}${params.toString() ? `?${params}` : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold text-ink/65">{order.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])} · آخرین تغییر {relativeAge(order.updatedAt)}</p>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusStyles[order.status]?.chip ?? "bg-ledger"}`}>{order.initialPaymentAmount && order.status === "paid" ? "پرداخت اول تأیید شده" : adminStatusLabels[order.status] ?? order.status}</span>
                  </div>
                  <p className="mt-2 truncate font-black">{order.productSummary}</p>
                  <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                    <span className={`truncate font-bold ${order.customerSubmitted ? "text-ink/70" : "text-error"}`}>
                      {order.customerSubmitted ? order.customerFullName : "اطلاعات مشتری ثبت نشده"}
                    </span>
                    <strong className="shrink-0">{persianNumber(order.amount)} تومان</strong>
                  </div>
                  {paymentLabel && <p className={`mt-2 text-xs font-black ${order.finalReceiptUploaded && !order.finalPaymentConfirmed ? "text-saffron" : order.finalPaymentConfirmed ? "text-teal" : "text-ink/55"}`}>{paymentLabel}</p>}
                </NavLink>
              );
            }
            const timing = deliveryTiming(order.estimatedDeliveryDate);
            return (
              <NavLink
                className={`block rounded-2xl border-r-4 bg-white p-4 text-ink no-underline shadow-sm ${statusStyles[order.status]?.rail ?? "border-ink"}`}
                key={order.id}
                to={`/orders/${order.id}${params.toString() ? `?${params}` : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink/70">{order.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])} · {relativeAge(order.createdAt)}</p>
                    <p className="mt-1 truncate font-black">{order.productSummary}</p>
                    <p className={`mt-1 truncate text-sm font-bold ${order.customerSubmitted ? "text-ink/75" : "text-error"}`}>
                      {order.customerSubmitted ? order.customerFullName : "اطلاعات مشتری ثبت نشده"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusStyles[order.status]?.chip ?? "bg-ledger"}`}>{order.initialPaymentAmount && order.status === "paid" ? "پرداخت اول تأیید شده" : adminStatusLabels[order.status] ?? order.status}</span>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3 border-t border-ledger pt-3 text-sm">
                  <span>
                    <span className="block text-xs text-ink/70">تحویل</span>
                    <strong>{persianDate(order.estimatedDeliveryDate)}</strong>
                    <span
                      className={
                        "mt-1 block w-fit rounded-full px-2 py-0.5 text-xs font-bold "
                        + (timing.days < 0 ? "bg-error/10 text-error" : timing.days <= 7 ? "bg-saffron/15 text-ink" : "bg-ledger text-ink/70")
                      }
                    >
                      {timing.label}
                    </span>
                  </span>
                  <span className="text-left">
                    <strong>{persianNumber(order.amount)} تومان</strong>
                    <span className="mt-1 flex max-w-48 flex-wrap justify-end gap-x-2 gap-y-1 text-xs text-ink/65">{paymentLabel && <span className={order.finalReceiptUploaded && !order.finalPaymentConfirmed ? "font-black text-saffron" : ""}>{paymentLabel}</span>}{order.receiptUploaded && !order.initialPaymentAmount && <span>رسید دارد</span>}{order.hasTrackingCode && <span>کد رهگیری دارد</span>}</span>
                  </span>
                </div>
              </NavLink>
            );
          })}
          {hasMore && (
            <button className="secondary-button w-full" type="button" disabled={loadingMore} onClick={loadMore}>
              {loadingMore && <LoaderCircle className="size-5 animate-spin" />}
              {loadingMore ? "در حال دریافت…" : "نمایش سفارش‌های بیشتر"}
            </button>
          )}
        </div>
      )}
      {!loading && !error && orders.length === 0 && (
        <div className="flex min-h-72 flex-col justify-center text-center">
          {view === "archive" && !filtered ? <Archive className="mx-auto size-10 text-teal" aria-hidden="true" /> : <ClipboardList className="mx-auto size-10 text-teal" aria-hidden="true" />}
          <h2 className="mt-4 text-xl font-black">
            {filtered ? "سفارشی با این فیلتر پیدا نشد" : view === "archive" ? "بایگانی خالی است" : archivedCount > 0 ? "همه سفارش‌ها رسیدگی شده‌اند" : "هنوز سفارشی ساخته نشده"}
          </h2>
          <p className="mt-2 text-sm text-ink/70">{emptyDescription}</p>
          {filtered ? (
            <button className="secondary-button mx-auto mt-6" type="button" onClick={clearFilters}>پاک‌کردن فیلترها</button>
          ) : view === "archive" ? (
            <button className="secondary-button mx-auto mt-6" type="button" onClick={() => setView("active")}>بازگشت به سفارش‌های در جریان</button>
          ) : archivedCount > 0 ? (
            <button className="secondary-button mx-auto mt-6" type="button" onClick={() => setView("archive")}><Archive className="size-5" />مشاهده بایگانی</button>
          ) : (
            <NavLink className="primary-button mx-auto mt-6" to="/orders/new"><Plus className="size-5" />ساخت سفارش جدید</NavLink>
          )}
        </div>
      )}
    </section>
  );
}
