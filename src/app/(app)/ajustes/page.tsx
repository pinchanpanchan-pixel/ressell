import { Download, LogOut } from 'lucide-react';
import { AnalysisSettingsForm } from '@/components/analysis-settings-form';
import { SupplierForm } from '@/components/supplier-form';
import { buttonClass, Card, PageHeader, SectionTitle } from '@/components/ui';
import { signOut } from '@/lib/actions/auth';
import { requireOwner } from '@/lib/auth';
import { getPlannerSettings, getSuppliers } from '@/lib/data';
import { formatDate } from '@/lib/dates';

export const metadata = { title: 'Ajustes' };

export default async function SettingsPage() {
  const { user, supabase } = await requireOwner();
  const [suppliers, settings, errors] = await Promise.all([
    getSuppliers(),
    getPlannerSettings(),
    supabase.from('error_logs').select('id, context, message, created_at').order('created_at', { ascending: false }).limit(5),
  ]);

  return (
    <>
      <PageHeader title="Ajustes" back="/" />

      <SectionTitle>Proveedores</SectionTitle>
      <div className="grid gap-2">
        {suppliers.map((s) => (
          <details key={s.id} className="rounded-[var(--radius-card)] border border-line bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between p-4">
              <span className="font-medium">{s.name}</span>
              <span className="text-xs text-faint">{s.default_lead_time_days} días</span>
            </summary>
            <div className="border-t border-line p-4"><SupplierForm supplier={s} /></div>
          </details>
        ))}
        <Card><SupplierForm /></Card>
      </div>

      <SectionTitle>Recomendaciones de compra</SectionTitle>
      <Card><AnalysisSettingsForm s={settings} /></Card>

      <SectionTitle>Datos y copias de seguridad</SectionTitle>
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-muted">Descarga una copia completa (JSON) de forma periódica y guárdala fuera del móvil. Los CSV se abren en Excel o Numbers.</p>
        <a href="/api/export?format=json" className={buttonClass('primary', 'md', true)}><Download className="size-4" />Copia completa (JSON)</a>
        <div className="grid grid-cols-2 gap-2">
          {[['ledger_entries', 'Movimientos'], ['sales', 'Ventas'], ['purchase_orders', 'Pedidos'], ['products', 'Productos']].map(([t, l]) => (
            <a key={t} href={`/api/export?format=csv&table=${t}`} className={buttonClass('secondary', 'sm', true)}>{l} CSV</a>
          ))}
        </div>
      </Card>

      <SectionTitle>Instalar en el móvil</SectionTitle>
      <Card className="space-y-2 text-sm text-muted">
        <p><b className="text-ink">iPhone (Safari):</b> botón Compartir → «Añadir a pantalla de inicio».</p>
        <p><b className="text-ink">Android (Chrome):</b> menú ⋮ → «Instalar aplicación» o «Añadir a pantalla de inicio».</p>
      </Card>

      {(errors.data?.length ?? 0) > 0 && (
        <>
          <SectionTitle>Últimos errores registrados</SectionTitle>
          <Card className="py-1">
            <ul className="divide-y divide-line text-xs">
              {errors.data!.map((e) => (
                <li key={e.id} className="py-2"><span className="text-faint">{formatDate(e.created_at)} · {e.context}</span><p className="text-muted">{e.message}</p></li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <SectionTitle>Cuenta</SectionTitle>
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-muted">Sesión iniciada como <b className="text-ink">{user.email}</b></p>
        <form action={signOut}><button className={buttonClass('secondary', 'md', true)}><LogOut className="size-4" />Cerrar sesión</button></form>
      </Card>
    </>
  );
}
