package com.boueke.canto

import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.nio.charset.StandardCharsets
import android.os.StatFs
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CancellationException
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile

/**
 * Disk-backed ZIP reader for large Canto backups.
 *
 * The React Native bridge receives only central-directory metadata, bounded
 * text entries, and paths to extracted temporary files. Archive and attachment
 * bytes never cross the bridge as a whole value.
 */
class CantoArchiveModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  private val archives = ConcurrentHashMap<String, File>()
  private val cancelledExtractions = ConcurrentHashMap.newKeySet<String>()

  override fun getName(): String = "CantoArchive"

  @ReactMethod
  fun open(
    sourceUri: String,
    operationId: String,
    expectedFingerprint: String?,
    promise: Promise,
  ) {
    Thread {
      var archive: File? = null
      try {
        val id = UUID.randomUUID().toString()
        val sourceFingerprint = sourceFingerprint(sourceUri)
        require(expectedFingerprint == null || expectedFingerprint == sourceFingerprint) {
          "Backup file changed after inspection"
        }
        val root = File(context.cacheDir, "canto-archives")
        if (!root.exists() && !root.mkdirs()) throw IllegalStateException("Unable to create archive cache")
        val copiedArchive = File(root, "$id.zip")
        archive = copiedArchive
        openSource(sourceUri).use { input ->
          FileOutputStream(copiedArchive).use { output ->
            copyBounded(input, output) { cancelledExtractions.contains(operationId) }
          }
        }

        val names = mutableSetOf<String>()
        val entries = Arguments.createArray()
        var totalBytes = 0L
        ZipFile(copiedArchive).use { zip ->
          val enumeration = zip.entries()
          while (enumeration.hasMoreElements()) {
            if (cancelledExtractions.contains(operationId)) {
              throw CancellationException("ZIP archive copy cancelled")
            }
            val entry = enumeration.nextElement()
            if (names.size >= MAX_ARCHIVE_ENTRIES) throw IllegalArgumentException("Archive contains too many entries")
            validateEntryName(entry.name)
            if (!names.add(entry.name)) throw IllegalArgumentException("Duplicate ZIP entry: ${entry.name}")
            validateEntryMetadata(entry)
            totalBytes += entry.size
            if (totalBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES || totalBytes < 0) {
              throw IllegalArgumentException("Archive uncompressed size exceeds limit")
            }
            val map = Arguments.createMap()
            map.putString("name", entry.name)
            map.putDouble("size", entry.size.toDouble())
            map.putDouble("compressedSize", entry.compressedSize.toDouble())
            map.putInt("method", entry.method)
            map.putDouble("crc", entry.crc.toDouble())
            map.putBoolean("directory", entry.isDirectory)
            entries.pushMap(map)
          }
        }

        archives[id] = copiedArchive
        archive = null
        val result = Arguments.createMap()
        result.putString("id", id)
        result.putString("sourceFingerprint", sourceFingerprint)
        result.putArray("entries", entries)
        promise.resolve(result)
      } catch (error: Exception) {
        archive?.delete()
        val code = if (error is CancellationException) "CANTO_ARCHIVE_CANCELLED" else "CANTO_ARCHIVE_OPEN"
        promise.reject(code, error.message, error)
      } finally {
        cancelledExtractions.remove(operationId)
      }
    }.start()
  }

  @ReactMethod
  fun readText(archiveId: String, entryName: String, maxBytes: Double, promise: Promise) {
    try {
      val archive = archiveFor(archiveId)
      val limit = maxBytes.toLong()
      require(limit in 1..MAX_TEXT_ENTRY_BYTES) { "Invalid text-entry limit" }
      ZipFile(archive).use { zip ->
        val entry = entryFor(zip, entryName)
        require(!entry.isDirectory && entry.size <= limit) { "ZIP text entry exceeds limit: $entryName" }
        val bytes = zip.getInputStream(entry).use { input -> readExactlyBounded(input, entry) }
        promise.resolve(String(bytes, StandardCharsets.UTF_8))
      }
    } catch (error: Exception) {
      promise.reject("CANTO_ARCHIVE_READ", error.message, error)
    }
  }

  /** Extract one validated entry to an app-private temporary file in 64-KiB writes. */
  @ReactMethod
  fun extract(
    archiveId: String,
    entryName: String,
    destinationUri: String,
    operationId: String,
    promise: Promise,
  ) {
    // Extraction is deliberately off the native-modules queue so cancel() can
    // arrive while a large entry is being copied.
    Thread {
      var destination: File? = null
      try {
        val archive = archiveFor(archiveId)
        val outputFile = destinationFile(destinationUri)
        destination = outputFile
        outputFile.parentFile?.mkdirs()
        var written = 0L
        ZipFile(archive).use { zip ->
          val entry = entryFor(zip, entryName)
          require(!entry.isDirectory) { "Cannot extract directory: $entryName" }
          zip.getInputStream(entry).use { input ->
            FileOutputStream(outputFile).use { output ->
              written = copyEntryAndVerifyCrc(input, output, entry) {
                cancelledExtractions.contains(operationId)
              }
            }
          }
          require(written == entry.size) { "Truncated ZIP entry: $entryName" }
        }
        val result = Arguments.createMap()
        result.putString("uri", Uri.fromFile(outputFile).toString())
        result.putDouble("size", written.toDouble())
        promise.resolve(result)
      } catch (error: Exception) {
        destination?.delete()
        val code = if (error is CancellationException) "CANTO_ARCHIVE_CANCELLED" else "CANTO_ARCHIVE_EXTRACT"
        promise.reject(code, error.message, error)
      } finally {
        cancelledExtractions.remove(operationId)
      }
    }.start()
  }

  @ReactMethod
  fun cancel(operationId: String, promise: Promise) {
    cancelledExtractions.add(operationId)
    promise.resolve(null)
  }

  @ReactMethod
  fun close(archiveId: String, promise: Promise) {
    try {
      archives.remove(archiveId)?.delete()
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("CANTO_ARCHIVE_CLOSE", error.message, error)
    }
  }

  @ReactMethod
  fun availableBytes(promise: Promise) {
    try {
      // Journal and attachment storage live under the app-private files
      // volume, not necessarily the same mount as an imported content URI.
      val bytes = StatFs(context.filesDir.absolutePath).availableBytes
      promise.resolve(bytes.toDouble())
    } catch (error: Exception) {
      promise.reject("CANTO_ARCHIVE_SPACE", error.message, error)
    }
  }

  private fun archiveFor(id: String): File = archives[id]
    ?: throw IllegalArgumentException("Archive handle is no longer available")

  private fun entryFor(zip: ZipFile, name: String): ZipEntry {
    validateEntryName(name)
    val entry = zip.getEntry(name) ?: throw IllegalArgumentException("ZIP entry not found: $name")
    validateEntryMetadata(entry)
    return entry
  }

  private fun openSource(value: String): InputStream {
    val uri = Uri.parse(value)
    return when (uri.scheme) {
      "content" -> context.contentResolver.openInputStream(uri)
        ?: throw IllegalArgumentException("Unable to open content URI")
      "file" -> FileInputStream(File(uri.path ?: throw IllegalArgumentException("Invalid file URI")))
      else -> FileInputStream(File(value))
    }
  }

  private fun sourceFingerprint(value: String): String {
    val uri = Uri.parse(value)
    if (uri.scheme != "content") {
      val file = when (uri.scheme) {
        "file" -> File(uri.path ?: throw IllegalArgumentException("Invalid file URI"))
        else -> File(value)
      }
      require(file.exists()) { "Backup file no longer exists" }
      return "${file.length()}:${file.lastModified()}"
    }

    context.contentResolver.query(
      uri,
      arrayOf(OpenableColumns.SIZE, DocumentsContract.Document.COLUMN_LAST_MODIFIED),
      null,
      null,
      null,
    )?.use { cursor ->
      if (cursor.moveToFirst()) {
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        val modifiedIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
        val size = if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) cursor.getLong(sizeIndex) else -1L
        val modified = if (modifiedIndex >= 0 && !cursor.isNull(modifiedIndex)) cursor.getLong(modifiedIndex) else -1L
        if (size >= 0) return "$size:$modified"
      }
    }
    throw IllegalArgumentException("Backup file fingerprint is unavailable")
  }

  private fun destinationFile(value: String): File {
    val uri = Uri.parse(value)
    require(uri.scheme == "file") { "Archive extraction requires a file URI" }
    val file = File(uri.path ?: throw IllegalArgumentException("Invalid destination URI")).canonicalFile
    val cache = context.cacheDir.canonicalFile
    require(file.path.startsWith("${cache.path}${File.separator}")) {
      "Archive extraction destination must be inside app cache"
    }
    return file
  }

  private fun validateEntryName(name: String) {
    require(name.isNotEmpty() && !name.startsWith('/') && !name.contains('\\') && !name.contains('\u0000')) {
      "Unsafe ZIP entry name: $name"
    }
    val segments = name.removeSuffix("/").split('/')
    require(segments.none { it == "." || it == ".." || it.isEmpty() }) {
      "Unsafe ZIP entry name: $name"
    }
  }

  private fun copyBounded(
    input: InputStream,
    output: FileOutputStream,
    isCancelled: () -> Boolean,
  ): Long {
    val buffer = ByteArray(COPY_BUFFER_BYTES)
    var written = 0L
    while (true) {
      if (isCancelled()) throw CancellationException("ZIP archive copy cancelled")
      val read = input.read(buffer)
      if (read < 0) break
      output.write(buffer, 0, read)
      written += read
    }
    return written
  }

  private fun readExactlyBounded(input: InputStream, entry: ZipEntry): ByteArray {
    require(entry.size <= MAX_TEXT_ENTRY_BYTES) { "ZIP text entry exceeds limit" }
    val result = ByteArray(entry.size.toInt())
    var offset = 0
    val crc = CRC32()
    while (offset < result.size) {
      val read = input.read(result, offset, result.size - offset)
      if (read < 0) throw IllegalArgumentException("Truncated ZIP text entry")
      crc.update(result, offset, read)
      offset += read
    }
    require(crc.value == entry.crc) { "ZIP entry CRC mismatch: ${entry.name}" }
    return result
  }

  private fun copyEntryAndVerifyCrc(
    input: InputStream,
    output: FileOutputStream,
    entry: ZipEntry,
    isCancelled: () -> Boolean,
  ): Long {
    val buffer = ByteArray(COPY_BUFFER_BYTES)
    val crc = CRC32()
    var written = 0L
    while (true) {
      if (isCancelled()) throw CancellationException("ZIP entry extraction cancelled")
      val read = input.read(buffer)
      if (read < 0) break
      output.write(buffer, 0, read)
      crc.update(buffer, 0, read)
      written += read
    }
    require(written == entry.size) { "Truncated ZIP entry: ${entry.name}" }
    require(crc.value == entry.crc) { "ZIP entry CRC mismatch: ${entry.name}" }
    return written
  }

  private fun validateEntryMetadata(entry: ZipEntry) {
    require(entry.size >= 0 && entry.compressedSize >= 0 && entry.crc >= 0) {
      "ZIP entry has invalid metadata: ${entry.name}"
    }
    require(entry.method == ZipEntry.STORED || entry.method == ZipEntry.DEFLATED) {
      "Unsupported ZIP compression method: ${entry.name}"
    }
    if (!entry.isDirectory && entry.compressedSize > 0) {
      require(entry.size / entry.compressedSize <= MAX_COMPRESSION_RATIO) {
        "ZIP entry compression ratio exceeds limit: ${entry.name}"
      }
    }
  }

  private companion object {
    const val COPY_BUFFER_BYTES = 64 * 1024
    const val MAX_TEXT_ENTRY_BYTES = 4L * 1024 * 1024
    const val MAX_ARCHIVE_ENTRIES = 10_000
    const val MAX_ARCHIVE_UNCOMPRESSED_BYTES = 2L * 1024 * 1024 * 1024
    const val MAX_COMPRESSION_RATIO = 10_000L
  }
}
