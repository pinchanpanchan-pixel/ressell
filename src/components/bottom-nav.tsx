'use client';
import { ArrowLeftRight, Boxes, House, ReceiptText, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

const items = [
  { href: '/', label: 'Inicio', icon: House, match: (p: string) => p === '/' },
  { href: '/stock', label: 'Stock', icon: Boxes, match: (p: string) => p.startsWith('/stock') },
  { href: '/pedidos', label: 'Pedidos', icon: ReceiptText, match: (p: string) => p.startsWith('/pedidos') },
  { href: '/ventas', label: 'Ventas', icon: ArrowLeftRight, match: (p: string) => p.startsWith('/ventas') },
  { href: '/finanzas', label: 'Finanzas', icon: Wallet, match: (p: string) => ['/finanzas', '/analisis', '/planificador'].some((x) => p.startsWith(x)) },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Navegación principal" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-graphite-deep/95 backdrop-blur-md">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined}
                className={cx('flex flex-col items-center gap-1 pb-1 pt-2.5 text-[11px] font-medium transition-colors', active ? 'text-sage' : 'text-muted hover:text-ink')}>
                <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
