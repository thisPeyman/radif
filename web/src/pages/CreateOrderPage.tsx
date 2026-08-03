import { CalendarDays, Check, ChevronDown, Clipboard, ClipboardCheck, LoaderCircle, Package, Plus, Share2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink } from "react-router";
import { ErrorNotice, ProductImage } from "../components";
import DeliveryDateSelect from "../DeliveryDateSelect";
import { api, defaultShareMessageTemplate, normalizeDigits, persianDate, persianDigits, persianNumber, randomID, todayISO, type CreatedOrder, type Product, type Shop } from "../shared";

type SelectedItem = { product: Product; quantity: number };

function newCreateKey(shopID: number) {
  const storageKey = `radif_create_key_${shopID}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const key = randomID();
  sessionStorage.setItem(storageKey, key);
  return key;
}

export default function CreateOrderPage({ shop, onBusyChange }: { shop: Shop; onBusyChange: (busy: boolean) => void }) {
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
    try { await api<void>(path, { method: "POST" }); } catch { navigator.sendBeacon(path); }
  }

  function shareMessage(order: CreatedOrder) {
    const values: Record<string, string> = {
      "{shopName}": shop.name,
      "{orderCode}": order.orderCode,
      "{customerUrl}": order.customerUrl,
      "{amount}": `${persianNumber(Number(amount))} تومان`,
      "{deliveryDate}": persianDate(order.estimatedDeliveryDate),
    };
    return (shop.shareMessageTemplate || defaultShareMessageTemplate).replace(/\{(?:shopName|orderCode|customerUrl|amount|deliveryDate)\}/g, (placeholder) => values[placeholder]);
  }

  async function copyText(order: CreatedOrder, text: string) {
    setCopyState("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      await recordCopy(order).catch(() => undefined);
    } catch { setCopyState("failed"); }
  }

  async function shareOrder(order: CreatedOrder) {
    if (!canShare) { await copyText(order, shareMessage(order)); return; }
    try {
      await navigator.share({ text: shareMessage(order) });
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      await copyText(order, shareMessage(order));
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
          estimatedDeliveryDate: deliveryDate,
          instagramUsername: instagram,
          internalNote: note,
          elapsedMs: Math.round(performance.now() - startedAt.current),
        }),
      });
      sessionStorage.removeItem(`radif_create_key_${shop.id}`);
      setCreated(order);
      if (reservedCopy && resolveReserved) {
        resolveReserved(new Blob([shareMessage(order)], { type: "text/plain" }));
        try { await reservedCopy; setCopyState("copied"); await recordCopy(order).catch(() => undefined); } catch { await copyText(order, shareMessage(order)); }
      } else { await copyText(order, shareMessage(order)); }
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

  if (created) return (
    <section className="page-content flex min-h-[70dvh] flex-col justify-center" aria-live="polite">
      <span className="grid size-16 place-items-center rounded-3xl bg-teal text-white"><ClipboardCheck className="size-8" strokeWidth={1.8} aria-hidden="true" /></span>
      <p className="page-kicker mt-6">{created.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])}</p><h1 className="page-title mt-1">سفارش ساخته شد</h1>
      <p className="mt-3 leading-7 text-ink/70">
        {copyState === "copied" && "متن کپی شد و آماده فرستادن در دایرکت است."}
        {copyState === "copying" && "در حال کپی‌کردن متن…"}
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
      {canShare && <button className="primary-button mt-6 w-full" type="button" onClick={() => shareOrder(created)}><Share2 className="size-5" aria-hidden="true" />اشتراک‌گذاری پیام</button>}
      <div className={`${canShare ? "mt-3" : "mt-6"} rounded-3xl border border-saffron/50 bg-saffron/10 p-4`}>
        <label className="text-sm font-bold" htmlFor="customer-link">لینک مشتری</label>
        <input id="customer-link" className="field mt-2 text-left text-sm" dir="ltr" readOnly value={created.customerUrl} onFocus={(event) => event.currentTarget.select()} />
        <button className="secondary-button mt-3 w-full" type="button" onClick={() => copyText(created, created.customerUrl)} disabled={copyState === "copying"}>
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
          <div className="mt-3 space-y-3">{products.map((product) => {
            const selectedItem = items.find((item) => item.product.id === product.id);
            const isSelected = Boolean(selectedItem);
            return (
              <div className={`product-choice product-choice-multi ${isSelected ? "product-choice-selected" : ""}`} key={product.id}>
                <button className="product-choice-main" type="button" aria-pressed={isSelected} onClick={() => toggleProduct(product)}>
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
                      <button
                        className="quantity-button"
                        type="button"
                        onClick={() => changeQuantity(product.id, -1)}
                        disabled={selectedItem.quantity === 1}
                        aria-label={`کم‌کردن تعداد ${product.name}`}
                      >
                        −
                      </button>
                      <span className="min-w-7 text-center font-black" aria-live="polite">{persianNumber(selectedItem.quantity)}</span>
                      <button
                        className="quantity-button"
                        type="button"
                        onClick={() => changeQuantity(product.id, 1)}
                        disabled={selectedItem.quantity === 99}
                        aria-label={`زیادکردن تعداد ${product.name}`}
                      >
                        +
                      </button>
                    </span>
                  </div>
                )}
              </div>
            );
          })}</div>
          {items.length > 0 && (
            <p className="mt-3 text-sm font-bold text-teal" aria-live="polite">
              {persianNumber(items.reduce((total, item) => total + item.quantity, 0))} قلم از {persianNumber(items.length)} محصول انتخاب شده
            </p>
          )}
        </fieldset>

        {items.length > 0 && <div className="creation-fields mt-7">
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
              onChange={(value) => {
                setDeliveryDate(value);
                setDeliveryDateError("");
              }}
              describedBy={deliveryDateError ? "delivery-date-preview delivery-date-error" : "delivery-date-preview"}
              invalid={Boolean(deliveryDateError)}
            />
            <span id="delivery-date-preview" className="mt-2 block text-sm text-ink/70">{deliveryDate ? `تحویل: ${persianDate(deliveryDate)}` : "تاریخ وعده‌داده‌شده به مشتری را انتخاب کنید."}</span>
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
