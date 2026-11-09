// Arayüzün motorla konuştuğu istemci. Önce modül worker'ı dener; açılamazsa
// (bazı eski WebView'lar) motoru ana iş parçacığında çalıştırır.

export class EngineError extends Error {
  constructor(info) {
    super(info.message);
    this.code = info.code;
    this.params = info.params || null;
  }
}

export class EngineClient {
  constructor() {
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.state = { open: false, pageCount: 0, version: 0, dirty: false };
    this.mode = "?";
  }

  async start() {
    try {
      await this._startWorker();
      this.mode = "worker";
    } catch (e) {
      console.warn("Worker açılamadı, motor ana iş parçacığında çalışacak:", e);
      this.worker = null;
      this.inline = await import("./host.js");
      this.mode = "inline";
    }
    return this.mode;
  }

  _startWorker() {
    return new Promise((resolve, reject) => {
      let w;
      try {
        w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
      } catch (e) {
        reject(e);
        return;
      }
      const timer = setTimeout(() => reject(new Error("worker zaman aşımı")), 20000);
      w.onerror = (e) => {
        clearTimeout(timer);
        reject(e.message ? new Error(e.message) : new Error("worker hatası"));
      };
      w.onmessage = (ev) => {
        if (ev.data && ev.data.ready) {
          clearTimeout(timer);
          w.onmessage = (m) => this._onMessage(m.data);
          w.onerror = (err) => console.error("worker:", err);
          this.worker = w;
          resolve();
        }
      };
    });
  }

  _onMessage(msg) {
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    this._apply(msg);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new EngineError(msg.error));
  }

  _apply(msg) {
    const state = msg.ok ? msg.state : msg.error && msg.error.state;
    if (state) this.state = state;
    if (msg.change || state) for (const fn of this.listeners) fn(this.state, msg.change || null);
  }

  /** Motor komutunu çağırır. transfer: aktarılacak ArrayBuffer listesi. */
  call(method, ...args) {
    if (this.inline) {
      return this.inline.handle(method, args).then(
        (out) => {
          this._apply({ ok: true, ...out });
          return out.result;
        },
        (e) => {
          const info = this.inline.errorInfo(e);
          this._apply({ ok: false, error: info });
          throw new EngineError(info);
        },
      );
    }
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const transfer = [];
      for (const a of args) if (a instanceof ArrayBuffer) transfer.push(a);
      this.worker.postMessage({ id, method, args }, transfer);
    });
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
