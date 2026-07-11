import { useState, type ReactNode } from "react";
import type { Product } from "../types";
import { formatGHS, formatLatLng, titleCase } from "../lib/format";
import { Card } from "./ui";

export function ProductCard({
  product,
  footer,
}: {
  product: Product;
  footer?: ReactNode;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(product.image_url) && !imageFailed;

  return (
    <Card className="flex h-[380px] flex-col overflow-hidden">
      <div className="h-40 w-full shrink-0 bg-slate-100">
        {showImage ? (
          <img
            src={product.image_url ?? undefined}
            alt={product.crop_type}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="grid h-full place-items-center text-slate-300">
            <svg viewBox="0 0 24 24" className="h-12 w-12" fill="currentColor">
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-base font-semibold text-slate-900">
            {titleCase(product.crop_type)}
          </h3>
          <span className="whitespace-nowrap text-base font-bold text-brand-700">
            {formatGHS(product.price_per_unit)}
            <span className="text-xs font-normal text-slate-400">
              /{product.unit}
            </span>
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-slate-500">
          {Number(product.quantity)} {product.unit} available
        </p>
        <p className="mt-1 truncate text-xs text-slate-400">
          📍 {formatLatLng(product.location)}
        </p>
        {footer && <div className="mt-auto pt-3">{footer}</div>}
      </div>
    </Card>
  );
}
