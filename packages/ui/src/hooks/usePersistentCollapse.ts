import { useState, useEffect } from "react";

export function usePersistentCollapse(key: string, defaultCollapsed: boolean = false) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(defaultCollapsed);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      setIsCollapsed(stored === "true");
    }
  }, [key]);

  const toggle = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(key, String(next));
      return next;
    });
  };

  return { isCollapsed, toggle, mounted };
}
