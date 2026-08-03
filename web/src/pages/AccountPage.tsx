import { Check, CircleCheck, CreditCard, LoaderCircle, LogOut, Pencil, Plus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorNotice } from "../components";
import { api, defaultShareMessageTemplate, persianNumber, type Me, type PaymentCard, type Shop } from "../shared";

function formatCardNumber(value: string) {
  return value.match(/.{1,4}/g)?.join(" ") ?? value;
}

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
  const [cardPending, setCardPending] = useState("");
  const [cardError, setCardError] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [addingCard, setAddingCard] = useState(false);
  const [editingCardID, setEditingCardID] = useState<number | null>(null);
  const [editedInstructions, setEditedInstructions] = useState("");
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
    setCardError("");
    setCardNumber("");
    setPaymentInstructions("");
    setAddingCard(false);
    setEditingCardID(null);
  }, [shop.id]);

  function updateCards(paymentCards: PaymentCard[]) {
    onShopUpdated({ ...shop, paymentCards });
  }

  async function addPaymentCard(event: FormEvent) {
    event.preventDefault();
    if (cardPending || saving) return;
    setCardPending("add");
    setCardError("");
    try {
      const card = await api<PaymentCard>(`/api/shops/${shop.id}/payment-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardNumber, paymentInstructions }),
      });
      updateCards([...shop.paymentCards, card]);
      setCardNumber("");
      setPaymentInstructions("");
      setAddingCard(false);
    } catch (reason) {
      setCardError(reason instanceof Error ? reason.message : "کارت ذخیره نشد.");
    } finally {
      setCardPending("");
    }
  }

  async function saveCardInstructions(cardID: number) {
    if (cardPending || saving) return;
    setCardPending(`edit-${cardID}`);
    setCardError("");
    try {
      const card = await api<PaymentCard>(`/api/shops/${shop.id}/payment-cards/${cardID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentInstructions: editedInstructions }),
      });
      updateCards(shop.paymentCards.map((current) => current.id === card.id ? card : current));
      setEditingCardID(null);
    } catch (reason) {
      setCardError(reason instanceof Error ? reason.message : "توضیحات پرداخت ذخیره نشد.");
    } finally {
      setCardPending("");
    }
  }

  async function activateCard(card: PaymentCard) {
    if (cardPending || saving) return;
    if (!window.confirm(`شماره کارت ${formatCardNumber(card.cardNumber)} برای سفارش‌های جدید فعال شود؟`)) return;
    setCardPending(`activate-${card.id}`);
    setCardError("");
    try {
      const activeCard = await api<PaymentCard>(`/api/shops/${shop.id}/payment-cards/${card.id}/activate`, { method: "POST" });
      updateCards(shop.paymentCards.map((current) => ({ ...current, active: current.id === activeCard.id })));
    } catch (reason) {
      setCardError(reason instanceof Error ? reason.message : "شماره کارت فعال نشد.");
    } finally {
      setCardPending("");
    }
  }

  async function saveSupport(event: FormEvent) {
    event.preventDefault();
    if (cardPending || saving) return;
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

  const orderedCards = [...shop.paymentCards].sort((left, right) => Number(right.active) - Number(left.active));

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
      <section className="mt-5 rounded-3xl border border-ledger bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-saffron/15 text-ink"><CreditCard className="size-5" aria-hidden="true" /></span>
          <div>
            <h2 className="font-black">کارت‌های پرداخت</h2>
            <p className="mt-1 text-sm leading-7 text-ink/65">کارت فعال فقط به سفارش‌های جدید اختصاص پیدا می‌کند.</p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {orderedCards.map((card) => (
            <article className={`relative overflow-hidden rounded-[1.4rem] border p-4 ${card.active ? "border-ink bg-ink text-white shadow-[0_14px_32px_rgb(24_59_78_/_18%)]" : "border-ledger bg-paper/70"}`} key={card.id}>
              {card.active && <CreditCard className="absolute -bottom-7 -left-5 size-28 rotate-[-12deg] text-white opacity-[0.06]" strokeWidth={1.2} aria-hidden="true" />}
              <div className="relative flex items-center justify-between gap-3">
                <div className={`flex items-center gap-2 text-xs font-black ${card.active ? "text-saffron" : "text-ink/55"}`}>
                  {card.active ? <CircleCheck className="size-4" aria-hidden="true" /> : <CreditCard className="size-4" aria-hidden="true" />}
                  {card.active ? "کارت فعال" : "کارت ذخیره‌شده"}
                </div>
                <button
                  className={`grid size-11 shrink-0 place-items-center rounded-xl transition-colors ${card.active ? "bg-white/10 text-white hover:bg-white/15" : "text-teal hover:bg-ledger/70"}`}
                  type="button"
                  aria-label={`ویرایش توضیحات کارت ${formatCardNumber(card.cardNumber)}`}
                  onClick={() => { setEditingCardID(card.id); setEditedInstructions(card.paymentInstructions); setCardError(""); }}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
              </div>
              <p className="relative mt-3 text-left text-lg font-black tracking-[0.08em] sm:text-xl" dir="ltr">{formatCardNumber(card.cardNumber)}</p>
              {editingCardID === card.id ? (
                <div className={`relative mt-4 border-t pt-4 ${card.active ? "border-white/15" : "border-ledger"}`}>
                  <label className={`mb-2 block text-xs font-bold ${card.active ? "text-white/70" : "text-ink/60"}`} htmlFor={`card-instructions-${card.id}`}>توضیحات پرداخت</label>
                  <textarea id={`card-instructions-${card.id}`} className="field min-h-28 resize-y leading-7 text-ink" maxLength={1000} value={editedInstructions} onChange={(event) => setEditedInstructions(event.target.value)} />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="secondary-button" type="button" onClick={() => setEditingCardID(null)}>انصراف</button>
                    <button className="primary-button" type="button" disabled={cardPending !== "" || saving} onClick={() => saveCardInstructions(card.id)}>
                      {cardPending === `edit-${card.id}` ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}{cardPending === `edit-${card.id}` ? "در حال ذخیره…" : "ذخیره"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className={`relative mt-3 whitespace-pre-wrap border-t pt-3 text-sm leading-7 ${card.active ? "border-white/15 text-white/75" : "border-ledger text-ink/65"}`}>{card.paymentInstructions}</p>
              )}
              {!card.active && editingCardID !== card.id && (
                <button className="relative mt-3 min-h-11 w-full rounded-xl bg-teal/10 px-3 text-sm font-black text-teal transition-colors hover:bg-teal/15" type="button" disabled={cardPending !== "" || saving} onClick={() => activateCard(card)}>
                  {cardPending === `activate-${card.id}` ? <span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />در حال فعال‌سازی…</span> : "انتخاب برای سفارش‌های جدید"}
                </button>
              )}
            </article>
          ))}
          {!orderedCards.length && <p className="rounded-2xl bg-ledger/50 p-4 text-sm leading-7 text-ink/65">هنوز کارت پرداختی ثبت نشده است.</p>}
        </div>
        {addingCard ? (
          <form className="mt-4 rounded-2xl border border-teal/25 bg-teal/5 p-4" onSubmit={addPaymentCard}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black">کارت جدید</h3>
                <p className="mt-1 text-xs leading-6 text-ink/60">پس از ذخیره، خودتان آن را فعال می‌کنید.</p>
              </div>
              <button className="grid size-11 place-items-center rounded-xl text-ink/60 hover:bg-white" type="button" aria-label="بستن فرم کارت جدید" onClick={() => { setAddingCard(false); setCardError(""); }}><X className="size-5" aria-hidden="true" /></button>
            </div>
            <label className="mt-4 block" htmlFor="new-card-number">
              <span className="mb-2 block text-sm font-bold">شماره کارت</span>
              <input id="new-card-number" className="field text-left tracking-wider" inputMode="numeric" dir="ltr" autoComplete="off" placeholder="6037 9918 1234 5678" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} required />
            </label>
            <label className="mt-4 block" htmlFor="new-card-instructions">
              <span className="mb-2 block text-sm font-bold">توضیحات پرداخت</span>
              <textarea id="new-card-instructions" className="field min-h-28 resize-y leading-7" maxLength={1000} placeholder="مثلاً نام صاحب کارت" value={paymentInstructions} onChange={(event) => setPaymentInstructions(event.target.value)} required />
            </label>
            <button className="primary-button mt-4 w-full" type="submit" disabled={cardPending !== "" || saving}>
              {cardPending === "add" ? <LoaderCircle className="size-5 animate-spin" /> : <Plus className="size-5" />}
              {cardPending === "add" ? "در حال ذخیره…" : "ذخیره کارت"}
            </button>
          </form>
        ) : (
          <button className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-teal/40 bg-teal/5 px-4 font-black text-teal transition-colors hover:bg-teal/10" type="button" onClick={() => { setAddingCard(true); setEditingCardID(null); setCardError(""); }}>
            <Plus className="size-5" aria-hidden="true" />افزودن کارت جدید
          </button>
        )}
        {cardError && <div className="mt-4"><ErrorNotice>{cardError}</ErrorNotice></div>}
      </section>
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
        <button className="primary-button mt-5 w-full" type="submit" disabled={saving || cardPending !== ""}>
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
