import { FLASH } from '@/lib/labels';
import { Notice } from './ui';

export function Flash({ code }: { code?: string }) {
  const text = code ? FLASH[code] : undefined;
  if (!text) return null;
  return <div className="mb-4" role="status"><Notice tone="positive">{text}</Notice></div>;
}
