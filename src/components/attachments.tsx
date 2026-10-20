'use client';
import { FileText, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { AttachmentView } from '@/lib/data';
import { createClient } from '@/lib/supabase/browser';
import { buttonClass, Notice } from './ui';

const MAX_BYTES = 10 * 1024 * 1024;

export function Attachments({ entityType, entityId, ownerId, items }: { entityType: 'product' | 'purchase_order' | 'sale'; entityId: string; ownerId: string; items: AttachmentView[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) throw new Error(`${file.name}: supera 10 MB`);
        const safe = file.name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80);
        const path = `${ownerId}/${entityType}/${entityId}/${Date.now()}-${safe}`;
        const up = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw new Error(up.error.message);
        const row = await supabase.from('attachments').insert({ entity_type: entityType, entity_id: entityId, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size });
        if (row.error) {
          await supabase.storage.from('attachments').remove([path]);
          throw new Error(row.error.message);
        }
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el archivo');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(a: AttachmentView) {
    if (!confirm(`¿Eliminar «${a.file_name}»?`)) return;
    setBusy(true);
    const supabase = createClient();
    const rm = await supabase.storage.from('attachments').remove([a.storage_path]);
    if (rm.error) setError(rm.error.message);
    else await supabase.from('attachments').delete().eq('id', a.id);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {items.map((a) => (
            <li key={a.id} className="group relative overflow-hidden rounded-xl border border-line bg-graphite-deep/60">
              <a href={a.url ?? '#'} target="_blank" rel="noreferrer" className="block aspect-square">
                {a.mime_type?.startsWith('image/') && a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.file_name} className="size-full object-cover" />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-muted"><FileText className="size-6" />{a.file_name}</span>
                )}
              </a>
              <button type="button" onClick={() => remove(a)} disabled={busy} aria-label={`Eliminar ${a.file_name}`}
                className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-graphite/80 text-muted hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className={buttonClass('secondary', 'md', true)}>
        <Upload className="size-4" />{busy ? 'Procesando…' : 'Añadir foto o documento'}
      </button>
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  );
}
