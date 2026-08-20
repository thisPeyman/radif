import { ArrowLeft, Check, Clipboard, ClipboardCheck, ClipboardList, MessageCircle, Package, Store, Truck } from "lucide-react";
import { NavLink } from "react-router";
import { Brand } from "../components";

export default function LandingPage() {
  return (
    <div className="landing-page text-ink">
      <header className="landing-header">
        <NavLink className="landing-brand" to="/" aria-label="ردیف، صفحه اصلی"><Brand /></NavLink>
        <NavLink className="landing-login" to="/login">ورود کاربران</NavLink>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">دفتر سفارش فروشگاه‌های اینستاگرامی</p>
            <h1>فروش در دایرکت؛<br />سفارش در <span>ردیف</span></h1>
            <p className="landing-lead">بعد از قطعی‌شدن خرید، سفارش را بساز، لینک را در دایرکت بفرست و آدرس، رسید و وضعیت ارسال را یک‌جا نگه دار.</p>
            <div className="landing-actions">
              <NavLink className="landing-pilot-button" to="/login" aria-describedby="pilot-status">شروع آزمایشی رایگان ۱۴ روزه</NavLink>
              <a className="landing-text-link" href="#how-it-works">
                دیدن روند کار
                <ArrowLeft className="size-4" aria-hidden="true" />
              </a>
            </div>
            <p id="pilot-status" className="landing-pilot-note">دسترسی آزمایشی ۱۴ روزه برای تعداد محدودی فروشگاه</p>
          </div>

          <div className="landing-ledger" aria-label="نمایی از روند ثبت و پیگیری سفارش در ردیف">
            <div className="landing-ledger-heading">
              <span>امروز در ردیف</span>
              <span>۳ سفارش</span>
            </div>
            <div className="landing-message">
              <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
              <p>خرید قطعی شد؛ لینک سفارش را بفرست.</p>
            </div>
            <div className="landing-slip landing-slip-saffron">
              <span className="landing-slip-icon"><Package aria-hidden="true" /></span>
              <span><small>سفارش جدید</small><strong>شمع موج × ۲</strong></span>
              <span className="landing-slip-state">ساخته شد</span>
            </div>
            <div className="landing-slip landing-slip-teal">
              <span className="landing-slip-icon"><ClipboardCheck aria-hidden="true" /></span>
              <span><small>لینک مشتری</small><strong>اطلاعات و رسید ثبت شد</strong></span>
              <span className="landing-slip-state">کامل</span>
            </div>
            <div className="landing-slip landing-slip-ink">
              <span className="landing-slip-icon"><Truck aria-hidden="true" /></span>
              <span><small>وضعیت سفارش</small><strong>آماده ارسال</strong></span>
              <span className="landing-slip-state">امروز</span>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="landing-section landing-process">
          <div className="landing-section-heading">
            <p className="landing-eyebrow">یک مسیر کوتاه و واقعی</p>
            <h2>از دایرکت تا ارسال، در سه قدم</h2>
            <p>ردیف جای گفت‌وگوی فروش را نمی‌گیرد؛ فقط بعد از خرید، سفارش را از میان پیام‌ها بیرون می‌آورد.</p>
          </div>
          <ol className="landing-steps">
            <li>
              <span className="landing-step-number">۱</span>
              <MessageCircle aria-hidden="true" />
              <h3>خرید را نهایی کن</h3>
              <p>مثل همیشه در دایرکت با مشتری گفت‌وگو کن و خرید را قطعی کن.</p>
            </li>
            <li>
              <span className="landing-step-number">۲</span>
              <Clipboard aria-hidden="true" />
              <h3>لینک سفارش را بفرست</h3>
              <p>محصول و تاریخ تحویل را انتخاب کن؛ ردیف لینک مشتری را آماده می‌کند.</p>
            </li>
            <li>
              <span className="landing-step-number">۳</span>
              <ClipboardList aria-hidden="true" />
              <h3>همه‌چیز را یک‌جا ببین</h3>
              <p>مشتری بدون ساخت حساب، اطلاعات و رسید را ثبت می‌کند و وضعیت را می‌بیند.</p>
            </li>
          </ol>
        </section>

        <section className="landing-section landing-proof">
          <div className="landing-order-preview" aria-label="نمای نمونه فهرست سفارش‌های ردیف">
            <div className="landing-preview-header">
              <span className="landing-preview-logo"><Store aria-hidden="true" /></span>
              <span><small>نمای نمونه فروشگاه</small><strong>خانه آبی</strong></span>
              <span className="landing-preview-brand">ردیف</span>
            </div>
            <div className="landing-preview-title">
              <span><small>خانه آبی</small><strong>سفارش‌ها</strong></span>
              <span>۳ فعال</span>
            </div>
            <div className="landing-preview-orders">
              <article className="landing-preview-order landing-preview-order-saffron">
                <span><small>ردیف ۱۴۰۵ · امروز</small><strong>گلدان صدف</strong><em>اطلاعات مشتری ثبت نشده</em></span>
                <b>در انتظار مشتری</b>
              </article>
              <article className="landing-preview-order landing-preview-order-teal">
                <span><small>ردیف ۱۴۰۴ · دیروز</small><strong>شمع موج × ۲</strong><em>رسید پرداخت ثبت شده</em></span>
                <b>آماده‌سازی</b>
              </article>
              <article className="landing-preview-order landing-preview-order-ink">
                <span><small>ردیف ۱۴۰۳ · ۲ روز پیش</small><strong>آباژور چوبی</strong><em>کد رهگیری دارد</em></span>
                <b>ارسال شده</b>
              </article>
            </div>
          </div>

          <div className="landing-proof-copy">
            <p className="landing-eyebrow">هر سفارش، سر جای خودش</p>
            <h2>دایرکت برای گفتگو می‌ماند، نه بایگانی.</h2>
            <p>دیگر برای پیدا کردن آدرس یا رسید میان پیام‌ها نگرد. هر چیزی که برای آماده‌کردن و فرستادن سفارش لازم است، کنار همان سفارش می‌ماند.</p>
            <ul>
              <li><Check aria-hidden="true" />آدرس و رسید کنار مشخصات سفارش</li>
              <li><Check aria-hidden="true" />وضعیت روشن از انتظار تا ارسال</li>
              <li><Check aria-hidden="true" />پیگیری مشتری از همان لینک، بدون حساب</li>
            </ul>
          </div>
        </section>

        <section className="landing-cta">
          <div>
            <p className="landing-eyebrow">پایلوت ردیف</p>
            <h2>۱۴ روز با سفارش‌های واقعی امتحانش کن.</h2>
            <div className="landing-client-proof">
              <img className="landing-client-logo" src="/images/miroki.jpg" alt="" />
              <p><strong>میروکی، فروشگاه آنلاین دنج</strong><span>ردیف به میروکی کمک می‌کند سفارش‌های اینستاگرامی چراغ‌های پرینت سه‌بعدی را یک‌جا مدیریت کند.</span></p>
            </div>
          </div>
          <div className="landing-cta-action">
            <NavLink className="landing-pilot-button" to="/login">شروع آزمایشی رایگان ۱۴ روزه</NavLink>
            <span>دسترسی آزمایشی ۱۴ روزه برای تعداد محدودی فروشگاه</span>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p><strong>ردیف</strong> · ساخته‌شده برای فروشگاه‌های کوچک اینستاگرامی</p>
        <div className="landing-footer-links">
          <a href="https://wa.me/989362507047" target="_blank" rel="noreferrer">واتساپ</a>
          <NavLink to="/login">ورود کاربران</NavLink>
        </div>
      </footer>
    </div>
  );
}
