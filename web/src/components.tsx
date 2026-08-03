import { Check, Clipboard, LoaderCircle, Package, RotateCcw, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { persianNumber, type Product } from "./shared";

export type SelectedOrderItem = { product: Product; quantity: number };

export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img className="size-12 rounded-2xl" src="/icons/icon-96.png" alt="" />
      <div>
        <p className="text-2xl font-black leading-none">ردیف</p>
        <p className="mt-1 text-sm text-ink/70">دفتر آرام سفارش‌های شما</p>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="app-viewport grid place-items-center px-6 text-ink">
      <div className="text-center" role="status">
        <LoaderCircle className="mx-auto size-7 animate-spin text-teal" aria-hidden="true" />
        <p className="mt-3 text-sm text-ink/70">در حال آماده‌کردن ردیف…</p>
      </div>
    </div>
  );
}

export function ErrorNotice({ children, retry }: { children: ReactNode; retry?: () => void }) {
  return (
    <div className="rounded-2xl border border-error/25 bg-error/8 p-4 text-sm leading-7 text-error" role="alert">
      <p>{children}</p>
      {retry && (
        <button className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold" onClick={retry} type="button">
          <RotateCcw className="size-4" aria-hidden="true" />
          تلاش دوباره
        </button>
      )}
    </div>
  );
}

export function ProductImage({ product }: { product: Product }) {
  return (
    <span className="relative grid size-[4.5rem] shrink-0 place-items-center overflow-hidden rounded-2xl bg-ledger text-ink/70">
      <Package className="size-6" aria-hidden="true" />
      <img className="absolute inset-0 size-full object-cover" src={product.imagePath} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
    </span>
  );
}

export function ProductChoices({ products, items, onChange }: {
  products: Product[];
  items: SelectedOrderItem[];
  onChange: (items: SelectedOrderItem[]) => void;
}) {
  function toggle(product: Product) {
    const exists = items.some((item) => item.product.id === product.id);
    onChange(exists ? items.filter((item) => item.product.id !== product.id) : [...items, { product, quantity: 1 }]);
  }
  function changeQuantity(productID: number, change: number) {
    onChange(items.map((item) => item.product.id === productID ? { ...item, quantity: Math.min(99, Math.max(1, item.quantity + change)) } : item));
  }
  return (
    <>
      <div className="mt-3 space-y-3">{products.map((product) => {
        const selectedItem = items.find((item) => item.product.id === product.id);
        const isSelected = Boolean(selectedItem);
        return (
          <div className={`product-choice product-choice-multi ${isSelected ? "product-choice-selected" : ""}`} key={product.id}>
            <button className="product-choice-main" type="button" aria-pressed={isSelected} onClick={() => toggle(product)}>
              <ProductImage product={product} />
              <span className="min-w-0 flex-1 text-right">
                <span className="block font-black">{product.name}</span>
                {product.shortDescription && <span className="mt-0.5 block truncate text-xs text-ink/70">{product.shortDescription}</span>}
                <span className="mt-2 block text-sm font-bold text-teal">{persianNumber(product.defaultPrice)} تومان</span>
              </span>
              <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${isSelected ? "border-saffron bg-saffron" : "border-ink/20"}`}>
                {isSelected && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
              </span>
            </button>
            {selectedItem && (
              <div className="flex items-center justify-between border-t border-saffron/35 px-4 py-2.5">
                <span className="text-sm font-bold">تعداد</span>
                <span className="flex items-center gap-2" aria-label={`تعداد ${product.name}`}>
                  <button className="quantity-button" type="button" onClick={() => changeQuantity(product.id, -1)} disabled={selectedItem.quantity === 1} aria-label={`کم‌کردن تعداد ${product.name}`}>−</button>
                  <span className="min-w-7 text-center font-black" aria-live="polite">{persianNumber(selectedItem.quantity)}</span>
                  <button className="quantity-button" type="button" onClick={() => changeQuantity(product.id, 1)} disabled={selectedItem.quantity === 99} aria-label={`زیادکردن تعداد ${product.name}`}>+</button>
                </span>
              </div>
            )}
          </div>
        );
      })}</div>
      {items.length > 0 && (
        <p className="mt-3 text-sm font-bold text-teal" aria-live="polite">
          {persianNumber(items.reduce((total, item) => total + item.quantity, 0))} قلم از {persianNumber(items.length)} محصول انتخاب شده
        </p>
      )}
    </>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-black text-teal" type="button" onClick={copy}>
      <Clipboard className="size-4" aria-hidden="true" />
      {copied ? "کپی شد" : label}
    </button>
  );
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function optimizeReceipt(file: File) {
  const end = file.type === "image/jpeg" ? new Uint8Array(await file.slice(-2).arrayBuffer()) : null;
  const decodable = end && (end[0] !== 0xff || end[1] !== 0xd9) ? new Blob([file, new Uint8Array([0xff, 0xd9])], { type: file.type }) : file;
  const source = URL.createObjectURL(decodable);
  try {
    const image = await loadImage(source);
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, 2000 / longestSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob) return file;
    return new File([blob], "receipt.webp", { type: blob.type, lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function ReceiptPicker({ id, file, onChange, onBusyChange }: { id: string; file: File | null; onChange: (file: File | null) => void; onBusyChange?: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [optimizing, setOptimizing] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview("");
      if (input.current) input.current.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function choose(selected?: File) {
    if (!selected) return;
    onChange(null);
    setOptimizing(true);
    onBusyChange?.(true);
    try { onChange(await optimizeReceipt(selected)); } catch { onChange(selected); } finally { setOptimizing(false); onBusyChange?.(false); }
  }

  return (
    <div>
      <input
        ref={input}
        id={id}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          void choose(selected);
        }}
      />
      {optimizing ? (
        <div className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-teal/30 bg-teal/5 text-sm font-bold text-ink/70" role="status">
          <LoaderCircle className="size-5 animate-spin text-teal" aria-hidden="true" />
          در حال آماده‌سازی تصویر…
        </div>
      ) : !file ? (
        <button className="secondary-button w-full" type="button" onClick={() => input.current?.click()}><Upload className="size-5" aria-hidden="true" />انتخاب تصویر رسید</button>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-teal/30 bg-teal/5">
          <img className="h-48 w-full bg-ledger object-contain" src={preview} alt="پیش‌نمایش رسید انتخاب‌شده" />
          <div className="p-3">
            <p className="truncate text-sm font-bold" dir="auto">{file.name}</p>
            <p className="mt-1 text-xs text-ink/60">{(file.size / 1048576).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} مگابایت</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="secondary-button min-h-11 px-3 text-sm" type="button" onClick={() => input.current?.click()}>تغییر تصویر</button>
              <button className="secondary-button min-h-11 px-3 text-sm text-error" type="button" onClick={() => onChange(null)}>حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
