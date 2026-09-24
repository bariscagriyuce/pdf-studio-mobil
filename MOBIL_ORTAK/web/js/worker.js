// PDF motoru worker'ı: ağır işler (görüntüleme, düzenleme, kaydetme) arayüzü
// kilitlemesin diye ayrı iş parçacığında çalışır.

import { handle, errorInfo, transferables } from "./host.js";

// Çağrılar sırayla işlenir: mupdf belgesi aynı anda iki işlemle değiştirilmemeli.
let queue = Promise.resolve();

self.onmessage = (ev) => {
  const { id, method, args } = ev.data;
  queue = queue.then(async () => {
    try {
      const out = await handle(method, args);
      self.postMessage({ id, ok: true, ...out }, transferables(out.result));
    } catch (e) {
      self.postMessage({ id, ok: false, error: errorInfo(e) });
    }
  });
};

self.postMessage({ ready: true });
