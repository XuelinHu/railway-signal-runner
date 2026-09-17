# 安卓语音桥接对接文档

本文档是给**安卓外壳（WebView 容器）开发方**的完整对接规范。H5 侧已经全部实现，
安卓侧按本文实现 `RailwayVoice` 注入对象与三个回调，即可让网页获得原生语音识别与播报。

---

## 0. 为什么必须走原生桥接

H5 的浏览器语音识别（`webkitSpeechRecognition`）**只在安全上下文可用**。
本项目的公网入口是 `http://47.120.48.245:14029`——明文 HTTP，不是安全上下文，
浏览器会直接禁用 `getUserMedia` 与语音识别，**没有任何前端绕过的办法**。

原生 `SpeechRecognizer` / `TextToSpeech` 不受此限制，所以安卓端唯一可用的语音路径是桥接。

> 语音播报（TTS）例外：`speechSynthesis` 不受安全上下文限制，H5 侧在 http 下也能朗读。
> 但安卓原生的 `TextToSpeech` 音质与中文支持明显更好，仍然优先走桥接。

---

## 1. WebView 配置（必须）

```kotlin
webView.settings.apply {
    javaScriptEnabled = true
    domStorageEnabled = true           // H5 用 localStorage 存登录令牌
    mediaPlaybackRequiresUserGesture = false   // 否则 TTS 会被判定为"非用户手势"而拒绝播放
    // 如果页面是 https 而音频源是 http，还需要：
    // mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
}

webView.addJavascriptInterface(RailwayVoiceBridge(), "RailwayVoice")
webView.addJavascriptInterface(RailwayVoiceBridge(), "AndroidVoice")  // 兼容别名，H5 两个都认
webView.webChromeClient = object : WebChromeClient() {
    override fun onPermissionRequest(request: PermissionRequest) {
        // 网页请求麦克风时授予；不实现这个回调，录音会直接被拒。
        request.grant(request.resources)
    }
}
```

**清单声明与运行时权限**：

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
```

`RECORD_AUDIO` 必须在**运行时**申请。用户拒绝时不要抛异常，按 §4 回 `no_permission`，
H5 会显示「未获得麦克风权限，请在系统设置中允许本应用录音」。

---

## 2. JS → 原生：`RailwayVoice`

**每个方法只接收一个 JSON 字符串参数**，全部异步。
这样设计是为了规避 `@JavascriptInterface` 的参数类型编组问题（多种参数类型、可空类型
在部分 ROM 上会静默失败），单参数是最稳的形态。

| 方法 | 参数（JSON 字符串） | 返回值 |
| --- | --- | --- |
| `isAvailable()` | `{}` | `"true"` / `"false"`，同步返回 |
| `getCapabilities()` | `{}` | 见下方，**同步返回 JSON 字符串** |
| `startListening()` | `{requestId, locale, partial, maxDurationMs, vadSilenceMs}` | void，结果走回调 |
| `stopListening()` | `{requestId}` | void，正常结束并给出 final 结果 |
| `cancelListening()` | `{requestId}` | void，丢弃结果，不再回调 final |
| `speak()` | `{requestId, text, locale, rate, pitch, queue}` | void，结果走回调 |
| `stopSpeaking()` | `{requestId}` | void |

`getCapabilities()` 同步返回：

```json
{"asr": true, "tts": true, "locale": "zh-CN", "supportsPartial": true}
```

- `asr`：麦克风识别是否可用（权限已被拒 → `false`）
- `tts`：`TextToSpeech` 是否初始化成功（`OnInitListener` 返回 `ERROR` → `false`）
- `supportsPartial`：是否支持中间结果（`RecognitionListener.onPartialResults`）

Kotlin 参考实现：

```kotlin
class RailwayVoiceBridge(private val activity: Activity) {
    private val gson = Gson()

    @JavascriptInterface
    fun isAvailable(json: String) = "true"

    @JavascriptInterface
    fun getCapabilities(json: String): String = gson.toJson(mapOf(
        "asr" to hasAudioPermission(),
        "tts" to ttsReady,
        "locale" to "zh-CN",
        "supportsPartial" to true
    ))

    @JavascriptInterface
    fun startListening(json: String) {
        val req = gson.fromJson(json, StartReq::class.java)
        activity.runOnUiThread { recognizer.start(req) }
    }
    // stopListening / cancelListening / speak / stopSpeaking 同理
}
```

> **线程注意**：`@JavascriptInterface` 方法在 WebView 的 JavaBridge 线程被调用，
> 不是主线程。所有涉及 UI / 系统服务的操作都要 `runOnUiThread` 切回主线程。

---

## 3. 原生 → JS：三个全局回调

原生必须回到 **WebView 线程**派发，否则 JS 收不到：

```kotlin
private fun dispatch(js: String) {
    webView.post { webView.evaluateJavascript(js, null) }
}

dispatch("window.RailwayVoiceOnResult(${JSONObject.quote(gson.toJson(payload))})")
```

用 `JSONObject.quote()` 做转义，**不要手写字符串拼接**——识别文本里可能有引号、换行、反斜杠。

### `window.RailwayVoiceOnResult(json)`

```jsonc
// 中间结果，可以多次
{"requestId":"r-1","type":"partial","text":"前方信号","isFinal":false}
// 最终结果，一次，收到后本次收音结束
{"requestId":"r-1","type":"final","text":"前方信号机是什么颜色？","isFinal":true,"confidence":0.92}
```

**`requestId` 必须原样回传。** H5 用它过滤过期回调（用户可能已经发起了新一轮收音）。
H5 侧的规则是：`requestId` 与当前活跃请求不一致的回调直接丢弃。

### `window.RailwayVoiceOnError(json)`

```json
{"requestId":"r-1","code":"no_permission","message":"未获得麦克风权限"}
```

| `code` | 触发场景 | H5 展示的文案 |
| --- | --- | --- |
| `no_permission` | 权限被拒 | 未获得麦克风权限，请在系统设置中允许本应用录音 |
| `busy` | 麦克风被其它应用占用 | 麦克风被其它应用占用，请稍后重试 |
| `no_match` | 识别不出内容 | 没有识别到内容，请再说一次 |
| `no_speech` | 没有检测到说话声 | 没有检测到说话声，请靠近麦克风再试 |
| `network` | 识别服务网络异常 | 语音识别服务网络异常，请检查网络 |
| `timeout` | 超时 | 语音识别超时，请重试 |
| `unsupported` | 设备不支持 | 当前设备不支持语音功能 |
| `native_error` | 其它 | 语音功能出错，请重试或改用文字提问 |

`message` 字段可选，H5 优先用自己的文案表，`message` 只作为兜底。

### `window.RailwayVoiceOnEvent(json)`

```jsonc
{"requestId":"r-1","type":"volume","level":0.42}      // 0..1，驱动波形动画
{"requestId":"r-2","type":"speak_start"}
{"requestId":"r-2","type":"speak_done"}
```

`volume` 建议在 `onRmsChanged` 里派发（`rmsdB` 范围约 -2..10，可映射为 `(rmsdB + 2) / 12` 并钳到 0..1）。
派发频率控制在 **每秒 10 次以内**，太密会拖慢 WebView 渲染。

---

## 4. 安卓端的义务清单

按重要性排序，缺任何一条都会导致功能不可用：

1. **完成终态回调**：`startListening` 之后必须在 `maxDurationMs + 3000` 毫秒内
   给出 `final` 或 `error` 回调。H5 侧有 20 秒兜底超时，但那会让用户白等 20 秒。
   权限弹窗、来电打断、识别服务崩溃都必须收敛到一个终态。
2. **权限被拒走 `no_permission`**，不要抛异常，也不要静默失败。
3. **`TextToSpeech` 初始化失败时 `getCapabilities().tts = false`**，
   且 `speak()` 要回 `unsupported`，否则用户点了朗读什么都不会发生。
4. **`Locale.SIMPLIFIED_CHINESE`**：`tts.setLanguage(Locale.SIMPLIFIED_CHINESE)`，
   返回 `LANG_MISSING_DATA` / `LANG_NOT_SUPPORTED` 时按上一条处理。
5. **收音期间取音频焦点**：`AudioManager.requestAudioFocus` 并切 `MODE_IN_COMMUNICATION`，
   结束后释放。否则录进来的可能是媒体音量下的环境噪声。
6. **`onPause` 时清理**：调用 `cancelListening` 与 `stopSpeaking`。
   否则应用切到后台后麦克风仍在占用，用户会看到状态栏的录音图标不消失。
7. **`speak()` 的 `queue` 参数**：为 `false` 时应先中断当前播报再播新的（默认行为）。
   H5 侧在用户开口时会主动调 `stopSpeaking()` 做打断，安卓端不需要额外处理。

---

## 5. H5 侧的降级行为（对接方需知）

H5 按 **安卓桥接 → 浏览器 Web Speech → 禁用** 三档降级，探测顺序：

1. `window.RailwayVoice` 或 `window.AndroidVoice` 存在，且 `isAvailable()` 返回 true
   → 用原生桥接。`getCapabilities()` 再细分：只有 TTS 可用时降为「仅朗读」。
2. 否则看浏览器 `webkitSpeechRecognition`：只在 Chromium 且安全上下文下可用。
3. 都不可用 → 语音按钮置灰，提示「当前环境不支持语音输入，请使用文字提问」。

因此**桥接没注入时网页不会报错**，只是退化为文字模式。安卓端可以放心分阶段接入。

---

## 6. 联调方法

1. 安卓端打开 `http://47.120.48.245:14029`（或局域网地址）。
2. 桌面 Chrome 打开 `chrome://inspect`，找到设备上的 WebView 页面并 inspect。
3. 在 Console 里手动验证桥接：

```js
// 1. 桥在不在
typeof window.RailwayVoice            // 期望 "object"
window.RailwayVoice.isAvailable('{}') // 期望 "true"
JSON.parse(window.RailwayVoice.getCapabilities('{}'))  // 期望 {asr:true,tts:true,...}

// 2. 手动触发一次收音，观察控制台里的回调
window.RailwayVoiceOnResult = (j) => console.log('RESULT', j)
window.RailwayVoiceOnError  = (j) => console.log('ERROR', j)
window.RailwayVoiceOnEvent  = (j) => console.log('EVENT', j)
window.RailwayVoice.startListening(JSON.stringify({
  requestId: 'manual-1', locale: 'zh-CN', partial: true,
  maxDurationMs: 15000, vadSilenceMs: 1200
}))

// 3. 手动触发一次播报
window.RailwayVoice.speak(JSON.stringify({
  requestId: 'manual-2', text: '前方信号机显示红灯', locale: 'zh-CN', rate: 1.0, pitch: 1.0, queue: false
}))
```

**注意**：直接在 Console 里手动调用时，`requestId` 必须与 H5 内部正在用的不同，
否则 H5 的过滤器会把回调当作过期结果丢掉。上面用 `manual-*` 前缀就是为了这个。

4. 页面内的完整流程：点右下角「智能体」→ 弹框里点「语音提问」→ 说话 →
   识别结果实时出现在输入框 → 「连续对话」档位下自动发送 → 回答流式返回 → 自动朗读。

---

## 7. 已知限制

- **不支持离线识别**：本方案用系统 `SpeechRecognizer`，国内 ROM 多数依赖在线服务，
  弱网下会回 `network` 错误。需要完全离线时得换 Vosk / sherpa-onnx 之类的本地模型，
  但那会显著增加 APK 体积，且本机 24G 显存已被 qwen3:14b 占用，不适合再跑本地 ASR。
- **不支持自定义唤醒词**：当前是按钮触发，没有「小铁小铁」这类唤醒。
- **同时只能有一路收音**：H5 侧发起新收音前不会自动取消旧的（由安卓端按 `requestId` 覆盖），
  安卓端实现时按「后到的请求覆盖先到的」处理即可。
