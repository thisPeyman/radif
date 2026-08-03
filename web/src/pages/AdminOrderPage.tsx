import { LoaderCircle } from "lucide-react";
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
  persianDate,
  persianDateTime,
  persianDigits,
  persianNumber,
  statusStyles,
  type AdminOrder,
  type CustomerDraft,
} from "../shared";

export default function AdminOrderPage() {
  const { orderID = "" } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [tracking, setTracking] = useState("");
  const [customer, setCustomer] = useState<CustomerDraft>(emptyCustomerDraft);
  const [instagramUsername, setInstagramUsername] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editingInternal, setEditingInternal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"" | "status" | "date" | "tracking" | "customer" | "internal">("");
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
        setInstagramUsername(response.instagramUsername);
        setInternalNote(response.internalNote);
      })
      .catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "سفارش دریافت نشد."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [orderID]);

  async function saveChanges(section: "status" | "date" | "tracking" | "customer" | "internal", changes: Record<string, string>) {
    if (!order) return;
    setSaving(section);
    setError("");
    try {
      const response = await api<AdminOrder>(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      setOrder(response);
      setDate(response.estimatedDeliveryDate);
      setStatus(response.status);
      setTracking(response.shipmentTrackingCode);
      setCustomer({ fullName: response.customerFullName, mobile: response.customerMobile, address: response.customerAddress, postalCode: response.customerPostalCode, note: response.customerNote });
      setInstagramUsername(response.instagramUsername);
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
    setInstagramUsername(order?.instagramUsername ?? "");
    setInternalNote(order?.internalNote ?? "");
    setEditingInternal(false);
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

      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <h2 className="font-black">رسید پرداخت</h2>
        {order.receiptUploaded && order.receiptUrl ? (
          <>
            <img className="mt-4 max-h-96 w-full rounded-2xl bg-ledger object-contain" src={order.receiptUrl} alt="رسید پرداخت مشتری" />
            <a className="secondary-button mt-3 w-full" href={order.receiptUrl} target="_blank" rel="noreferrer">نمایش در اندازه کامل</a>
          </>
        ) : (
          <p className="mt-3 text-sm text-ink/65">رسیدی بارگذاری نشده است.</p>
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
              <p className="text-xs font-bold text-ink/60">اینستاگرام</p>
              <p className="mt-1 font-bold" dir="ltr">{order.instagramUsername ? `@${order.instagramUsername}` : "ثبت نشده"}</p>
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold text-ink/60">یادداشت داخلی</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-7">{order.internalNote || "یادداشتی ثبت نشده است."}</p>
            </div>
          </>
        )}
        {editingInternal && (
          <form className="mt-3 space-y-3" onSubmit={(event) => { event.preventDefault(); void saveChanges("internal", { instagramUsername, internalNote }); }}>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">اینستاگرام مشتری</span>
              <input className="field" dir="ltr" maxLength={101} value={instagramUsername} onChange={(event) => setInstagramUsername(event.target.value)} placeholder="username" />
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
        <CopyButton value={order.customerUrl} label="کپی لینک مشتری" />
      </section>
      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5">
        <h2 className="font-black">تاریخچه وضعیت</h2>
        <ol className="mt-4 border-r-2 border-ledger pr-5">
          {order.history.map((entry, index) => (
            <li className="relative pb-5 last:pb-0" key={`${entry.createdAt}-${index}`}>
              <span className="absolute -right-[1.7rem] top-1 size-3 rounded-full bg-teal" />
              <p className="font-bold">{adminStatusLabels[entry.newStatus] ?? entry.newStatus}</p>
              <p className="mt-1 text-xs text-ink/60">{persianDateTime(entry.createdAt)}{entry.changedByAdminName ? ` · ${entry.changedByAdminName}` : ""}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 border-t border-ledger pt-4 text-xs text-ink/60">ساخته‌شده: {persianDateTime(order.createdAt)} · آخرین تغییر: {persianDateTime(order.updatedAt)}</p>
      </section>
    </section>
  );
}
