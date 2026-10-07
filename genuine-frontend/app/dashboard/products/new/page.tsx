'use client';

import { useRouter } from 'next/navigation';
import { ProductForm } from '@/components/products/ProductForm';
import type { Product } from '@/lib/api/products';

export default function NewProductPage() {
  const router = useRouter();
  return <ProductForm onSuccess={(product: Product) => router.push(`/dashboard/products/${product.id}`)} />;
}
