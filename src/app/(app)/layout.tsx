import { Settings } from 'lucide-react';
import Link from 'next/link';
import { BottomNav } from '@/components/bottom-nav';
import { requireOwner } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <div className="safe-top mx-auto min-h-dvh max-w-xl">
      <div className="flex items-center justify-between px-4 pt-3">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-card text-[11px] font-bold">ML</span>
          ML Supply
        </Link>
        <Link href="/ajustes" aria-label="Ajustes" className="grid size-10 place-items-center rounded-full text-muted hover:bg-white/5 hover:text-ink">
          <Settings className="size-5" />
        </Link>
      </div>
      <main className="fade-in px-4 pb-32">{children}</main>
      <BottomNav />
    </div>
  );
}
