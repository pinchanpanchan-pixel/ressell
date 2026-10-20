import { Card, PageHeader } from '@/components/ui';
import { ProductForm } from '@/components/product-form';
import { getProduct, getSuppliers } from '@/lib/data';

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, suppliers] = await Promise.all([getProduct(id), getSuppliers()]);
  return (
    <>
      <PageHeader title="Editar producto" back={`/stock/${id}`} />
      <Card><ProductForm product={product} suppliers={suppliers} /></Card>
    </>
  );
}
