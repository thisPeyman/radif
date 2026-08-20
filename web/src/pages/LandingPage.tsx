import { ArrowLeft, Check, ClipboardCheck, ClipboardList, Clock3, Link2, MessageCircle, Package, Store, Truck, UserRoundCheck } from "lucide-react";
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
            <h1>دایرکت برای فروش؛<br /><span>ردیف</span> برای سفارش.</h1>
            <p className="landing-lead">وقتی خرید قطعی شد، سفارش را بساز و لینک را برای مشتری بفرست. آدرس، رسید، وضعیت و کد رهگیری همان‌جا می‌ماند.</p>
            <div className="landing-actions">
              <NavLink className="landing-pilot-button" to="/login" aria-describedby="trial-note">شروع رایگان ۱۴ روزه</NavLink>
              <a className="landing-text-link" href="#how-it-works">
                ببین چطور کار می‌کند
                <ArrowLeft className="size-4" aria-hidden="true" />
              </a>
            </div>
            <p id="trial-note" className="landing-pilot-note">با شماره موبایل شروع کن؛ مشتری نیازی به ساخت حساب ندارد.</p>
          </div>

          <div className="landing-ledger" aria-label="نمایی از تبدیل گفت‌وگوی فروش به سفارش قابل پیگیری در ردیف">
            <div className="landing-ledger-heading">
              <span>امروز در ردیف</span>
              <span>سفارش ۱۴۰۵</span>
            </div>
            <div className="landing-message">
              <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
              <p>عالیه، همین آباژور رو می‌خوام.</p>
            </div>
            <div className="landing-handoff" aria-hidden="true">
              <span>لینک مشتری آماده شد</span>
              <Link2 />
            </div>
            <div className="landing-slip landing-slip-saffron">
              <span className="landing-slip-icon"><Package aria-hidden="true" /></span>
              <span><small>سفارش ساخته شد</small><strong>آباژور چوبی × ۱</strong></span>
              <span className="landing-slip-state">جدید</span>
            </div>
            <div className="landing-slip landing-slip-teal">
              <span className="landing-slip-icon"><ClipboardCheck aria-hidden="true" /></span>
              <span><small>مشتری از همان لینک</small><strong>آدرس و رسید را ثبت کرد</strong></span>
              <span className="landing-slip-state">کامل</span>
            </div>
            <div className="landing-slip landing-slip-ink">
              <span className="landing-slip-icon"><Truck aria-hidden="true" /></span>
              <span><small>آخرین وضعیت</small><strong>آماده ارسال</strong></span>
              <span className="landing-slip-state">امروز</span>
            </div>
          </div>
        </section>

        <aside className="landing-trust" aria-label="ویژگی‌های شروع کار با ردیف">
          <p><Clock3 aria-hidden="true" /><strong>۱۴ روز رایگان</strong><span>برای امتحان با سفارش واقعی</span></p>
          <p><UserRoundCheck aria-hidden="true" /><strong>بدون حساب مشتری</strong><span>فقط با همان لینک سفارش</span></p>
          <p><MessageCircle aria-hidden="true" /><strong>دایرکت سر جای خودش</strong><span>ردیف بعد از قطعی‌شدن خرید</span></p>
        </aside>

        <section id="how-it-works" className="landing-section landing-process">
          <div className="landing-section-heading">
            <p className="landing-eyebrow">همان فروش همیشگی، مرتب‌تر</p>
            <h2>از دایرکت تا ارسال، در سه قدم</h2>
            <p>ردیف جای گفت‌وگو با مشتری را نمی‌گیرد. فقط از جایی وارد می‌شود که خرید قطعی شده و باید سفارش را تحویل بدهی.</p>
          </div>
          <ol className="landing-steps">
            <li>
              <span className="landing-step-number">۱</span>
              <MessageCircle aria-hidden="true" />
              <h3>فروش را قطعی کن</h3>
              <p>مثل همیشه در دایرکت گفت‌وگو کن و محصول را بفروش.</p>
            </li>
            <li>
              <span className="landing-step-number">۲</span>
              <Link2 aria-hidden="true" />
              <h3>لینک سفارش را بفرست</h3>
              <p>محصول و زمان تحویل را انتخاب کن؛ ردیف پیام مشتری را آماده می‌کند.</p>
            </li>
            <li>
              <span className="landing-step-number">۳</span>
              <ClipboardList aria-hidden="true" />
              <h3>سفارش را جلو ببر</h3>
              <p>آدرس و رسید را ببین، وضعیت را به‌روز کن و کد رهگیری بفرست.</p>
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
              <span><small>کار امروز</small><strong>سفارش‌ها</strong></span>
              <span>۳ فعال</span>
            </div>
            <div className="landing-preview-orders">
              <article className="landing-preview-order landing-preview-order-saffron">
                <span><small>ردیف ۱۴۰۵ · تحویل امروز</small><strong>گلدان صدف</strong><em>هنوز اطلاعات مشتری ثبت نشده</em></span>
                <b>در انتظار مشتری</b>
              </article>
              <article className="landing-preview-order landing-preview-order-teal">
                <span><small>ردیف ۱۴۰۴ · تحویل فردا</small><strong>شمع موج × ۲</strong><em>رسید پرداخت تأیید شده</em></span>
                <b>آماده‌سازی</b>
              </article>
              <article className="landing-preview-order landing-preview-order-ink">
                <span><small>ردیف ۱۴۰۳ · ارسال امروز</small><strong>آباژور چوبی</strong><em>کد رهگیری ثبت شده</em></span>
                <b>ارسال شده</b>
              </article>
            </div>
          </div>

          <div className="landing-proof-copy">
            <p className="landing-eyebrow">هر سفارش، سر جای خودش</p>
            <h2>برای پیدا کردن سفارش، دایرکت را زیر و رو نکن.</h2>
            <p>هر چیزی که برای آماده‌کردن و فرستادن سفارش لازم داری، از رسید پرداخت تا کد رهگیری، کنار همان سفارش می‌ماند.</p>
            <ul>
              <li><Check aria-hidden="true" />آدرس و رسید کنار مشخصات سفارش</li>
              <li><Check aria-hidden="true" />وضعیت روشن از انتظار تا ارسال</li>
              <li><Check aria-hidden="true" />پیگیری مشتری از همان لینک</li>
            </ul>
            <div className="landing-client-proof">
              <img className="landing-client-logo" src="/images/miroki.jpg" alt="" />
              <p><strong>میروکی، فروشگاه آنلاین دنج</strong><span>سفارش‌های اینستاگرامی چراغ‌های پرینت سه‌بعدی‌اش را با ردیف یک‌جا مدیریت می‌کند.</span></p>
            </div>
          </div>
        </section>

        <section className="landing-cta">
          <div>
            <p className="landing-eyebrow">شروع با سفارش واقعی</p>
            <h2>۱۴ روز، فروشگاهت را با ردیف بچرخان.</h2>
            <p>محصول‌ها را ثبت کن، اولین سفارش را بساز و ببین چقدر از رفت‌وبرگشت میان پیام‌ها کم می‌شود.</p>
          </div>
          <div className="landing-cta-action">
            <NavLink className="landing-pilot-button" to="/login">شروع رایگان ۱۴ روزه</NavLink>
            <span>ثبت‌نام با شماره موبایل</span>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p><strong>ردیف</strong> · دفتر آرام سفارش‌های فروشگاه‌های کوچک</p>
        <div className="landing-footer-links">
          <a href="https://wa.me/989362507047" target="_blank" rel="noreferrer">پشتیبانی واتساپ</a>
          <NavLink to="/login">ورود کاربران</NavLink>
        </div>
      </footer>
    </div>
  );
}
