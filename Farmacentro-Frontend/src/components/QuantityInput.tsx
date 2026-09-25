import { useEffect, useState, type KeyboardEvent } from 'react';

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
}

/**
 * Quantity field with − / + buttons. The text can be cleared and retyped freely; the value is
 * clamped to [min, max] when the field loses focus or Enter is pressed (an empty field → min).
 * Arrow up/down change it by one.
 */
export function QuantityInput({ value, onChange, min = 1, max, label }: QuantityInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const clamp = (n: number) => Math.max(min, max === undefined ? n : Math.min(n, max));

  const commit = (text: string) => {
    const parsed = Number.parseInt(text, 10);
    const next = Number.isNaN(parsed) ? min : clamp(parsed);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const step = (delta: number) => onChange(clamp(value + delta));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit(draft);
    }
  };

  return (
    <div className="qty-control">
      <button type="button" aria-label={`Disminuir ${label}`} disabled={value <= min} onClick={() => step(-1)}>
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={draft}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 5);
          setDraft(digits);
          const parsed = Number.parseInt(digits, 10);
          // Valid values are applied while typing; empty or out-of-range text waits for blur.
          if (!Number.isNaN(parsed) && parsed >= min && (max === undefined || parsed <= max)) onChange(parsed);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        disabled={max !== undefined && value >= max}
        onClick={() => step(1)}
      >
        +
      </button>
    </div>
  );
}
