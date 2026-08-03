import { Check, LoaderCircle, LogOut } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorNotice } from "../components";
import { api, defaultShareMessageTemplate, persianNumber, type Me, type Shop } from "../shared";

export default function AccountPage({ me, shop, onShopUpdated, onLogout }: {
  me: Me;
  shop: Shop;
  onShopUpdated: (shop: Shop) => void;
  onLogout: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [instagramUsername, setInstagramUsername] = useState(shop.instagramUsername ?? "");
  const [whatsappNumber, setWhatsappNumber] = useState(shop.whatsappNumber ? `+${shop.whatsappNumber}` : "");
  const [supportChannel, setSupportChannel] = useState(shop.supportChannel ?? "");
  const [shareMessageTemplate, setShareMessageTemplate] = useState(shop.shareMessageTemplate ?? "");

  useEffect(() => {
    setInstagramUsername(shop.instagramUsername ?? "");
    setWhatsappNumber(shop.whatsappNumber ? `+${shop.whatsappNumber}` : "");
    setSupportChannel(shop.supportChannel ?? "");
    setShareMessageTemplate(shop.shareMessageTemplate ?? "");
    setSaved(false);
    setError("");
  }, [shop.id]);

  async function saveSupport(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const support = await api<{
        instagramUsername?: string;
        whatsappNumber?: string;
        supportChannel?: "instagram" | "whatsapp";
        shareMessageTemplate?: string;
      }>(`/api/shops/${shop.id}/support`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagramUsername, whatsappNumber, supportChannel, shareMessageTemplate }),
      });
      onShopUpdated({ ...shop, ...support });
      setInstagramUsername(support.instagramUsername ?? "");
      setWhatsappNumber(support.whatsappNumber ? `+${support.whatsappNumber}` : "");
      setSupportChannel(support.supportChannel ?? "");
      setShareMessageTemplate(support.shareMessageTemplate ?? "");
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تنظیمات فروشگاه ذخیره نشد.");
    } finally {
      setSaving(false);
    }
  }

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
      <form className="mt-5 rounded-3xl border border-ledger bg-white p-5 shadow-sm" onSubmit={saveSupport}>
        <h2 className="font-black">راه ارتباطی مشتریان</h2>
        <p className="mt-1 text-sm leading-7 text-ink/70">مشتری برای پرسش یا اصلاح سفارش از راه انتخاب‌شده به شما پیام می‌دهد.</p>
        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-bold">نام کاربری اینستاگرام</span>
          <input className="field" dir="ltr" placeholder="shopname" value={instagramUsername} onChange={(event) => { setInstagramUsername(event.target.value); setSaved(false); }} />
        </label>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-bold">شماره واتساپ</span>
          <input
            className="field"
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="09123456789"
            value={whatsappNumber}
            onChange={(event) => { setWhatsappNumber(event.target.value); setSaved(false); }}
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-bold">راه پیش‌فرض</span>
          <select className="field" value={supportChannel} onChange={(event) => { setSupportChannel(event.target.value as "" | "instagram" | "whatsapp"); setSaved(false); }}>
            <option value="">نمایش ندادن راه ارتباطی</option>
            <option value="instagram">اینستاگرام</option>
            <option value="whatsapp">واتساپ</option>
          </select>
        </label>
        <div className="my-5 h-px bg-ledger" />
        <h2 className="font-black">پیام اشتراک‌گذاری سفارش</h2>
        <p className="mt-1 text-sm leading-7 text-ink/70">متن دلخواه را با متغیرهای زیر بنویسید. خالی‌گذاشتن این بخش، پیام پیش‌فرض را برمی‌گرداند.</p>
        <p className="mt-2 text-xs leading-6 text-ink/70" dir="ltr">{`{shopName} · {orderCode} · {customerUrl} · {amount} · {deliveryDate}`}</p>
        <label className="mt-4 block">
          <span className="sr-only">متن پیام اشتراک‌گذاری</span>
          <textarea
            className="field min-h-40 resize-y leading-7"
            maxLength={1000}
            placeholder={defaultShareMessageTemplate}
            value={shareMessageTemplate}
            onChange={(event) => { setShareMessageTemplate(event.target.value); setSaved(false); }}
          />
        </label>
        <p className="mt-2 text-xs leading-6 text-ink/70">پیام سفارشی باید شامل <span dir="ltr">{"{customerUrl}"}</span> باشد.</p>
        {saved && <p className="mt-4 text-sm font-bold text-teal" role="status">تنظیمات فروشگاه ذخیره شد.</p>}
        <button className="primary-button mt-5 w-full" type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
          {saving ? "در حال ذخیره…" : "ذخیره تنظیمات"}
        </button>
      </form>
      {error && <div className="mt-4"><ErrorNotice>{error}</ErrorNotice></div>}
      <button className="secondary-button mt-6 w-full text-error" type="button" onClick={logout} disabled={pending}>
        {pending ? <LoaderCircle className="size-5 animate-spin" /> : <LogOut className="size-5" />}
        {pending ? "در حال خروج…" : "خروج از حساب"}
      </button>
    </section>
  );
}
