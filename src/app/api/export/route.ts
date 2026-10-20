import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TABLES = [
  'suppliers', 'products', 'purchase_orders', 'purchase_order_lines', 'stock_lots', 'sales', 'sale_lot_allocations',
  'sale_returns', 'stock_write_offs', 'inventory_movements', 'ledger_entries', 'planner_settings', 'attachments',
] as const;

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Separador «;» para que Excel en español lo abra correctamente.
  return '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\r\n');
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { data: allowed } = await supabase.from('authorized_users').select('user_id').eq('user_id', auth.user.id).maybeSingle();
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!allowed || (ownerEmail && auth.user.email?.toLowerCase() !== ownerEmail)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const format = req.nextUrl.searchParams.get('format') ?? 'json';
  const table = req.nextUrl.searchParams.get('table');
  const stamp = new Date().toISOString().slice(0, 10);

  async function fetchAll(t: string) {
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(t).select('*').range(from, from + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  try {
    if (format === 'csv') {
      const t = table === 'ledger' ? 'ledger_entries' : table;
      if (!t || !(TABLES as readonly string[]).includes(t)) return NextResponse.json({ error: 'Tabla no válida' }, { status: 400 });
      return new NextResponse(toCsv(await fetchAll(t)), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="mlsupply-${t}-${stamp}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    const dump: Record<string, unknown> = { exported_at: new Date().toISOString(), version: 1, note: 'Importes en céntimos de euro' };
    for (const t of TABLES) dump[t] = await fetchAll(t);
    return new NextResponse(JSON.stringify(dump, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="mlsupply-copia-${stamp}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al exportar' }, { status: 500 });
  }
}
