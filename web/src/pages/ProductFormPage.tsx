import { ArrowRight, Check, ImagePlus, LoaderCircle, ZoomIn } from "lucide-react";
import Cropper, { type Area } from "react-easy-crop";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { ErrorNotice } from "../components";
import { ApiError, api, normalizeDigits, persianDigits, type Product, type Shop } from "../shared";

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function cropImage(source: string, area: Area) {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1200;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تصویر برش نخورد.");
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, 1200, 1200);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error("مرورگر نتوانست تصویر WebP بسازد.");
  return new File([blob], "product.webp", { type: "image/webp" });
}

export function ImageEditor({ existing, file, onChange, onCroppingChange }: {
  existing?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  onCroppingChange: (cropping: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => { onCroppingChange(Boolean(source)); return () => onCroppingChange(false); }, [onCroppingChange, source]);

  function choose(selected?: File) {
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setError("تصویر باید JPEG، PNG یا WebP باشد.");
      return;
    }
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(selected));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setError("");
  }

  async function finishCrop() {
    if (!source || !area) return;
    setWorking(true);
    setError("");
    try {
      onChange(await cropImage(source, area));
      URL.revokeObjectURL(source);
      setSource("");
      if (input.current) input.current.value = "";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تصویر برش نخورد.");
    } finally {
      setWorking(false);
    }
  }

  function cancelCrop() {
    URL.revokeObjectURL(source);
    setSource("");
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <input ref={input} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choose(event.target.files?.[0])} />
      {source ? (
        <div className="product-crop-shell">
          <div className="product-crop-stage" dir="ltr">
            <Cropper
              image={source}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="rect"
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
            />
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm font-black">
            <ZoomIn className="size-5 shrink-0 text-teal" aria-hidden="true" />
            <span className="sr-only">بزرگ‌نمایی تصویر</span>
            <input className="product-zoom" type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="secondary-button" type="button" disabled={working} onClick={cancelCrop}>انصراف</button>
            <button className="primary-button" type="button" disabled={working || !area} onClick={finishCrop}>
              {working ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
              {working ? "در حال آماده‌سازی…" : "ثبت برش"}
            </button>
          </div>
        </div>
      ) : (preview || existing) ? (
        <div className="product-image-preview">
          <img src={preview || existing} alt="پیش‌نمایش تصویر" />
          <div className="p-3">
            <button className="secondary-button w-full" type="button" onClick={() => input.current?.click()}>
              <ImagePlus className="size-5" />
              تغییر و برش تصویر
            </button>
            {file && existing && <button className="mt-3 w-full text-sm font-black text-ink/65" type="button" onClick={() => onChange(null)}>بازگشت به تصویر فعلی</button>}
          </div>
        </div>
      ) : (
        <button className="product-image-empty" type="button" onClick={() => input.current?.click()}>
          <span className="grid size-12 place-items-center rounded-2xl bg-teal text-white"><ImagePlus className="size-6" /></span>
          <span><strong className="block">انتخاب و برش تصویر</strong><small className="mt-1 block text-ink/65">خروجی مربع و مناسب نمایش است</small></span>
        </button>
      )}
      {error && <p className="mt-2 text-sm font-bold text-error" role="alert">{error}</p>}
    </div>
  );
}

export default function ProductFormPage({ shop, mode }: { shop: Shop; mode: "create" | "edit" }) {
  const { productID } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product>();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [pending, setPending] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "edit") return;
    const controller = new AbortController();
    setLoading(true);
    api<{ products: Product[] }>(`/api/shops/${shop.id}/products?includeInactive=true`, { signal: controller.signal })
      .then((response) => {
        const found = response.products.find((item) => item.id === Number(productID));
        if (!found) throw new ApiError(404, "محصول پیدا نشد.");
        setProduct(found);
        setName(found.name);
        setPrice(String(found.defaultPrice));
        setDescription(found.shortDescription ?? "");
      })
      .catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "محصول دریافت نشد."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mode, productID, shop.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (cropping) {
      setError("برش تصویر را ثبت یا لغو کنید.");
      return;
    }
    const numericPrice = Number(price);
    if (!name.trim() || !Number.isSafeInteger(numericPrice) || numericPrice <= 0 || (mode === "create" && !image)) {
      setError("نام، قیمت صحیح و تصویر محصول را کامل کنید.");
      return;
    }
    const form = new FormData();
    form.set("name", name.trim());
    form.set("defaultPrice", String(numericPrice));
    form.set("shortDescription", description.trim());
    if (image) form.set("image", image);
    setPending(true);
    setError("");
    try {
      const path = mode === "create" ? `/api/shops/${shop.id}/products` : `/api/shops/${shop.id}/products/${productID}`;
      await api<Product>(path, { method: mode === "create" ? "POST" : "PATCH", body: form });
      navigate("/products", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "محصول ذخیره نشد.");
    } finally {
      setPending(false);
    }
  }

  if (loading) return <div className="page-content grid min-h-72 place-items-center"><LoaderCircle className="size-7 animate-spin text-teal" aria-label="در حال دریافت محصول" /></div>;
  if (mode === "edit" && !product) {
    return (
      <section className="page-content">
        <NavLink className="mb-5 inline-flex min-h-11 items-center gap-2 font-black text-teal" to="/products">
          <ArrowRight className="size-5" />
          بازگشت به محصول‌ها
        </NavLink>
        <ErrorNotice>{error || "محصول پیدا نشد."}</ErrorNotice>
      </section>
    );
  }
  return (
    <form className="page-content" onSubmit={submit}>
      <NavLink className="mb-5 inline-flex min-h-11 items-center gap-2 font-black text-teal" to="/products">
        <ArrowRight className="size-5" />
        بازگشت به محصول‌ها
      </NavLink>
      <p className="page-kicker">{shop.name}</p>
      <h1 className="page-title">{mode === "create" ? "محصول تازه" : "ویرایش محصول"}</h1>
      <p className="mt-2 text-sm leading-7 text-ink/65">تصویر مربع در سفارش مدیر و صفحه مشتری نمایش داده می‌شود.</p>
      <div className="mt-7"><ImageEditor existing={product?.imagePath} file={image} onChange={setImage} onCroppingChange={setCropping} /></div>
      <div className="mt-7 space-y-5">
        <label className="block" htmlFor="product-name">
          <span className="mb-2 block text-sm font-black">نام محصول</span>
          <input id="product-name" className="field" value={name} maxLength={150} required onChange={(event) => setName(event.target.value)} placeholder="مثلاً شمع موج" />
        </label>
        <label className="block" htmlFor="product-price">
          <span className="mb-2 block text-sm font-black">قیمت پیش‌فرض</span>
          <span className="relative block">
            <input
              id="product-price"
              className="field pl-20 text-lg font-black"
              inputMode="numeric"
              value={price.replace(/\d/g, (digit) => persianDigits[Number(digit)])}
              required
              onChange={(event) => setPrice(normalizeDigits(event.target.value))}
            />
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-bold text-ink/60">تومان</span>
          </span>
        </label>
        <label className="block" htmlFor="product-description">
          <span className="mb-2 block text-sm font-black">توضیح کوتاه <span className="font-medium text-ink/50">(اختیاری)</span></span>
          <textarea
            id="product-description"
            className="field min-h-28 resize-y py-3"
            value={description}
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="نکته‌ای که موقع انتخاب محصول کمک می‌کند"
          />
        </label>
      </div>
      {error && <div className="mt-5"><ErrorNotice>{error}</ErrorNotice></div>}
      <button className="primary-button mt-7 w-full" type="submit" disabled={pending || cropping || !name.trim() || !price || (mode === "create" && !image)}>
        {pending ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
        {pending ? "در حال ذخیره…" : mode === "create" ? "ساخت محصول" : "ذخیره تغییرات"}
      </button>
    </form>
  );
}
