# dsh-boot-screen

给 [DeepSeek Harness](https://deepseek.com) Web GUI 用的开机动画插件：一段约 9.3 秒的粒子启动序列，点击后播放、播完才进主页。

![预览](./preview.png?v=2)

- **双栏构图**：左侧是粒子文字、球体核心和加载进度，右侧是角色立绘（待机 42% 幽蓝剪影，点火时亮到 100%，被粒子环包住）。
- **一次点击**：既是开播开关，也是音频手势——低频轰鸣从第一帧就在。
- **播完才进主页**：序列结束才开始 0.72 秒淡出，应用即使早就加载好也会被盖住。
- **零依赖**：Canvas 2D + WebAudio 实时合成，没有图片序列、没有音频文件；立绘以 base64 内联，不额外发请求。
- **两个半边**：索引注入（浏览器）+ 客户端插件（桌面壳），同一个窗口只播一次。

## 效果

| 时刻 | 阶段 | 画面 |
| --- | --- | --- |
| — | STANDBY | 待机屏：`BOOT SEQUENCE` +「点击启动」，背景是缓慢漂移的星云 |
| 0.0s | POWER ON | CRT 开机亮线 + 低频冲击 |
| 0.8s | IDENTITY | 粒子错峰飞向落点，拼出 `DEEPSEEK` |
| 2.7s | HARNESS | 重组为 `HARNESS` |
| 4.4s | CORE | 坍缩成旋转的 3D 点云球（斐波那契球 + 透视投影） |
| 5.9s | LOAD | 环形进度 0→100%（1.8 秒） |
| 8.0s | IGNITE | 冲击波、RGB 故障字，核心炸开成围绕角色的轨道环 |
| 9.3s | ONLINE | `HARNESS ONLINE` /「神 器 启 动。」，随后淡出 |

节奏由 `speed` 统一缩放：`0.8` 更慢（≈11.6s），`1.3` 更快（≈7s）。

## 安装

需要 DSH `0.2.2` 及以上（用到 `webServer.tapIndex` 与 `dsh.client`）。

```bash
git clone https://github.com/fengrenfan/dsh-boot-screen.git
cd dsh-boot-screen
node scripts/install.mjs --profile desktop
```

脚本只做两件事，都可逆：

1. 把包装进 `~/.dsh/profiles/<profile>/node_modules/dsh-boot-screen`（软链接）；
2. 往 `<profile>/cordis.patch.yml` 追加一条 loader 条目（已存在则跳过）。

装完**刷新窗口**（⌘R）。如果 profile 没开 HMR，重启一次 DSH。

> 安装用的是软链接，所以克隆下来的目录别删、别移动。

### 手动安装

```yaml
# <profile>/cordis.patch.yml
- insert:
    - id: boot-screen
      name: "dsh-boot-screen"
```

```bash
mkdir -p ~/.dsh/profiles/desktop/node_modules
ln -sfn "$(pwd)" ~/.dsh/profiles/desktop/node_modules/dsh-boot-screen
```

## 配置

```yaml
- insert:
    - id: boot-screen
      name: "dsh-boot-screen"
      config:
        speed: 1              # 时间倍率：1 ≈ 9.3s
        autostart: false      # true = 不等点击，加载后自动开播
        oncePerSession: false # true = 同一标签页只播第一次
        skippable: true       # 播放中允许 Esc 跳过
        sound: ask            # ask = 点击后出声；off = 静音；auto = 尝试自动出声
        inline: true          # false = 不做索引注入，只靠客户端半边（排查用）
        enabled: true         # false = 完全关闭
```

## 卸载

```bash
node scripts/uninstall.mjs --profile desktop
```

## 工作原理

**索引半边**：宿主用 `webServer.tapIndex(transform)` 往服务端渲染的 `index.html` 里插入作用域 CSS 和一段内联脚本——位置在 `<body>` 开头，比应用的 module 入口更早，所以能覆盖首帧。

**客户端半边**：桌面窗口加载的是 `dsh-app://app/`（Electron 自定义协议），不经过 HTTP 索引，索引注入到不了。所以同一个包还声明了 `dsh.client`，桌面壳从启动图里加载 `lib/client.js`，在 React 渲染会话之前挂载同一份动画。

两个半边都会检查 `#dsh-boot` 是否已存在，谁先到谁挂，避免重复播放。

**动画**：粒子位置是墙钟时间的纯函数（缓动插值 + 每颗粒子独立的延迟），掉帧只会跳过中间姿态，不会让序列变慢。

**音效**：WebAudio 实时合成——低频铺底（55/82.4/110Hz）、颗粒音、噪声 riser、点火冲击 + FM 钟声 + 和弦；共用一个合成脉冲响应做混响，总线挂 3:1 压缩。

**诊断**：插件自带只读端点，排查注入问题时很有用：

```bash
curl http://127.0.0.1:<port>/dsh-boot-screen/health
# {"ok":true,"version":"1.3.1","renders":n,"injected":n,"seen":n}
```

## 开发

```bash
node tools/build-client.mjs        # 由 lib/boot.js + boot.css 生成客户端半边
python3 tools/prepare-portrait.py <white-bg.png>   # 抠图并生成 lib/assets/portrait.*
node tools/build-harness.mjs /tmp/preview.html     # 生成独立的预览页（不需要 DSH）
```

改了 `lib/client.js` 之后，需要让宿主重新编排客户端图（改一下配置行，或重启 DSH）——配置热重载不一定重新 `import()` 模块。

## 兼容性与注意

- 只在 DSH Web GUI（HTTP）与桌面壳（`dsh-app://`）里生效；纯 `file://` 部署不经过两者。
- 启动脚本是内联经典脚本，若页面加了严格 CSP 需要放行 `unsafe-inline`。
- 立绘缺失时会退化成“没有人物”，首页照常渲染。
- 角色是单张平面图，所以只有光效和构图，没有肢体动作；真要做动作需要分层素材。

## License

MIT
