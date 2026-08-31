type Handler<T> = (payload: T) => void;

/** 极简事件总线：把 WebSocket 推送出的即时事件（同步/画面流）转给持有 video 元素的组件 */
export class Emitter<E extends object> {
  private map = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(key: K, handler: Handler<E[K]>): () => void {
    let set = this.map.get(key);
    if (!set) {
      set = new Set();
      this.map.set(key, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(key: K, ...args: E[K] extends void ? [] : [E[K]]): void {
    const payload = args[0] as E[K];
    for (const h of this.map.get(key) ?? []) (h as Handler<E[K]>)(payload);
  }
}
