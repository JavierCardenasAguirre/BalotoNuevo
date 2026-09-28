'use client'

import { useEffect, useRef, useState } from 'react'

interface NumberCellProps {
  value: number;
  onChange: (value: number) => void;
  onPasteNumbers?: (numbers: number[]) => void;
  max: number;
  focusRingClass?: string;
  cellClass: string;
  ariaLabel?: string;
}

// Extrae todos los números de un texto pegado (separados por espacios, tabs,
// saltos de línea, guiones, comas, etc.).
export function parseNumbers(text: string): number[] {
  if (!text) return [];
  const matches = text.match(/\d+/g) ?? [];
  return matches.map((m) => parseInt(m, 10)).filter((n) => !isNaN(n));
}

export default function NumberCell({
  value,
  onChange,
  onPasteNumbers,
  max,
  focusRingClass = 'focus:ring-primary/40 focus:border-primary',
  cellClass,
  ariaLabel,
}: NumberCellProps) {
  const [focused, setFocused] = useState(false);
  const [local, setLocal] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Mientras no está enfocado, mostramos el valor formateado con cero a la izquierda (ej. 08).
  // Si está enfocado pero el valor cambió por fuera (ej. un pegado masivo), sincronizamos.
  useEffect(() => {
    if (!focused) {
      setLocal(value && value > 0 ? String(value).padStart(2, '0') : '');
    } else {
      const localNum = local === '' ? 0 : parseInt(local, 10);
      if (localNum !== value) {
        setLocal(value && value > 0 ? String(value) : '');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  const displayValue = focused ? local : (value && value > 0 ? String(value).padStart(2, '0') : '');

  const handleChange = (raw: string) => {
    const soloDigitos = (raw ?? '').replace(/[^0-9]/g, '');
    setLocal(soloDigitos);
    const num = soloDigitos === '' ? 0 : parseInt(soloDigitos, 10);
    onChange(isNaN(num) ? 0 : num);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData?.getData('text') ?? '';
    const numeros = parseNumbers(text);
    // Si hay más de un número, es un pegado masivo: lo maneja el panel.
    if (numeros.length > 1 && onPasteNumbers) {
      e.preventDefault();
      onPasteNumbers(numeros);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={displayValue}
      onFocus={() => {
        setFocused(true);
        setLocal(value && value > 0 ? String(value) : '');
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => handleChange(e?.target?.value ?? '')}
      onPaste={handlePaste}
      placeholder="--"
      className={`w-12 sm:w-14 h-10 text-center text-sm font-mono rounded-lg border-2 transition-all duration-150 focus:outline-none focus:ring-2 ${focusRingClass} ${cellClass}`}
    />
  );
}
