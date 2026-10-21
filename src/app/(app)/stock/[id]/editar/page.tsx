import { Card, PageHeader } from '@/components/ui';
import { ProductForm } from '@/components/product-form';
import { getProduct, getProductVersion, getSuppliers } from '@/lib/data';

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, suppliers, version] = await Promise.all([getProduct(id), getSuppliers(), getProductVersion(id)]);
  return (
    <>
      <PageHeader title="Editar producto" back={`/stock/${id}`} />
      <Card><ProductForm product={product} suppliers={suppliers} version={version} /></Card>
    </>
  );
}
