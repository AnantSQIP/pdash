'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children into <body> so fixed-position overlays escape any ancestor
 * with a CSS transform or overflow clip. The sidebar <aside> uses translate-x
 * (drawer slide), which makes it the containing block for position:fixed
 * descendants and clips them with overflow — so panels mounted inside it get
 * trapped/hidden. Portaling to <body> fixes that. SSR-safe.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
