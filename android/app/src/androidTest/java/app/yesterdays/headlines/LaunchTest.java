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
            android.graphics.Bitmap shot=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            assertNotNull(shot);
            java.io.File file=new java.io.File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null),"launch.png");
            try(java.io.FileOutputStream stream=new java.io.FileOutputStream(file)){shot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,stream);}
        }
    }
}
