package app.yesterdays.headlines;
import org.junit.Test;
import static org.junit.Assert.*;
public class NavigationPolicyTest {
    @Test public void onlyExactHttpsOriginIsTrusted() {
        assertTrue(NavigationPolicy.isInternal("https://yesterdays-headlines-app.netlify.app/?date=2026-09-22"));
        for (String url : new String[]{"http://yesterdays-headlines-app.netlify.app", "https://yesterdays-headlines-app.netlify.app.evil.test", "https://evil.test", "javascript:alert(1)", "file:///x", "https://evil@yesterdays-headlines-app.netlify.app", "https://yesterdays-headlines-app.netlify.app:444", "not a url"}) assertFalse(url, NavigationPolicy.isInternal(url));
    }
    @Test public void externalNavigationOnlyAllowsWebLinks() {
        assertTrue(NavigationPolicy.isExternalWeb("https://www.gov.cn/example"));
        assertFalse(NavigationPolicy.isExternalWeb("intent://evil"));
        assertFalse(NavigationPolicy.isExternalWeb("javascript:alert(1)"));
    }
}
