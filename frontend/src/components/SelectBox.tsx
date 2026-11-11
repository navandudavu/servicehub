import { useEffect, useRef } from 'react';

/**
 * Checkbox for list rows and the header "select all" box. The header one can show the in-between state
 * (some rows ticked). Clicks do not bubble, so ticking a row never opens it.
 */
export function SelectBox({ checked, indeterminate = false, onChange, label }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      style={{ width: 16, height: 16, margin: 0, cursor: 'pointer' }}
    />
  );
}
