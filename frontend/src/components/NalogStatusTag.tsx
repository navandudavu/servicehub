import type { CSSProperties } from 'react';
import type { NalogStatus } from '../types/nalog';
import { useLang } from '../i18n/typedLang';

// Colour carries a hint only; the label is always shown too.
const STYLES: Record<NalogStatus, CSSProperties> = {
  DRAFT: { background: 'var(--paper)', color: 'var(--stone)', borderColor: 'var(--border)' },
  DISPATCHED: { background: '#FFF9B0', color: 'var(--ink)', borderColor: 'var(--green-dark)' },
  IN_PROGRESS: { background: 'var(--green)', color: 'var(--on-accent)', borderColor: 'var(--green-dark)' },
  AWAITING_PARTS: { background: '#FBE3D3', color: '#8A3F12', borderColor: 'var(--orange)' },
  COMPLETED: { background: 'var(--ink)', color: 'var(--green)', borderColor: 'var(--ink)' },
  CANCELLED: { background: 'transparent', color: 'var(--danger)', borderColor: 'var(--danger)' },
};

export function NalogStatusTag({ status }: { status: NalogStatus }) {
  const { t } = useLang();
  return <span className="tag" style={STYLES[status]}>{t(`nalogStatus_${status}`)}</span>;
}
