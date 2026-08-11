import { BadgeCheck, Clipboard, ClipboardCheck, CreditCard, LoaderCircle, RefreshCw, Send, Share2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { NavLink, useLocation, useParams } from "react-router";
import { CopyButton, ErrorNotice } from "../components";
import DeliveryDateSelect from "../DeliveryDateSelect";
import {
  adminStatusLabels,
  api,
  emptyCustomerDraft,
  normalizeDigits,
  normalizeIranianMobile,
  orderShareMessage,
  persianDate,
  persianDateTime,
  persianDigits,
  persianNumber,
  randomID,
  sendPilotEvent,
  salesChannelLabels,
  salesChannels,
  statusStyles,
  type AdminOrder,
  type CustomerDraft,
  type SalesChannel,
  type Shop,
} from "../shared";

export default function AdminOrderPage({ shops }: { shops: Shop[] }) {
  const { orderID = "" } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [tracking, setTracking] = useState("");
  const [customer, setCustomer] = useState<CustomerDraft>(emptyCustomerDraft);
  const [salesChannel, setSalesChannel] = useState<SalesChannel>("instagram");
  const [conversationReference, setConversationReference] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editingInternal, setEditingInternal] = useState(false);
  const [linkRotated, setLinkRotated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"" | "status" | "date" | "tracking" | "customer" | "internal" | "link" | "requestFinal" | "confirmFinal">("");
  const [finalCopyState, setFinalCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [messageState, setMessageState] = useState<"idle" | "copied" | "shared" | "failed">("idle");
  const [error, setError] = useState("");
  const canShare = typeof navigator.share === "function";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOrder(null);
    setError("");
    setLinkRotated(false);
    setFinalCopyState("idle");
    setMessageState("idle");
    api<AdminOrder>(`/api/orders/${encodeURIComponent(orderID)}`, { signal: controller.signal })
      .then((response) => {
        setOrder(response);
        setDate(response.estimatedDeliveryDate);
        setStatus(response.status);
        setTracking(response.shipmentTrackingCode);
        setCustomer({ fullName: response.customerFullName, mobile: response.customerMobile, address: response.customerAddress, postalCode: response.customerPostalCode, note: response.customerNote });
        setSalesChannel(response.salesChannel);
        setConversationReference(response.conversationReference);
        setInternalNote(response.internalNote);
      })
      .catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "سفارش دریافت نشد."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [orderID]);

  async function saveChanges(section: "status" | "date" | "tracking" | "customer" | "internal", changes: Record<string, string>) {
    if (!order) return;
    if (section === "status" && changes.status === "shipped" && order.initialPaymentAmount && !order.finalPaymentConfirmed
      && !window.confirm("پرداخت نهایی این سفارش هنوز تأیید نشده است. با این حال سفارش ارسال‌شده ثبت شود؟")) return;
    setSaving(section);
    setError("");
    try {
      const response = await api<AdminOrder>(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      setOrder(response);
      setDate(response.estimatedDeliveryDate);
      setStatus(response.status);
      setTracking(response.shipmentTrackingCode);
      setCustomer({ fullName: response.customerFullName, mobile: response.customerMobile, address: response.customerAddress, postalCode: response.customerPostalCode, note: response.customerNote });
      setSalesChannel(response.salesChannel);
      setConversationReference(response.conversationReference);
      setInternalNote(response.internalNote);
      if (section === "customer") setEditingCustomer(false);
      if (section === "internal") setEditingInternal(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تغییرات ذخیره نشد."); } finally { setSaving(""); }
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
  function cancelInternalEdit() {
    setSalesChannel(order?.salesChannel ?? "instagram");
    setConversationReference(order?.conversationReference ?? "");
    setInternalNote(order?.internalNote ?? "");
    setEditingInternal(false);
  }

  async function rotateCustomerLink() {
    if (!order || saving || !window.confirm("لینک فعلی بلافاصله از کار می‌افتد. لینک جدید ساخته شود؟")) return;
    setSaving("link");
    setError("");
    setLinkRotated(false);
    try {
      const response = await api<{ customerUrl: string }>(`/api/orders/${order.id}/customer-link/rotate`, { method: "POST" });
      setOrder((current) => current ? { ...current, customerUrl: response.customerUrl } : current);
      setLinkRotated(true);
      setFinalCopyState("idle");
      setMessageState("idle");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "لینک جدید ساخته نشد.");
    } finally {
      setSaving("");
    }
  }

  function finalPaymentMessage(value: AdminOrder) {
    return `سلام، لطفاً باقی‌مانده سفارش ${value.orderCode} به مبلغ ${persianNumber(value.finalPaymentAmount ?? 0)} تومان را پرداخت کنید و تصویر رسید را از لینک زیر بفرستید:\n${value.customerUrl}`;
  }

  async function copyFinalPaymentMessage(value = order) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(finalPaymentMessage(value));
      setFinalCopyState("copied");
      recordLinkCopy(value, "final_payment");
    } catch {
      setFinalCopyState("failed");
    }
  }

  function messageForOrder(value: AdminOrder) {
    return orderShareMessage(shops.find((shop) => shop.id === value.shop.id) ?? value.shop, value, value.amount);
  }

  async function copyOrderMessage() {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(messageForOrder(order));
      setMessageState("copied");
      recordLinkCopy(order, "order_detail", "clipboard");
    } catch {
      setMessageState("failed");
    }
  }

  async function shareOrderMessage() {
    if (!order) return;
    try {
      await navigator.share({ text: messageForOrder(order) });
      setMessageState("shared");
      recordLinkCopy(order, "order_detail", "native_share");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      await copyOrderMessage();
    }
  }

  function recordLinkCopy(value: AdminOrder, source: "order_detail" | "final_payment", method: "clipboard" | "native_share" = "clipboard") {
    sendPilotEvent(`/api/orders/${value.id}/link-copied`, { method, source, eventKey: randomID() });
  }

  async function requestFinalPayment() {
    if (!order || saving || !window.confirm("درخواست پرداخت نهایی دائمی است و قابل لغو نیست. درخواست ثبت شود؟")) return;
    setSaving("requestFinal");
    setError("");
    try {
      const response = await api<AdminOrder>(`/api/orders/${order.id}/final-payment/request`, { method: "POST" });
      setOrder(response);
      await copyFinalPaymentMessage(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "درخواست پرداخت نهایی ثبت نشد.");
    } finally {
      setSaving("");
    }
  }

  async function confirmFinalPayment() {
    if (!order || saving || !window.confirm("رسید بررسی شده و پرداخت نهایی تأیید می‌شود؟")) return;
    setSaving("confirmFinal");
    setError("");
    try {
      setOrder(await api<AdminOrder>(`/api/orders/${order.id}/final-payment/confirm`, { method: "POST" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "پرداخت نهایی تأیید نشد.");
    } finally {
      setSaving("");
    }
  }

  if (loading) return <div className="grid min-h-[65dvh] place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت سفارش" /></div>;
  if (!order) return <section className="page-content"><ErrorNotice>{error || "سفارش پیدا نشد."}</ErrorNotice></section>;
  const finalRequestAllowed = order.customerSubmitted
    && order.receiptUploaded
    && order.history.some((entry) => entry.newStatus === "paid")
    && ["paid", "preparing", "shipped"].includes(order.status);

  return (
    <section className="page-content">
      <NavLink className="inline-flex min-h-11 items-center text-sm font-black text-teal" to={`/orders${location.search}`}>بازگشت به سفارش‌ها</NavLink>
      <p className="page-kicker mt-2">{order.orderCode.replace(/\d/g, (digit) => persianDigits[Number(digit)])} · {order.shop.name}</p>
      <h1 className="page-title">عملیات سفارش</h1>
      <div className="mt-1 flex min-h-11 flex-wrap items-center gap-x-1 text-xs" aria-label="ارسال پیام سفارش">
        <span className="ml-1 font-bold text-ink/45">پیام مشتری:</span>
        <button className="inline-flex min-h-11 items-center gap-1.5 px-2 font-black text-teal" type="button" onClick={copyOrderMessage}><Clipboard className="size-4" aria-hidden="true" />کپی پیام</button>
        {canShare && <button className="inline-flex min-h-11 items-center gap-1.5 px-2 font-black text-teal" type="button" onClick={shareOrderMessage}><Share2 className="size-4" aria-hidden="true" />ارسال</button>}
        {messageState !== "idle" && <span className={`mr-auto font-bold ${messageState === "failed" ? "text-error" : "text-teal"}`} role="status">{messageState === "copied" ? "کپی شد" : messageState === "shared" ? "ارسال شد" : "کپی نشد"}</span>}
      </div>
      {error && <div className="mt-4"><ErrorNotice>{error}</ErrorNotice></div>}

      <section className={`mt-5 rounded-3xl border-r-4 bg-white p-5 shadow-sm ${statusStyles[order.status]?.rail ?? "border-ink"}`}>
        <label className="text-sm font-black" htmlFor="admin-order-status">وضعیت سفارش</label>
        <select id="admin-order-status" className="field mt-2" value={status} onChange={(event) => setStatus(event.target.value)}>
          {Object.entries(adminStatusLabels).map(([value, label]) => {
            const infoAlreadySubmitted = value === "waiting_info" && order.customerSubmitted;
            const missingReceipt = value === "waiting_payment" && !order.receiptUploaded;
            const shownLabel = order.initialPaymentAmount && value === "paid" ? "پرداخت اول تأیید شده" : label;
            return <option key={value} value={value} disabled={infoAlreadySubmitted || missingReceipt}>{shownLabel}{infoAlreadySubmitted ? " (اطلاعات ثبت شده)" : missingReceipt ? " (نیازمند رسید)" : ""}</option>;
          })}
        </select>
        <button className="primary-button mt-3 w-full" type="button" onClick={() => saveChanges("status", { status })} disabled={Boolean(saving) || status === order.status}>
          {saving === "status" && <LoaderCircle className="size-5 animate-spin" />}
          {saving === "status" ? "در حال ذخیره…" : "ثبت وضعیت"}
        </button>
      </section>

      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-black">مشتری و تحویل</h2>
          {order.customerSubmitted && !editingCustomer && <button className="min-h-11 px-2 text-sm font-black text-teal" type="button" onClick={() => setEditingCustomer(true)}>اصلاح اطلاعات</button>}
        </div>
        {!order.customerSubmitted && <p className="mt-3 text-sm font-bold text-error">مشتری هنوز اطلاعات تحویل را ثبت نکرده است.</p>}
        {order.customerSubmitted && !editingCustomer && (
          <div className="mt-3 space-y-4 text-sm">
            <div><p className="text-xs font-bold text-ink/60">نام مشتری</p><p className="mt-1 font-black">{order.customerFullName}</p></div>
            <div>
              <p className="text-xs font-bold text-ink/60">شماره موبایل</p>
              <div className="flex items-center justify-between gap-2"><span dir="ltr" className="font-bold">{order.customerMobile}</span><CopyButton value={order.customerMobile} label="کپی" /></div>
            </div>
            <div>
              <p className="text-xs font-bold text-ink/60">نشانی</p>
              <p className="mt-1 whitespace-pre-wrap leading-7">{order.customerAddress}</p>
              <CopyButton value={order.customerAddress} label="کپی نشانی" />
            </div>
            {order.customerPostalCode && <div><p className="text-xs font-bold text-ink/60">کد پستی</p><p className="mt-1 font-bold" dir="ltr">{order.customerPostalCode}</p></div>}
            {order.customerNote && <div><p className="text-xs font-bold text-ink/60">یادداشت مشتری</p><p className="mt-1 whitespace-pre-wrap leading-7">{order.customerNote}</p></div>}
          </div>
        )}
        {order.customerSubmitted && editingCustomer && (
          <form className="mt-3 space-y-3" onSubmit={saveCustomer}>
            <input className="field" value={customer.fullName} onChange={(event) => setCustomer({ ...customer, fullName: event.target.value })} aria-label="نام مشتری" />
            <input className="field" type="tel" dir="ltr" value={customer.mobile} onChange={(event) => setCustomer({ ...customer, mobile: event.target.value })} aria-label="شماره موبایل مشتری" />
            <textarea className="field min-h-28 py-3" value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} aria-label="نشانی مشتری" />
            <input
              className="field"
              inputMode="numeric"
              dir="ltr"
              value={customer.postalCode}
              onChange={(event) => setCustomer({ ...customer, postalCode: event.target.value })}
              aria-label="کد پستی"
              placeholder="کد پستی اختیاری"
            />
            <textarea
              className="field min-h-20 py-3"
              value={customer.note}
              onChange={(event) => setCustomer({ ...customer, note: event.target.value })}
              aria-label="یادداشت مشتری"
              placeholder="یادداشت اختیاری"
            />
            <div className="grid grid-cols-2 gap-2">
              <button className="secondary-button" type="button" onClick={cancelCustomerEdit}>انصراف</button>
              <button className="primary-button" disabled={Boolean(saving)}>{saving === "customer" ? "در حال ذخیره…" : "ذخیره"}</button>
            </div>
          </form>
        )}
      </section>

      <section className="mt-5 overflow-hidden rounded-3xl border border-ledger bg-white">
        <div className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-teal/10 text-teal"><CreditCard className="size-5" aria-hidden="true" /></span>
            <div><h2 className="font-black">پرداخت‌ها و رسیدها</h2><p className="mt-0.5 text-xs text-ink/60">مبلغ کل {persianNumber(order.amount)} تومان</p></div>
          </div>
          {order.initialPaymentAmount && (
            <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-teal/15 bg-teal/6">
              <div className="p-3"><p className="text-xs font-bold text-ink/55">پرداخت اول</p><p className="mt-1 font-black text-teal">{persianNumber(order.initialPaymentAmount)} تومان</p></div>
              <div className="border-r border-dashed border-teal/25 p-3"><p className="text-xs font-bold text-ink/55">پرداخت نهایی</p><p className="mt-1 font-black">{persianNumber(order.finalPaymentAmount ?? 0)} تومان</p></div>
            </div>
          )}
        </div>
        <div className="border-t border-ledger p-5">
          <p className="text-xs font-black text-ink/55">{order.initialPaymentAmount ? "رسید پرداخت اول" : "رسید پرداخت"}</p>
          {order.receiptUploaded && order.receiptUrl ? (
            <>
              <img className="mt-3 max-h-96 w-full rounded-2xl bg-ledger object-contain" src={order.receiptUrl} alt={order.initialPaymentAmount ? "رسید پرداخت اول مشتری" : "رسید پرداخت مشتری"} />
              <a className="secondary-button mt-3 w-full" href={order.receiptUrl} target="_blank" rel="noreferrer">نمایش در اندازه کامل</a>
            </>
          ) : <p className="mt-2 text-sm text-ink/65">رسیدی بارگذاری نشده است.</p>}
        </div>
        {order.initialPaymentAmount && (
          <div className="border-t-2 border-dashed border-saffron/45 bg-saffron/6 p-5">
            <div className="flex items-center justify-between gap-3"><p className="font-black">پرداخت نهایی</p>{order.finalPaymentConfirmed && <span className="rounded-full bg-teal px-3 py-1 text-xs font-black text-white">تسویه شد</span>}</div>
            {!order.finalPaymentRequested && (
              <>
                <p className="mt-2 text-sm leading-7 text-ink/70">پس از تأیید پرداخت اول، درخواست را ثبت کنید.</p>
                {!finalRequestAllowed && <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-bold text-error">ابتدا رسید و اطلاعات مشتری را دریافت کنید و پرداخت اول را با وضعیت «پرداخت اول تأیید شده» ثبت کنید.</p>}
                <button className="primary-button mt-4 w-full" type="button" onClick={requestFinalPayment} disabled={Boolean(saving) || !finalRequestAllowed}>
                  {saving === "requestFinal" ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Send className="size-5" aria-hidden="true" />}
                  {saving === "requestFinal" ? "در حال ثبت…" : "درخواست پرداخت نهایی"}
                </button>
                <p className="mt-2 text-center text-xs font-bold text-ink/55">این درخواست قابل لغو نیست.</p>
              </>
            )}
            {order.finalPaymentRequested && (
              <>
                <dl className="mt-4 grid gap-3 rounded-2xl bg-white p-4 text-sm">
                  <div><dt className="text-xs font-bold text-ink/55">مبلغ باقی‌مانده</dt><dd className="mt-1 font-black">{persianNumber(order.finalPaymentAmount ?? 0)} تومان</dd></div>
                  {order.finalPaymentRequestedAt && <div><dt className="text-xs font-bold text-ink/55">زمان درخواست</dt><dd className="mt-1 font-bold">{persianDateTime(order.finalPaymentRequestedAt)}</dd></div>}
                </dl>
                <button className="secondary-button mt-3 w-full" type="button" onClick={() => copyFinalPaymentMessage()}>
                  {finalCopyState === "copied" ? <ClipboardCheck className="size-5" aria-hidden="true" /> : <Clipboard className="size-5" aria-hidden="true" />}
                  {finalCopyState === "copied" ? "پیام کپی شد" : "کپی پیام برای مشتری"}
                </button>
                {finalCopyState === "failed" && <p className="mt-2 text-sm text-error">کپی خودکار ممکن نشد؛ لینک مشتری را جداگانه بفرستید.</p>}
                <div className="mt-5 border-t border-saffron/25 pt-5">
                  <p className="text-xs font-black text-ink/55">رسید پرداخت نهایی</p>
                  {order.finalReceiptUploaded && order.finalReceiptUrl ? (
                    <>
                      <img className="mt-3 max-h-96 w-full rounded-2xl bg-white object-contain" src={order.finalReceiptUrl} alt="رسید پرداخت نهایی مشتری" />
                      <a className="secondary-button mt-3 w-full" href={order.finalReceiptUrl} target="_blank" rel="noreferrer">نمایش در اندازه کامل</a>
                    </>
                  ) : <p className="mt-2 text-sm leading-7 text-ink/65">مشتری هنوز رسید نهایی را از لینک سفارش نفرستاده است.</p>}
                </div>
                {order.finalReceiptUploaded && !order.finalPaymentConfirmed && (
                  <button className="primary-button mt-4 w-full" type="button" onClick={confirmFinalPayment} disabled={Boolean(saving) || order.status === "cancelled"}>
                    {saving === "confirmFinal" ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <BadgeCheck className="size-5" aria-hidden="true" />}
                    {saving === "confirmFinal" ? "در حال تأیید…" : "تأیید پرداخت نهایی"}
                  </button>
                )}
                {order.finalPaymentConfirmed && (
                  <p className="mt-4 flex items-center gap-2 rounded-2xl bg-teal/10 p-4 text-sm font-bold text-teal">
                    <BadgeCheck className="size-5 shrink-0" aria-hidden="true" />
                    تأیید شده{order.finalPaymentConfirmedByAdminName ? ` توسط ${order.finalPaymentConfirmedByAdminName}` : ""}{order.finalPaymentConfirmedAt ? ` · ${persianDateTime(order.finalPaymentConfirmedAt)}` : ""}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </section>
      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <h2 className="font-black">محصول‌ها و مبلغ</h2>
        <div className="mt-3 divide-y divide-ledger">
          {order.items.map((item) => (
            <div className="flex items-center justify-between gap-3 py-3" key={item.name}>
              <span className="font-bold">{item.name} × {persianNumber(item.quantity)}</span>
              <span className="text-sm">{persianNumber(item.unitPrice)} تومان</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between border-t border-ink/15 pt-4"><span className="font-bold">مبلغ سفارش</span><strong>{persianNumber(order.amount)} تومان</strong></div>
      </section>

      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <h2 className="font-black">تحویل و ارسال</h2>
        <p className="mt-4 text-sm font-bold">تاریخ تحویل</p>
        <div className="mt-2"><DeliveryDateSelect id="order-delivery-date" value={date} onChange={setDate} /></div>
        <p className="mt-2 text-sm text-ink/70">{date ? persianDate(date) : "تاریخ را انتخاب کنید."}</p>
        <button
          className="secondary-button mt-3 w-full"
          type="button"
          onClick={() => saveChanges("date", { estimatedDeliveryDate: date })}
          disabled={Boolean(saving) || !date || date === order.estimatedDeliveryDate}
        >
          {saving === "date" ? "در حال ذخیره…" : "ذخیره تاریخ"}
        </button>
        <label className="mt-5 block text-sm font-bold" htmlFor="tracking-code">کد رهگیری مرسوله</label>
        <input id="tracking-code" className="field mt-2" dir="ltr" value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="اختیاری" />
        {tracking && <div className="mt-1 text-left"><CopyButton value={tracking} label="کپی کد رهگیری" /></div>}
        <button
          className="secondary-button mt-2 w-full"
          type="button"
          onClick={() => saveChanges("tracking", { shipmentTrackingCode: tracking })}
          disabled={Boolean(saving) || tracking === order.shipmentTrackingCode}
        >
          {saving === "tracking" ? "در حال ذخیره…" : "ذخیره کد رهگیری"}
        </button>
      </section>

      <section className="mt-5 rounded-3xl border border-saffron/40 bg-saffron/8 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-black">اطلاعات داخلی</h2>
          {!editingInternal && <button className="min-h-11 px-2 text-sm font-black text-teal" type="button" onClick={() => setEditingInternal(true)}>ویرایش سریع</button>}
        </div>
        {!editingInternal && (
          <>
            <div className="mt-3 text-sm">
              <p className="text-xs font-bold text-ink/60">کانال فروش</p>
              <p className="mt-1 font-bold">{salesChannelLabels[order.salesChannel]}</p>
            </div>
            <div className="mt-4 text-sm">
              <p className="text-xs font-bold text-ink/60">مرجع گفتگو</p>
              <p className="mt-1 font-bold" dir="auto">{order.conversationReference || "ثبت نشده"}</p>
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold text-ink/60">یادداشت داخلی</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-7">{order.internalNote || "یادداشتی ثبت نشده است."}</p>
            </div>
          </>
        )}
        {editingInternal && (
          <form className="mt-3 space-y-3" onSubmit={(event) => { event.preventDefault(); void saveChanges("internal", { salesChannel, conversationReference, internalNote }); }}>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">کانال فروش</span>
              <select className="field" value={salesChannel} onChange={(event) => setSalesChannel(event.target.value as SalesChannel)} required>
                {salesChannels.map((channel) => <option key={channel} value={channel}>{salesChannelLabels[channel]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">مرجع گفتگو</span>
              <input className="field" dir="auto" maxLength={100} value={conversationReference} onChange={(event) => setConversationReference(event.target.value)} placeholder="نام کاربری، موبایل، نام نمایشی یا هر نشانه دیگر" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">یادداشت داخلی</span>
              <textarea className="field min-h-24 py-3" maxLength={1000} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button className="secondary-button" type="button" onClick={cancelInternalEdit}>انصراف</button>
              <button className="primary-button" disabled={Boolean(saving)}>{saving === "internal" ? "در حال ذخیره…" : "ذخیره"}</button>
            </div>
          </form>
        )}
      </section>
      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <h2 className="font-black">لینک مشتری</h2>
        <p className="mt-3 break-all text-left text-xs" dir="ltr">{order.customerUrl}</p>
        {saving !== "link" && <CopyButton value={order.customerUrl} label="کپی لینک مشتری" onCopied={() => recordLinkCopy(order, "order_detail")} />}
        <p className="mt-3 text-xs leading-6 text-ink/65">اگر لینک فاش شده است، لینک جدید بسازید. لینک فعلی دیگر قابل استفاده نخواهد بود.</p>
        <button className="secondary-button mt-3 w-full text-error" type="button" onClick={rotateCustomerLink} disabled={Boolean(saving)}>
          {saving === "link" ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-5" aria-hidden="true" />}
          {saving === "link" ? "در حال ساخت لینک…" : "ساخت لینک جدید"}
        </button>
        {linkRotated && <p className="mt-3 text-sm font-bold text-teal" role="status">لینک جدید ساخته شد و لینک قبلی از کار افتاد.</p>}
      </section>
      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <h2 className="font-black">تاریخچه وضعیت</h2>
        <ol className="mt-4 border-r-2 border-ledger pr-5">
          {order.history.map((entry, index) => (
            <li className="relative pb-5 last:pb-0" key={`${entry.createdAt}-${index}`}>
              <span className="absolute -right-[1.7rem] top-1 size-3 rounded-full bg-teal" />
              <p className="font-bold">{order.initialPaymentAmount && entry.newStatus === "paid" ? "پرداخت اول تأیید شده" : adminStatusLabels[entry.newStatus] ?? entry.newStatus}</p>
              <p className="mt-1 text-xs text-ink/60">{persianDateTime(entry.createdAt)}{entry.changedByAdminName ? ` · ${entry.changedByAdminName}` : ""}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 border-t border-ledger pt-4 text-xs text-ink/60">ساخته‌شده: {persianDateTime(order.createdAt)} · آخرین تغییر: {persianDateTime(order.updatedAt)}</p>
      </section>
    </section>
  );
}
