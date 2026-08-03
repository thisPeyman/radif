import { Archive, LoaderCircle, Package, Pencil, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import { ErrorNotice, ProductImage } from "../components";
import { api, persianNumber, type Product, type Shop } from "../shared";

function sortProducts(products: Product[]) {
  return [...products].sort((a, b) => Number(b.active) - Number(a.active) || b.id - a.id);
}

export default function ProductsPage({ shop }: { shop: Shop }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState<number>();

  function loadProducts() {
    setLoading(true);
    setError("");
    api<{ products: Product[] }>(`/api/shops/${shop.id}/products?includeInactive=true`)
      .then((response) => setProducts(response.products))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "محصول‌ها دریافت نشدند."))
      .finally(() => setLoading(false));
  }

  useEffect(loadProducts, [shop.id]);

  async function changeActive(product: Product) {
    setChanging(product.id);
    setError("");
    try {
      if (product.active) await api<void>(`/api/shops/${shop.id}/products/${product.id}`, { method: "DELETE" });
      else await api<Product>(`/api/shops/${shop.id}/products/${product.id}/activate`, { method: "POST" });
      setProducts((current) => sortProducts(current.map((item) => item.id === product.id ? { ...item, active: !product.active } : item)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "وضعیت محصول تغییر نکرد.");
    } finally {
      setChanging(undefined);
    }
  }

  const activeCount = products.filter((product) => product.active).length;
  return (
    <section className="page-content">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="page-kicker">{shop.name}</p>
          <h1 className="page-title">محصول‌ها</h1>
          {!loading && <p className="mt-2 text-sm font-bold text-ink/65">{persianNumber(activeCount)} فعال از {persianNumber(products.length)} محصول</p>}
        </div>
        <NavLink className="grid size-12 shrink-0 place-items-center rounded-2xl bg-saffron text-ink shadow-sm" to="/products/new" aria-label="محصول جدید">
          <Plus className="size-6" strokeWidth={2.5} />
        </NavLink>
      </div>
      {loading && <div className="mt-8 grid min-h-48 place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت محصول‌ها" /></div>}
      {error && <div className="mt-6"><ErrorNotice retry={loadProducts}>{error}</ErrorNotice></div>}
      {!loading && !error && products.length === 0 && (
        <div className="mt-8 rounded-3xl border border-ledger bg-white p-7 text-center">
          <Package className="mx-auto size-9 text-teal" />
          <h2 className="mt-4 text-lg font-black">اولین محصول را بسازید</h2>
          <p className="mt-2 text-sm leading-7 text-ink/65">نام، قیمت و تصویر را یک‌بار ثبت کنید تا ساخت سفارش سریع‌تر شود.</p>
          <NavLink className="primary-button mt-6 w-full" to="/products/new"><Plus className="size-5" />ساخت محصول</NavLink>
        </div>
      )}
      <div className="mt-7 space-y-3" aria-live="polite">
        {products.map((product, index) => (
          <div key={product.id}>
            {!product.active && (index === 0 || products[index - 1].active) && <p className="archive-divider">بایگانی‌شده‌ها</p>}
            <div className={`manage-product-card ${product.active ? "" : "manage-product-card-archived"}`}>
              <div className="flex items-center gap-3 p-3">
                <ProductImage product={product} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-black">{product.name}</h2>
                    {product.active && <span className="size-2 shrink-0 rounded-full bg-teal" aria-label="فعال" />}
                  </div>
                  {product.shortDescription && <p className="mt-1 truncate text-xs text-ink/60">{product.shortDescription}</p>}
                  <p className="mt-2 text-sm font-black text-teal">{persianNumber(product.defaultPrice)} تومان</p>
                </div>
              </div>
              <div className="grid grid-cols-2 border-t border-ledger/80">
                <NavLink className="manage-product-action border-l border-ledger/80" to={`/products/${product.id}/edit`}>
                  <Pencil className="size-4" />
                  ویرایش
                </NavLink>
                <button
                  className={`manage-product-action ${product.active ? "text-error" : "text-teal"}`}
                  type="button"
                  disabled={changing === product.id}
                  onClick={() => changeActive(product)}
                >
                  {changing === product.id ? <LoaderCircle className="size-4 animate-spin" /> : product.active ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}
                  {product.active ? "بایگانی" : "فعال‌سازی دوباره"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
