# 昨日头条 Android

轻量联网阅读器，最低 Android 8.0，无广告、无账号、无推送。唯一运行权限为联网。

打开固定 HTTPS 站点 `https://yesterdays-headlines-app.netlify.app/`，每天的数据和网页改进自动生效。开屏字体随 APK 打包，网络故障会显示重试。收藏存在本机应用数据中；浏览器和 APK 的收藏不共享。此版本不提供离线日报缓存。

新闻出处在外部浏览器打开。PNG 导出通过限定生产域名、限定主框架的 WebMessageListener 发送，使用系统文件保存窗口，不申请存储权限。旧版 Android System WebView 不支持此接口时，页面会提示更新 WebView。

## 构建

GitHub Actions 的 `Build Android APK` 工作流可手动运行，或在 main 的 android 文件变更后自动运行。使用 Java 17、Gradle 8.9、AGP 8.7.3、Android SDK 35。

```sh
gradle -p android testDebugUnitTest lintRelease assembleRelease
```

签名环境变量：`ANDROID_KEYSTORE` 指向 PKCS12 文件，`ANDROID_KEYSTORE_PASSWORD` 为密码，别名固定 `headlines`。CI 对应两个加密 Secrets：`ANDROID_KEYSTORE_BASE64` 和 `ANDROID_KEYSTORE_PASSWORD`。构建日志不打印私钥，APK 产物不含私钥。

维护者须保留本机被 Git 忽略的 `.signing/` 目录，并在下一版提高 versionCode。丢失原签名后不能直接覆盖升级，卸载会丢失本机收藏。

## 检查

构建执行 URL 来源边界单元测试、Android lint、APK 签名验证和 Android 15 模拟器启动测试，测试报告上传为 `android-checks`。模拟器验证不能替代所有品牌手机的实际安装体验。

字体：Ma Shan Zheng，SIL Open Font License，许可随 assets 保存。
