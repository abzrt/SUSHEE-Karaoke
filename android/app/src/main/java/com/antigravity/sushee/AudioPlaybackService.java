package com.antigravity.sushee;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Foreground Media Playback Service with Play/Pause & Next notification actions
 * that keeps SUSHEE Karaoke audio & WebView active in the background / lockscreen.
 */
public class AudioPlaybackService extends Service {
    public static final String CHANNEL_ID = "sushee_media_playback_channel";
    public static final int NOTIFICATION_ID = 20261;

    public static final String ACTION_UPDATE = "com.antigravity.sushee.ACTION_UPDATE_MEDIA";
    public static final String ACTION_TOGGLE_PLAY = "com.antigravity.sushee.ACTION_TOGGLE_PLAY";
    public static final String ACTION_NEXT_TRACK = "com.antigravity.sushee.ACTION_NEXT_TRACK";
    public static final String BROADCAST_MEDIA_CMD = "com.antigravity.sushee.BROADCAST_MEDIA_CMD";
    public static final String EXTRA_CMD = "cmd";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_IS_PLAYING = "is_playing";

    private String currentTitle = "SUSHEE Karaoke";
    private String currentArtist = "Musik berjalan di latar belakang";
    private boolean currentIsPlaying = true;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_TOGGLE_PLAY.equals(action)) {
                currentIsPlaying = !currentIsPlaying;
                sendMediaCommandToActivity("toggle");
            } else if (ACTION_NEXT_TRACK.equals(action)) {
                sendMediaCommandToActivity("next");
            } else {
                String t = intent.getStringExtra(EXTRA_TITLE);
                String a = intent.getStringExtra(EXTRA_ARTIST);
                if (t != null && !t.trim().isEmpty()) currentTitle = t;
                if (a != null && !a.trim().isEmpty()) currentArtist = a;
                if (intent.hasExtra(EXTRA_IS_PLAYING)) {
                    currentIsPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, true);
                }
            }
        }

        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        return START_STICKY;
    }

    private void sendMediaCommandToActivity(String cmd) {
        Intent bcast = new Intent(BROADCAST_MEDIA_CMD);
        bcast.setPackage(getPackageName());
        bcast.putExtra(EXTRA_CMD, cmd);
        sendBroadcast(bcast);
    }

    private PendingIntent makeActionPendingIntent(String action, int reqCode) {
        Intent i = new Intent(this, AudioPlaybackService.class);
        i.setAction(action);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getService(this, reqCode, i, pendingFlags);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openIntent, pendingFlags);

        int toggleIcon = currentIsPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String toggleLabel = currentIsPlaying ? "Jeda" : "Putar";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(contentIntent)
                .setOngoing(currentIsPlaying)
                .setSilent(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .addAction(toggleIcon, toggleLabel, makeActionPendingIntent(ACTION_TOGGLE_PLAY, 101))
                .addAction(android.R.drawable.ic_media_next, "Berikutnya", makeActionPendingIntent(ACTION_NEXT_TRACK, 102))
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "SUSHEE Media Playback",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Kontrol pemutaran musik & karaoke di latar belakang dan layar kunci");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
