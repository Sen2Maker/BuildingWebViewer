# App 更新安全 / Update security

适用 v1.3.0+ Android Preview。它是针对本项目的签名更新通道，不是完整 TUF 实现，不能承诺抵御已被完全控制的手机或泄露的签名私钥。

## 两层验证

- APK 内置公钥；Android 原生代码用标准 JCA `SHA256withECDSA`（P-256）验证清单的原始 UTF-8 字节，加入固定协议前缀避免跨用途签名。
- 清单签名覆盖版本、原生接口、递增序号、有效期、包名、双语公告，以及网页/APK 的精确地址、字节数和 SHA-256。APK 还绑定 versionCode 和签名证书指纹。
- 序号不允许回退，同序号不允许更换内容；接受过的最高版本不允许回退。网络清单过期、签名不符、未知密钥、错误时间或不兼容文件均拒绝。签名清单有效期目前为 180 天；到期前须发布下一版。阻断网络仍能阻断更新，不能阻断本地使用。
- HTTPS 和固定下载主机继续启用；更新下载限大小、超时与可用空间，解压拒绝越界路径。网页包验证完整后原子保存，下次启动启用；失败启动回退。本机已安装可信内容不因清单到期失效。
- APK 必须与当前应用具有相同包名、相同签名证书且版本更高。下载与安装前均验证，不通过就不打开安装器。系统保留最终安装确认。

## 公告与状态

`mobile/update-release.json` 保存本次公告和发布元数据，构建时将公告写入网页/APK。更新前只展示验签后的清单公告；成功启动后展示本地公告一次。已准备、等待系统安装、成功升级是不同状态，不把下载完成当成升级成功。离线仍可在“版本与更新”查看当前公告。

## 签名与密钥

公钥在 `mobile/android/app/src/main/res/raw/update_trust.json`；私钥必须放在仓库之外、权限 0600，不进入 APK、源码包、GitHub Secrets 或 CI。当前由维护者本机离线签名。请将私钥备份到自己控制的加密存储；丢失或泄露需要发新 APK 更换信任根。不要把私钥发送给聊天或上传仓库。

```bash
python3 mobile/prepare.py
npm --prefix mobile run sync
bash mobile/android/gradlew -p mobile/android :app:assembleDebug :app:testDebugUnitTest
# 将 APK 复制为 dist/BuildingWebViewer-Android-vX.Y.Z-preview.1.apk
python3 mobile/sign-update.py --key /secure/location/update-key.pem \
  --apk dist/BuildingWebViewer-Android-vX.Y.Z-preview.1.apk \
  --apksigner "$ANDROID_HOME/build-tools/36.0.0/apksigner" \
  --aapt "$ANDROID_HOME/build-tools/36.0.0/aapt"
```

准备阶段输出 unsigned 清单，签名阶段才输出可发布的 `mobile-update.json`。纯网页更新无需重新编译 APK：签名时用 `--reuse-apk-from /path/to/previous-signed-mobile-update.json` 替代 `--apk`，复用先前已验签且 nativeApi 相同的安装包引用。网页版本与 APK 版本分别记录；原生接口变化则拒绝复用。每次变更序号必须递增；已发布清单及标签不覆盖。CI 从 Release 下载清单并独立验签、重建网页包比对哈希，核对 APK 哈希后才部署。

密钥轮换当前采用 APK 更新：新 APK 可带旧、新公钥，迁移后后续 APK 移除旧公钥。不能从网页清单自动导入陌生公钥。若签名钥匙泄露，必须发布可信新 APK，不能仅靠网页热更新恢复信任。

Preview 暂保留已有调试安装证书以支持覆盖安装、保留项目；网页签名密钥与 APK 安装证书是两套独立密钥。正式长期发行前仍应规划正式应用 ID、受保护的 release 签名和项目迁移。签名可验证来源，不等于代码没有漏洞。

## English

Pinned native P-256 signature verification authenticates exact metadata bytes before any update decision. Signed sequence/expiry/package identity and artifact hashes protect the update channel; rejected updates never block local projects. APKs require the installed signer and a higher version, then Android user approval. Release notes are bundled and acknowledged per activated version. Private keys remain outside the repository; CI verifies with public keys only. Key rotation currently needs an APK upgrade. This is a scoped update protocol, not a full TUF implementation.

References: [Android cryptography](https://developer.android.com/privacy-and-security/cryptography), [TUF overview](https://theupdateframework.io/docs/overview/), [Android app signing](https://developer.android.com/studio/publish/app-signing).
