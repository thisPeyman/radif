import { CalendarDays, Check, Clipboard, ClipboardCheck, ClipboardList, LoaderCircle, MessageCircle, Package, Store } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { CopyButton, ErrorNotice, ReceiptPicker } from "../components";
import {
  api,
  normalizeDigits,
  normalizeIranianMobile,
  persianDate,
  persianDateTime,
  persianDigits,
  persianNumber,
  pilotFailureReason,
  publicStatusLabels,
  randomID,
  readCustomerDraft,
  sendPilotEvent,
  type CustomerDraft,
  type PublicOrder,
} from "../shared";

function formatIBAN(value: string) {
  return value.match(/.{1,4}/g)?.join(" ") ?? value;
}

export default function PublicOrderPage() {
  const { token = "" } = useParams();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<CustomerDraft>(() => readCustomerDraft(token));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CustomerDraft, string>>>({});
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const [finalReceipt, setFinalReceipt] = useState<File | null>(null);
  const [finalReceiptError, setFinalReceiptError] = useState("");
  const [finalError, setFinalError] = useState("");
  const [pending, setPending] = useState(false);
  const [finalPending, setFinalPending] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [ibanCopyState, setIBANCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [amountCopyState, setAmountCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const formStarted = useRef(false);

  useEffect(() => {
    formStarted.current = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setOrder(null);
    api<PublicOrder>(`/api/o/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(setOrder)
      .catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "سفارش دریافت نشد."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, reload]);

  useEffect(() => {
    setDraft(readCustomerDraft(token));
    setFieldErrors({});
    setReceipt(null);
    setReceiptError("");
    setFinalReceipt(null);
    setFinalReceiptError("");
    setFinalError("");
  }, [token]);

  function recordFormEvent(eventName: "customer_form_started" | "customer_submission_failed", reason?: string) {
    sendPilotEvent(`/api/o/${encodeURIComponent(token)}/pilot-events`, { eventName, ...(reason ? { eventKey: randomID(), reason } : {}) });
  }

  function startForm() {
    if (formStarted.current) return;
    formStarted.current = true;
    recordFormEvent("customer_form_started");
  }

  useEffect(() => {
    if (!order || order.customerSubmitted) return;
    try {
      localStorage.setItem(`radif_customer_draft_${token}`, JSON.stringify(draft));
    } catch {
      /* Storage is optional in restricted in-app browsers. */
    }
  }, [draft, order, token]);

  function updateDraft(field: keyof CustomerDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function copyPaymentCardNumber() {
    if (!order) return;
    const cardNumber = order.customerSubmitted && order.finalPaymentRequested ? order.finalPaymentCardNumber : order.paymentCardNumber;
    if (!cardNumber) return;
    try { await navigator.clipboard.writeText(cardNumber); setCopyState("copied"); } catch { setCopyState("failed"); }
  }

  async function copyPaymentIBAN() {
    if (!order) return;
    const iban = order.customerSubmitted && order.finalPaymentRequested ? order.finalPaymentIban : order.paymentIban;
    if (!iban) return;
    try { await navigator.clipboard.writeText(iban); setIBANCopyState("copied"); } catch { setIBANCopyState("failed"); }
  }

  async function copyPaymentAmount() {
    if (!order) return;
    const amount = order.initialPaymentAmount
      ? order.customerSubmitted && order.finalPaymentRequested ? order.finalPaymentAmount ?? 0 : order.initialPaymentAmount
      : order.amount;
    try { await navigator.clipboard.writeText(String(amount * 10)); setAmountCopyState("copied"); } catch { setAmountCopyState("failed"); }
  }

  async function submitDetails(event: FormEvent) {
    event.preventDefault();
    startForm();
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
      recordFormEvent("customer_submission_failed", "client_validation");
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
      try {
        localStorage.removeItem(`radif_customer_draft_${token}`);
      } catch {
        /* Draft storage is optional. */
      }
      setOrder(updated);
      setReceipt(null);
    } catch (reason) {
      recordFormEvent("customer_submission_failed", pilotFailureReason(reason));
      setError(reason instanceof Error ? reason.message : "اطلاعات ثبت نشد. دوباره تلاش کنید.");
    } finally {
      setPending(false);
    }
  }

  async function submitFinalReceipt(event: FormEvent) {
    event.preventDefault();
    if (!finalReceipt) {
      setFinalReceiptError("تصویر رسید پرداخت نهایی را انتخاب کنید.");
      return;
    }
    const form = new FormData();
    form.set("receipt", finalReceipt);
    setFinalPending(true);
    setFinalError("");
    try {
      setOrder(await api<PublicOrder>(`/api/o/${encodeURIComponent(token)}/final-payment/receipt`, { method: "POST", body: form }));
      setFinalReceipt(null);
    } catch (reason) {
      setFinalError(reason instanceof Error ? reason.message : "رسید پرداخت نهایی ثبت نشد.");
    } finally {
      setFinalPending(false);
    }
  }

  function supportClicked() {
    if (!order?.support) return;
    if (order.support.channel === "instagram" && navigator.clipboard) void navigator.clipboard.writeText(order.support.message).catch(() => undefined);
    const endpoint = `/api/o/${encodeURIComponent(token)}/support-click`;
    try {
      if (navigator.sendBeacon(endpoint)) return;
    } catch {
      /* External navigation must continue. */
    }
    void fetch(endpoint, { method: "POST", keepalive: true }).catch(() => undefined);
  }

  function supportAction(label: string) {
    if (!order?.support) return null;
    const instagramInApp = order.support.channel === "instagram" && /Instagram/i.test(navigator.userAgent);
    const href = instagramInApp ? `instagram://user?username=${order.support.url.split("/").pop() ?? ""}` : order.support.url;
    return (
      <div className="mt-5">
        <a className="secondary-button w-full" href={href} target={instagramInApp ? undefined : "_blank"} rel="noreferrer" onClick={supportClicked}>
          <MessageCircle className="size-5" aria-hidden="true" />
          {label}
        </a>
        {order.support.channel === "instagram" && (
          <p className="mt-2 text-center text-xs text-ink/60">
            {instagramInApp ? "متن پیام کپی می‌شود؛ در صفحه فروشگاه روی «پیام» بزنید." : "متن پیام کپی می‌شود و اینستاگرام باز می‌شود."}
          </p>
        )}
      </div>
    );
  }

  const initialPaymentConfirmed = Boolean(order?.history.some((entry) => entry.status === "paid"));
  const initialPaymentActive = Boolean(order?.initialPaymentAmount && !order.customerSubmitted && order.customerSubmissionAllowed);
  const finalPaymentActive = Boolean(order?.initialPaymentAmount && order.customerSubmitted && order.finalPaymentRequested && !order.finalReceiptUploaded && !order.finalPaymentConfirmed && order.status !== "cancelled");
  const paymentIban = order?.customerSubmitted && order.finalPaymentRequested ? order.finalPaymentIban : order?.paymentIban;

  return (
    <div className="app-viewport min-h-dvh px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] text-ink sm:min-h-[760px] sm:px-6">
      <a
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-ink/60 no-underline transition-colors hover:text-teal"
        href="/"
        target="_blank"
        rel="noreferrer"
        aria-label="درباره ردیف"
      >
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
            <p className="mt-1 text-lg font-black text-teal">{order.initialPaymentAmount && order.status === "paid" ? "پرداخت اول تأیید شد" : publicStatusLabels[order.status] ?? order.status}</p>
            {order.status === "waiting_payment" && order.receiptUploaded && <p className="mt-2 text-sm text-ink/70">فروشگاه در حال بررسی {order.initialPaymentAmount ? "رسید پرداخت اول" : "رسید پرداخت"} شماست.</p>}
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
                  <span className="relative grid size-14 place-items-center overflow-hidden rounded-2xl bg-ledger">
                    <Package className="size-5" aria-hidden="true" />
                    <img className="absolute inset-0 size-full object-cover" src={item.imagePath} alt="" />
                  </span>
                  <p className="min-w-0 flex-1 font-bold">{item.name}</p>
                  <span className="text-sm font-black text-teal">{persianNumber(item.quantity)} عدد</span>
                </div>
              ))}
            </div>
          </section>

          {order.initialPaymentAmount ? (
            <section className="mt-5 rounded-3xl border border-ledger bg-white p-5 shadow-sm">
              <div className="flex items-end justify-between gap-4 border-b border-ledger pb-4">
                <div><p className="text-xs font-black text-teal">برنامه پرداخت</p><h2 className="mt-1 text-lg font-black">پرداخت در دو مرحله</h2></div>
                <div className="text-left">
                  <p className="text-xs font-bold text-ink/50">مبلغ کل</p>
                  {order.originalAmount ? <>
                    <p className="mt-1 text-xs font-bold text-ink/45 line-through">{persianNumber(order.originalAmount)} تومان</p>
                    <p className="mt-0.5 font-black text-teal">{persianNumber(order.amount)} تومان</p>
                    <p className="mt-1 inline-block rounded-full bg-teal/10 px-2 py-0.5 text-[0.65rem] font-black text-teal">{persianNumber(order.originalAmount - order.amount)} تومان تخفیف</p>
                  </> : <p className="mt-1 font-black">{persianNumber(order.amount)} تومان</p>}
                </div>
              </div>
              <ol className="mt-5">
                <li className="relative pr-12 pb-4">
                  <span className={`absolute right-[1.15rem] top-9 h-[calc(100%-1rem)] w-0.5 ${initialPaymentConfirmed ? "bg-teal/35" : "bg-ledger"}`} aria-hidden="true" />
                  <span className={`absolute right-0 top-1 grid size-10 place-items-center rounded-full border-4 border-white text-sm font-black shadow-sm ${initialPaymentConfirmed ? "bg-teal text-white" : initialPaymentActive ? "bg-saffron text-ink ring-4 ring-saffron/15" : "bg-ledger text-ink/55"}`} aria-hidden="true">
                    {initialPaymentConfirmed ? <Check className="size-5" /> : "۱"}
                  </span>
                  <div className={`rounded-2xl border p-4 ${initialPaymentActive ? "border-2 border-saffron bg-saffron/10 shadow-sm" : initialPaymentConfirmed ? "border-teal/20 bg-teal/6" : "border-ledger bg-ledger/25"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black">پرداخت اول</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${initialPaymentActive ? "bg-saffron text-ink" : initialPaymentConfirmed ? "bg-teal text-white" : "bg-white text-ink/60"}`}>
                        {initialPaymentActive ? "الان پرداخت کنید" : initialPaymentConfirmed ? "تأیید شد" : order.customerSubmitted ? "رسید در حال بررسی" : "بسته شده"}
                      </span>
                    </div>
                    <p className="mt-2 text-xl font-black">{persianNumber(order.initialPaymentAmount)} <span className="text-sm">تومان</span></p>
                    {initialPaymentActive && (
                      <button className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-3 text-sm font-black text-teal shadow-sm" type="button" onClick={copyPaymentAmount}>
                        <span>{persianNumber(order.initialPaymentAmount * 10)} ریال</span>
                        <span className="flex items-center gap-1.5">{amountCopyState === "copied" ? <ClipboardCheck className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}{amountCopyState === "copied" ? "کپی شد" : "کپی مبلغ"}</span>
                      </button>
                    )}
                  </div>
                </li>
                <li className="relative pr-12">
                  <span className={`absolute right-0 top-1 grid size-10 place-items-center rounded-full border-4 border-white text-sm font-black shadow-sm ${order.finalPaymentConfirmed ? "bg-teal text-white" : finalPaymentActive ? "bg-saffron text-ink ring-4 ring-saffron/15" : order.finalReceiptUploaded ? "bg-saffron text-ink" : "bg-ledger text-ink/55"}`} aria-hidden="true">
                    {order.finalPaymentConfirmed ? <Check className="size-5" /> : "۲"}
                  </span>
                  <div className={`rounded-2xl border p-4 ${finalPaymentActive ? "border-2 border-saffron bg-saffron/10 shadow-sm" : order.finalPaymentConfirmed ? "border-teal/20 bg-teal/6" : order.finalReceiptUploaded ? "border-saffron/35 bg-saffron/8" : "border-ledger bg-ledger/25"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black">پرداخت نهایی</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${finalPaymentActive ? "bg-saffron text-ink" : order.finalPaymentConfirmed ? "bg-teal text-white" : order.finalReceiptUploaded ? "bg-saffron/40 text-ink" : "bg-white text-ink/60"}`}>
                        {order.status === "cancelled" ? "بسته شده" : order.finalPaymentConfirmed ? "تسویه شد" : order.finalReceiptUploaded ? "رسید در حال بررسی" : finalPaymentActive ? "الان پرداخت کنید" : "پس از آماده‌سازی"}
                      </span>
                    </div>
                    <p className="mt-2 text-xl font-black">{persianNumber(order.finalPaymentAmount ?? 0)} <span className="text-sm">تومان</span></p>
                    {finalPaymentActive && (
                      <button className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-3 text-sm font-black text-teal shadow-sm" type="button" onClick={copyPaymentAmount}>
                        <span>{persianNumber((order.finalPaymentAmount ?? 0) * 10)} ریال</span>
                        <span className="flex items-center gap-1.5">{amountCopyState === "copied" ? <ClipboardCheck className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}{amountCopyState === "copied" ? "کپی شد" : "کپی مبلغ"}</span>
                      </button>
                    )}
                    {!order.finalPaymentRequested && order.status !== "cancelled" && <p className="mt-2 text-xs leading-6 text-ink/55">فروشگاه پس از آماده‌شدن سفارش، زمان پرداخت را اعلام می‌کند.</p>}
                  </div>
                </li>
              </ol>
            </section>
          ) : (
            <button
              className={`mt-5 flex w-full items-center justify-between gap-4 rounded-2xl border bg-white px-4 py-3.5 text-ink shadow-sm transition hover:border-teal/30 hover:shadow-md active:scale-[0.99] ${order.originalAmount ? "border-teal/30 bg-teal/5" : "border-teal/15"}`}
              type="button"
              onClick={copyPaymentAmount}
            >
              {order.originalAmount ? (
                <span className="w-full text-right">
                  <span className="block text-xs font-bold text-ink/50">قیمت اصلی</span>
                  <span className="mt-1 block text-sm font-bold text-ink/40 line-through">{persianNumber(order.originalAmount)} تومان</span>
                  <span className="mt-3 block border-t border-dashed border-teal/25 pt-3">
                    <span className="block text-xs font-bold text-teal">مبلغ قابل پرداخت</span>
                    <strong className="mt-1 block text-lg text-teal">{persianNumber(order.amount)} تومان</strong>
                  </span>
                  <span className="mt-2 flex items-center justify-between text-xs font-black text-teal">
                    <span>{persianNumber(order.amount * 10)} ریال</span>
                    <span className="flex items-center gap-2">
                      {amountCopyState === "copied" ? <ClipboardCheck className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}
                      {amountCopyState === "copied" ? "کپی شد" : "کپی مبلغ"}
                    </span>
                  </span>
                </span>
              ) : <>
                <span className="text-right">
                  <span className="block text-xs font-bold text-ink/60">مبلغ سفارش</span>
                  <strong className="mt-1 block text-lg">{persianNumber(order.amount)} تومان</strong>
                  <span className="mt-0.5 block text-xs font-bold text-ink/45">{persianNumber(order.amount * 10)} ریال</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 rounded-xl bg-teal/8 px-3 py-2 text-xs font-black text-teal">
                  {amountCopyState === "copied" ? <ClipboardCheck className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}
                  {amountCopyState === "copied" ? "کپی شد" : "کپی"}
                </span>
              </>}
            </button>
          )}
          {amountCopyState === "failed" && <p className="mt-2 text-sm text-error" role="alert">کپی خودکار ممکن نشد؛ دوباره تلاش کنید.</p>}

          {(!order.initialPaymentAmount || !order.customerSubmitted || (order.finalPaymentRequested && !order.finalReceiptUploaded && !order.finalPaymentConfirmed && order.status !== "cancelled")) && <section className="mt-6 rounded-3xl border border-ledger bg-white p-5">
            <h2 className="text-sm font-black">{order.initialPaymentAmount ? order.customerSubmitted ? "پرداخت نهایی" : "پرداخت اول" : "اطلاعات پرداخت فروشگاه"}</h2>
            <p className="mt-2 text-sm leading-7 text-ink/70">{order.initialPaymentAmount ? `مبلغ ${persianNumber(order.customerSubmitted ? order.finalPaymentAmount ?? 0 : order.initialPaymentAmount)} تومان را به ${paymentIban ? "یکی از شماره‌های زیر" : "شماره کارت زیر"} واریز کنید.` : `مبلغ سفارش را به ${paymentIban ? "یکی از شماره‌های زیر" : "شماره کارت زیر"} واریز کنید.`}</p>
            <button
              className={`${order.initialPaymentAmount ? "mt-4" : "mt-3"} block min-h-16 w-full rounded-2xl border-2 border-saffron/60 bg-saffron/10 px-4 py-3 text-ink`}
              type="button"
              onClick={copyPaymentCardNumber}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-ink/60">شماره کارت</span>
                <span className="flex items-center gap-1.5 text-xs font-black text-teal">
                  {copyState === "copied" ? <ClipboardCheck className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}
                  {copyState === "copied" ? "کپی شد" : "کپی"}
                </span>
              </span>
              <strong className="mt-2 block select-all whitespace-nowrap text-center text-lg font-black tracking-wider" dir="ltr">{(order.customerSubmitted && order.finalPaymentRequested ? order.finalPaymentCardNumber : order.paymentCardNumber)?.match(/.{1,4}/g)?.join(" ")}</strong>
            </button>
            {paymentIban && <button
              className="mt-3 block min-h-16 w-full rounded-2xl border border-ledger bg-paper/60 px-4 py-3 text-ink"
              type="button"
              onClick={copyPaymentIBAN}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-ink/60">شماره شبا</span>
                <span className="flex items-center gap-1.5 text-xs font-black text-teal">
                  {ibanCopyState === "copied" ? <ClipboardCheck className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}
                  {ibanCopyState === "copied" ? "کپی شد" : "کپی"}
                </span>
              </span>
              <strong className="mt-2 block select-all whitespace-nowrap text-center text-[clamp(0.68rem,3.3vw,0.875rem)] font-black tracking-normal" dir="ltr">{formatIBAN(paymentIban)}</strong>
            </button>}
            <p className="mt-3 whitespace-pre-wrap text-sm font-bold leading-7 text-ink/80">{order.customerSubmitted && order.finalPaymentRequested ? order.finalPaymentInstructions : order.paymentInstructions}</p>
            {copyState === "failed" && <p className="mt-2 text-sm text-error" role="alert">کپی خودکار ممکن نشد؛ شماره کارت بالا را نگه دارید و انتخاب کنید.</p>}
            {ibanCopyState === "failed" && <p className="mt-2 text-sm text-error" role="alert">کپی خودکار ممکن نشد؛ شماره شبا بالا را نگه دارید و انتخاب کنید.</p>}
          </section>}

          {order.initialPaymentAmount && order.customerSubmitted && order.finalPaymentRequested && !order.finalPaymentConfirmed && (
            order.finalReceiptUploaded ? (
              <section className="mt-5 rounded-3xl border border-saffron/40 bg-saffron/10 p-5" aria-live="polite">
                <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-saffron text-ink"><ClipboardCheck className="size-5" aria-hidden="true" /></span><div><h2 className="font-black">رسید نهایی ارسال شد</h2><p className="mt-1 text-sm text-ink/65">فروشگاه در حال بررسی پرداخت نهایی است.</p></div></div>
              </section>
            ) : order.status !== "cancelled" ? (
              <form className="mt-5 rounded-3xl border-2 border-saffron/55 bg-white p-5 shadow-sm" onSubmit={submitFinalReceipt}>
                <p className="text-xs font-black text-saffron">مرحله دوم</p>
                <h2 className="mt-1 text-xl font-black">رسید پرداخت نهایی را بفرستید</h2>
                <p className="mt-2 text-sm leading-7 text-ink/70">پس از واریز، تصویر رسید را بررسی و همین‌جا ثبت کنید.</p>
                <div className="mt-4"><ReceiptPicker id="final-payment-receipt" file={finalReceipt} onChange={(file) => { setFinalReceipt(file); setFinalReceiptError(""); }} /></div>
                {finalReceiptError && <p className="mt-2 text-sm text-error" role="alert">{finalReceiptError}</p>}
                <p className="mt-2 text-xs leading-6 text-ink/60">رسید پس از ارسال قابل جایگزینی نیست.</p>
                {finalError && <div className="mt-3"><ErrorNotice>{finalError}</ErrorNotice></div>}
                <button className="primary-button mt-4 w-full" type="submit" disabled={finalPending}>
                  {finalPending ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}
                  {finalPending ? "در حال ارسال…" : "ارسال رسید پرداخت نهایی"}
                </button>
              </form>
            ) : null
          )}

          {order.customerSubmissionAllowed && (
            <form className="mt-8 space-y-5" onSubmit={submitDetails} onFocusCapture={startForm} noValidate>
              <div>
                <h2 className="text-xl font-black">اطلاعات تحویل</h2>
                <p className="mt-1 text-sm leading-7 text-ink/70">پس از ثبت، اطلاعات برای شما قفل می‌شود و فروشگاه سفارش را بررسی می‌کند.</p>
                {supportAction("پیام به فروشگاه")}
              </div>
              <label className="block" htmlFor="customer-name">
                <span className="mb-2 block text-sm font-bold">نام و نام خانوادگی</span>
                <input
                  id="customer-name"
                  className="field"
                  autoComplete="name"
                  value={draft.fullName}
                  onChange={(event) => updateDraft("fullName", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.fullName)}
                  aria-describedby={fieldErrors.fullName ? "customer-name-error" : undefined}
                />
                {fieldErrors.fullName && <span id="customer-name-error" className="mt-2 block text-sm text-error" role="alert">{fieldErrors.fullName}</span>}
              </label>
              <label className="block" htmlFor="customer-mobile">
                <span className="mb-2 block text-sm font-bold">شماره موبایل</span>
                <input
                  id="customer-mobile"
                  className="field"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="09123456789"
                  value={draft.mobile}
                  onChange={(event) => updateDraft("mobile", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.mobile)}
                  aria-describedby={fieldErrors.mobile ? "customer-mobile-error" : undefined}
                />
                {fieldErrors.mobile && <span id="customer-mobile-error" className="mt-2 block text-sm text-error" role="alert">{fieldErrors.mobile}</span>}
              </label>
              <label className="block" htmlFor="customer-address">
                <span className="mb-2 block text-sm font-bold">نشانی کامل</span>
                <textarea
                  id="customer-address"
                  className="field min-h-32 py-3"
                  autoComplete="street-address"
                  value={draft.address}
                  onChange={(event) => updateDraft("address", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.address)}
                  aria-describedby={fieldErrors.address ? "customer-address-error" : undefined}
                />
                {fieldErrors.address && <span id="customer-address-error" className="mt-2 block text-sm text-error" role="alert">{fieldErrors.address}</span>}
              </label>
              <label className="block" htmlFor="customer-postal-code">
                <span className="mb-2 block text-sm font-bold">کد پستی <span className="font-normal text-ink/60">(اختیاری)</span></span>
                <input
                  id="customer-postal-code"
                  className="field"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  dir="ltr"
                  value={draft.postalCode}
                  onChange={(event) => updateDraft("postalCode", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.postalCode)}
                  aria-describedby={fieldErrors.postalCode ? "customer-postal-error" : undefined}
                />
                {fieldErrors.postalCode && <span id="customer-postal-error" className="mt-2 block text-sm text-error" role="alert">{fieldErrors.postalCode}</span>}
              </label>
              <label className="block" htmlFor="customer-note">
                <span className="mb-2 block text-sm font-bold">یادداشت برای فروشگاه <span className="font-normal text-ink/60">(اختیاری)</span></span>
                <textarea id="customer-note" className="field min-h-24 py-3" value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} />
              </label>
              <div>
                <span className="mb-2 block text-sm font-bold">تصویر {order.initialPaymentAmount ? "رسید پرداخت اول" : "رسید پرداخت"}</span>
                <ReceiptPicker id="customer-receipt" file={receipt} onChange={(file) => { setReceipt(file); setReceiptError(""); }} />
                {receiptError && <span className="mt-2 block text-sm text-error" role="alert">{receiptError}</span>}
                <span className="mt-2 block text-xs leading-6 text-ink/65">بارگذاری رسید به معنی تأیید پرداخت نیست؛ فروشگاه آن را بررسی می‌کند.</span>
              </div>
              {error && <ErrorNotice>{error}</ErrorNotice>}
              <button className="primary-button w-full" type="submit" disabled={pending}>
                {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}
                {pending ? "در حال ثبت…" : order.initialPaymentAmount ? "ثبت اطلاعات و ارسال رسید اول" : "ثبت اطلاعات و ارسال رسید"}
              </button>
            </form>
          )}

          {!order.customerSubmitted && !order.customerSubmissionAllowed && (
            <section className="mt-7 rounded-3xl border border-error/25 bg-error/8 p-5">
              <h2 className="font-black">ثبت اطلاعات این سفارش بسته شده است</h2>
              <p className="mt-2 text-sm leading-7 text-ink/70">برای پیگیری یا اصلاح سفارش با فروشگاه تماس بگیرید.</p>
              {supportAction("پیام به فروشگاه")}
            </section>
          )}

          {order.customerSubmitted && (
            <section className="mt-7 rounded-3xl border border-teal/25 bg-teal/8 p-5" aria-live="polite">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-teal text-white"><Check className="size-5" aria-hidden="true" /></span>
                <div>
                  <h2 className="font-black">اطلاعات تحویل ثبت شد</h2>
                  <p className="mt-1 text-sm text-ink/70">فروشگاه سفارش شما را بررسی می‌کند.</p>
                </div>
              </div>
              <p className="mt-4 border-t border-teal/15 pt-4 text-sm font-bold">{order.receiptUploaded ? order.initialPaymentAmount ? "رسید پرداخت اول بارگذاری شده است." : "رسید پرداخت بارگذاری شده است." : "هنوز رسیدی بارگذاری نشده است."}</p>
              {order.customerSummary && (
                <dl className="mt-4 grid gap-3 border-t border-teal/15 pt-4 text-sm">
                  <div><dt className="text-xs font-bold text-ink/60">گیرنده</dt><dd className="mt-1 font-bold">{order.customerSummary.fullName}</dd></div>
                  <div><dt className="text-xs font-bold text-ink/60">شماره ثبت‌شده</dt><dd className="mt-1 font-bold" dir="ltr">{order.customerSummary.mobile}</dd></div>
                  <div><dt className="text-xs font-bold text-ink/60">نشانی ثبت‌شده</dt><dd className="mt-1 font-bold">{order.customerSummary.addressPreview}</dd></div>
                  {order.customerSummary.postalCodeSuffix && (
                    <div>
                      <dt className="text-xs font-bold text-ink/60">پایان کد پستی</dt>
                      <dd className="mt-1 font-bold" dir="ltr">••••••{order.customerSummary.postalCodeSuffix}</dd>
                    </div>
                  )}
                </dl>
              )}
              {supportAction("درخواست اصلاح اطلاعات")}
            </section>
          )}

          {order.customerSubmitted && order.history.length > 0 && (
            <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
              <h2 className="font-black">روند سفارش</h2>
              <ol className="mt-4 border-r-2 border-ledger pr-5">
                {order.history.map((entry, index) => (
                  <li className="relative pb-5 last:pb-0" key={`${entry.createdAt}-${index}`}>
                    <span className="absolute -right-[1.7rem] top-1 size-3 rounded-full bg-teal" />
                    <p className="font-bold">{order.initialPaymentAmount && entry.status === "paid" ? "پرداخت اول تأیید شد" : publicStatusLabels[entry.status] ?? entry.status}</p>
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
