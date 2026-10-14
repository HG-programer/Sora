package com.haru.sora;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Debug;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.security.MessageDigest;

public class MainActivity extends BridgeActivity {
    // Official Sora release keystore SHA-256 fingerprint (sora-release-key.jks)
    private static final String OFFICIAL_RELEASE_SHA256 =
        "58FB6EC70CCEF5F673CE1E1ECC2BFEFB07351D5A0F14B5491E9B0D30A75E5548";

    // Known modding & tampering packages (LiteAPK, LuckyPatcher, Xposed)
    private static final String[] TAMPER_PACKAGES = {
        "com.chelpus.lackypatch",
        "com.chelpus.luckypatcher",
        "de.robv.android.xposed.installer",
        "com.topjohnwu.magisk",
        "org.meowcat.edxposed.manager"
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Execute security & integrity enforcement in release builds
        if (!BuildConfig.DEBUG) {
            enforceSecurityChecks();
            // Strictly disable WebView DevTools debugging in production release builds
            WebView.setWebContentsDebuggingEnabled(false);
        }
    }

    private void enforceSecurityChecks() {
        if (!verifyAppSignature()) {
            terminateApp();
            return;
        }

        if (isDebuggerOrHookPresent()) {
            terminateApp();
            return;
        }

        if (hasTamperToolsInstalled()) {
            terminateApp();
        }
    }

    /**
     * Verifies that the running APK's cryptographic signing certificate matches
     * the official Sora release keystore, blocking modified/re-signed APKs from mod sites.
     */
    private boolean verifyAppSignature() {
        try {
            PackageManager pm = getPackageManager();
            String packageName = getPackageName();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES);
                SigningInfo signingInfo = packageInfo.signingInfo;
                if (signingInfo == null) return false;

                Signature[] signatures = signingInfo.hasMultipleSigners()
                    ? signingInfo.getApkContentsSigners()
                    : signingInfo.getSigningCertificateHistory();

                if (signatures == null || signatures.length == 0) return false;

                for (Signature sig : signatures) {
                    if (computeSha256(sig.toByteArray()).equalsIgnoreCase(OFFICIAL_RELEASE_SHA256)) {
                        return true;
                    }
                }
            } else {
                @SuppressWarnings("deprecation")
                PackageInfo packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES);
                @SuppressWarnings("deprecation")
                Signature[] signatures = packageInfo.signatures;
                if (signatures == null || signatures.length == 0) return false;

                for (Signature sig : signatures) {
                    if (computeSha256(sig.toByteArray()).equalsIgnoreCase(OFFICIAL_RELEASE_SHA256)) {
                        return true;
                    }
                }
            }
        } catch (Exception e) {
            return false;
        }
        return false;
    }

    /**
     * Checks if a debugger or dynamic hooking framework (Frida / Xposed) is attached.
     */
    private boolean isDebuggerOrHookPresent() {
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) {
            return true;
        }

        // Check call stack for hooking engines
        for (StackTraceElement element : Thread.currentThread().getStackTrace()) {
            String cls = element.getClassName().toLowerCase();
            if (cls.contains("frida") || cls.contains("xposed") || cls.contains("substrate")) {
                return true;
            }
        }

        // Detect Frida default server pipe
        try {
            File fridaSocket = new File("/data/local/tmp/re.frida.server");
            if (fridaSocket.exists()) return true;
        } catch (Exception ignored) {}

        return false;
    }

    /**
     * Checks if known APK modding / billing spoofing tools are installed on device.
     */
    private boolean hasTamperToolsInstalled() {
        PackageManager pm = getPackageManager();
        for (String pkg : TAMPER_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                return true;
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        return false;
    }

    private String computeSha256(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(data);
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02X", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private void terminateApp() {
        finishAffinity();
        System.exit(0);
    }
}
