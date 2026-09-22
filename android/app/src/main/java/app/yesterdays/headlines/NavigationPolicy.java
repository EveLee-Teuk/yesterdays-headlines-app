package app.yesterdays.headlines;

import java.net.URI;

final class NavigationPolicy {
    static final String ORIGIN = "https://yesterdays-headlines-app.netlify.app";
    static boolean isInternal(String value) {
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme()) && "yesterdays-headlines-app.netlify.app".equals(uri.getHost())
                && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception ignored) { return false; }
    }
    static boolean isExternalWeb(String value) {
        try {
            URI uri = new URI(value);
            return ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) && uri.getHost() != null && uri.getUserInfo() == null;
        } catch (Exception ignored) { return false; }
    }
}
