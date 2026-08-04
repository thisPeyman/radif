import { ChartColumn, LoaderCircle, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import { ErrorNotice } from "../components";
import { adminStatusLabels, api, persianNumber, type Shop } from "../shared";

type ShopReport = {
  orderCount: number;
  confirmedOrderCount: number;
  confirmedOrderValue: number;
  averageOrderValue: number;
  statusCounts: Record<string, number>;
  topProducts: { id: number; name: string; quantity: number }[];
};

const statuses = [
  { key: "waiting_info", color: "bg-saffron" },
  { key: "waiting_payment", color: "bg-saffron" },
  { key: "paid", color: "bg-teal" },
  { key: "preparing", color: "bg-ink" },
  { key: "shipped", color: "bg-teal" },
  { key: "cancelled", color: "bg-error" },
];

export default function ReportPage({ shop }: { shop: Shop }) {
  const [report, setReport] = useState<ShopReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setReport(undefined);
    api<ShopReport>(`/api/shops/${shop.id}/report`, { signal: controller.signal })
      .then(setReport)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "گزارش دریافت نشد.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, shop.id]);

  return (
    <section className="page-content">
      <p className="page-kicker">{shop.name}</p>
      <h1 className="page-title">گزارش فروشگاه</h1>
      <p className="mt-1 text-sm font-bold text-ink/60">نمای کلی از تمام سفارش‌های ثبت‌شده</p>

      {loading && <div className="mt-8 grid min-h-48 place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت گزارش" /></div>}
      {error && <div className="mt-6"><ErrorNotice retry={() => setReload((value) => value + 1)}>{error}</ErrorNotice></div>}

      {!loading && !error && report?.orderCount === 0 && (
        <div className="mt-8 rounded-3xl border border-ledger bg-white p-7 text-center">
          <ChartColumn className="mx-auto size-9 text-teal" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-black">هنوز گزارشی ندارید</h2>
          <p className="mt-2 text-sm leading-7 text-ink/65">با ثبت سفارش، آمار فروشگاه در این صفحه نمایش داده می‌شود.</p>
          <NavLink className="primary-button mt-6 w-full" to="/orders/new">ثبت سفارش جدید</NavLink>
        </div>
      )}

      {!loading && !error && report && report.orderCount > 0 && (
        <div className="mt-6 space-y-4">
          <article className="relative overflow-hidden rounded-3xl bg-ink p-6 text-white shadow-lg shadow-ink/15">
            <span className="absolute inset-y-0 right-0 w-1.5 bg-saffron" aria-hidden="true" />
            <p className="text-xs font-black text-white/70">ارزش سفارش‌های تاییدشده</p>
            <p className="mt-3 text-3xl font-black leading-tight">
              {persianNumber(report.confirmedOrderValue)} <span className="text-sm text-white/75">تومان</span>
            </p>
            <p className="mt-4 text-xs font-bold text-white/65">{persianNumber(report.confirmedOrderCount)} سفارش پرداخت‌شده، در حال آماده‌سازی یا ارسال‌شده</p>
          </article>

          <div className="grid grid-cols-2 gap-3">
            <article className="rounded-2xl border border-ledger bg-white p-4">
              <p className="text-xs font-bold text-ink/60">کل سفارش‌ها</p>
              <p className="mt-2 text-2xl font-black">{persianNumber(report.orderCount)}</p>
            </article>
            <article className="rounded-2xl border border-ledger bg-white p-4">
              <p className="text-xs font-bold text-ink/60">میانگین سفارش تاییدشده</p>
              <p className="mt-2 text-xl font-black">{persianNumber(report.averageOrderValue)}</p>
              <p className="mt-1 text-[.7rem] font-bold text-ink/55">تومان</p>
            </article>
          </div>

          <article className="rounded-3xl border border-ledger bg-white p-5">
            <h2 className="font-black">وضعیت سفارش‌ها</h2>
            <div className="mt-5 space-y-4">
              {statuses.map(({ key, color }) => {
                const count = report.statusCounts[key] ?? 0;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between gap-4 text-xs font-bold">
                      <span>{adminStatusLabels[key]}</span>
                      <span>{persianNumber(count)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ledger" aria-hidden="true">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${(count / report.orderCount) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="rounded-3xl border border-ledger bg-white p-5">
            <div className="flex items-center gap-2">
              <Package className="size-5 text-teal" aria-hidden="true" />
              <h2 className="font-black">محصول‌های پرفروش</h2>
            </div>
            {report.topProducts.length === 0 ? (
              <p className="mt-4 text-sm leading-7 text-ink/60">هنوز سفارش تاییدشده‌ای برای رتبه‌بندی محصول‌ها وجود ندارد.</p>
            ) : (
              <ol className="mt-4 divide-y divide-ledger">
                {report.topProducts.map((product, index) => (
                  <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0" key={product.id}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ledger text-xs font-black">{persianNumber(index + 1)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-black">{product.name}</span>
                    <span className="text-xs font-bold text-teal">{persianNumber(product.quantity)} عدد</span>
                  </li>
                ))}
              </ol>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
