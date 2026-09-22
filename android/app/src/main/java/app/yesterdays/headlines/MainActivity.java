package app.yesterdays.headlines;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import androidx.core.splashscreen.SplashScreen;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.OutputStream;
import java.util.Collections;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int PAPER = Color.rgb(248,245,238), INK = Color.rgb(39,43,37), RED = Color.rgb(167,66,46);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private LinearLayout cover;
    private TextView status;
    private Button retry;
    private byte[] pendingPng;
    private long started;
    private boolean failed;
    private final Runnable timeout = () -> showError("暂时未能打开日签，请检查网络后重试。");

    @Override @SuppressLint("SetJavaScriptEnabled") public void onCreate(Bundle state) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(PAPER);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(root);
        web = new WebView(this);
        web.setId(View.generateViewId());
        web.setBackgroundColor(PAPER);
        root.addView(web, new FrameLayout.LayoutParams(-1,-1));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " YesterdayHeadlines/1.0");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (NavigationPolicy.isInternal(url)) return false;
                if (request.isForMainFrame() && NavigationPolicy.isExternalWeb(url)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); }
                    catch (Exception ignored) { Toast.makeText(MainActivity.this,"未找到可打开链接的浏览器",Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!failed && NavigationPolicy.isInternal(url)) {
                    handler.removeCallbacks(timeout);
                    handler.postDelayed(() -> { if (!failed) cover.setVisibility(View.GONE); }, Math.max(0, 1100 - (SystemClock.elapsedRealtime() - started)));
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("连接暂时中断，联网后再翻开这一页。");
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) showError("日签服务暂时不可用，请稍后重试。");
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web,"HeadlinesAndroid",Collections.singleton(NavigationPolicy.ORIGIN), (view,message,origin,mainFrame,reply) -> {
                if (mainFrame && NavigationPolicy.isInternal(origin.toString())) savePoster(message.getData());
            });
        }
        buildCover(root);
        loadHome();
    }

    private TextView label(String text, int size, int color) {
        TextView label = new TextView(this);
        label.setText(text); label.setTextSize(size); label.setTextColor(color); label.setGravity(Gravity.CENTER);
        return label;
    }
    private void buildCover(FrameLayout root) {
        cover = new LinearLayout(this); cover.setOrientation(LinearLayout.VERTICAL); cover.setGravity(Gravity.CENTER); cover.setPadding(32,32,32,32); cover.setBackgroundColor(PAPER);
        TextView edition = label("YOUR DAILY HISTORY",10,Color.GRAY); edition.setLetterSpacing(.3f); cover.addView(edition);
        TextView title = label("昨日\n头条",82,INK);
        try { title.setTypeface(Typeface.createFromAsset(getAssets(),"brush.ttf")); } catch (RuntimeException ignored) { title.setTypeface(Typeface.SERIF); }
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-2,-2); titleParams.setMargins(0,48,0,20); cover.addView(title,titleParams);
        TextView seal = label("日 签",16,RED);
        GradientDrawable border = new GradientDrawable(); border.setColor(PAPER); border.setStroke(1,RED); seal.setBackground(border); seal.setPadding(14,5,14,5); seal.setRotation(-4); cover.addView(seal);
        TextView motto = label("翻过日历，读到历史。",16,Color.GRAY); motto.setPadding(0,30,0,24); cover.addView(motto);
        status = label("正在翻开今日…",13,Color.GRAY); cover.addView(status);
        retry = new Button(this); retry.setText("重新翻开"); retry.setTextColor(RED); retry.setVisibility(View.GONE); retry.setOnClickListener(v -> loadHome()); cover.addView(retry);
        root.addView(cover,new FrameLayout.LayoutParams(-1,-1));
    }
    private void loadHome() {
        failed = false; started = SystemClock.elapsedRealtime(); cover.setVisibility(View.VISIBLE); retry.setVisibility(View.GONE); status.setText("正在翻开今日…");
        handler.removeCallbacks(timeout); handler.postDelayed(timeout,20000); web.loadUrl(NavigationPolicy.ORIGIN + "/");
    }
    private void showError(String message) {
        if (isFinishing() || cover == null) return;
        failed = true; handler.removeCallbacks(timeout); cover.setVisibility(View.VISIBLE); status.setText(message); retry.setVisibility(View.VISIBLE);
    }
    private void savePoster(String raw) {
        if (pendingPng != null) return;
        try {
            if (raw == null || raw.length() > 16_000_000) throw new IllegalArgumentException();
            JSONObject payload = new JSONObject(raw);
            String data = payload.getString("data");
            if (!"savePoster".equals(payload.getString("type")) || !data.startsWith("data:image/png;base64,")) throw new IllegalArgumentException();
            byte[] png = Base64.decode(data.substring(22),Base64.DEFAULT);
            byte[] magic = {(byte)137,80,78,71,13,10,26,10};
            if (png.length < 8) throw new IllegalArgumentException();
            for (int i=0;i<8;i++) if (png[i]!=magic[i]) throw new IllegalArgumentException();
            pendingPng = png;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("image/png");
            String name = payload.optString("filename","昨日头条.png");
            if (!name.matches("昨日头条-\\d{4}-\\d{2}-\\d{2}\\.png")) name = "昨日头条.png";
            intent.putExtra(Intent.EXTRA_TITLE,name); startActivityForResult(intent,10);
        } catch (Exception exception) { pendingPng = null; Toast.makeText(this,"无法保存图片，请重试",Toast.LENGTH_LONG).show(); }
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if (requestCode != 10) return;
        byte[] image = pendingPng; pendingPng = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null && image != null) {
            Uri destination = data.getData();
            new Thread(() -> {
                try (OutputStream output = getContentResolver().openOutputStream(destination)) {
                    if (output == null) throw new java.io.IOException();
                    output.write(image); runOnUiThread(() -> Toast.makeText(this,"日签已保存",Toast.LENGTH_SHORT).show());
                } catch (Exception ignored) { runOnUiThread(() -> Toast.makeText(this,"保存失败，请重新选择位置",Toast.LENGTH_LONG).show()); }
            }).start();
        }
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true;}return false;})()", result -> {
            if ("true".equals(result)) return;
            if (web.canGoBack()) web.goBack(); else finish();
        });
    }
    @Override protected void onDestroy() { handler.removeCallbacksAndMessages(null); if (web!=null) web.destroy(); super.onDestroy(); }
}
