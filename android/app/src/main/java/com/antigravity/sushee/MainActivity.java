package com.antigravity.sushee;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_CODE = 1001;
    private static final String TAG = "SUSHEE_MAIN";
    private StorageBridge storageBridge;

    public class StorageBridge {
        private final Context context;
        private PowerManager.WakeLock wakeLock;

        public StorageBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean saveRecording(String base64Data, String filename, String mimeType, String songTitle, String artist) {
            try {
                if (base64Data == null || base64Data.isEmpty()) {
                    showToastOnUiThread("Data rekaman kosong.");
                    return false;
                }

                byte[] audioBytes = Base64.decode(base64Data, Base64.DEFAULT);
                String safeName = (filename != null && !filename.trim().isEmpty()) ? filename : ("Karaoke_" + System.currentTimeMillis() + ".mp3");
                String safeMime = (mimeType != null && !mimeType.trim().isEmpty()) ? mimeType : "audio/mp3";

                // For Android 10+ (API 29+), use MediaStore to save directly into Music / SUSHEE_Karaoke
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Audio.Media.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Audio.Media.MIME_TYPE, safeMime);
                    values.put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/SUSHEE_Karaoke");
                    values.put(MediaStore.Audio.Media.IS_PENDING, 1);
                    if (songTitle != null) values.put(MediaStore.Audio.Media.TITLE, songTitle);
                    if (artist != null) values.put(MediaStore.Audio.Media.ARTIST, artist);

                    ContentResolver resolver = context.getContentResolver();
                    Uri uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);

                    if (uri != null) {
                        try (OutputStream os = resolver.openOutputStream(uri)) {
                            if (os != null) {
                                os.write(audioBytes);
                                os.flush();
                            }
                        }
                        values.clear();
                        values.put(MediaStore.Audio.Media.IS_PENDING, 0);
                        resolver.update(uri, values, null, null);

                        showToastOnUiThread("✓ Berhasil disimpan ke Musik/SUSHEE_Karaoke/" + safeName);
                        return true;
                    }
                }

                // Legacy Android (or fallback for older devices)
                File musicDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "SUSHEE_Karaoke");
                if (!musicDir.exists()) {
                    musicDir.mkdirs();
                }
                if (!musicDir.exists()) {
                    musicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                }

                File outFile = new File(musicDir, safeName);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(audioBytes);
                    fos.flush();
                }

                // Trigger Media Scanner so the new recording appears in Android Music Player and File Manager
                MediaScannerConnection.scanFile(context, new String[]{outFile.getAbsolutePath()}, new String[]{safeMime}, null);

                showToastOnUiThread("✓ Berhasil disimpan ke: " + outFile.getAbsolutePath());
                return true;
            } catch (Exception e) {
                Log.e(TAG, "Error saving recording to storage", e);
                showToastOnUiThread("Gagal menyimpan ke memori HP: " + e.getMessage());
                return false;
            }
        }

        @JavascriptInterface
        public int getOptimalHardwareLatencyMs() {
            try {
                android.media.AudioManager am = (android.media.AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    // Check connected audio route first
                    if (am.isBluetoothA2dpOn() || am.isBluetoothScoOn()) {
                        return 180; // Bluetooth TWS/Headphones transmission latency
                    }
                    if (am.isWiredHeadsetOn()) {
                        return 60; // Low latency analog wired headset
                    }

                    String sampleRate = am.getProperty(android.media.AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE);
                    String bufferFrames = am.getProperty(android.media.AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER);
                    if (sampleRate != null && bufferFrames != null) {
                        int sr = Integer.parseInt(sampleRate);
                        int frames = Integer.parseInt(bufferFrames);
                        int bufferMs = (int) ((frames * 1000.0) / sr);
                        // Total acoustic roundtrip: speaker output buffer + mic input buffer + acoustic HAL delay
                        return Math.max(85, Math.min(220, bufferMs * 2 + 65));
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Could not determine hardware latency", e);
            }
            return 0; // Pure Realtime 0ms Direct Sync (Zero Delay)
        }

        @JavascriptInterface
        public boolean isBluetoothAudioConnected() {
            try {
                android.media.AudioManager am = (android.media.AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    return am.isBluetoothA2dpOn() || am.isBluetoothScoOn();
                }
            } catch (Exception ignored) {}
            return false;
        }

        @JavascriptInterface
        public boolean isWiredHeadsetConnected() {
            try {
                android.media.AudioManager am = (android.media.AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    return am.isWiredHeadsetOn();
                }
            } catch (Exception ignored) {}
            return false;
        }

        @JavascriptInterface
        public void enableRealtimeAudioMode() {
            try {
                android.media.AudioManager am = (android.media.AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    am.setMode(android.media.AudioManager.MODE_NORMAL);
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void setKeepScreenAwake(final boolean keepAwake) {
            MainActivity.this.runOnUiThread(() -> {
                try {
                    Window window = getWindow();
                    if (window != null) {
                        if (keepAwake) {
                            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                            Log.d(TAG, "Screen keep awake: ENABLED (recording in progress)");
                        } else {
                            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                            Log.d(TAG, "Screen keep awake: DISABLED (idle or playback only)");
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error updating FLAG_KEEP_SCREEN_ON: " + e.getMessage());
                }
            });
        }

        @JavascriptInterface
        public void setBackgroundAudioActive(final boolean active) {
            try {
                if (active) {
                    if (wakeLock == null) {
                        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                        if (pm != null) {
                            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SUSHEE::KaraokeBackgroundAudioLock");
                            wakeLock.setReferenceCounted(false);
                        }
                    }
                    if (wakeLock != null && !wakeLock.isHeld()) {
                        wakeLock.acquire(180 * 60 * 1000L); // 3 hours timeout safety
                        Log.d(TAG, "Background audio WakeLock acquired");
                    }
                } else {
                    if (wakeLock != null && wakeLock.isHeld()) {
                        wakeLock.release();
                        Log.d(TAG, "Background audio WakeLock released");
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "WakeLock management error: " + e.getMessage());
            }
        }

        public void releaseWakeLock() {
            try {
                if (wakeLock != null && wakeLock.isHeld()) {
                    wakeLock.release();
                    Log.d(TAG, "WakeLock cleanly released");
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public boolean isStoragePermissionGranted() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED;
            } else {
                return ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
            }
        }

        @JavascriptInterface
        public void requestStoragePermission() {
            MainActivity.this.runOnUiThread(MainActivity.this::requestAppPermissions);
        }

        @JavascriptInterface
        public void exitApp() {
            MainActivity.this.runOnUiThread(MainActivity.this::finish);
        }

        private void showToastOnUiThread(final String message) {
            MainActivity.this.runOnUiThread(() -> Toast.makeText(context, message, Toast.LENGTH_LONG).show());
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Intercept Android navbar / gesture back button to navigate tabs sequentially in WebView
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                try {
                    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                    if (webView != null) {
                        webView.evaluateJavascript("if (window.handleAppBackButton) { window.handleAppBackButton(); }", null);
                    } else {
                        finish();
                    }
                } catch (Exception e) {
                    finish();
                }
            }
        });
        applyDarkSystemBarsWithWhiteIcons();

        // Respect system bar insets on Android 15/16 (targetSdk 36) so WebView never overlaps status bar icons
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content), (view, windowInsets) -> {
            androidx.core.graphics.Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            view.setBackgroundColor(Color.parseColor("#07080d"));
            return windowInsets;
        });

        // Optimize Android AudioManager for lowest hardware latency audio
        try {
            android.media.AudioManager am = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setMode(android.media.AudioManager.MODE_NORMAL);
                am.requestAudioFocus(focusChange -> {}, android.media.AudioManager.STREAM_MUSIC, android.media.AudioManager.AUDIOFOCUS_GAIN);
            }
        } catch (Exception e) {
            Log.w(TAG, "Audio manager setup warning", e);
        }

        configureWebViewSettings();

        // Safely request permissions after window is rendered to prevent UI lockup
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(this::requestAppPermissions, 600);
    }

    private void applyDarkSystemBarsWithWhiteIcons() {
        try {
            Window window = getWindow();
            if (window == null) return;
            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN);
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            WindowCompat.setDecorFitsSystemWindows(window, true);
            window.getDecorView().setBackgroundColor(Color.parseColor("#07080d"));
            window.setStatusBarColor(Color.parseColor("#07080d"));
            window.setNavigationBarColor(Color.parseColor("#0a0c14"));

            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            if (controller != null) {
                // Dark status bar (#07080d) requires crisp WHITE icons (lightStatusBar = false)
                controller.setAppearanceLightStatusBars(false);
                controller.setAppearanceLightNavigationBars(false);
                controller.show(WindowInsetsCompat.Type.statusBars());
                controller.show(WindowInsetsCompat.Type.navigationBars());
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.view.WindowInsetsController nativeController = window.getInsetsController();
                if (nativeController != null) {
                    nativeController.setSystemBarsAppearance(
                        0,
                        android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                    );
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "System bar appearance setup warning", e);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        applyDarkSystemBarsWithWhiteIcons();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyDarkSystemBarsWithWhiteIcons();
        }
    }

    public void requestAppPermissions() {
        try {
            List<String> permissions = new ArrayList<>();

            // Microphone (Runtime permission)
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.RECORD_AUDIO);
            }

            // Bluetooth Connect for Low Latency Headphones (Android 12+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                    permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
                }
            }

            // Storage & Music/Audio Access
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // Android 13+
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    permissions.add(Manifest.permission.READ_MEDIA_AUDIO);
                }
            } else {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
                }
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
                }
            }

            if (!permissions.isEmpty()) {
                ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), PERMISSION_REQ_CODE);
            }
        } catch (Exception e) {
            Log.e(TAG, "Permission request error: " + e.getMessage());
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQ_CODE) {
            boolean anyGranted = false;
            for (int res : grantResults) {
                if (res == PackageManager.PERMISSION_GRANTED) {
                    anyGranted = true;
                    break;
                }
            }
            if (anyGranted) {
                Log.d(TAG, "Permissions granted by user.");
            }
        }
    }

    private void configureWebViewSettings() {
        try {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);
                settings.setDatabaseEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setJavaScriptEnabled(true);

                // Add Javascript interface for saving recordings to smartphone storage and background audio
                storageBridge = new StorageBridge(this);
                webView.addJavascriptInterface(storageBridge, "AndroidStorage");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        try {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                // Resume JavaScript timers when screen is locked or app is in background so audio playback continues uninterrupted
                webView.resumeTimers();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onStop() {
        super.onStop();
        try {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                webView.resumeTimers();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        try {
            if (storageBridge != null) {
                storageBridge.releaseWakeLock();
            }
        } catch (Exception ignored) {}
        super.onDestroy();
    }
}

