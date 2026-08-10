import { ArrowRight, BookOpenText, CheckCircle2, ChevronDown, ClipboardCheck, LoaderCircle, Package, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { NavLink } from "react-router";
import { ErrorNotice, ProductChoices, ReceiptPicker, type SelectedOrderItem } from "../components";
import DeliveryDateSelect from "../DeliveryDateSelect";
import { adminStatusLabels, api, normalizeDigits, normalizeIranianMobile, persianDate, persianDigits, persianNumber, pilotFailureReason, randomID, readLastSalesChannel, rememberSalesChannel, salesChannelLabels, salesChannels, sendPilotEvent, type CreatedOrder, type Product, type SalesChannel, type Shop } from "../shared";

const importStatuses = ["waiting_payment", "paid", "preparing", "shipped", "cancelled"];
const emptyCustomer = { fullName: "", mobile: "", address: "", postalCode: "" };

function newHistoricalCreateKey(shopID: number) {
  const storageKey = `radif_historical_create_key_${shopID}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const key = randomID();
  sessionStorage.setItem(storageKey, key);
  return key;
}

function StepHeading({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink font-black text-white">{number}</span>
      <div><h2 className="font-black">{title}</h2><p className="mt-1 text-xs leading-6 text-ink/65">{children}</p></div>
    </div>
  );
}

export default function HistoricalOrderPage({ shop, onBusyChange }: { shop: Shop; onBusyChange: (busy: boolean) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [items, setItems] = useState<SelectedOrderItem[]>([]);
  const [amount, setAmount] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [customer, setCustomer] = useState(emptyCustomer);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [status, setStatus] = useState("preparing");
  const [salesChannel, setSalesChannel] = useState<SalesChannel>(readLastSalesChannel);
  const [conversationReference, setConversationReference] = useState("");
  const [note, setNote] = useState("");
  const [createKey, setCreateKey] = useState(() => newHistoricalCreateKey(shop.id));
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedOrder | null>(null);
  const startedKey = useRef("");

  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  useEffect(() => {
    if (!pending) return;
    const preventExit = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
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

  function updateItems(next: SelectedOrderItem[]) {
    if (next.length && startedKey.current !== createKey) {
      startedKey.current = createKey;
      sendPilotEvent(`/api/shops/${shop.id}/pilot-events`, { eventName: "order_create_started", createKey, source: "historical" });
    }
    setItems(next);
    setAmount(String(next.reduce((total, item) => total + item.product.defaultPrice * item.quantity, 0)));
    setError("");
  }

  function recordFailure(reason: "client_validation" | "conflict" | "request" | "network" | "server") {
    sendPilotEvent(`/api/shops/${shop.id}/pilot-events`, { eventName: "order_create_failed", createKey, eventKey: randomID(), reason, source: "historical" });
  }

  function openReview(event: FormEvent) {
    event.preventDefault();
    if (receiptBusy) {
      setError("کمی صبر کنید تا تصویر رسید آماده شود.");
      recordFailure("client_validation");
      return;
    }
    if (status === "waiting_payment" && !receipt) {
      setError("برای وضعیت در انتظار تأیید پرداخت، تصویر رسید را انتخاب کنید.");
      recordFailure("client_validation");
      return;
    }
    const numericAmount = Number(amount);
    const mobile = normalizeIranianMobile(customer.mobile);
    const postalCode = normalizeDigits(customer.postalCode);
    if (!items.length || !Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setError("محصول‌ها و مبلغ نهایی سفارش را بررسی کنید.");
      recordFailure("client_validation");
      return;
    }
    if (!deliveryDate) {
      setError("تاریخ تحویل را انتخاب کنید.");
      recordFailure("client_validation");
      return;
    }
    if (!customer.fullName.trim() || !customer.address.trim() || !/^09\d{9}$/.test(mobile) || (postalCode !== "" && !/^\d{10}$/.test(postalCode))) {
      setError("نام، شماره موبایل، نشانی و کد پستی مشتری را بررسی کنید.");
      recordFailure("client_validation");
      return;
    }
    setCustomer({ ...customer, mobile, postalCode });
    setError("");
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setItems([]);
    setAmount("");
    setDeliveryDate("");
    setCustomer(emptyCustomer);
    setReceipt(null);
    setStatus("preparing");
    setConversationReference("");
    setNote("");
    const key = randomID();
    sessionStorage.setItem(`radif_historical_create_key_${shop.id}`, key);
    setCreateKey(key);
  }

  async function submit() {
    setPending(true);
    onBusyChange(true);
    setError("");
    const form = new FormData();
    form.append("order", JSON.stringify({
      createKey,
      shopId: shop.id,
      items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      amount: Number(amount),
      estimatedDeliveryDate: deliveryDate,
      status,
      customerFullName: customer.fullName,
      customerMobile: customer.mobile,
      customerAddress: customer.address,
      customerPostalCode: customer.postalCode,
      salesChannel,
      conversationReference,
      internalNote: note,
    }));
    if (receipt) form.append("receipt", receipt);
    try {
      const order = await api<CreatedOrder>("/api/orders/import", { method: "POST", body: form });
      rememberSalesChannel(salesChannel);
      setCreated(order);
      setReviewing(false);
      reset();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      recordFailure(pilotFailureReason(reason));
      setError(reason instanceof Error ? reason.message : "سفارش ثبت نشد. دوباره تلاش کنید.");
    } finally {
      setPending(false);
      onBusyChange(false);
    }
  }

  if (reviewing) return (
    <div>
      <section className="page-content pb-6">
        <button className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-teal" type="button" onClick={() => setReviewing(false)} disabled={pending}>
          <ArrowRight className="size-4" aria-hidden="true" />بازگشت و اصلاح
        </button>
        <div className="historical-cover mt-3 rounded-[2rem] p-6 text-white">
          <p className="text-xs font-black text-saffron">بازخوانی دفتر قدیمی</p>
          <h1 className="mt-2 text-2xl font-black">همه‌چیز درست ثبت شده؟</h1>
          <p className="mt-3 text-sm leading-7 text-white/70">محصول، مبلغ و رسید بعد از ثبت قابل اصلاح نیستند. یک‌بار با مدرک اصلی تطبیق دهید.</p>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-ledger bg-white">
          <div className="border-b border-ledger p-5">
            <p className="text-xs font-bold text-ink/55">محصول‌ها</p>
            {items.map((item) => <p className="mt-2 font-black" key={item.product.id}>{item.product.name} × {persianNumber(item.quantity)}</p>)}
          </div>
          <div className="grid grid-cols-2 divide-x divide-x-reverse divide-ledger border-b border-ledger">
            <div className="p-5"><p className="text-xs font-bold text-ink/55">مبلغ نهایی</p><p className="mt-2 font-black">{persianNumber(amount)} تومان</p></div>
            <div className="p-5"><p className="text-xs font-bold text-ink/55">تاریخ تحویل</p><p className="mt-2 font-black">{persianDate(deliveryDate)}</p></div>
          </div>
          <div className="border-b border-ledger p-5">
            <p className="text-xs font-bold text-ink/55">مشتری</p>
            <p className="mt-2 font-black">{customer.fullName}</p>
            <p className="mt-1 text-sm" dir="ltr">{customer.mobile}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink/75">{customer.address}</p>
            {customer.postalCode && <p className="mt-2 text-sm" dir="ltr">{customer.postalCode}</p>}
          </div>
          <div className="grid grid-cols-2 divide-x divide-x-reverse divide-ledger">
            <div className="p-5"><p className="text-xs font-bold text-ink/55">وضعیت فعلی</p><p className="mt-2 font-black">{adminStatusLabels[status]}</p></div>
            <div className="p-5"><p className="text-xs font-bold text-ink/55">رسید پرداخت</p><p className="mt-2 font-black">{receipt ? "پیوست شده" : "بدون رسید"}</p></div>
          </div>
        </div>
        <div className="mt-4 rounded-3xl bg-ledger/55 p-5 text-sm leading-7">
            <p><strong>کانال فروش:</strong> {salesChannelLabels[salesChannel]}</p>
            {conversationReference.trim() && <p className="mt-2"><strong>مرجع گفتگو:</strong> <span dir="auto">{conversationReference.trim()}</span></p>}
            {note.trim() && <p className="mt-2 whitespace-pre-wrap"><strong>یادداشت داخلی:</strong> {note.trim()}</p>}
        </div>
        {error && <div className="mt-5"><ErrorNotice>{error}</ErrorNotice></div>}
      </section>
      <div className="create-action grid grid-cols-[0.8fr_1.2fr] gap-2">
        <button className="secondary-button" type="button" onClick={() => setReviewing(false)} disabled={pending}>اصلاح</button>
        <button className="primary-button" type="button" onClick={submit} disabled={pending || receiptBusy}>
          {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <ClipboardCheck className="size-5" aria-hidden="true" />}
          {pending ? "در حال ثبت…" : "ثبت سفارش"}
        </button>
      </div>
    </div>
  );

  return (
    <form onSubmit={openReview}>
      <section className="page-content pb-8">
        <NavLink className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-teal" to="/orders/new"><ArrowRight className="size-4" aria-hidden="true" />بازگشت به سفارش جدید</NavLink>
        <div className="historical-cover mt-3 overflow-hidden rounded-[2rem] p-6 text-white shadow-[0_18px_45px_rgb(24_59_78_/_18%)]">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-xs font-black text-saffron">{shop.name}</p><h1 className="mt-2 text-2xl font-black">ثبت سفارش قدیمی</h1></div>
            <span className="grid size-14 shrink-0 -rotate-3 place-items-center rounded-2xl border border-white/20 bg-white/10"><BookOpenText className="size-7 text-saffron" aria-hidden="true" /></span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-7 text-white/72">اطلاعات سفارش را یک‌جا از روی پیام یا دفتر وارد کنید؛ نیازی به بازکردن لینک مشتری نیست.</p>
        </div>

        {created && (
          <div className="mt-5 flex items-center gap-3 rounded-3xl border border-teal/25 bg-teal/8 p-4" aria-live="polite">
            <CheckCircle2 className="size-6 shrink-0 text-teal" aria-hidden="true" />
            <div className="min-w-0 flex-1"><p className="font-black">سفارش ثبت شد</p><p className="mt-1 text-xs text-ink/65">فرم برای سفارش بعدی آماده است.</p></div>
            <NavLink className="min-h-11 content-center px-2 text-sm font-black text-teal" to={`/orders/${created.id}`}>{created.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])}</NavLink>
          </div>
        )}

        <section className="mt-7">
          <StepHeading number="۱" title="محصول‌ها">محصول‌ها و تعدادشان را از روی سفارش قبلی انتخاب کنید.</StepHeading>
          {loading && <div className="mt-4 grid min-h-28 place-items-center rounded-3xl bg-ledger/55"><LoaderCircle className="size-6 animate-spin text-teal" aria-label="در حال دریافت محصول‌ها" /></div>}
          {loadError && <div className="mt-4"><ErrorNotice retry={loadProducts}>{loadError}</ErrorNotice></div>}
          {!loading && !loadError && products.length === 0 && <div className="mt-4 rounded-3xl border border-ledger bg-white p-6 text-center"><Package className="mx-auto size-7 text-ink/60" /><p className="mt-3 font-bold">محصول فعالی پیدا نشد</p></div>}
          {!loading && !loadError && <ProductChoices products={products} items={items} onChange={updateItems} />}
        </section>

        {items.length > 0 && <div className="creation-fields">
          <section className="mt-8 border-r-2 border-ledger pr-4">
            <StepHeading number="۲" title="مبلغ و تحویل">مبلغ واقعی همان سفارش و تاریخ وعده‌داده‌شده را وارد کنید.</StepHeading>
            <label className="mt-5 block" htmlFor="historical-amount">
              <span className="mb-2 block text-sm font-black">مبلغ نهایی سفارش</span>
              <span className="relative block">
                <input id="historical-amount" className="field pl-20 text-lg font-black" inputMode="numeric" value={amountFocused ? amount.replace(/\d/g, (digit) => persianDigits[Number(digit)]) : persianNumber(amount)} onFocus={() => setAmountFocused(true)} onBlur={() => setAmountFocused(false)} onChange={(event) => setAmount(normalizeDigits(event.target.value))} required />
                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-bold text-ink/70">تومان</span>
              </span>
            </label>
            <div className="mt-5">
              <span className="mb-2 block text-sm font-black">تاریخ تحویل</span>
              <DeliveryDateSelect id="historical-delivery-date" value={deliveryDate} onChange={setDeliveryDate} allowPast />
            </div>
          </section>

          <section className="mt-8 border-r-2 border-ledger pr-4">
            <StepHeading number="۳" title="اطلاعات مشتری">این اطلاعات ثبت‌شده محسوب می‌شود و لینک مشتری فقط برای پیگیری خواهد بود.</StepHeading>
            <div className="mt-5 space-y-4">
              <label className="block"><span className="mb-2 block text-sm font-black">نام و نام خانوادگی</span><input className="field" autoComplete="name" maxLength={150} value={customer.fullName} onChange={(event) => setCustomer({ ...customer, fullName: event.target.value })} required /></label>
              <label className="block"><span className="mb-2 block text-sm font-black">شماره موبایل</span><input className="field text-left" type="tel" dir="ltr" autoComplete="tel" value={customer.mobile} onChange={(event) => setCustomer({ ...customer, mobile: event.target.value })} placeholder="09123456789" required /></label>
              <label className="block"><span className="mb-2 block text-sm font-black">نشانی کامل</span><textarea className="field min-h-28 resize-y py-3" autoComplete="street-address" maxLength={2000} value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} required /></label>
              <label className="block"><span className="mb-2 block text-sm font-black">کد پستی <span className="font-normal text-ink/55">(اختیاری)</span></span><input className="field text-left" inputMode="numeric" dir="ltr" autoComplete="postal-code" value={customer.postalCode} onChange={(event) => setCustomer({ ...customer, postalCode: event.target.value })} /></label>
            </div>
          </section>

          <section className="mt-8 border-r-2 border-ledger pr-4">
            <StepHeading number="۴" title="وضعیت و مدرک">وضعیت فعلی را مشخص کنید؛ رسید فقط برای وضعیت در انتظار تأیید پرداخت الزامی است.</StepHeading>
            <fieldset className="mt-5">
              <legend className="text-sm font-black">وضعیت فعلی سفارش</legend>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {importStatuses.map((value) => (
                  <label className="relative flex min-h-14 items-center justify-center rounded-2xl border border-ledger bg-white px-3 text-center text-sm font-bold transition-colors has-checked:border-teal has-checked:bg-teal/8 has-checked:text-teal" key={value}>
                    <input className="peer sr-only" type="radio" name="historical-status" value={value} checked={status === value} onChange={() => setStatus(value)} />
                    <span className="pointer-events-none absolute inset-0 rounded-2xl peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-teal" />
                    <span className="relative">{adminStatusLabels[value]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-5"><ReceiptPicker id="historical-receipt" file={receipt} onChange={setReceipt} onBusyChange={setReceiptBusy} /><p className="mt-2 text-xs text-ink/60">بدون رسید هم می‌توانید سفارش را ثبت کنید، مگر اینکه وضعیت آن در انتظار تأیید پرداخت باشد.</p></div>
            <label className="mt-5 block" htmlFor="historical-sales-channel">
              <span className="mb-2 block text-sm font-black">کانال فروش</span>
              <select id="historical-sales-channel" className="field" value={salesChannel} onChange={(event) => setSalesChannel(event.target.value as SalesChannel)} required>
                {salesChannels.map((channel) => <option key={channel} value={channel}>{salesChannelLabels[channel]}</option>)}
              </select>
            </label>
            <details className="mt-5 rounded-3xl border border-ledger bg-white">
              <summary className="flex min-h-14 list-none items-center justify-between px-4 font-bold"><span>جزئیات اختیاری</span><ChevronDown className="details-chevron size-5 text-ink/70" aria-hidden="true" /></summary>
              <div className="space-y-5 border-t border-ledger p-4">
                <label className="block"><span className="mb-2 block text-sm font-bold">مرجع گفتگو</span><input className="field" dir="auto" maxLength={100} value={conversationReference} onChange={(event) => setConversationReference(event.target.value)} placeholder="نام کاربری، موبایل، نام نمایشی یا هر نشانه دیگر" /></label>
                <label className="block"><span className="mb-2 block text-sm font-bold">یادداشت داخلی</span><textarea className="field min-h-24 resize-y py-3" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
              </div>
            </details>
          </section>
        </div>}

        {error && <div className="mt-5"><ErrorNotice>{error}</ErrorNotice></div>}
      </section>
      <div className="create-action">
        <button className="primary-button w-full" type="submit" disabled={!items.length || pending || loading || receiptBusy}>
          <RotateCcw className="size-5" aria-hidden="true" />بازخوانی و ثبت
        </button>
      </div>
    </form>
  );
}
