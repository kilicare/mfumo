'use client';

import { useParams, useRouter } from 'next/navigation';
import { ProductForm } from '@/components/products/ProductForm';
import type { Product } from '@/lib/api/products';

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = params.id;
  return <ProductForm productId={productId} onSuccess={(product: Product) => router.push(`/dashboard/products/${product.id}`)} />;
}
