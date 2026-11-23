const fs = require('node:fs');
const path = require('node:path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const OTA_RUNTIME_VERSION = '1';

const OTA_MANAGER_KT = `package dev.omnideck.mobile

import android.content.Context
import java.io.File

object OmniDeckOtaManager {
  const val RUNTIME_VERSION = "${OTA_RUNTIME_VERSION}"
  private const val PREFS_NAME = "omnideck_ota_prefs"
  private const val KEY_OTA_VERSION = "ota_version"
  private const val KEY_OTA_RUNTIME = "ota_runtime"
  private const val KEY_FAILED_BOOTS = "failed_boot_count"
  private const val KEY_ACTIVE_FILE = "active_bundle_file"
  private const val MAX_FAILED_BOOTS = 2

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun otaDir(context: Context): File {
    val dir = File(context.filesDir, "omnideck-ota")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  fun compareSemver(a: String?, b: String?): Int {
    val pa = (a ?: "").trim().removePrefix("v").removePrefix("V")
      .split(".").map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
    val pb = (b ?: "").trim().removePrefix("v").removePrefix("V")
      .split(".").map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
    val len = maxOf(pa.size, pb.size, 3)
    for (i in 0 until len) {
      val va = if (i < pa.size) pa[i] else 0
      val vb = if (i < pb.size) pb[i] else 0
      if (va != vb) return va.compareTo(vb)
    }
    return 0
  }

  /**
   * Called synchronously during MainApplication reactHost initialization.
   * Returns an absolute file path to a verified OTA Hermes bundle if valid,
   * or null to safely boot the APK's embedded bundle.
   */
  fun resolveActiveBundlePath(context: Context, embeddedVersion: String): String? {
    return try {
      val p = prefs(context)
      val otaVersion = p.getString(KEY_OTA_VERSION, null) ?: return null
      val otaRuntime = p.getString(KEY_OTA_RUNTIME, null) ?: return null
      val bundlePath = p.getString(KEY_ACTIVE_FILE, null) ?: return null
      val failedBoots = p.getInt(KEY_FAILED_BOOTS, 0)

      val file = File(bundlePath)
      val runtimeMatches = otaRuntime == RUNTIME_VERSION
      val isNewerThanApk = compareSemver(otaVersion, embeddedVersion) > 0

      if (!runtimeMatches || !isNewerThanApk || !file.exists() || file.length() < 1024L || failedBoots >= MAX_FAILED_BOOTS) {
        clearOta(context)
        return null
      }

      // Brick-proof boot guard: incremented before JS loads, reset to 0 by confirmBootSuccess()
      p.edit().putInt(KEY_FAILED_BOOTS, failedBoots + 1).commit()
      file.absolutePath
    } catch (_: Throwable) {
      null
    }
  }

  fun confirmBootSuccess(context: Context) {
    try {
      prefs(context).edit().putInt(KEY_FAILED_BOOTS, 0).apply()
    } catch (_: Throwable) {
      // ignore
    }
  }

  fun markOtaInstalled(context: Context, version: String, runtimeVersion: String, bundleFile: File) {
    prefs(context).edit()
      .putString(KEY_OTA_VERSION, version)
      .putString(KEY_OTA_RUNTIME, runtimeVersion)
      .putString(KEY_ACTIVE_FILE, bundleFile.absolutePath)
      .putInt(KEY_FAILED_BOOTS, 0)
      .commit()
  }

  fun getActiveOtaVersion(context: Context, embeddedVersion: String): String? {
    val p = prefs(context)
    val otaVersion = p.getString(KEY_OTA_VERSION, null) ?: return null
    val otaRuntime = p.getString(KEY_OTA_RUNTIME, null) ?: return null
    val bundlePath = p.getString(KEY_ACTIVE_FILE, null) ?: return null
    val file = File(bundlePath)
    if (otaRuntime == RUNTIME_VERSION && compareSemver(otaVersion, embeddedVersion) > 0 && file.exists() && file.length() >= 1024L) {
      return otaVersion
    }
    return null
  }

  fun clearOta(context: Context) {
    try {
      prefs(context).edit().clear().commit()
      val dir = File(context.filesDir, "omnideck-ota")
      if (dir.exists()) {
        dir.listFiles()?.forEach { runCatching { it.delete() } }
      }
    } catch (_: Throwable) {
      // ignore
    }
  }
}
`;

const OTA_MODULE_KT = `package dev.omnideck.mobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class OmniDeckOtaModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  companion object {
    const val NAME = "OmniDeckOta"
    const val PROGRESS_EVENT = "OmniDeckOtaProgress"
  }

  override fun getName(): String = NAME

  private fun emitProgress(phase: String, percent: Int) {
    try {
      val map = Arguments.createMap().apply {
        putString("phase", phase)
        putInt("percent", percent.coerceIn(0, 100))
      }
      reactCtx
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(PROGRESS_EVENT, map)
    } catch (_: Throwable) {
      // ignore if JS listener not attached
    }
  }

  private fun openConnectionFollowingRedirects(rawUrl: String): HttpURLConnection {
    var currentUrl = rawUrl
    var hops = 0
    while (hops < 6) {
      val conn = URL(currentUrl).openConnection() as HttpURLConnection
      conn.instanceFollowRedirects = false
      conn.connectTimeout = 15000
      conn.readTimeout = 30000
      conn.setRequestProperty("User-Agent", "OmniDeck-Android/\${BuildConfig.VERSION_NAME}")
      val code = conn.responseCode
      if (code in 300..399) {
        val loc = conn.getHeaderField("Location")
        conn.disconnect()
        if (loc.isNullOrBlank()) throw IllegalStateException("Redirect without Location header")
        currentUrl = URL(URL(currentUrl), loc).toString()
        hops++
      } else {
        if (code !in 200..299) {
          conn.disconnect()
          throw IllegalStateException("HTTP \$code downloading update")
        }
        return conn
      }
    }
    throw IllegalStateException("Too many redirects while downloading update")
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter compatibility
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for NativeEventEmitter compatibility
  }

  @ReactMethod
  fun getOtaState(promise: Promise) {
    try {
      val embedded = BuildConfig.VERSION_NAME
      val otaVersion = OmniDeckOtaManager.getActiveOtaVersion(reactCtx.applicationContext, embedded)
      val map = Arguments.createMap().apply {
        putString("embeddedVersion", embedded)
        putString("activeVersion", otaVersion ?: embedded)
        putString("runtimeVersion", OmniDeckOtaManager.RUNTIME_VERSION)
        putBoolean("isRunningOta", otaVersion != null)
        if (otaVersion != null) putString("otaVersion", otaVersion) else putNull("otaVersion")
      }
      promise.resolve(map)
    } catch (e: Throwable) {
      promise.reject("OTA_STATE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun confirmBootSuccess() {
    OmniDeckOtaManager.confirmBootSuccess(reactCtx.applicationContext)
  }

  @ReactMethod
  fun clearOta(promise: Promise) {
    try {
      OmniDeckOtaManager.clearOta(reactCtx.applicationContext)
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.reject("OTA_CLEAR_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun downloadAndApplyOta(
    bundleUrl: String,
    expectedSha256: String,
    targetVersion: String,
    runtimeVersion: String,
    promise: Promise
  ) {
    if (runtimeVersion != OmniDeckOtaManager.RUNTIME_VERSION) {
      promise.reject(
        "RUNTIME_MISMATCH",
        "Native runtime \$runtimeVersion requires an APK update (installed runtime \${OmniDeckOtaManager.RUNTIME_VERSION})."
      )
      return
    }

    Thread {
      var conn: HttpURLConnection? = null
      try {
        emitProgress("downloading", 2)
        conn = openConnectionFollowingRedirects(bundleUrl)
        val totalBytes = conn.contentLengthLong
        val dir = OmniDeckOtaManager.otaDir(reactCtx.applicationContext)
        val tempFile = File(dir, "pending.android.bundle")
        val finalFile = File(dir, "index.android.bundle")

        val digest = MessageDigest.getInstance("SHA-256")
        var downloaded = 0L
        var lastPct = 2

        conn.inputStream.use { input ->
          FileOutputStream(tempFile).use { output ->
            val buf = ByteArray(16384)
            while (true) {
              val read = input.read(buf)
              if (read <= 0) break
              output.write(buf, 0, read)
              digest.update(buf, 0, read)
              downloaded += read
              if (totalBytes > 0) {
                val pct = ((downloaded * 96) / totalBytes).toInt().coerceIn(2, 98)
                if (pct >= lastPct + 3 || pct == 98) {
                  lastPct = pct
                  emitProgress("downloading", pct)
                }
              }
            }
            output.fd.sync()
          }
        }

        if (tempFile.length() < 1024L) {
          tempFile.delete()
          throw IllegalStateException("Downloaded OTA bundle is empty or truncated.")
        }

        val actualSha = digest.digest().joinToString("") { "%02x".format(it) }
        val cleanExpected = expectedSha256.trim().lowercase()
        if (cleanExpected.isNotEmpty() && actualSha != cleanExpected) {
          tempFile.delete()
          throw IllegalStateException("OTA bundle integrity check failed (SHA-256 mismatch).")
        }

        if (finalFile.exists()) {
          finalFile.delete()
        }
        if (!tempFile.renameTo(finalFile)) {
          tempFile.copyTo(finalFile, overwrite = true)
          tempFile.delete()
        }

        OmniDeckOtaManager.markOtaInstalled(
          reactCtx.applicationContext,
          targetVersion,
          runtimeVersion,
          finalFile
        )
        emitProgress("ready", 100)
        promise.resolve(true)
      } catch (e: Throwable) {
        emitProgress("error", 0)
        promise.reject("OTA_DOWNLOAD_ERROR", e.message ?: "Failed to apply OTA update", e)
      } finally {
        conn?.disconnect()
      }
    }.start()
  }

  @ReactMethod
  fun restartApp() {
    val ctx = reactCtx.applicationContext
    Handler(Looper.getMainLooper()).post {
      try {
        val launchIntent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        if (launchIntent != null) {
          launchIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_CLEAR_TASK or
              Intent.FLAG_ACTIVITY_CLEAR_TOP
          )
          ctx.startActivity(launchIntent)
        }
      } catch (_: Throwable) {
        // fallback below
      }
      Handler(Looper.getMainLooper()).postDelayed({
        Process.killProcess(Process.myPid())
      }, 180)
    }
  }

  @ReactMethod
  fun downloadAndInstallApk(apkUrl: String, promise: Promise) {
    Thread {
      var conn: HttpURLConnection? = null
      try {
        val ctx = reactCtx.applicationContext
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.packageManager.canRequestPackageInstalls()) {
          val settingsIntent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:\${ctx.packageName}")
          ).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          ctx.startActivity(settingsIntent)
          val result = Arguments.createMap().apply {
            putString("status", "permission-required")
          }
          promise.resolve(result)
          return@Thread
        }

        emitProgress("downloading-apk", 2)
        conn = openConnectionFollowingRedirects(apkUrl)
        val totalBytes = conn.contentLengthLong
        val updatesDir = File(ctx.cacheDir, "updates")
        if (!updatesDir.exists()) updatesDir.mkdirs()
        val apkFile = File(updatesDir, "omnideck-update.apk")
        if (apkFile.exists()) apkFile.delete()

        var downloaded = 0L
        var lastPct = 2
        conn.inputStream.use { input ->
          FileOutputStream(apkFile).use { output ->
            val buf = ByteArray(16384)
            while (true) {
              val read = input.read(buf)
              if (read <= 0) break
              output.write(buf, 0, read)
              downloaded += read
              if (totalBytes > 0) {
                val pct = ((downloaded * 96) / totalBytes).toInt().coerceIn(2, 98)
                if (pct >= lastPct + 3 || pct == 98) {
                  lastPct = pct
                  emitProgress("downloading-apk", pct)
                }
              }
            }
          }
        }

        emitProgress("installing-apk", 100)
        val contentUri = FileProvider.getUriForFile(
          ctx,
          "\${ctx.packageName}.omnideck.updater.provider",
          apkFile
        )
        val installIntent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(contentUri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        ctx.startActivity(installIntent)

        val result = Arguments.createMap().apply {
          putString("status", "installer-opened")
        }
        promise.resolve(result)
      } catch (e: Throwable) {
        emitProgress("error", 0)
        promise.reject("APK_INSTALL_ERROR", e.message ?: "Failed to download/install APK", e)
      } finally {
        conn?.disconnect()
      }
    }.start()
  }
}
`;

const OTA_PACKAGE_KT = `package dev.omnideck.mobile

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class OmniDeckOtaPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == OmniDeckOtaModule.NAME) OmniDeckOtaModule(reactContext) else null
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      OmniDeckOtaModule.NAME to ReactModuleInfo(
        OmniDeckOtaModule.NAME,
        OmniDeckOtaModule::class.java.name,
        false,
        false,
        false,
        false
      )
    )
  }
}
`;

const FILE_PROVIDER_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths>
  <cache-path name="omnideck_updates" path="updates/" />
</paths>
`;

const PROGUARD_KEEP_BLOCK = `
# Keep OmniDeck Self-Updater / OTA native bridge classes under R8
-keep class dev.omnideck.mobile.OmniDeckOtaModule { *; }
-keep class dev.omnideck.mobile.OmniDeckOtaPackage { *; }
-keep class dev.omnideck.mobile.OmniDeckOtaManager { *; }
`;

/**
 * Expo Config Plugin adding:
 * 1. Zero-APK Over-The-Air (OTA) Hermes JS bundle self-updater with SHA-256 verification & brick-proof rollback.
 * 2. Fallback in-app APK downloader + FileProvider installer for future native runtime upgrades.
 */
module.exports = function withAndroidSelfUpdater(config) {
  // 1. Add REQUEST_INSTALL_PACKAGES permission + FileProvider to AndroidManifest.xml
  config = withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    if (!Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = [];
    }
    const installPerm = 'android.permission.REQUEST_INSTALL_PACKAGES';
    const hasPerm = manifest['uses-permission'].some(
      (item) => item?.$?.['android:name'] === installPerm,
    );
    if (!hasPerm) {
      manifest['uses-permission'].push({
        $: { 'android:name': installPerm },
      });
    }

    const app = manifest.application?.[0];
    if (app) {
      if (!Array.isArray(app.provider)) {
        app.provider = [];
      }
      const authority = '${applicationId}.omnideck.updater.provider';
      const hasProvider = app.provider.some(
        (p) => p?.$?.['android:authorities'] === authority,
      );
      if (!hasProvider) {
        app.provider.push({
          $: {
            'android:name': 'androidx.core.content.FileProvider',
            'android:authorities': authority,
            'android:exported': 'false',
            'android:grantUriPermissions': 'true',
          },
          'meta-data': [
            {
              $: {
                'android:name': 'android.support.FILE_PROVIDER_PATHS',
                'android:resource': '@xml/omnideck_updater_paths',
              },
            },
          ],
        });
      }
    }
    return modConfig;
  });

  // 2. Patch MainApplication.kt to register OmniDeckOtaPackage and boot OTA bundle when present
  config = withMainApplication(config, (modConfig) => {
    let contents = modConfig.modResults.contents;

    if (!contents.includes('add(OmniDeckOtaPackage())')) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        'PackageList(this).packages.apply {\n          add(OmniDeckOtaPackage())',
      );
    }

    if (!contents.includes('jsBundleFilePath = OmniDeckOtaManager.resolveActiveBundlePath')) {
      contents = contents.replace(
        /ExpoReactHostFactory\.getDefaultReactHost\(\s*context\s*=\s*applicationContext,/,
        'ExpoReactHostFactory.getDefaultReactHost(\n      context = applicationContext,\n      jsBundleFilePath = OmniDeckOtaManager.resolveActiveBundlePath(applicationContext, BuildConfig.VERSION_NAME),',
      );
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });

  // 3. Emit Kotlin source files, FileProvider XML, and ProGuard keep rules
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const androidRoot = modConfig.modRequest.platformProjectRoot;
      const javaDir = path.join(
        androidRoot,
        'app',
        'src',
        'main',
        'java',
        'dev',
        'omnideck',
        'mobile',
      );
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(path.join(javaDir, 'OmniDeckOtaManager.kt'), OTA_MANAGER_KT, 'utf-8');
      fs.writeFileSync(path.join(javaDir, 'OmniDeckOtaModule.kt'), OTA_MODULE_KT, 'utf-8');
      fs.writeFileSync(path.join(javaDir, 'OmniDeckOtaPackage.kt'), OTA_PACKAGE_KT, 'utf-8');

      const xmlDir = path.join(androidRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'omnideck_updater_paths.xml'),
        FILE_PROVIDER_PATHS_XML,
        'utf-8',
      );

      const proguardPath = path.join(androidRoot, 'app', 'proguard-rules.pro');
      const existingProguard = fs.existsSync(proguardPath)
        ? fs.readFileSync(proguardPath, 'utf-8')
        : '';
      if (!existingProguard.includes('OmniDeckOtaModule')) {
        fs.writeFileSync(proguardPath, `${existingProguard.trimEnd()}\n${PROGUARD_KEEP_BLOCK}`, 'utf-8');
      }

      return modConfig;
    },
  ]);

  return config;
};
