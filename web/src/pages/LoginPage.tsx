import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Brand, ErrorNotice } from "../components";
import { api, type Me } from "../shared";

type Step = "identifier" | "password" | "signup" | "reset" | "shop";

export default function LoginPage({ onLogin }: { onLogin: (me: Me) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("identifier");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [shop, setShop] = useState({
    name: "",
    instagramUsername: "",
    cardNumber: "",
    iban: "",
    paymentInstructions: "",
  });
  const navigate = useNavigate();
  const mobile = identifier.replace(/[\s()-]/g, "");
  const done = async () => {
    const me = await api<Me>("/api/me");
    if (me.shops.length) {
      onLogin(me);
      navigate("/orders/new", { replace: true });
    } else setStep("shop");
  };
  const run = async (task: () => Promise<void>) => {
    setPending(true);
    setError("");
    try {
      await task();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "دوباره تلاش کنید.");
    } finally {
      setPending(false);
    }
  };
  function identify(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await api<{ next: "password" | "otp" }>(
        "/api/auth/identify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier }),
        },
      );
      setPassword("");
      setCode("");
      setStep(result.next === "password" ? "password" : "signup");
    });
  }
  function login(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api<void>("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      await done();
    });
  }
  function signup(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api<void>("/api/auth/signup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, code, password }),
      });
      await done();
    });
  }
  function reset(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api<void>("/api/auth/password/reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, code, password }),
      });
      await done();
    });
  }
  function startReset() {
    void run(async () => {
      await api<void>("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });
      setPassword("");
      setCode("");
      setStep("reset");
    });
  }
  function createShop(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api("/api/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shop),
      });
      onLogin(await api<Me>("/api/me"));
      navigate("/orders/new", { replace: true });
    });
  }
  const isCode = step === "signup" || step === "reset";
  const title =
    step === "shop"
      ? "فروشگاهت را بساز."
      : step === "identifier"
        ? "ورود به ردیف."
        : isCode
          ? "رمزت را انتخاب کن."
          : "رمز عبور را وارد کن.";
  const submit =
    step === "identifier"
      ? identify
      : step === "password"
        ? login
        : step === "signup"
          ? signup
          : step === "reset"
            ? reset
            : createShop;
  return (
    <div className="app-viewport flex min-h-dvh flex-col px-6 pb-8 pt-[max(2rem,env(safe-area-inset-top))] text-ink sm:min-h-[760px] sm:px-8 sm:pt-12">
      <Brand />
      <div className="my-auto py-10">
        <div className="border-r-4 border-teal pr-5">
          <h1 className="text-[2rem] font-black leading-[1.65]">{title}</h1>
          <p className="mt-1 text-sm leading-7 text-ink/70">
            {step === "identifier"
              ? "شماره موبایل یا نام کاربری‌ات را وارد کن."
              : step === "shop"
                ? "کارت پرداخت سفارش‌ها را همین‌جا ثبت کن."
                : isCode
                  ? "کد پیامک‌شده و یک رمز حداقل ۸ نویسه‌ای وارد کن."
                  : ""}
          </p>
        </div>
        <form className="mt-10 space-y-5" onSubmit={submit}>
          {step === "identifier" && (
            <label className="block">
              <span className="mb-2 block text-sm font-bold">
                شماره موبایل یا نام کاربری
              </span>
              <input
                className="field text-left"
                dir="ltr"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                required
              />
            </label>
          )}
          {step === "password" && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-ledger bg-ledger/35 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink/55">ورود با</p>
                  <p className="mt-1 truncate text-sm font-black" dir="ltr">{identifier}</p>
                </div>
                <button className="shrink-0 text-sm font-black text-teal" type="button" disabled={pending} onClick={() => setStep("identifier")}>تغییر</button>
              </div>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">رمز عبور</span>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-ink/45" aria-hidden="true" />
                  <input className="field !pl-16 !pr-12" dir="ltr" type={passwordVisible ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                  <button className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-ink/55 hover:bg-ledger/60" type="button" aria-label={passwordVisible ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"} aria-pressed={passwordVisible} onClick={() => setPasswordVisible(!passwordVisible)}>
                    {passwordVisible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
                  </button>
                </div>
              </label>
              {/^((\+|00)?98|0)?9\d{9}$/.test(mobile) && (
                <button
                  className="text-sm font-black text-teal underline decoration-teal/30 underline-offset-4"
                  type="button"
                  disabled={pending}
                  onClick={startReset}
                >
                  رمز عبور را فراموش کرده‌ام
                </button>
              )}
            </>
          )}
          {isCode && (
            <>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">کد شش‌رقمی</span>
                <input
                  className="field text-center tracking-[.5em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  رمز عبور جدید
                </span>
                <input
                  className="field"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
            </>
          )}
          {step === "shop" && (
            <>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  نام فروشگاه
                </span>
                <input
                  className="field"
                  placeholder="مزون آفتاب"
                  value={shop.name}
                  onChange={(event) =>
                    setShop({ ...shop, name: event.target.value })
                  }
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  نام کاربری اینستاگرام (اختیاری)
                </span>
                <input
                  className="field text-left"
                  dir="ltr"
                  placeholder="shopname"
                  value={shop.instagramUsername}
                  onChange={(event) =>
                    setShop({ ...shop, instagramUsername: event.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">شماره کارت</span>
                <input
                  className="field text-left"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="6037 9918 1234 5678"
                  value={shop.cardNumber}
                  onChange={(event) =>
                    setShop({ ...shop, cardNumber: event.target.value })
                  }
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  شماره شبا (اختیاری)
                </span>
                <input
                  className="field text-left"
                  dir="ltr"
                  placeholder="IR12 3456 7890 1234 5678 9012 34"
                  value={shop.iban}
                  onChange={(event) =>
                    setShop({ ...shop, iban: event.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  توضیحات پرداخت
                </span>
                <textarea
                  className="field min-h-24"
                  placeholder="به نام علی رضایی"
                  value={shop.paymentInstructions}
                  onChange={(event) =>
                    setShop({
                      ...shop,
                      paymentInstructions: event.target.value,
                    })
                  }
                  required
                />
              </label>
            </>
          )}
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <button
            className="primary-button w-full"
            disabled={pending}
            type="submit"
          >
            {pending && <LoaderCircle className="size-5 animate-spin" />}
            {pending
              ? "در حال انجام…"
              : step === "identifier"
                ? "ادامه"
                : step === "password"
                  ? "ورود"
                  : step === "shop"
                    ? "ساخت فروشگاه و شروع آزمایشی"
                    : "تأیید و ورود"}
          </button>
        </form>
      </div>
    </div>
  );
}
