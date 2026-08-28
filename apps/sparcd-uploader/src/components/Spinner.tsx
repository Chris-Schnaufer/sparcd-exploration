import { useEffect, useState } from 'react';

// The design system is sharp-corners-everywhere (border-radius is zeroed in
// the Tailwind theme), so a border-ring spinner renders as a broken square.
// A mono-glyph spinner is the Field Notebook-native busy indicator instead.
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return (
    <span aria-hidden className="font-mono">
      {FRAMES[frame]}
    </span>
  );
}
