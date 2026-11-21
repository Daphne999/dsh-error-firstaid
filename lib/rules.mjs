/**
 * 规则表：症状 → 原因 → 一步能做的修复。
 *
 * 写每一条时的纪律：
 * - `source: 'tested'` 才是我们在这台机器上真的验证过的；`'reported'` 是社区/上游公开的，
 *   这种情况下 fixes 里不写我们没验证过的步骤。
 * - 不确定就别写。**宁可少一条，也不要给一个看起来像答案的猜测**——
 *   用户照着猜的步骤做，比不知道更糟。
 * - 每条 fix 都要是"能直接做的一步"，不是"检查一下""注意一下"这种废话。
 */

const R = (s) => new RegExp(s, 'i');

export const RULES = [
  {
    id: 'win-sandbox-0xc0000142',
    title: 'Windows：workspace-write 下所有命令都起不来（0xC0000142）',
    stage: 'runtime',
    source: 'tested',
    signals: [
      { re: R('0xc0000142'), w: 6 },
      { re: R('3221225794'), w: 6 },
      { re: R('STATUS_DLL_INIT_FAILED'), w: 4 },
      { re: R('workspace-write'), w: 2 },
      { re: R('exit code: 3221225794'), w: 4 },
    ],
    cause:
      'Windows 上文件策略设成 workspace-write 时，命令在被限制的 spawn 路径里就崩了，产生任何输出之前就退出。同一个命令在 danger-full-access 下正常——所以不是你的解释器或脚本有问题。',
    fixes: [
      '把当前会话的文件策略临时改成 danger-full-access（设置 → 权限），再跑同一条命令验证它确实能过——这一步只是确认病因，不是长期方案',
      '长期用：danger-full-access + dsh-warden 装前扫、dsh-drift 升级后比对，把风险挪到"装之前"而不是"跑的时候"',
    ],
    verify: '同一条命令在两种策略下分别跑一次：workspace-write 报 3221225794、full access 正常，即确认。',
    evidence: '本机实测；社区讨论 #10066（14 条评论）、#8322 同症状。',
  },
  {
    id: 'pty-shell-exited',
    title: 'PTY shell exited during startup（终端起不来）',
    stage: 'runtime',
    source: 'reported',
    signals: [
      { re: R('PTY shell exited'), w: 6 },
      { re: R('pty shell'), w: 3 },
      { re: R('terminal exited'), w: 2 },
    ],
    cause: '终端子进程在启动阶段就退出了，通常是同一类沙箱/spawn 限制导致的，不是 shell 本身坏了。',
    fixes: [
      '先确认是不是被沙箱拦的：把文件策略换成 danger-full-access 再开一次终端',
      '仍然失败就看 `%APPDATA%\\@deepseek-ai\\dsh-desktop\\logs\\` 下最新的日志，找 PTY 那几行',
    ],
    verify: '换 full access 后终端能开、能执行 `echo ok` 即为沙箱问题。',
    evidence: '社区讨论 #8322（13 条评论）。',
  },
  {
    id: 'patch-needs-insert',
    title: '插件装上了但工具一个都没有，状态一直是 restart',
    stage: 'plugin',
    source: 'tested',
    signals: [
      { re: R('state["\']?\\s*:\\s*["\']?restart'), w: 5 },
      { re: R('热挂载仅支持纯\\s*insert'), w: 6 },
      { re: R('bundle patch'), w: 2 },
      { re: R('工具不出现'), w: 3 },
      { re: R('工具列表里没有'), w: 3 },
    ],
    cause:
      'bundle 自带的 cordis.patch.yml 写成了「给已存在条目加配置」的形式（`- id: xxx` + `config:`），宿主判定需要重启才生效；而这种写法重启后依然是 restart。',
    fixes: [
      '把 bundle 里的 cordis.patch.yml 改成 insert 形式：\n  - insert:\n      - id: 你的插件名\n        name: \'你的插件名\'',
      '配置项不要写在 bundle 里，写到 profile 的 cordis.patch.yml（`- id: 插件名` + `config:`，不写 name）',
      '改完是热挂载生效；查 `/dsh-market/installed` 里该插件是否变成 `state: live`',
    ],
    verify: 'installed 里 `state:"live"`、`hot:true`，并且下一次工具表刷新后工具出现。',
    evidence: '本机实测（dsh-prompt-reverse、dsh-media-kit 都踩过）。',
  },
  {
    id: 'bom-json',
    title: 'package.json 开头带了 BOM，装完不加载',
    stage: 'install',
    source: 'tested',
    signals: [
      { re: R('bom'), w: 4 },
      { re: R('\\uFEFF'), w: 4 },
      { re: R('unexpected token.*json'), w: 3 },
      { re: R('json\\.parse'), w: 2 },
      { re: R('装完不加载|装上没反应'), w: 3 },
    ],
    cause:
      'DSH 用 `JSON.parse(readFileSync(p, "utf8"))` 读插件清单，不去 BOM；文件首字节是 EF BB BF 时直接解析失败，插件根本不加载。PowerShell 的 `Set-Content -Encoding UTF8` 默认就会写 BOM。',
    fixes: [
      '用一条命令扫全部插件：`node -e "const b=require(\'fs\').readFileSync(process.argv[1]);console.log(b[0]===0xef?\'BOM!\':\'ok\')" package.json`',
      '去掉 BOM：用编辑器另存为「UTF-8 无 BOM」，或 `node -e "const f=\'package.json\';const s=require(\'fs\').readFileSync(f,\'utf8\').replace(/^\\uFEFF/,\'\');require(\'fs\').writeFileSync(f,s)"`',
    ],
    verify: '首字节不再是 0xEF；重新安装后工具出现。',
    evidence: '本机实测 + 市场维护者用这条打回过一次 PR（dsh-drift）。',
  },
  {
    id: 'inject-missing',
    title: '插件 live 了但工具/路由一个都没有（inject 漏声明）',
    stage: 'plugin',
    source: 'tested',
    signals: [
      { re: R('ctx\\.get\\([^)]*\\)[\\s\\S]{0,20}undefined'), w: 6 },
      { re: R('inject'), w: 2 },
      { re: R('live:\\s*\\[\\]'), w: 5 },
      { re: R('路由\\s*404|404'), w: 2 },
      { re: R('工具不出现|没有注册'), w: 3 },
    ],
    cause:
      '插件 `inject` 里没声明需要的服务（`tools`、`webServer` 等），`ctx.get()` 拿到 undefined，而"拿不到就 return"的写法让插件静默什么都不注册——市场里看得见、diagnostics 为空、就是没有工具。',
    fixes: [
      '在插件入口补声明：`export const inject = [\'tools\']`（要挂 HTTP 路由就再加 `\'webServer\'`）',
      '把所有"服务拿不到就 return"的地方改成 `throw`，让错误暴露出来而不是静默',
      '改完重启一次宿主（改 lib 代码不会热重载）',
    ],
    verify: '重启后工具出现在列表里；路由用 curl 打一次看是否 200。',
    evidence: '本机实测（dsh-media-kit / dsh-drift / fake-call / watch-bridge 都踩过）。',
  },
  {
    id: 'invalid-output-null',
    title: '工具执行了但报 returned invalid output',
    stage: 'plugin',
    source: 'tested',
    signals: [
      { re: R('returned invalid output'), w: 6 },
      { re: R('must be an object|must be a string|must be array'), w: 4 },
      { re: R('output\\.schema'), w: 2 },
    ],
    cause: '工具声明了具体类型的输出字段，却返回了 `null`；宿主校验拒绝，结果被打回。',
    fixes: [
      '空值不要返回 null，整个省略这个字段',
      '或者在 schema 里改成可选，别声明成必填的具体类型',
    ],
    verify: '同一个调用不再报 invalid output。',
    evidence: '本机实测（dsh-media-lens 的 audio 字段）。',
  },
  {
    id: 'unknown-tool',
    title: 'unknown tool（工具根本不存在）',
    stage: 'plugin',
    source: 'tested',
    signals: [{ re: R('unknown tool'), w: 6 }, { re: R('tool not found'), w: 4 }],
    cause:
      '这个工具名没有被注册。和 `returned invalid output` 是两件完全不同的事：那个是注册成功了但返回值形状不对，这个是压根没注册。',
    fixes: [
      '先查插件是否 live：`curl -s http://127.0.0.1:<宿主端口>/dsh-market/installed`',
      '再查 inject 是否声明了 `tools`（见 inject 那条）',
      '改完 lib 代码要重启宿主才生效',
    ],
    verify: '重启后工具名出现在工具表里。',
    evidence: '本机实测。',
  },
  {
    id: 'hosts-hijack',
    title: 'GitHub / 外网站点连不上，报 ECONNREFUSED 127.0.0.1:443',
    stage: 'network',
    source: 'tested',
    signals: [
      { re: R('ECONNREFUSED\\s+127\\.0\\.0\\.1:443'), w: 6 },
      { re: R('non-public IP'), w: 5 },
      { re: R('resolves to a non-public'), w: 5 },
      { re: R('steam\\+\\+|watt toolkit'), w: 4 },
      { re: R('hosts'), w: 2 },
    ],
    cause:
      '加速器（如 Steam++ / Watt Toolkit）改写了 hosts，把几十个域名指到 127.0.0.1；它的加速没启动时本地 443 没人监听，于是所有请求都撞在 127.0.0.1 上。',
    fixes: [
      '先确认：`grep -i github /c/Windows/System32/drivers/etc/hosts`，看到 `# Steam++ Start` 区块就是它',
      '退出那个加速器（写 hosts 需要管理员，普通权限改不了），然后重新 grep 一遍确认没了',
      '应急：SSH 走 ssh.github.com:443 不受 hosts 影响，git 操作可以先顶一下',
    ],
    verify: 'hosts 里 github 相关行数为 0，且 `curl -sI https://api.github.com` 返回 200。',
    evidence: '本机实测。',
  },
  {
    id: 'tls-leaf-signature',
    title: 'TLS 报 UNABLE_TO_VERIFY_LEAF_SIGNATURE / self signed',
    stage: 'network',
    source: 'tested',
    signals: [
      { re: R('UNABLE_TO_VERIFY_LEAF_SIGNATURE'), w: 6 },
      { re: R('self.signed certificate'), w: 4 },
      { re: R('unable to get local issuer'), w: 4 },
      { re: R('certificate'), w: 1 },
    ],
    cause: 'Node 自带的 CA 列表不认这个环境的根证书（公司代理、系统证书库差异都会这样）。',
    fixes: ['跑 node 脚本时加 `NODE_OPTIONS=--use-system-ca`，让它用系统的证书库'],
    verify: '同样的请求不再报证书错误。',
    evidence: '本机实测。',
  },
  {
    id: 'sandbox-temp-gone',
    title: 'shell 突然全挂：no sandbox backend is usable / --temp is not an existing directory',
    stage: 'runtime',
    source: 'tested',
    signals: [
      { re: R('no sandbox backend is usable'), w: 6 },
      { re: R('--temp is not an existing directory'), w: 6 },
      { re: R('windows-acl-run'), w: 3 },
    ],
    cause: '沙箱用的临时目录被系统清理掉了，于是所有命令都起不来。',
    fixes: ['在报错里提到的那个路径下创建一个文件（例如 `.keep`），把目录重建出来，不用重启应用'],
    verify: '随便跑一条命令能出结果。',
    evidence: '本机实测。',
  },
  {
    id: 'claimcheck-working-tree-changed',
    title: 'claim_verify 报 working tree changed，拿不到 pass',
    stage: 'plugin',
    source: 'tested',
    signals: [
      { re: R('working tree changed'), w: 6 },
      { re: R('cannot be a pass'), w: 4 },
      { re: R('evidence is stale'), w: 3 },
    ],
    cause: '检查脚本自己在工作区里写了文件；它的语义是"检查期间工作树必须不变"，所以整次运行只能是 incomplete。',
    fixes: [
      '检查脚本跑完自己清干净：`fs.rmSync(tmp, { recursive: true, force: true })`',
      '临时目录建成在工作区之外不可行（沙箱不允许），所以优先选"自己删"',
    ],
    verify: '再跑一次得到 pass 而不是 incomplete。',
    evidence: '本机实测。',
  },
  {
    id: 'exit-0-but-crash',
    title: '脚本打印对了，但退出码不是 0',
    stage: 'runtime',
    source: 'tested',
    signals: [
      { re: R('UV_HANDLE_CLOSING'), w: 6 },
      { re: R('Assertion failed'), w: 3 },
      { re: R('libuv'), w: 3 },
      { re: R('退出码不是\\s*0|exit code: 1'), w: 2 },
    ],
    cause:
      '在 Windows 上 `process.exit(0)` 收尾时，undici 的 keep-alive 连接还挂在池里，libuv 的 async handle 正在关闭 → 断言失败。输出全对，退出码却非 0。',
    fixes: ['别用 `process.exit()` 收尾：把后续逻辑包进 if/else，让事件循环自己跑完'],
    verify: '`echo exit=$?` 是 0。',
    evidence: '本机实测。',
  },
  {
    id: 'ffmpeg-temp-permission',
    title: 'ffmpeg / 外部程序写不了临时目录（Permission denied / 4294967283）',
    stage: 'runtime',
    source: 'tested',
    signals: [
      { re: R('4294967283'), w: 6 },
      { re: R('permission denied'), w: 3 },
      { re: R('ffmpeg'), w: 2 },
      { re: R('\\bEACCES\\b'), w: 4 },
    ],
    cause:
      '往系统临时目录（%TEMP%）写文件被拒。注意：PowerShell 能写不等于 ffmpeg 能写——要按"同程序换目录 / 同目录换程序"分别试，才能分清是程序被拦还是目录没权限。',
    fixes: [
      '把所有"让外部程序写文件"的路径换到用户盘上的固定目录（如 `D:\\ds工作区\\.work` 或 `~/.dsh/<插件>/work`）',
      '不要在代码里用 `os.tmpdir()` 当工作目录',
    ],
    verify: '同样的命令在新目录下成功。',
    evidence: '本机实测（dsh-media-kit、dsh-prompt-reverse 各踩一次）。',
  },
  {
    id: 'ffmpeg-filter-drive-colon',
    title: 'ffmpeg 报 Error parsing filterchain（filter 里写了带盘符的路径）',
    stage: 'runtime',
    source: 'tested',
    signals: [
      { re: R('Error parsing filterchain'), w: 6 },
      { re: R('drawtext|textfile|metadata=print'), w: 3 },
      { re: R('-22'), w: 1 },
    ],
    cause: 'filter 选项里的 `D:` 冒号被 ffmpeg 当成选项分隔符。',
    fixes: [
      '把子进程的 cwd 切到目标目录，filter 里只写相对文件名',
      '必须写绝对路径时（如 fontfile），用 `C\\:/Windows/Fonts/msyh.ttc` 这种反斜杠转义冒号的写法',
    ],
    verify: '同一条命令不再报 filterchain 错误。',
    evidence: '本机实测。',
  },
  {
    id: 'pnpm-git-revocation',
    title: 'pnpm install 报 ERR_PNPM_GIT_FETCH_FAILED / CRYPT_E_NO_REVOCATION_CHECK',
    stage: 'install',
    source: 'tested',
    signals: [
      { re: R('CRYPT_E_NO_REVOCATION_CHECK'), w: 6 },
      { re: R('ERR_PNPM_GIT_FETCH_FAILED'), w: 6 },
      { re: R('InitializeSecurityContext'), w: 4 },
    ],
    cause: '拉 git 依赖时证书吊销列表连不上，pnpm 直接整个 install 失败（连 link: 依赖也没装上）。',
    fixes: [
      '对本地 link 依赖直接建 junction：`cmd /c mklink /J "<profile>\\node_modules\\dsh-xxx" "D:\\ds工作区\\dsh-xxx"`',
      'DSH 解析 bundle 只看 node_modules，不依赖 lockfile，所以手工建好就能用',
    ],
    verify: '从 profile 目录 `import(\'dsh-xxx\')` 成功。',
    evidence: '本机实测。',
  },
  {
    id: 'link-missing-dsh-llm',
    title: 'Cannot find package \'@deepseek-ai/dsh-llm\'（link: 依赖解析失败）',
    stage: 'plugin',
    source: 'tested',
    signals: [
      { re: R('Cannot find package .@deepseek-ai/dsh-(llm|session)'), w: 6 },
      { re: R('bundle failed'), w: 3 },
      { re: R('link:'), w: 2 },
    ],
    cause:
      '用 link: 挂本地插件时，ESM 从真实文件路径（D 盘）向上找 node_modules，找不到 DSH 的内部包，宿主把该 bundle 标 failed。',
    fixes: [
      '给插件目录建 dev 依赖 junction：`node_modules\\@deepseek-ai\\{schemastery,dsh-llm,dsh-session}`',
      '或者把业务逻辑拆成不依赖 DSH 内部模块的纯函数，测试时注入假依赖',
    ],
    verify: '从 profile 里 import 该插件不再报 Cannot find package。',
    evidence: '本机实测。',
  },
  {
    id: 'module-not-found-cwd',
    title: 'Cannot find module .../lib/index.js（cwd 不对）',
    stage: 'runtime',
    source: 'tested',
    signals: [
      { re: R('Cannot find module .*lib[\\\\/]index\\.js'), w: 6 },
      { re: R('ENOENT.*package\\.json'), w: 3 },
    ],
    cause: '进程的当前工作目录不是插件目录，相对路径解析不到。',
    fixes: ['cd 进插件目录再跑，或用绝对路径；`cd` 和 `cwd` 不一定是同一件事，写完确认一下 `pwd`'],
    verify: '同一条命令在正确目录下能跑。',
    evidence: '本机实测。',
  },
  {
    id: 'self-restart-disabled',
    title: '想重启宿主但返回 403 self-restart is disabled',
    stage: 'runtime',
    source: 'tested',
    signals: [
      { re: R('self-restart is disabled'), w: 6 },
      { re: R('403'), w: 1 },
      { re: R('restart'), w: 2 },
    ],
    cause: '这个宿主默认禁止自我重启；`restartReachable:true` 只说明路由还在、能打到，不等于功能开着。',
    fixes: [
      '用外部方式重启（dsh-safe-restart 这类：从进程树外派 helper → 强杀 → 拉起 → 扫端口自检 → 发通知）',
      '或者你自己从托盘退出再打开',
    ],
    verify: '重启后端口变了或进程 StartTime 更新——别凭"我觉得重启了"判断。',
    evidence: '本机实测。',
  },
  {
    id: 'no-ctrl-f-search',
    title: '想在会话里搜以前说过的话，但 Ctrl+F 没反应',
    stage: 'usage',
    source: 'reported',
    signals: [
      { re: R('ctrl\\+f'), w: 5 },
      { re: R('搜索.*(会话|聊天|对话)'), w: 4 },
      { re: R('找.*以前.*说'), w: 3 },
    ],
    cause: '桌面版没接会话内搜索入口（底层检索引擎其实已经在）。这是产品缺口，不是你操作错了。',
    fixes: [
      '临时办法：让我去查历史归档（本机的会话日志 + qq-archive 库都能按关键词检索）',
      '想自己搜：直接问我"我以前说过 XX 吗"',
    ],
    evidence: '社区讨论 #8713（21 条评论，作者附了根因与原型）。',
  },
  {
    id: 'eaddr-in-use',
    title: '端口被占用（EADDRINUSE）',
    stage: 'runtime',
    source: 'tested',
    signals: [{ re: R('EADDRINUSE'), w: 6 }, { re: R('address already in use'), w: 5 }],
    cause: '要监听的端口已经有人在用；DSH 宿主自己每次启动还会换端口，写死端口长期一定撞。',
    fixes: [
      '查是谁占的：`netstat -ano -p tcp | grep <端口>` 拿 PID，再 `tasklist /FO CSV /NH` 对名字',
      '别写死端口：按配置 → 宿主 webServer 端口 → 环境变量 的顺序取',
    ],
    verify: '换一个端口或用动态端口后能起来。',
    evidence: '本机实测。',
  },
  {
    id: 'github-401-vs-403',
    title: 'GitHub API 报 401 或 403',
    stage: 'network',
    source: 'tested',
    signals: [
      { re: R('401.*(bad credentials|unauthorized)'), w: 6 },
      { re: R('403.*resource not accessible'), w: 6 },
      { re: R('personal access token'), w: 3 },
    ],
    cause:
      '401 = token 本身失效（撤销/泄露被冻结）；403 = 身份有效但权限不够。另一个常见 403 真因是**fine-grained token 天生不能给别人的仓库开 PR**，勾什么权限都没用。',
    fixes: [
      '401 → 换新 token 并写进本地凭据文件（别贴聊天）',
      '403 且是给别人的仓库开 PR → 换 classic token（只勾 `public_repo`）',
      '验证 token 是否有效：`GET /user` 返回 200 即可',
    ],
    verify: '同一个请求返回 200。',
    evidence: '本机实测。',
  },
  {
    id: 'first-launch-fetch-failed',
    title: '首次启动就弹「应用无法启动或已意外停止」，日志里有 fetch failed',
    stage: 'startup',
    source: 'reported',
    signals: [
      { re: R('fetch failed'), w: 5 },
      { re: R('无法启动或已意外停止'), w: 5 },
      { re: R('crash-.*main\\.log'), w: 3 },
    ],
    cause: '启动阶段要联网，但本机网络/代理/证书链有问题（也可能撞上 hosts 被改写）。这属于启动链路问题，不是插件导致的。',
    fixes: [
      '先查 hosts（见那条 ECONNREFUSED 127.0.0.1:443）',
      '把 `%APPDATA%\\@deepseek-ai\\dsh-desktop\\logs\\crash-*-main.log` 里最后 30 行复制出来再判断——没有日志内容时不要猜',
    ],
    evidence: '社区讨论 #13368（18 条评论）、#13533、#13532。',
  },
  {
    id: 'upgrade-rc3-agents-roots',
    title: '覆盖升级后工作区点不动、新建会话报 ctx.agents.roots is not a function',
    stage: 'startup',
    source: 'reported',
    signals: [
      { re: R('ctx\\.agents\\.roots is not a function'), w: 6 },
      { re: R('覆盖升级|覆盖安装'), w: 3 },
      { re: R('工作区.{0,6}(无反应|点不动)'), w: 3 },
    ],
    cause:
      '升级后运行时和你 profile 里的旧状态对不上，不是你的会话坏了。这一版有多起同类报告，属于版本本身的问题。',
    fixes: [
      '先确认版本号：如果是 0.2.2-rc.3 附近，**别在这版上继续折腾数据**，越折腾越容易丢',
      '退回上一个能用的版本；退回前先把 `plugins` 和 `sessions` 各备份一份（有人在同一波升级里把两者一起丢了）',
    ],
    evidence: '社区 #13550、#13607。',
  },
  {
    id: 'startup-crash-rc3-fetch',
    title: 'Windows 上启动十几秒后必崩（fetch failed / ECONNRESET）',
    stage: 'startup',
    source: 'reported',
    signals: [
      { re: R('ECONNRESET'), w: 4 },
      { re: R('0\\.2\\.2-rc\\.3'), w: 4 },
      { re: R('14\\s*秒|14s|十几秒'), w: 3 },
      { re: R('应用无法启动或已意外停止'), w: 3 },
    ],
    cause:
      '遥测上报超时，本地请求拿到 ECONNRESET，主进程没接住就崩了。和你的插件、profile 内容都无关。',
    fixes: [
      '这三步已经有人试过且**无效**：重装同版本、清空 profile 运行时目录、禁用第三方插件——别重复浪费时间',
      '退回上一个能用的版本，等这一版修',
    ],
    evidence: '社区 #13590、#13605。',
  },
  {
    id: 'emfile-external-bundle',
    title: '加了一个外部插件之后桌面端起不来（EMFILE / 句柄耗尽）',
    stage: 'startup',
    source: 'reported',
    signals: [
      { re: R('\\bEMFILE\\b'), w: 6 },
      { re: R('too many open files'), w: 5 },
      { re: R('句柄'), w: 2 },
      { re: R('8192'), w: 2 },
    ],
    cause:
      '宿主启动期要打开的缓存文件太多，撞上了 Windows 的句柄上限；新加的外部 bundle 只是把数量推过了线。',
    fixes: [
      '先清 `%USERPROFILE%\\.dsh\\storages\\session_projcache`，有人清完就恢复了',
      '还不行就把刚加的那个包从 `dsh.profile.bundles` 里去掉，二分定位是谁把数量顶上去的',
    ],
    evidence: '社区 #13593。',
  },
  {
    id: 'bundle-vanished-after-update',
    title: '更新插件时提示成功，重启后插件没了',
    stage: 'plugin',
    source: 'reported',
    signals: [
      { re: R('dsh\\.profile\\.bundles'), w: 5 },
      { re: R('(更新|升级).{0,8}(成功|完成).{0,12}(没了|消失|不见|不生效)'), w: 5 },
      { re: R('\\bapplied\\b'), w: 3 },
    ],
    cause:
      '插件管理器更新 git 版 bundle 后，没有把它写回 `dsh.profile.bundles`；`applied` 只代表包装上了，不代表会被加载。',
    fixes: [
      '打开 profile 的 `package.json`，看 `dsh.profile.bundles` 数组里还有没有这个包名；没有就手动加回去再重启',
      '以后装完/更新完，一律去 `/dsh-market/installed` 看 activation 是不是 `live`——别信提示框',
    ],
    evidence: '社区 #13609。',
  },
  {
    id: 'fs-write-needs-read',
    title: '写文件被拒：file has not been read（先读后写策略）',
    stage: 'plugin',
    source: 'tested',
    signals: [
      { re: R('file has not been read'), w: 6 },
      { re: R('read the file, then retry'), w: 5 },
    ],
    cause:
      '宿主的文件观测策略要求先读后写：这个会话还没读过该文件（新会话、文件由子代理或另一个会话写入、或路径刚被移动/重命名过），`write`/`edit` 会直接被拒。这不是文件权限问题，也不是路径写错。',
    fixes: [
      '先用 `read` 把该文件完整读一遍（不是 `ls`，也不是只读一行），再重试同一个 `write`/`edit`',
      '改已有文件优先用 `edit` 只传 old_string/new_string；整文件 `write` 更容易踩这条限制',
      '批量改多个文件时先逐个 `read` 完再开始改，别让"读到一半就写"把失败点搞乱',
    ],
    verify: '同一个文件：不读直接 write 报 file has not been read；read 之后 write 成功，即确认。',
    evidence: '本机 7 天会话扫描 30 次 / 7 个会话；2026-11-21 复现（目录重命名后直接 write 旧路径被拒）。',
  },
  {
    id: 'fs-stale-after-change',
    title: '写文件被拒：file changed since it was read / file no longer exists',
    stage: 'plugin',
    source: 'tested',
    signals: [
      { re: R('file changed since it was read'), w: 6 },
      { re: R('file no longer exists'), w: 6 },
      { re: R('re-read the file'), w: 4 },
    ],
    cause:
      '你读完之后文件又被改了：另一个会话或子代理写入、git checkout、编辑器保存，或者文件被移走/删掉。宿主按「读到的那一版」判定，旧内容已经不能安全覆盖。',
    fixes: [
      '重新 `read` 当前内容再改；不要拿记忆里的旧内容直接覆盖',
      '报 file no longer exists 时先确认工作区与路径（相对路径按会话工作区解析）；文件确实不在就先创建再写',
    ],
    verify: '重新 read 之后同一个 write/edit 通过，即确认。',
    evidence: '本机 7 天：file no longer exists 9 次 / 4 会话；file changed since it was read 8 次 / 2 会话。',
  },
  {
    id: 'plugin-invalid-output-oneof',
    title: '插件工具返回 invalid output（oneOf 校验不匹配）',
    stage: 'plugin',
    source: 'reported',
    signals: [
      { re: R('must match exactly one oneof branch'), w: 7 },
      { re: R('oneof branch'), w: 6 },
      { re: R('returned invalid output'), w: 3 },
    ],
    cause:
      '某个插件声明的工具输出 schema 与实际返回值对不上（常见：没有数据时返回 null、空对象或漏掉必填字段）。宿主在工具边界就拦下了，模型看到的是校验错误，不是插件结果。',
    fixes: [
      '从报错里拿到工具名，定位是哪个插件（`/dsh-market/installed` 或 profile 的 bundles）；升级到修复版，或先禁用该插件',
      '把完整报错（工具名 + schema 那句）发给插件作者——这是插件 bug，硬绕通常不值得',
      '临时绕路：换用同功能的另一件工具；不要反复重试同一个调用',
    ],
    evidence: '本机 7 天：11 次 / 4 会话（含 proactive_list 无闹钟时返回 null）。',
  },
  {
    id: 'shell-dialect-mismatch',
    title: '命令语法和 shell 方言对不上（PowerShell 写法跑在 bash 里）',
    stage: 'usage',
    source: 'tested',
    signals: [
      { re: R('select-object|get-childitem|where-object|get-command|start-process'), w: 6 },
      { re: R('not recognized as an internal or external command'), w: 6 },
      { re: R('不是内部或外部命令'), w: 6 },
      { re: R('command not found'), w: 3 },
    ],
    cause:
      '命令的方言和实际执行它的 shell 不一致：把 PowerShell 管用写法（`Select-Object` 等 cmdlet）交给了 bash，或把 bash 写法交给了 PowerShell。',
    fixes: [
      '先确认这个 shell 工具是哪种方言（工具名/描述会写 bash 还是 pwsh），再用对应写法：bash 用 `head/sed/grep`，PowerShell 用 `Select-Object/Where-Object`',
      '同一件事换一个已确认能跑的写法重试一次；别在原命令上猜着改参数',
      '要跨方言执行，显式钉死：`powershell -NoProfile -Command "..."` 或 `bash -lc "..."`',
    ],
    verify: '把 `... | Select-Object -First 3` 改成 `... | head -3` 后同命令退出 0，即确认。',
    evidence: '本机实测 2026-11-21（`Select-Object: command not found`，命令交给了 bash）。',
  },
  {
    id: 'claimcheck-check-title-missing',
    title: 'claim_plan 被拒：check 缺 title',
    stage: 'plugin',
    source: 'reported',
    signals: [
      { re: R('title is required'), w: 7 },
      { re: R('rejected checks'), w: 6 },
      { re: R('check-\\d+:'), w: 2 },
    ],
    cause:
      '`claim_plan` 里每条检查都必须带 `title`（一句话、可证伪的断言）；只给 command 会被整体拒绝，连一条都记不下来。',
    fixes: [
      '给每条 check 补 `title`，写成"命令退出 0""文件包含 X"这种能被判真假的一句话',
      '补完重新调用 `claim_plan`（不是 claim_verify），再跑 claim_verify',
    ],
    evidence: '本机 7 天：5 次 / 4 会话（dsh-claimcheck 0.1.2）。',
  },
  {
    id: 'taskboard-version-conflict',
    title: '任务卡写入被拒：version_conflict',
    stage: 'usage',
    source: 'reported',
    signals: [
      { re: R('version_conflict'), w: 7 },
      { re: R('stale version'), w: 6 },
      { re: R('re-read the task and retry'), w: 5 },
    ],
    cause:
      '任务卡在你读取之后被别人（或另一个会话）改过，手里的 version 过期了；写入被乐观锁拒绝。',
    fixes: [
      '重新 `taskboard_get` 拿最新 version，确认需求没变，再用新 version 提交一次',
      '第二次仍冲突就停手：说明有人正在同时改这张卡，别循环重试',
    ],
    evidence: '本机 7 天：6 次 / 2 会话。',
  },
  {
    id: 'image-extension-mismatch',
    title: '读图被拒：扩展名声明 jpeg，字节是别的格式',
    stage: 'usage',
    source: 'tested',
    signals: [
      { re: R('extension declares'), w: 6 },
      { re: R('different image format'), w: 6 },
      { re: R('rename the file to match its actual format'), w: 5 },
    ],
    cause:
      '图片扩展名和实际字节格式不一致（QQ/微信/浏览器常把 PNG/WebP 存成 .jpg）。读取工具按扩展名声称的 jpeg 去解，发现 magic bytes 不是 jpeg 就拒绝——这是防止把错误格式当图片解析，不是文件坏了。',
    fixes: [
      '把文件改成真实格式的扩展名再读（PNG→.png、WebP→.webp、GIF→.gif）；不确定就先复制一份改名，别覆盖原文件',
      '看文件头判断真实格式：PNG `89 50 4E 47`、JPEG `FF D8 FF`、GIF `47 49 46 38`、WebP `52 49 46 46`（RIFF 开头）',
      '要保留原路径时用 ffmpeg/图片工具真的转成声明的格式，而不是只改扩展名',
    ],
    verify: '同一份 PNG：存成 .jpg 时报这句；改成 .png 后再 read_image 成功，即确认。',
    evidence: '本机实测 2026-11-21（PNG 存成 .jpg → read_image 报同句，改 .png 后可读）；本机 24h 日志 7 次 / 2 会话。',
  },
  {
    id: 'edit-old-string-missing',
    title: 'edit 被拒：old_string was not found',
    stage: 'plugin',
    source: 'tested',
    signals: [
      { re: R('old_string was not found'), w: 7 },
      { re: R('old_string'), w: 3 },
    ],
    cause:
      '要替换的片段不在当前文件里：读到的是旧版本、空白/换行不一致（CRLF vs LF、全角空格）、或片段在文件里出现多次而上下文不够唯一。',
    fixes: [
      '重新 `read` 该文件确认当前内容，复制原文片段（含缩进与换行）再 `edit`',
      '片段太长或重复时，缩短到足以唯一的几行；实在不好定位就 `write` 整个文件',
      '多处要改就逐个 `edit`，别指望一个 old_string 命中多处',
    ],
    verify: '对同一文件先 read、再复制其中真实存在的一段做 edit 成功；传不存在的片段报同句，即确认。',
    evidence: '本机实测 2026-11-21（对已读文件传不存在的 old_string 得同句）；本机 24h 日志 5 次 / 1 会话。',
  },
];

export function listRuleIds() {
  return RULES.map((r) => r.id);
}
