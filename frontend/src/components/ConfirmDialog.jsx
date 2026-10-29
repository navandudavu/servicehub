import { useLang } from '../i18n/LangContext';

// Styled replacement for window.confirm(). Renders as a small centered
// dialog matching the rest of the app instead of the browser's native
// unstyled prompt. Danger-styled by default since every current use is a
// destructive action; pass danger={false} if a future use isn't.
export default function ConfirmDialog({ message, onConfirm, onCancel, danger = true, busy = false }) {
  const { t } = useLang();

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(28,35,33,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: 360, maxWidth: '100%', padding: 22 }}
      >
        <div style={{ fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onCancel} disabled={busy} style={{ padding: '8px 16px' }}>
            {t('common_cancel')}
          </button>
          <button
            className="btn"
            onClick={onConfirm}
            disabled={busy}
            style={danger ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
          >
            {busy ? t('common_deleting') : t('common_delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
