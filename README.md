# ردیف

نسخه آزمایشی ثبت و پیگیری سفارش برای فروشگاه‌های اینستاگرامی.

شرح به‌روز محصول، قابلیت‌های پیاده‌شده، دلیل هر قابلیت و زمینه لازم برای
برنامه‌ریزی مراحل بعد در [PRODUCT.md](PRODUCT.md) قرار دارد.

## پیش‌نیازها

- Go 1.26
- Node.js 24 و npm
- Docker و Docker Compose

## راه‌اندازی

```sh
npm --prefix web ci
APP_ORIGIN=http://localhost:5173 make dev
```

To try signup or password reset without an SMS provider, use a fixed local-only OTP:

```sh
DEV_OTP_CODE=123456 APP_ORIGIN=http://localhost:5173 make dev
```

رابط توسعه روی `http://localhost:5173` اجرا می‌شود و درخواست‌های `/api` را به سرور Go روی پورت `8080` می‌فرستد.

## پایگاه داده و داده آزمایشی

فرمان‌های توسعه PostgreSQL را با Docker Compose روی پورت `5433` اجرا می‌کنند. داده پایگاه داده در volume داکر نگهداری می‌شود و `make db-down` سرویس را بدون حذف داده متوقف می‌کند.

نشانی اتصال پیش‌فرض `postgres://postgres:postgres@localhost:5433/insta_helper?sslmode=disable` است. متغیر `DATABASE_URL` آن را برای محیط‌های دیگر تغییر می‌دهد. برنامه هنگام شروع migrationهای تعبیه‌شده Goose را اجرا می‌کند.

برای ساخت یا به‌روزرسانی تنها حساب مدیر، اطلاعات ورود را در متغیرهای محیطی قرار دهید و فرمان seed را اجرا کنید:

```sh
SEED_ADMIN_LOGIN=admin \
SEED_ADMIN_PASSWORD='replace-me' \
SEED_ADMIN_NAME='مدیر فروشگاه' \
make seed
```

`SEED_ADMIN_NAME` اختیاری است. اجرای دوباره این فرمان رکورد تکراری ایجاد نمی‌کند و رمز همان مدیر را به‌روزرسانی می‌کند. فروشگاه باید جداگانه ساخته شود؛ محصول‌ها پس از ورود از بخش «محصول‌ها» مدیریت می‌شوند.

## نشست و امنیت

تنظیمات نشست مدیر با متغیرهای زیر انجام می‌شود:

- `APP_ORIGIN`: مبدأ مجاز درخواست‌های تغییردهنده، پیش‌فرض `http://localhost:8080`
- `DATABASE_URL`: نشانی اتصال PostgreSQL
- `SESSION_LIFETIME`: مدت نشست با قالب duration زبان Go، پیش‌فرض `720h`
- `COOKIE_SECURE`: در محیط HTTPS روی `true` قرار گیرد، پیش‌فرض `false`
- `MAX_RECEIPT_BYTES`: بیشترین حجم تصویر رسید به بایت، پیش‌فرض `5242880` (۵ مگابایت)
- `DATA_DIR`: پوشه نگهداری رسیدها و تصاویر محصول، پیش‌فرض `data`

اطلاعات مشتری و رسید اول در یک مرحله ثبت می‌شوند. سفارش‌های جدید می‌توانند پرداخت دو مرحله‌ای داشته باشند و رسید نهایی را بعداً با همان لینک مشتری دریافت کنند. همه رسیدها در `DATA_DIR/receipts` و تصویرهای عمومی محصول در `DATA_DIR/product-images` نگهداری می‌شوند؛ از هر دو پوشه همراه PostgreSQL پشتیبان بگیرید.

برای توسعه محلی با Vite، `APP_ORIGIN` باید دقیقاً روی `http://localhost:5173` تنظیم شود؛ درخواست‌های تغییردهنده با مبدأ متفاوت رد می‌شوند.

## ساخت و اجرا

```sh
make run
```

نسخه تولید روی `http://localhost:8080` در دسترس است. برای اجرای بررسی‌های ساخت از `make check` استفاده کنید.

`make check` ابتدا PostgreSQL توسعه را آماده می‌کند و تست‌های Go را در schemaهای موقت و جدا اجرا می‌کند. در CI می‌توان نشانی پایگاه داده تست را با `TEST_DATABASE_URL` تعیین کرد.

## استقرار

ساخت image روی رایانه محلی، استقرار بدون source، Caddy، TLS، PostgreSQL، پشتیبان‌گیری شبانه، دانلود، بازیابی و اتصال DBeaver در [DEPLOYMENT.md](DEPLOYMENT.md) مستند شده‌اند.
