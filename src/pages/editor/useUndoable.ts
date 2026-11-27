import { useCallback, useState } from 'react';

interface State<T> {
  past: T[];
  present: T;
  future: T[];
}

const LIMIT = 200;

/** Estado com desfazer/refazer (seção 10.1: "Desfazer e refazer"). */
export function useUndoable<T>(initial: T) {
  const [state, setState] = useState<State<T>>({ past: [], present: initial, future: [] });

  const set = useCallback((next: T | ((current: T) => T)) => {
    setState((s) => {
      const value = typeof next === 'function' ? (next as (c: T) => T)(s.present) : next;
      if (Object.is(value, s.present)) return s;
      return { past: [...s.past, s.present].slice(-LIMIT), present: value, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  /** Substitui o valor e limpa o histórico (ex.: ao abrir outra área). */
  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), []);

  return { value: state.present, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
