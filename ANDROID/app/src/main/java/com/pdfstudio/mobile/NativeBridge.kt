package com.pdfstudio.mobile

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.print.PrintManager
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebResourceResponse
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContract
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * JS ↔ Android köprüsü. Sözleşme MOBIL_ORTAK/web/js/bridge.js başındaki
 * açıklamadadır; iOS tarafı (IOS/PDFStudio/NativeBridge.swift) aynısını uygular.
 */
class NativeBridge(private val activity: MainActivity) {

    @Volatile var jsReady = false
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    val files = FileRegistry(activity)
    private val writes = ConcurrentHashMap<String, PendingWrite>()
    private val queuedEvents = mutableListOf<JSONObject>()

    private class PendingWrite(val file: File, val out: FileOutputStream)

    // ------------------------------------------------------ sistem pencereleri
    private var openCallback: ((List<Uri>) -> Unit)? = null
    private var createCallback: ((Uri?) -> Unit)? = null

    private val openLauncher = activity.registerForActivityResult(OpenDocs()) { uris ->
        openCallback?.invoke(uris)
        openCallback = null
    }
    private val createLauncher = activity.registerForActivityResult(CreateDoc()) { uri ->
        createCallback?.invoke(uri)
        createCallback = null
    }

    /** ACTION_OPEN_DOCUMENT: (mime listesi, çoklu seçim) → Uri listesi */
    private class OpenDocs : ActivityResultContract<Pair<Array<String>, Boolean>, List<Uri>>() {
        override fun createIntent(context: Context, input: Pair<Array<String>, Boolean>) =
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = if (input.first.size == 1) input.first[0] else "*/*"
                if (input.first.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, input.first)
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, input.second)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            }

        override fun parseResult(resultCode: Int, intent: Intent?): List<Uri> {
            if (resultCode != Activity.RESULT_OK || intent == null) return emptyList()
            val clip = intent.clipData
            if (clip != null) return (0 until clip.itemCount).map { clip.getItemAt(it).uri }
            return listOfNotNull(intent.data)
        }
    }

    /** ACTION_CREATE_DOCUMENT: (önerilen ad, mime) → Uri */
    private class CreateDoc : ActivityResultContract<Pair<String, String>, Uri?>() {
        override fun createIntent(context: Context, input: Pair<String, String>) =
            Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = input.second
                putExtra(Intent.EXTRA_TITLE, input.first)
            }

        override fun parseResult(resultCode: Int, intent: Intent?): Uri? =
            if (resultCode == Activity.RESULT_OK) intent?.data else null
    }

    // ------------------------------------------------------------ JS girişi
    @JavascriptInterface
    fun postMessage(json: String) {
        val msg = try { JSONObject(json) } catch (e: Exception) { return }
        main.post { dispatch(msg) }
    }

    private fun dispatch(msg: JSONObject) {
        val id = msg.optInt("id", 0)
        try {
            when (msg.optString("cmd")) {
                "ready" -> {
                    jsReady = true
                    synchronized(queuedEvents) {
                        queuedEvents.forEach { sendToJs(it) }
                        queuedEvents.clear()
                    }
                }
                "openFiles" -> openFiles(id, msg.optString("kind", "pdf"), msg.optBoolean("multiple"))
                "openHandle" -> openHandle(id, msg.getString("handle"))
                "writeBegin" -> writeBegin(id)
                "writeChunk" -> writeChunk(id, msg.getString("token"), msg.getString("data"))
                "writeEnd" -> writeEnd(id, msg)
                "openUrl" -> { openExternal(msg.getString("url")); reply(id, JSONObject.NULL) }
                "copyText" -> {
                    val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("PDF Studio", msg.getString("text")))
                    reply(id, JSONObject.NULL)
                }
                "setTheme" -> { activity.setDarkUi(msg.optBoolean("dark")); reply(id, JSONObject.NULL) }
                "setDirty" -> Unit
                "backResult" -> if (!msg.optBoolean("handled")) activity.finish()
                "appInfo" -> {
                    val info = activity.packageManager.getPackageInfo(activity.packageName, 0)
                    reply(id, JSONObject().put("platform", "android").put("version", info.versionName).put("sdk", Build.VERSION.SDK_INT))
                }
                else -> if (id != 0) fail(id, "Bilinmeyen komut: " + msg.optString("cmd"))
            }
        } catch (e: Exception) {
            if (id != 0) fail(id, e.message ?: e.toString())
        }
    }

    // ------------------------------------------------------------ JS çıkışı
    private fun sendToJs(obj: JSONObject) {
        val js = "window.PDFStudioBridge&&window.PDFStudioBridge.receive(${JSONObject.quote(obj.toString())})"
        main.post { activity.web.evaluateJavascript(js, null) }
    }

    fun sendEvent(obj: JSONObject) {
        if (jsReady) sendToJs(obj) else synchronized(queuedEvents) { queuedEvents.add(obj) }
    }

    private fun reply(id: Int, result: Any) {
        if (id != 0) sendToJs(JSONObject().put("id", id).put("ok", true).put("result", result))
    }

    private fun fail(id: Int, message: String) {
        sendToJs(JSONObject().put("id", id).put("ok", false).put("error", message))
    }

    // ---------------------------------------------------------------- açma
    private fun mimesFor(kind: String): Array<String> = when (kind) {
        "pdf" -> arrayOf("application/pdf")
        "image" -> arrayOf("image/*")
        "json" -> arrayOf("application/json", "text/plain", "application/octet-stream")
        "font" -> arrayOf("font/ttf", "font/otf", "font/sfnt", "application/x-font-ttf", "application/x-font-otf", "application/font-sfnt", "application/vnd.ms-opentype", "application/octet-stream")
        "doc" -> arrayOf("application/pdf", "image/*", "application/vnd.ms-xpsdocument", "application/oxps", "application/epub+zip", "application/x-cbz", "application/vnd.comicbook+zip")
        else -> arrayOf("*/*")
    }

    private fun openFiles(id: Int, kind: String, multiple: Boolean) {
        openCallback = { uris ->
            val arr = JSONArray()
            for (uri in uris) {
                files.persist(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                arr.put(files.describe(uri))
            }
            reply(id, arr)
        }
        try {
            openLauncher.launch(Pair(mimesFor(kind), multiple))
        } catch (e: ActivityNotFoundException) {
            openCallback = null
            fail(id, "Dosya seçici bulunamadı")
        }
    }

    private fun openHandle(id: Int, handle: String) {
        val uri = Uri.parse(handle)
        if (!files.canRead(uri)) {
            fail(id, "Dosyaya erişim izni yok ya da dosya taşınmış")
            return
        }
        reply(id, files.describe(uri))
    }

    /** "Birlikte aç" / "Paylaş" ile gelen dosya */
    fun openIncoming(uri: Uri, flags: Int) {
        files.persist(uri, flags)
        sendEvent(JSONObject().put("event", "openFile").put("file", files.describe(uri)))
    }

    // ---------------------------------------------------------------- yazma
    private fun writeBegin(id: Int) {
        val token = UUID.randomUUID().toString()
        val dir = File(activity.cacheDir, "writes").apply { mkdirs() }
        val f = File(dir, token)
        writes[token] = PendingWrite(f, FileOutputStream(f))
        reply(id, JSONObject().put("token", token))
    }

    private fun writeChunk(id: Int, token: String, data: String) {
        val w = writes[token] ?: return fail(id, "Geçersiz yazma belirteci")
        io.execute {
            try {
                w.out.write(Base64.decode(data, Base64.DEFAULT))
                reply(id, JSONObject.NULL)
            } catch (e: Exception) {
                fail(id, e.message ?: "Yazılamadı")
            }
        }
    }

    private fun writeEnd(id: Int, msg: JSONObject) {
        val token = msg.getString("token")
        val w = writes.remove(token) ?: return fail(id, "Geçersiz yazma belirteci")
        val mode = msg.optString("mode", "saveAs")
        val name = sanitizeName(msg.optString("name", "belge.pdf"))
        val mime = msg.optString("mime", "application/pdf").substringBefore(';')
        val handle = msg.optString("handle", "").ifEmpty { null }
        io.execute {
            try { w.out.close() } catch (_: Exception) {}
            main.post {
                try {
                    when (mode) {
                        "save" -> if (handle != null) saveTo(id, w.file, Uri.parse(handle), name) else saveAs(id, w.file, name, mime)
                        "saveAs" -> saveAs(id, w.file, name, mime)
                        "share" -> share(id, w.file, name, mime)
                        "print" -> print(id, w.file, name)
                        else -> fail(id, "Bilinmeyen yazma kipi: $mode")
                    }
                } catch (e: Exception) {
                    w.file.delete()
                    fail(id, e.message ?: e.toString())
                }
            }
        }
    }

    private fun sanitizeName(name: String) = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "belge.pdf" }

    private fun copyToUri(src: File, uri: Uri) {
        // "wt": dosyayı kısaltarak üzerine yaz (eski içerikten kalıntı olmasın)
        val out = activity.contentResolver.openOutputStream(uri, "wt") ?: throw IllegalStateException("Dosya yazmak için açılamadı")
        out.use { o -> src.inputStream().use { it.copyTo(o) } }
    }

    private fun saveTo(id: Int, src: File, uri: Uri, name: String) {
        io.execute {
            try {
                copyToUri(src, uri)
                src.delete()
                reply(id, JSONObject().put("handle", uri.toString()).put("name", files.displayName(uri) ?: name))
            } catch (e: Exception) {
                src.delete()
                fail(id, e.message ?: "Kaydedilemedi")
            }
        }
    }

    private fun saveAs(id: Int, src: File, name: String, mime: String) {
        createCallback = { uri ->
            if (uri == null) {
                src.delete()
                reply(id, JSONObject.NULL)
            } else {
                files.persist(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                saveTo(id, src, uri, name)
            }
        }
        createLauncher.launch(Pair(name, mime))
    }

    private fun share(id: Int, src: File, name: String, mime: String) {
        val dir = File(activity.cacheDir, "shared").apply { mkdirs() }
        dir.listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() > 3_600_000) it.delete() }
        val target = File(dir, name)
        if (target.exists()) target.delete()
        if (!src.renameTo(target)) {
            src.copyTo(target, overwrite = true)
            src.delete()
        }
        val uri = FileProvider.getUriForFile(activity, activity.packageName + ".files", target)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TITLE, name)
            clipData = ClipData.newRawUri(name, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivity(Intent.createChooser(send, activity.getString(R.string.share_with)))
        reply(id, JSONObject().put("name", name))
    }

    private fun print(id: Int, src: File, name: String) {
        val pm = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
        pm.print(name, PdfPrintAdapter(src, name), null)
        reply(id, JSONObject().put("name", name))
    }

    // ---------------------------------------------------------------- diğer
    fun openExternal(url: String) {
        val uri = Uri.parse(url)
        if (uri.scheme !in setOf("http", "https", "mailto", "tel")) return
        try {
            activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(activity, "Bu bağlantıyı açacak uygulama yok", Toast.LENGTH_SHORT).show()
        }
    }

    fun shutdown() {
        io.shutdown()
        writes.values.forEach { runCatching { it.out.close(); it.file.delete() } }
        writes.clear()
    }
}

/**
 * Açılan dosyaların içeriğini WebView'e https://appassets.../native/file/<belirteç>
 * adresinden akıtır (büyük PDF'ler JS köprüsünden base64 geçmesin).
 */
class FileRegistry(private val activity: Activity) {
    private val tokens = ConcurrentHashMap<String, Uri>()

    fun register(uri: Uri): String {
        val token = UUID.randomUUID().toString()
        tokens[token] = uri
        return token
    }

    fun describe(uri: Uri): JSONObject {
        val token = register(uri)
        return JSONObject()
            .put("name", displayName(uri) ?: uri.lastPathSegment ?: "belge.pdf")
            .put("url", "https://${WebAssets.HOST}/native/file/$token")
            .put("handle", uri.toString())
            .put("mime", activity.contentResolver.getType(uri) ?: "")
    }

    fun displayName(uri: Uri): String? = try {
        activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    } catch (e: Exception) {
        null
    }

    /** Uygulama yeniden açıldığında da erişilebilsin (son kullanılanlar, "Kaydet"). */
    fun persist(uri: Uri, flags: Int) {
        if (uri.scheme != "content") return
        val rw = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        try {
            activity.contentResolver.takePersistableUriPermission(uri, flags and rw)
        } catch (e: SecurityException) {
            try {
                activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } catch (_: SecurityException) {
                // kalıcı izin verilmeyen kaynak (ör. e-posta eki): oturum boyunca geçerli
            }
        }
    }

    fun canRead(uri: Uri): Boolean = try {
        activity.contentResolver.openInputStream(uri)?.close()
        true
    } catch (e: Exception) {
        false
    }

    fun pathHandler() = WebViewAssetLoader.PathHandler { path ->
        // path: "file/<belirteç>"
        val token = path.removePrefix("file/")
        val uri = tokens[token]
        if (uri == null) {
            WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), null)
        } else {
            try {
                val stream = activity.contentResolver.openInputStream(uri)
                WebResourceResponse("application/octet-stream", null, stream)
            } catch (e: Exception) {
                WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), null)
            }
        }
    }
}
