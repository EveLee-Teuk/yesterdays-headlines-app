package app.yesterdays.headlines;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import android.webkit.WebView;
import android.view.View;
import android.view.ViewGroup;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class LaunchTest {
    private void screenshot(String name) throws Exception {
        android.graphics.Bitmap shot=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(shot);
        // Gradle uninstalls the test app after the run. Shared Downloads survive that cleanup.
        android.content.ContentResolver resolver=InstrumentationRegistry.getInstrumentation().getTargetContext().getContentResolver();
        android.content.ContentValues values=new android.content.ContentValues();
        values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME,name);
        values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE,"image/png");
        values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,"Download/");
        android.net.Uri uri=resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
        assertNotNull(uri);
        try(java.io.OutputStream stream=resolver.openOutputStream(uri)){assertNotNull(stream);shot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,stream);}
    }
    private WebView findWeb(View view) {
        if (view instanceof WebView) return (WebView)view;
        if (view instanceof ViewGroup) {
            ViewGroup group=(ViewGroup)view;
            for(int i=0;i<group.getChildCount();i++){ WebView found=findWeb(group.getChildAt(i)); if(found!=null)return found; }
        }
        return null;
    }
    @Test public void opensProductionReaderWithRestrictedWebView() throws Exception {
        try (ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            screenshot("splash.png");
            Thread.sleep(15000);
            java.util.concurrent.CountDownLatch loaded = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.atomic.AtomicReference<String> document = new java.util.concurrent.atomic.AtomicReference<>("");
            scenario.onActivity(activity -> {
                WebView web=findWeb(activity.getWindow().getDecorView());
                assertNotNull(web);
                assertTrue(NavigationPolicy.isInternal(web.getUrl()));
                assertTrue(web.getSettings().getDomStorageEnabled());
                assertFalse(web.getSettings().getAllowFileAccess());
                assertTrue(web.getSettings().getUserAgentString().contains("YesterdayHeadlines/"));
                web.evaluateJavascript("document.body.innerText", text -> { document.set(text); loaded.countDown(); });
            });
            assertTrue(loaded.await(10, java.util.concurrent.TimeUnit.SECONDS));
            assertTrue("Expected the actual reader, got: " + document.get(), document.get().contains("昨日头条"));
            screenshot("launch.png");
        }
    }
}
