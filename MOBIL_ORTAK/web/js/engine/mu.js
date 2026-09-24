// mupdf.js kitaplığına tek erişim noktası.
// Tarayıcıda (worker) ve Node'da (sınama) farklı yollardan yüklenir; motorun
// geri kalanı her zaman buradaki `mu` nesnesini kullanır.

export const mu = {};

export function installMupdf(lib) {
  for (const key of Object.keys(lib)) mu[key] = lib[key];
  if (lib.default) {
    for (const key of Object.keys(lib.default)) if (!(key in mu)) mu[key] = lib.default[key];
  }
}
