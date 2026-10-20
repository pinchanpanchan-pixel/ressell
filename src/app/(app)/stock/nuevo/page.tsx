import { Card, PageHeader } from '@/components/ui';
import { ProductForm } from '@/components/product-form';
import { getSuppliers } from '@/lib/data';

export const metadata = { title: 'Nuevo producto' };

export default async function NewProduct() {
  const suppliers = await getSuppliers();
  return (
    <>
      <PageHeader title="Nuevo producto" back="/stock" subtitle="El stock se añade al recibir un pedido." />
      <Card><ProductForm suppliers={suppliers} /></Card>
    </>
  );
}
