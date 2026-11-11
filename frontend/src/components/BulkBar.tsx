import type { ReactNode } from 'react';
import { useLang } from '../i18n/typedLang';

/** The strip that appears above a list while rows are ticked: how many, the actions, and a way out. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  const { t } = useLang();
  return (
    <div role="toolbar" style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12,
      padding: '8px 14px', background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 6,
    }}>
      <strong style={{ fontSize: 13 }}>{t('bulk_selected', count)}</strong>
      {children}
      <button type="button" className="btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={onClear}>
        {t('bulk_clear')}
      </button>
    </div>
  );
}
