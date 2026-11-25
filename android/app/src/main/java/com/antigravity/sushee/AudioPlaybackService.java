package com.antigravity.sushee;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.InputStream;

/**
 * Foreground Media Playback Service with native MediaSession + MediaStyle &
 * Android 16/17 Live Updates (Dynamic Island / Now Bar / Hyper Island) support.
 */
public class AudioPlaybackService extends Service {
    public static final String CHANNEL_ID = "sushee_media_playback_channel";
    public static final int NOTIFICATION_ID = 20261;

    public static final String ACTION_UPDATE = "com.antigravity.sushee.ACTION_UPDATE_MEDIA";
    public static final String ACTION_TOGGLE_PLAY = "com.antigravity.sushee.ACTION_TOGGLE_PLAY";
    public static final String ACTION_NEXT_TRACK = "com.antigravity.sushee.ACTION_NEXT_TRACK";
    public static final String ACTION_PREV_TRACK = "com.antigravity.sushee.ACTION_PREV_TRACK";
    public static final String BROADCAST_MEDIA_CMD = "com.antigravity.sushee.BROADCAST_MEDIA_CMD";
    public static final String EXTRA_CMD = "cmd";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_IS_PLAYING = "is_playing";

    private String currentTitle = "SUSHEE Karaoke";
    private String currentArtist = "Musik berjalan di latar belakang";
    private boolean currentIsPlaying = true;
    private MediaSession mediaSession;
    private Bitmap appArtwork;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        initMediaSession();
    }

    private Bitmap loadAppLogoBitmap() {
        // 1. Try high-res SUSHEE logo PNG bundled in Capacitor assets
        try (InputStream is = getAssets().open("public/assets/icon-512.png")) {
            Bitmap bmp = BitmapFactory.decodeStream(is);
            if (bmp != null) return bmp;
        } catch (Exception ignored) {}

        // 2. Fallback: render Adaptive Icon Drawable (R.mipmap.ic_launcher) to a real Bitmap
        try {
            Drawable drawable = ContextCompat.getDrawable(this, R.mipmap.ic_launcher);
            if (drawable != null) {
                if (drawable instanceof BitmapDrawable && ((BitmapDrawable) drawable).getBitmap() != null) {
                    return ((BitmapDrawable) drawable).getBitmap();
                }
                int size = 256;
                Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bmp);
                drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
                drawable.draw(canvas);
                return bmp;
            }
        } catch (Exception ignored) {}

        return null;
    }

    private void initMediaSession() {
        appArtwork = loadAppLogoBitmap();
        mediaSession = new MediaSession(this, "SUSHEE_KARAOKE_SESSION");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                currentIsPlaying = true;
                sendMediaCommandToActivity("play");
                updateMediaSession();
                refreshNotification();
            }

            @Override
            public void onPause() {
                currentIsPlaying = false;
                sendMediaCommandToActivity("pause");
                updateMediaSession();
                refreshNotification();
            }

            @Override
            public void onSkipToNext() {
                sendMediaCommandToActivity("next");
            }

            @Override
            public void onSkipToPrevious() {
                sendMediaCommandToActivity("prev");
            }
        });
        mediaSession.setActive(true);
    }

    private void updateMediaSession() {
        if (mediaSession == null) return;
        try {
            MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)
                    .putString(MediaMetadata.METADATA_KEY_ALBUM, "SUSHEE Karaoke");
            if (appArtwork != null) {
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, appArtwork);
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, appArtwork);
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, appArtwork);
            }
            mediaSession.setMetadata(metaBuilder.build());

            long actions = PlaybackState.ACTION_PLAY
                    | PlaybackState.ACTION_PAUSE
                    | PlaybackState.ACTION_PLAY_PAUSE
                    | PlaybackState.ACTION_SKIP_TO_NEXT
                    | PlaybackState.ACTION_SKIP_TO_PREVIOUS;
            int state = currentIsPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
            PlaybackState playbackState = new PlaybackState.Builder()
                    .setActions(actions)
                    .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, currentIsPlaying ? 1.0f : 0.0f)
                    .build();
            mediaSession.setPlaybackState(playbackState);
            mediaSession.setActive(true);
        } catch (Exception ignored) {}
    }

    private void refreshNotification() {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, buildNotification());
            }
        } catch (Exception ignored) {}
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
            } else if (ACTION_PREV_TRACK.equals(action)) {
                sendMediaCommandToActivity("prev");
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

        updateMediaSession();
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Action prevAction = new Notification.Action.Builder(
                    Icon.createWithResource(this, android.R.drawable.ic_media_previous),
                    "Sebelumnya",
                    makeActionPendingIntent(ACTION_PREV_TRACK, 100)
            ).build();
            Notification.Action toggleAction = new Notification.Action.Builder(
                    Icon.createWithResource(this, toggleIcon),
                    toggleLabel,
                    makeActionPendingIntent(ACTION_TOGGLE_PLAY, 101)
            ).build();
            Notification.Action nextAction = new Notification.Action.Builder(
                    Icon.createWithResource(this, android.R.drawable.ic_media_next),
                    "Berikutnya",
                    makeActionPendingIntent(ACTION_NEXT_TRACK, 102)
            ).build();

            Notification.MediaStyle mediaStyle = new Notification.MediaStyle()
                    .setShowActionsInCompactView(0, 1, 2);
            if (mediaSession != null) {
                mediaStyle.setMediaSession(mediaSession.getSessionToken());
            }

            Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
                    .setContentTitle(currentTitle)
                    .setContentText(currentArtist)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentIntent(contentIntent)
                    .setOngoing(currentIsPlaying)
                    .setVisibility(Notification.VISIBILITY_PUBLIC)
                    .setCategory(Notification.CATEGORY_TRANSPORT)
                    .setColorized(true)
                    .setColor(0xFF0B0E17)
                    .setStyle(mediaStyle)
                    .addAction(prevAction)
                    .addAction(toggleAction)
                    .addAction(nextAction);

            if (appArtwork != null) {
                builder.setLargeIcon(appArtwork);
            }

            // Android 16 / Android 17 Live Updates (Dynamic Island / Promoted Ongoing Pill)
            if (Build.VERSION.SDK_INT >= 36) {
                try {
                    String chipText = currentIsPlaying ? "♪ " + currentTitle : "❚❚ " + currentTitle;
                    if (chipText.length() > 20) chipText = chipText.substring(0, 19) + "…";
                    builder.setShortCriticalText(chipText);
                    builder.getExtras().putBoolean("android.requestPromotedOngoing", true);
                } catch (Throwable ignored) {}
            }

            return builder.build();
        }

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
                .addAction(android.R.drawable.ic_media_previous, "Sebelumnya", makeActionPendingIntent(ACTION_PREV_TRACK, 100))
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
        if (mediaSession != null) {
            try {
                mediaSession.setActive(false);
                mediaSession.release();
            } catch (Exception ignored) {}
            mediaSession = null;
        }
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
