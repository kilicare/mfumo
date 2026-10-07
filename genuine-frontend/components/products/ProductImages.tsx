'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Package, Trash2, Upload } from 'lucide-react';
import { productsAPI, type ProductImageMeta } from '@/lib/api/products';
import { getApiError } from '@/lib/api';

const MAX_IMAGE_BYTES = 128 * 1024;
const MAX_IMAGES = 5;

export function ProductPhoto({
  productId,
  image,
  className = '',
}: {
  productId: string;
  image?: ProductImageMeta;
  className?: string;
}) {
  const [url, setUrl] = useState('');
  const imageId = image?.id;
  useEffect(() => {
    if (!imageId) {
      setUrl('');
      return;
    }
    let active = true;
    let objectUrl = '';
    productsAPI
      .getImage(productId, imageId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setUrl('');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [productId, imageId]);
  return (
    <div
      className={`relative grid place-items-center overflow-hidden bg-[#f4f7e9] text-[#71840c] ${className}`}
    >
      {url ? (
        <Image
          unoptimized
          fill
          sizes="(max-width: 768px) 64px, 176px"
          src={url}
          alt="Product"
          className="object-cover"
        />
      ) : (
        <Package aria-hidden="true" size={28} />
      )}
    </div>
  );
}

async function compressImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose an image smaller than 15 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This image could not be opened. Choose a valid image file.');
  }
  try {
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > 40_000_000)
      throw new Error('This image is too large to process.');
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this image.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.74, 0.62, 0.5, 0.38]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', quality)
      );
      if (blob && blob.size <= MAX_IMAGE_BYTES) {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('The compressed image could not be read.'));
          reader.onload = () =>
            typeof reader.result === 'string'
              ? resolve(reader.result)
              : reject(new Error('Invalid image result.'));
          reader.readAsDataURL(blob);
        });
      }
    }
    throw new Error(
      'Image is still too large after compression. Choose a simpler or smaller image.'
    );
  } finally {
    bitmap.close();
  }
}

export function ProductImagePicker({
  images,
  onChange,
  disabled = false,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    if (images.length + files.length > MAX_IMAGES) {
      setError(`A product can have up to ${MAX_IMAGES} photos.`);
      return;
    }
    setBusy(true);
    try {
      const next = [...images];
      for (const file of Array.from(files)) next.push(await compressImage(file));
      onChange(next);
    } catch (cause) {
      setError(
        getApiError(cause, cause instanceof Error ? cause.message : 'Could not process this image.')
      );
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  return (
    <section
      className="rounded-2xl border border-[#e6e9e1] bg-white p-4 shadow-sm sm:p-6"
      aria-labelledby="product-images-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="product-images-heading"
            className="flex items-center gap-2 text-base font-bold text-[#292d27]"
          >
            <ImagePlus size={18} className="text-[#70820f]" />
            Product photos
          </h2>
          <p className="mt-1 text-sm text-[#73766f]">
            Add up to five JPG, PNG or WebP photos. We compress them to WebP; the first photo is the
            catalog cover.
          </p>
        </div>
        <label
          className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#dfe5d3] px-3.5 text-sm font-semibold text-[#46523a] hover:bg-[#f4f8e7] ${disabled || busy || images.length >= MAX_IMAGES ? 'pointer-events-none opacity-50' : ''}`}
        >
          <Upload size={16} />
          {busy ? 'Preparing…' : 'Add photos'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            disabled={disabled || busy || images.length >= MAX_IMAGES}
            onChange={(event) => {
              void addFiles(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-[#efd4cf] bg-[#fff8f6] p-3 text-sm text-[#96382f]"
        >
          {error}
        </p>
      ) : null}
      {images.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {images.map((image, index) => (
            <article
              key={`${index}-${image.slice(-20)}`}
              className="overflow-hidden rounded-xl border border-[#e6e9e1] bg-[#f8f9f6]"
            >
              <div className="relative aspect-square">
                <Image
                  unoptimized
                  fill
                  sizes="(max-width: 768px) 50vw, 20vw"
                  src={image}
                  alt={`Product photo ${index + 1}`}
                  className="object-cover"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 p-2">
                <span className="text-xs font-semibold text-[#545850]">
                  {index === 0 ? 'Cover photo' : `Photo ${index + 1}`}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    aria-label="Move photo left"
                    onClick={() => move(index, -1)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[#dfe5d3] text-xs disabled:opacity-40"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === images.length - 1}
                    aria-label="Move photo right"
                    onClick={() => move(index, 1)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[#dfe5d3] text-xs disabled:opacity-40"
                  >
                    →
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Remove photo ${index + 1}`}
                    onClick={() => onChange(images.filter((_, itemIndex) => itemIndex !== index))}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[#efd4cf] text-[#a63832] disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-[#dfe5d3] bg-[#fbfcf9] px-4 py-8 text-center text-sm text-[#73766f]">
          No photos added. Products without a photo use the catalog placeholder.
        </div>
      )}
    </section>
  );
}
