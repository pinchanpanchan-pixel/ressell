'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CapitalPoint } from '@/lib/capital-series';
import { formatEUR } from '@/lib/money';

const fmtDay = (iso: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export function CapitalChart({ data }: { data: CapitalPoint[] }) {
  if (data.length < 2) {
    return <div className="grid h-40 place-items-center text-sm text-faint">El gráfico aparecerá con los primeros movimientos.</div>;
  }
  const rows = data.map((d) => ({ date: d.date, cash: d.cashCents / 100, total: d.totalCents / 100 }));
  return (
    <div className="h-48 w-full" role="img" aria-label="Evolución de la caja y del capital total a coste">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#91A785" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#91A785" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(167,180,198,0.10)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: '#7D8A9C', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fill: '#7D8A9C', fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => `${Math.round(v)}€`} />
          <Tooltip
            contentStyle={{ background: '#1A2029', border: '1px solid rgba(167,180,198,0.2)', borderRadius: 12, color: '#F4F0E8', fontSize: 13 }}
            labelFormatter={(l) => fmtDay(String(l))}
            formatter={(v, name) => [formatEUR(Math.round(Number(v) * 100)), name === 'cash' ? 'Caja' : 'Caja + stock a coste']}
          />
          <Area type="monotone" dataKey="total" stroke="#A7B4C6" strokeWidth={1.5} strokeDasharray="4 4" fill="transparent" />
          <Area type="monotone" dataKey="cash" stroke="#91A785" strokeWidth={2} fill="url(#cashFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
