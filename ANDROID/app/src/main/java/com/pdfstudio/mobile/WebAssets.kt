package com.pdfstudio.mobile

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.IOException

/**
 * assets/www içindeki ortak arayüzü https://appassets.androidplatform.net/assets/www/
 * altında sunar. ES modülleri, Worker ve WebAssembly doğru MIME türü ister;
 * bu yüzden türler uzantıdan açıkça belirlenir.
 */
object WebAssets {
    const val HOST = "appassets.androidplatform.net"
    const val START_URL = "https://$HOST/assets/www/index.html"

    private val MIME = mapOf(
        "html" to "text/html", "js" to "text/javascript", "mjs" to "text/javascript",
        "css" to "text/css", "json" to "application/json", "wasm" to "application/wasm",
        "ttf" to "font/ttf", "otf" to "font/otf", "png" to "image/png", "svg" to "image/svg+xml",
        "gz" to "application/octet-stream", "txt" to "text/plain", "md" to "text/plain",
    )

    fun mimeFor(path: String): String = MIME[path.substringAfterLast('.', "").lowercase()] ?: "application/octet-stream"

    class AssetHandler(private val context: Context) : WebViewAssetLoader.PathHandler {
        /**
         * AAPT, .gz uzantılı varlıkları APK'ya açarak ve uzantısız koyar
         * (lang/tur.traineddata.gz → lang/tur.traineddata). OCR motoru .gz adını
         * ister ama sıkıştırılmamış veriyi de tanır; bu yüzden uzantısız adı dene.
         */
        private fun openAsset(path: String) = try {
            context.assets.open(path)
        } catch (e: IOException) {
            if (path.endsWith(".gz")) context.assets.open(path.removeSuffix(".gz")) else throw e
        }

        override fun handle(path: String): WebResourceResponse? {
            val clean = path.trimStart('/')
            if (clean.contains("..")) return null
            return try {
                val stream = openAsset(clean)
                val mime = mimeFor(clean)
                val encoding = if (mime.startsWith("text/") || mime == "application/json") "utf-8" else null
                WebResourceResponse(mime, encoding, stream).apply {
                    responseHeaders = mapOf("Cache-Control" to "no-cache")
                }
            } catch (e: IOException) {
                WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), null)
            }
        }
    }
}
