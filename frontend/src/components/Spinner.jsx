// A small spinning indicator plus optional label, used everywhere the app
// is waiting on a request. Replaces bare "Loading…" text with something
// that has actual visual weight - a plain text node next to a live app
// reads as unfinished, a spinner reads as "working on it".
// The spin keyframe is defined once globally in index.css rather than
// injected per-instance here, so mounting several spinners at once
// doesn't duplicate the animation definition in the DOM.
export default function Spinner({ label, size = 16 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--stone)', fontSize: 13 }}>
      <div
        style={{
          width: size, height: size, borderRadius: '50%',
          border: '2px solid var(--border)', borderTopColor: 'var(--green)',
          animation: 'spin 0.7s linear infinite'
        }}
      />
      {label && <span>{label}</span>}
    </div>
  );
}
