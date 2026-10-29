// A slightly more considered empty state than bare grey text - for primary
// content areas (a whole table, a whole board column) where landing on
// nothing is a real moment, not a nested detail. Deliberately not used for
// every "no X yet" message in the app - a compact modal section (e.g. "no
// appliances") reading plain grey text is fine and adding an icon there
// would be clutter, not polish. Reserved for the views someone actually
// lands on and needs to feel "this is empty, not broken".
export default function EmptyState({ icon = '○', message, action }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '36px 20px', textAlign: 'center', color: 'var(--stone)'
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', background: 'var(--paper)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, marginBottom: 12, border: '1px solid var(--border)'
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 13.5 }}>{message}</div>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
