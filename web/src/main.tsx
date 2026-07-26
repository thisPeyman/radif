import "@fontsource-variable/vazirmatn";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { ClipboardList } from "lucide-react";
import "./styles.css";

function App() {
  return (
    <main className="min-h-dvh bg-[#183b4e] px-4 py-10 text-[#183b4e] sm:py-16">
      <section className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-[480px] flex-col justify-between rounded-[2rem] bg-[#f7f9f8] p-7 shadow-2xl shadow-black/20 sm:min-h-[720px]">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#e9a928]">
            <ClipboardList aria-hidden="true" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-2xl font-black">ردیف</p>
            <p className="text-sm text-[#183b4e]/65">دفتر آرام سفارش‌های شما</p>
          </div>
        </div>

        <div className="border-r-4 border-[#287266] pr-5">
          <h1 className="text-3xl font-black leading-relaxed">هر سفارش، سر جای خودش.</h1>
          <p className="mt-3 leading-8 text-[#183b4e]/70">
            زیرساخت اولیه آماده است. ساخت سفارش‌ها در مرحله بعد اضافه می‌شود.
          </p>
        </div>

        <p className="text-center text-xs text-[#183b4e]/50">نسخه آزمایشی ردیف</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
