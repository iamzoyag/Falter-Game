// A single shared event bus so vision, quiz, audio, and the director stay
// decoupled — nobody imports anybody else's internals, they just emit/listen.
export const bus = new EventTarget();

export function emit(type, detail) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, handler) {
  bus.addEventListener(type, handler);
  return () => bus.removeEventListener(type, handler);
}
