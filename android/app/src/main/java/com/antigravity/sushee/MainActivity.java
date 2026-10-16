package com.antigravity.sushee;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        if (window != null) {
            // Ensure app screen boundaries do not overlap status bar and navigation bar
            WindowCompat.setDecorFitsSystemWindows(window, true);
            window.setStatusBarColor(Color.parseColor("#07080d"));
            window.setNavigationBarColor(Color.parseColor("#0a0c14"));
        }
    }
}
