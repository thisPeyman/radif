import { ArchiveRestore, CalendarDays, ChevronDown, Clipboard, ClipboardCheck, LoaderCircle, Package, Plus, Share2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink } from "react-router";
import { ErrorNotice, ProductChoices, type SelectedOrderItem } from "../components";
import DeliveryDateSelect from "../DeliveryDateSelect";
import { addWorkingDays, api, normalizeDigits, orderShareMessage, persianDate, persianDigits, persianNumber, pilotFailureReason, randomID, readLastSalesChannel, rememberSalesChannel, salesChannelLabels, salesChannels, sendPilotEvent, todayISO, type CreatedOrder, type Product, type SalesChannel, type Shop } from "../shared";

function newCreateKey(shopID: number) {
  const storageKey = `radif_create_key_${shopID}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const key = randomID();
  sessionStorage.setItem(storageKey, key);
  return key;
}

function halfAmount(amount: number) {
  return amount > 1 ? String(Math.ceil(amount / 2)) : "";
}

export default function CreateOrderPage({ shop, onBusyChange }: { shop: Shop; onBusyChange: (busy: boolean) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [items, setItems] = useState<SelectedOrderItem[]>([]);
  const [amount, setAmount] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);
  const [splitPayment, setSplitPayment] = useState(false);
  const [initialPaymentAmount, setInitialPaymentAmount] = useState("");
  const [initialPaymentFocused, setInitialPaymentFocused] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [workDays, setWorkDays] = useState(0);
  const [salesChannel, setSalesChannel] = useState<SalesChannel>(readLastSalesChannel);
  const [conversationReference, setConversationReference] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [initialPaymentError, setInitialPaymentError] = useState("");
  const [deliveryDateError, setDeliveryDateError] = useState("");
  const [created, setCreated] = useState<CreatedOrder | null>(null);
  const [editingDeliveryDate, setEditingDeliveryDate] = useState(false);
  const [updatedDeliveryDate, setUpdatedDeliveryDate] = useState("");
  const [deliveryUpdatePending, setDeliveryUpdatePending] = useState(false);
  const [deliveryUpdateError, setDeliveryUpdateError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "shared" | "failed">("idle");
  const [linkCopyState, setLinkCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const startedAt = useRef(performance.now());
  const [createKey, setCreateKey] = useState(() => newCreateKey(shop.id));
  const canShare = typeof navigator.share === "function";
  const deliveryDateHelp = workDays > 0 ? `${persianNumber(workDays)} روز کاری از امروز` : deliveryDate ? "" : "تاریخ وعده‌داده‌شده به مشتری را انتخاب کنید.";
  const itemsTotal = items.reduce((sum, item) => sum + item.product.defaultPrice * item.quantity, 0);

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

  useEffect(() => {
    sendPilotEvent(`/api/shops/${shop.id}/pilot-events`, { eventName: "order_create_started", createKey, source: "normal" });
  }, [createKey, shop.id]);

  function updateItems(next: SelectedOrderItem[]) {
    const total = next.reduce((sum, item) => sum + item.product.defaultPrice * item.quantity, 0);
    setItems(next);
    setAmount(String(total));
    if (splitPayment) setInitialPaymentAmount(halfAmount(total));
    setAmountError("");
    setInitialPaymentError("");
    setError("");
  }

  async function recordCopy(order: CreatedOrder, method: "clipboard" | "native_share") {
    const path = `/api/orders/${order.id}/link-copied`;
    const body = JSON.stringify({ method, source: "create", eventKey: randomID() });
    try {
      await api<void>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    } catch {
      navigator.sendBeacon(path, new Blob([body], { type: "application/json" }));
    }
  }

  function shareMessage(order: CreatedOrder) {
    return orderShareMessage(shop, order, Number(amount));
  }

  async function copyMessage(order: CreatedOrder, showState = true) {
    if (showState) setCopyState("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(shareMessage(order));
      if (showState) setCopyState("copied");
      await recordCopy(order, "clipboard").catch(() => undefined);
    } catch { setCopyState("failed"); }
  }

  async function copyCustomerLink(order: CreatedOrder) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(order.customerUrl);
      setLinkCopyState("copied");
      await recordCopy(order, "clipboard").catch(() => undefined);
    } catch { setLinkCopyState("failed"); }
  }

  async function shareOrder(order: CreatedOrder) {
    if (!canShare) { await copyMessage(order); return; }
    try {
      await navigator.share({ text: shareMessage(order) });
      setCopyState("shared");
      await recordCopy(order, "native_share").catch(() => undefined);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      await copyMessage(order);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!items.length || !Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setAmountError("مبلغ سفارش را به‌صورت یک عدد بزرگ‌تر از صفر وارد کنید.");
      sendPilotEvent(`/api/shops/${shop.id}/pilot-events`, { eventName: "order_create_failed", createKey, eventKey: randomID(), reason: "client_validation", source: "normal" });
      return;
    }
    const numericInitialPayment = Number(initialPaymentAmount);
    if (splitPayment && (!Number.isSafeInteger(numericInitialPayment) || numericInitialPayment <= 0 || numericInitialPayment >= numericAmount)) {
      setInitialPaymentError("مبلغ پرداخت اول باید بیشتر از صفر و کمتر از مبلغ سفارش باشد.");
      sendPilotEvent(`/api/shops/${shop.id}/pilot-events`, { eventName: "order_create_failed", createKey, eventKey: randomID(), reason: "client_validation", source: "normal" });
      return;
    }
    if (!deliveryDate || deliveryDate < todayISO()) {
      setDeliveryDateError("تاریخ تحویل را برای امروز یا یکی از روزهای بعد انتخاب کنید.");
      sendPilotEvent(`/api/shops/${shop.id}/pilot-events`, { eventName: "order_create_failed", createKey, eventKey: randomID(), reason: "client_validation", source: "normal" });
      return;
    }
    setAmountError("");
    setInitialPaymentError("");
    setDeliveryDateError("");
    setPending(true);
    onBusyChange(true);
    setError("");
    let resolveReserved: ((value: Blob) => void) | undefined;
    let rejectReserved: ((reason?: unknown) => void) | undefined;
    let reservedCopy: Promise<void> | undefined;
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        const content = new Promise<Blob>((resolve, reject) => { resolveReserved = resolve; rejectReserved = reject; });
        reservedCopy = navigator.clipboard.write([new ClipboardItem({ "text/plain": content })]);
        void reservedCopy.catch(() => undefined);
      } catch { reservedCopy = undefined; }
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
          ...(splitPayment ? { initialPaymentAmount: numericInitialPayment } : {}),
          estimatedDeliveryDate: deliveryDate,
          salesChannel,
          conversationReference,
          internalNote: note,
          elapsedMs: Math.round(performance.now() - startedAt.current),
        }),
      });
      sessionStorage.removeItem(`radif_create_key_${shop.id}`);
      rememberSalesChannel(salesChannel);
      setCreated(order);
      if (reservedCopy && resolveReserved) {
        resolveReserved(new Blob([shareMessage(order)], { type: "text/plain" }));
        try { await reservedCopy; await recordCopy(order, "clipboard").catch(() => undefined); } catch { await copyMessage(order, false); }
      } else { await copyMessage(order, false); }
    } catch (reason) {
      rejectReserved?.(reason);
      sendPilotEvent(`/api/shops/${shop.id}/pilot-events`, { eventName: "order_create_failed", createKey, eventKey: randomID(), reason: pilotFailureReason(reason), source: "normal" });
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
    setSplitPayment(false);
    setInitialPaymentAmount("");
    setDeliveryDate("");
    setWorkDays(0);
    setConversationReference("");
    setNote("");
    setCreated(null);
    setError("");
    setAmountError("");
    setInitialPaymentError("");
    setDeliveryDateError("");
    setEditingDeliveryDate(false);
    setDeliveryUpdateError("");
    setCopyState("idle");
    setLinkCopyState("idle");
    const key = randomID();
    sessionStorage.setItem(`radif_create_key_${shop.id}`, key);
    setCreateKey(key);
    startedAt.current = performance.now();
  }

  if (created) return (
    <section className="page-content flex min-h-[70dvh] flex-col justify-center" aria-live="polite">
      <span className="grid size-16 place-items-center rounded-3xl bg-teal text-white"><ClipboardCheck className="size-8" strokeWidth={1.8} aria-hidden="true" /></span>
      <p className="page-kicker mt-6">{created.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])}</p><h1 className="page-title mt-1">سفارش ساخته شد</h1>
      <p className="mt-3 leading-7 text-ink/70">لینک مشتری آماده است. پیام را بفرستید یا کپی کنید.</p>
      <div className="mt-5 rounded-2xl bg-ledger/70 p-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="size-5 shrink-0 text-teal" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ink/70">تاریخ تحویل</p>
            <p className="mt-1 font-black">{persianDate(created.estimatedDeliveryDate)}</p>
          </div>
          {!editingDeliveryDate && (
            <button
              className="min-h-11 px-2 text-sm font-black text-teal"
              type="button"
              onClick={() => {
                setUpdatedDeliveryDate(created.estimatedDeliveryDate);
                setEditingDeliveryDate(true);
              }}
            >
              تغییر
            </button>
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
      <section className="mt-5 overflow-hidden rounded-3xl border border-teal/20 bg-white shadow-sm" aria-label="ارسال پیام سفارش">
        <div className="flex items-center justify-between gap-3 bg-teal/6 p-4">
          <div>
            <p className="font-black">پیام سفارش آماده است</p>
            <p className="mt-1 text-xs leading-5 text-ink/60">شامل لینک و مشخصات سفارش برای مشتری</p>
          </div>
          {copyState !== "idle" && <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${copyState === "failed" ? "bg-error/10 text-error" : "bg-white text-teal"}`} role="status">
            {copyState === "copying" ? "در حال کپی…" : copyState === "copied" ? "کپی شد" : copyState === "shared" ? "ارسال شد" : "کپی نشد"}
          </span>}
        </div>
        <div className={`grid gap-2 border-t border-dashed border-teal/20 p-3 ${canShare ? "grid-cols-2" : ""}`}>
          <button className="secondary-button min-h-11 w-full" type="button" onClick={() => copyMessage(created)} disabled={copyState === "copying"}>
            {copyState === "copying" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : copyState === "copied" ? <ClipboardCheck className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}
            {copyState === "copied" ? "پیام کپی شد" : "کپی پیام"}
          </button>
          {canShare && <button className="secondary-button min-h-11 w-full border-teal/25 text-teal" type="button" onClick={() => shareOrder(created)}><Share2 className="size-4" aria-hidden="true" />ارسال</button>}
        </div>
      </section>
      <div className="mt-3 rounded-2xl border border-ledger bg-ledger/35 p-3">
        <label className="text-sm font-bold" htmlFor="customer-link">لینک مشتری</label>
        <input id="customer-link" className="field mt-2 text-left text-sm" dir="ltr" readOnly value={created.customerUrl} onFocus={(event) => event.currentTarget.select()} />
        <button className="secondary-button mt-2 min-h-11 w-full" type="button" onClick={() => copyCustomerLink(created)}>
          {linkCopyState === "copied" ? <ClipboardCheck className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}
          {linkCopyState === "copied" ? "لینک کپی شد" : "کپی لینک"}
        </button>
        {linkCopyState === "failed" && <p className="mt-2 text-xs font-bold text-error" role="status">کپی لینک انجام نشد؛ متن کادر را انتخاب کنید.</p>}
      </div>
      <button className="secondary-button mt-8 w-full" type="button" onClick={reset} disabled={pending}>
        <Plus className="size-5" aria-hidden="true" />
        ساخت سفارش دیگر
      </button>
      <NavLink className={`secondary-button mt-3 w-full ${pending ? "pointer-events-none opacity-45" : ""}`} aria-disabled={pending} to={`/orders/${created.id}`}>مشاهده و ویرایش سفارش</NavLink>
      <NavLink className={`secondary-button mt-3 w-full ${pending ? "pointer-events-none opacity-45" : ""}`} aria-disabled={pending} to="/orders">رفتن به سفارش‌ها</NavLink>
    </section>
  );

  return (
    <form onSubmit={submit}>
      <section className="page-content pb-8">
        <p className="page-kicker">{shop.name}</p>
        <h1 className="page-title">سفارش جدید</h1>
        <p className="mt-2 text-sm leading-7 text-ink/70">یک یا چند محصول را انتخاب کنید؛ مبلغ آماده است و لینک با یک لمس ساخته می‌شود.</p>
        <NavLink className="mt-4 flex min-h-14 items-center gap-3 rounded-2xl border border-ink/10 bg-ledger/55 px-4 text-sm font-black text-ink no-underline" to="/orders/import">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-white"><ArchiveRestore className="size-4" aria-hidden="true" /></span>
          <span className="flex-1">ثبت سفارش‌های قدیمی</span>
          <span className="text-xs text-teal">ورود سریع</span>
        </NavLink>
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
          <ProductChoices products={products} items={items} onChange={updateItems} />
        </fieldset>

        {items.length > 0 && <div className="creation-fields mt-7">
          <label className="block" htmlFor="amount">
            <span className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm font-black">
              مبلغ نهایی سفارش
              <span className="text-xs font-bold text-ink/50">قیمت محصول‌ها: {persianNumber(itemsTotal)} تومان</span>
            </span>
            <span className="relative block">
              <input
                id="amount"
                className={`field pl-20 text-lg font-black ${Number(amount) > 0 && Number(amount) < itemsTotal ? "border-teal! bg-teal/5!" : ""}`}
                inputMode="numeric"
                value={amountFocused ? amount.replace(/\d/g, (digit) => persianDigits[Number(digit)]) : persianNumber(amount)}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
                onChange={(event) => {
                  const value = normalizeDigits(event.target.value);
                  setAmount(value);
                  if (splitPayment) setInitialPaymentAmount(halfAmount(Number(value)));
                }}
                aria-describedby={amountError ? "amount-unit amount-help amount-error" : "amount-unit amount-help"}
                aria-invalid={Boolean(amountError)}
                required
              />
              <span id="amount-unit" className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-bold text-ink/70">تومان</span>
            </span>
            {amountError && <span id="amount-error" className="mt-2 block text-sm font-bold text-error" role="alert">{amountError}</span>}
            <span id="amount-help" className={`mt-2 flex min-h-7 items-center text-xs font-bold ${Number(amount) > 0 && Number(amount) < itemsTotal ? "text-teal" : "text-ink/55"}`}>
              {Number(amount) > 0 && Number(amount) < itemsTotal
                ? <span className="rounded-full bg-teal/10 px-3 py-1">{persianNumber(itemsTotal - Number(amount))} تومان تخفیف اعمال شد</span>
                : "برای اعمال تخفیف، مبلغ نهایی را کمتر کنید."}
            </span>
          </label>
          <div className="mt-5 rounded-3xl border border-teal/20 bg-white p-4 shadow-sm">
            <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4" htmlFor="split-payment">
              <span>
                <span className="block text-sm font-black">پرداخت در دو مرحله</span>
                <span className="mt-1 block text-xs leading-6 text-ink/65">بخشی اکنون و باقی‌مانده پس از آماده‌شدن سفارش</span>
              </span>
              <input
                id="split-payment"
                className="size-5 accent-teal"
                type="checkbox"
                checked={splitPayment}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSplitPayment(checked);
                  setInitialPaymentError("");
                  if (checked) setInitialPaymentAmount(halfAmount(Number(amount)));
                }}
              />
            </label>
            {splitPayment && (
              <div className="mt-4 border-t border-dashed border-teal/25 pt-4">
                <label className="block" htmlFor="initial-payment-amount">
                  <span className="mb-2 block text-sm font-bold">مبلغ پرداخت اول</span>
                  <span className="relative block">
                    <input
                      id="initial-payment-amount"
                      className="field pl-20 font-black"
                      inputMode="numeric"
                      value={initialPaymentFocused ? initialPaymentAmount.replace(/\d/g, (digit) => persianDigits[Number(digit)]) : persianNumber(initialPaymentAmount)}
                      onFocus={() => setInitialPaymentFocused(true)}
                      onBlur={() => setInitialPaymentFocused(false)}
                      onChange={(event) => { setInitialPaymentAmount(normalizeDigits(event.target.value)); setInitialPaymentError(""); }}
                      aria-invalid={Boolean(initialPaymentError)}
                      required
                    />
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-bold text-ink/70">تومان</span>
                  </span>
                </label>
                {initialPaymentError && <p className="mt-2 text-sm font-bold text-error" role="alert">{initialPaymentError}</p>}
                <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-teal/15 bg-teal/6">
                  <div className="p-3">
                    <p className="text-xs font-bold text-ink/55">اکنون</p>
                    <p className="mt-1 font-black text-teal">{persianNumber(initialPaymentAmount)} تومان</p>
                  </div>
                  <div className="border-r border-dashed border-teal/25 p-3">
                    <p className="text-xs font-bold text-ink/55">پس از آماده‌سازی</p>
                    <p className="mt-1 font-black">{Number(amount) > Number(initialPaymentAmount) ? persianNumber(Number(amount) - Number(initialPaymentAmount)) : "—"} تومان</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-5">
            <span className="mb-2 block text-sm font-black">تاریخ تحویل</span>
            <DeliveryDateSelect
              id="delivery-date"
              value={deliveryDate}
              workDays={workDays}
              onWorkDayPick={(count) => {
                setWorkDays(count);
                setDeliveryDate(addWorkingDays(todayISO(), count));
                setDeliveryDateError("");
              }}
              onChange={(value) => {
                setDeliveryDate(value);
                setWorkDays(0);
                setDeliveryDateError("");
              }}
              describedBy={[deliveryDateHelp && "delivery-date-help", deliveryDateError && "delivery-date-error"].filter(Boolean).join(" ") || undefined}
              invalid={Boolean(deliveryDateError)}
            />
            {deliveryDateHelp && <span id="delivery-date-help" className="mt-2 block text-xs font-bold text-ink/55">{deliveryDateHelp}</span>}
            {deliveryDateError && <span id="delivery-date-error" className="mt-2 block text-sm font-bold text-error" role="alert">{deliveryDateError}</span>}
          </div>
          <label className="mt-5 block" htmlFor="sales-channel">
            <span className="mb-2 block text-sm font-black">کانال فروش</span>
            <span className="relative block">
              <select id="sales-channel" className="field appearance-none pl-12" value={salesChannel} onChange={(event) => setSalesChannel(event.target.value as SalesChannel)} required>
                {salesChannels.map((channel) => <option key={channel} value={channel}>{salesChannelLabels[channel]}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink/60" aria-hidden="true" />
            </span>
          </label>
          <details open className="mt-5 rounded-3xl border border-ledger bg-white">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-bold">
              <span>جزئیات اختیاری</span>
              <ChevronDown className="details-chevron size-5 text-ink/70" aria-hidden="true" />
            </summary>
            <div className="space-y-5 border-t border-ledger p-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold">مرجع گفتگو</span>
                <input
                  className="field"
                  dir="auto"
                  autoComplete="off"
                  maxLength={100}
                  value={conversationReference}
                  onChange={(event) => setConversationReference(event.target.value)}
                  placeholder="نام کاربری، موبایل، نام نمایشی یا هر نشانه دیگر"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">یادداشت داخلی</span>
                <textarea
                  className="field min-h-24 resize-y py-3"
                  maxLength={1000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="مثلاً رنگ یا هماهنگی انجام‌شده در گفتگو"
                />
                <span className="mt-1 block text-xs text-ink/70">این یادداشت به مشتری نشان داده نمی‌شود.</span>
              </label>
            </div>
          </details>
        </div>}
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
