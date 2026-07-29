const vscode = require('vscode');
const { ReactionPolicy } = require('./reactionPolicy');
const { ProductivityController } = require('./productivityController');

class YuukaViewProvider {
  static viewType = 'yuukaPet.view';

  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.view = undefined;
    this.productivity = undefined;
  }

  setProductivity(productivity) {
    this.productivity = productivity;
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };
    webview.html = this.getHtml(webview);
    webview.onDidReceiveMessage((message) => {
      if (message.type === 'hello') {
        vscode.window.setStatusBarMessage('优香：今天的任务也要按计划完成。', 3500);
        this.post('settings', { settings: getWebviewSettings() });
        this.productivity?.sync(true);
      }
      if (message.type === 'status') {
        vscode.window.setStatusBarMessage(`优香：${message.text}`, 3500);
      }
      if (message.type === 'productivity') {
        void this.productivity?.handleAction(message.action, message);
      }
      if (message.type === 'relationshipSettings' && typeof message.enabled === 'boolean') {
        void updateRelationshipEnabled(this, message.enabled);
      }
      if (message.type === 'appearanceSettings') {
        void updateAppearanceSettings(this, message);
      }
    });
  }

  post(command, payload = {}) {
    if (!this.view) return false;
    this.view.webview.postMessage({ command, ...payload });
    return true;
  }

  notify(command, payload = {}) {
    if (!this.view?.visible) return false;
    return this.post(command, payload);
  }

  send(command, payload = {}) {
    this.view?.show?.(true);
    return this.post(command, payload);
  }

  getHtml(webview) {
    const nonce = getNonce();
    const classicSpriteUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'spritesheet.png'));
    const pajamaSpriteUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'spritesheet-pajama.webp'));
    const dialogueUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'dialogue.js'));
    const dialoguePolicyUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'dialoguePolicy.js'));
    const relationshipDialogueUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'relationshipDialogue.js'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'style.css'));
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource}`,
      `style-src ${webview.cspSource} 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <style nonce="${nonce}">body { --sprite-classic-url: url('${classicSpriteUri}'); --sprite-pajama-url: url('${pajamaSpriteUri}'); }</style>
  <title>早濑优香</title>
</head>
<body>
  <main id="world" data-scene="millennium" data-outfit="classic" aria-label="早濑优香桌宠活动区域">
    <section id="speech" role="status">今天的工作清单整理好了吗？</section>
    <div id="hint">点击优香互动 · 点击地面让她走过去</div>
    <div id="pet" class="sprite" role="button" tabindex="0" aria-label="早濑优香"></div>
    <div id="floor"></div>
  </main>
  <nav aria-label="桌宠操作">
    <button id="play">互动</button>
    <button id="work">工作</button>
    <button id="reset">复位</button>
  </nav>
  <section id="productivity" aria-label="生产力工具">
    <div class="tabs" role="tablist" aria-label="桌宠功能视图">
      <button id="tab-focus" class="tab active" role="tab" aria-selected="true" aria-controls="focus-panel" tabindex="0" data-panel="focus-panel">专注</button>
      <button id="tab-tasks" class="tab" role="tab" aria-selected="false" aria-controls="tasks-panel" tabindex="-1" data-panel="tasks-panel">任务</button>
      <button id="tab-reminders" class="tab" role="tab" aria-selected="false" aria-controls="reminders-panel" tabindex="-1" data-panel="reminders-panel">提醒</button>
      <button id="tab-stats" class="tab" role="tab" aria-selected="false" aria-controls="stats-panel" tabindex="-1" data-panel="stats-panel">统计</button>
      <button id="tab-relationship" class="tab" role="tab" aria-selected="false" aria-controls="relationship-panel" tabindex="-1" data-panel="relationship-panel">关系</button>
      <button id="tab-appearance" class="tab" role="tab" aria-selected="false" aria-controls="scene-panel" tabindex="-1" data-panel="scene-panel">外观</button>
    </div>
    <div id="productivity-message" class="inline-message" role="status" aria-live="polite" hidden></div>
    <section id="focus-panel" class="panel active" role="tabpanel" aria-labelledby="tab-focus">
      <div class="timer-context">
        <strong id="timer-phase">专注</strong>
        <span id="timer-task">未选择当前任务</span>
      </div>
      <div id="timer-display" role="timer" aria-label="专注剩余 25 分钟">25:00</div>
      <div class="button-row three">
        <button id="timer-primary">开始</button>
        <button id="timer-stop" class="secondary">结束</button>
        <button id="timer-reset" class="secondary">重置</button>
      </div>
    </section>
    <section id="tasks-panel" class="panel" role="tabpanel" aria-labelledby="tab-tasks" hidden>
      <form id="task-form" class="inline-form">
        <input id="task-input" type="text" maxlength="120" placeholder="添加今日任务" aria-label="任务内容">
        <button id="task-submit" type="submit">添加</button>
      </form>
      <div id="task-empty" class="empty-state">今天还没有任务，先记下最重要的一件事吧。</div>
      <ul id="task-list" class="item-list" aria-label="今日任务"></ul>
    </section>
    <section id="reminders-panel" class="panel" role="tabpanel" aria-labelledby="tab-reminders" hidden>
      <form id="reminder-form" class="stack-form">
        <input id="reminder-input" type="text" maxlength="120" placeholder="提醒内容" aria-label="提醒内容">
        <div class="inline-form">
          <input id="reminder-time" type="datetime-local" aria-label="提醒时间">
          <button id="reminder-submit" type="submit">添加</button>
        </div>
      </form>
      <div id="reminder-empty" class="empty-state">没有待处理提醒，需要时在上方添加。</div>
      <ul id="reminder-list" class="item-list" aria-label="提醒列表"></ul>
    </section>
    <section id="stats-panel" class="panel" role="tabpanel" aria-labelledby="tab-stats" hidden>
      <div class="stats-grid">
        <div><strong id="today-focus">0</strong><span>今日专注</span></div>
        <div><strong id="today-minutes">0</strong><span>今日分钟</span></div>
        <div><strong id="today-tasks">0</strong><span>今日任务</span></div>
        <div><strong id="focus-streak">0</strong><span>连续天数</span></div>
        <div><strong id="week-minutes">0</strong><span>本周分钟</span></div>
        <div><strong id="week-tasks">0</strong><span>本周任务</span></div>
      </div>
      <button id="clear-stats" class="secondary full-width">清除本机统计</button>
    </section>
    <section id="relationship-panel" class="panel" role="tabpanel" aria-labelledby="tab-relationship" hidden>
      <label class="toggle-row">
        <input id="relationship-enabled" type="checkbox">
        <span>启用心情与亲密度</span>
      </label>
      <div id="relationship-controls" class="relationship-controls">
        <label class="field-row" for="mood-select">
          <span>当前心情</span>
          <select id="mood-select">
            <option value="2">很开心</option>
            <option value="1">开心</option>
            <option value="0">平静</option>
            <option value="-1">低落</option>
            <option value="-2">很低落</option>
          </select>
        </label>
        <div class="affinity-heading">
          <label for="affinity-range">好感</label>
          <output id="affinity-output" for="affinity-range affinity-number">0</output>
        </div>
        <div class="affinity-editor">
          <input id="affinity-range" type="range" min="0" max="100" step="1" value="0" aria-label="好感值">
          <input id="affinity-number" type="number" min="0" max="100" step="1" value="0" aria-label="手动输入好感值">
        </div>
        <button id="reset-relationship" class="secondary full-width">重置为平静与 0 好感</button>
      </div>
    </section>
    <section id="scene-panel" class="panel" role="tabpanel" aria-labelledby="tab-appearance" hidden>
      <label class="field-row" for="outfit-select">
        <span>优香形象</span>
        <select id="outfit-select">
          <option value="classic">经典制服</option>
          <option value="pajama">睡衣</option>
        </select>
      </label>
      <div class="scene-description">
        <strong id="outfit-name">经典制服</strong>
        <p id="outfit-detail">保留原有像素风形象与完整互动动画。</p>
      </div>
      <label class="field-row" for="scene-select">
        <span>桌宠背景</span>
        <select id="scene-select">
          <option value="office">简洁办公室</option>
          <option value="millennium">千年风格</option>
          <option value="transparent">纯透明感</option>
        </select>
      </label>
      <div class="scene-description">
        <strong id="scene-name">千年风格</strong>
        <p id="scene-detail">蓝色网格与数据光效，呼应千年科技感。</p>
      </div>
      <p class="local-note">颜色会跟随 VS Code 深色或浅色主题；背景仅使用扩展内置样式。</p>
    </section>
  </section>
  <script nonce="${nonce}" src="${dialogueUri}"></script>
  <script nonce="${nonce}" src="${dialoguePolicyUri}"></script>
  <script nonce="${nonce}" src="${relationshipDialogueUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function activate(context) {
  const provider = new YuukaViewProvider(context.extensionUri);
  const productivity = new ProductivityController(context, provider, vscode, getProductivitySettings);
  provider.setProductivity(productivity);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(YuukaViewProvider.viewType, provider),
    vscode.commands.registerCommand('yuukaPet.show', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.yuukaPet');
    }),
    vscode.commands.registerCommand('yuukaPet.play', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.yuukaPet');
      provider.send('play');
    }),
    vscode.commands.registerCommand('yuukaPet.work', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.yuukaPet');
      provider.send('work');
    }),
    vscode.commands.registerCommand('yuukaPet.reset', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.yuukaPet');
      provider.send('reset');
    }),
    vscode.commands.registerCommand('yuukaPet.jump', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.yuukaPet');
      provider.send('jump');
    }),
    vscode.commands.registerCommand('yuukaPet.think', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.yuukaPet');
      provider.send('think');
    }),
    vscode.commands.registerCommand('yuukaPet.celebrateMilestone', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.yuukaPet');
      provider.send('milestone');
    }),
    vscode.commands.registerCommand('yuukaPet.resetRelationship', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.yuukaPet');
      provider.send('resetRelationship');
    }),
    vscode.commands.registerCommand('yuukaPet.startFocus', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.yuukaPet');
      await productivity.handleAction('start');
    }),
    vscode.commands.registerCommand('yuukaPet.pauseFocus', async () => {
      await productivity.handleAction('pause');
    }),
    vscode.commands.registerCommand('yuukaPet.resetFocus', async () => {
      await productivity.handleAction('reset');
    }),
    vscode.commands.registerCommand('yuukaPet.clearStatistics', async () => {
      await productivity.handleAction('clearStats');
    })
  );
  registerEditorReactions(context, provider, productivity);
}

function deactivate() {}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  return nonce;
}

function getReactionSettings() {
  const config = vscode.workspace.getConfiguration('yuukaPet.reactions');
  return {
    enabled: config.get('enabled', true),
    saveCooldownMs: config.get('saveCooldownSeconds', 90) * 1000,
    typingThresholdMs: config.get('continuousTypingMinutes', 45) * 60000,
    idleThresholdMs: config.get('idleMinutes', 10) * 60000,
    focusCooldownMs: config.get('focusCooldownMinutes', 30) * 60000,
    taskResults: config.get('taskResults', true)
  };
}

function getWebviewSettings() {
  return {
    relationshipEnabled: vscode.workspace.getConfiguration('yuukaPet.relationship').get('enabled', true),
    randomEventFrequency: vscode.workspace.getConfiguration('yuukaPet.randomEvents').get('frequency', 'low'),
    scene: vscode.workspace.getConfiguration('yuukaPet.appearance').get('scene', 'millennium'),
    outfit: vscode.workspace.getConfiguration('yuukaPet.appearance').get('outfit', 'classic')
  };
}

async function updateRelationshipEnabled(provider, enabled) {
  try {
    await vscode.workspace.getConfiguration('yuukaPet.relationship')
      .update('enabled', enabled, vscode.ConfigurationTarget.Global);
  } catch (error) {
    provider.post('settings', { settings: getWebviewSettings() });
    vscode.window.showErrorMessage(`无法更新心情与亲密度设置：${error.message}`);
  }
}

async function updateAppearanceSettings(provider, { scene, outfit }) {
  const allowedScenes = new Set(['office', 'millennium', 'transparent']);
  const allowedOutfits = new Set(['classic', 'pajama']);
  const appearance = vscode.workspace.getConfiguration('yuukaPet.appearance');
  try {
    if (typeof scene === 'string' && allowedScenes.has(scene)) {
      await appearance.update('scene', scene, vscode.ConfigurationTarget.Global);
    }
    if (typeof outfit === 'string' && allowedOutfits.has(outfit)) {
      await appearance.update('outfit', outfit, vscode.ConfigurationTarget.Global);
    }
  } catch (error) {
    provider.post('settings', { settings: getWebviewSettings() });
    vscode.window.showErrorMessage(`无法更新桌宠外观：${error.message}`);
  }
}

function getProductivitySettings() {
  const focus = vscode.workspace.getConfiguration('yuukaPet.focus');
  const reminders = vscode.workspace.getConfiguration('yuukaPet.reminders');
  return {
    durations: {
      focus: focus.get('focusMinutes', 25) * 60000,
      shortBreak: focus.get('shortBreakMinutes', 5) * 60000,
      longBreak: focus.get('longBreakMinutes', 15) * 60000
    },
    longBreakEvery: focus.get('longBreakEvery', 4),
    remindersEnabled: reminders.get('enabled', false),
    hydrationMinutes: reminders.get('hydrationMinutes', 60),
    hourlyReminder: reminders.get('hourly', false),
    quietHoursStart: reminders.get('quietHoursStart', '22:00'),
    quietHoursEnd: reminders.get('quietHoursEnd', '08:00')
  };
}

function registerEditorReactions(context, provider, productivity) {
  const policy = new ReactionPolicy();
  const markActivity = () => policy.markActivity(Date.now());

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(() => {
      const settings = getReactionSettings();
      if (!settings.enabled) return;
      if (policy.noteEdit(Date.now(), settings.typingThresholdMs)) provider.notify('typingReminder');
    }),
    vscode.workspace.onDidSaveTextDocument(() => {
      const settings = getReactionSettings();
      if (!settings.enabled) return;
      if (policy.noteSave(Date.now(), settings.saveCooldownMs)) provider.notify('saved');
    }),
    vscode.window.onDidChangeTextEditorSelection(markActivity),
    vscode.window.onDidChangeWindowState(({ focused }) => {
      if (!focused) return;
      const settings = getReactionSettings();
      if (!settings.enabled) return;
      if (policy.noteFocus(Date.now(), settings.focusCooldownMs)) provider.notify('focus');
    }),
    vscode.tasks.onDidEndTaskProcess(({ exitCode }) => {
      const settings = getReactionSettings();
      if (!settings.enabled || !settings.taskResults || typeof exitCode !== 'number') return;
      provider.notify(exitCode === 0 ? 'taskSucceeded' : 'taskFailed');
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('yuukaPet.relationship')
        || event.affectsConfiguration('yuukaPet.randomEvents')
        || event.affectsConfiguration('yuukaPet.appearance')) {
        provider.post('settings', { settings: getWebviewSettings() });
      }
      if (event.affectsConfiguration('yuukaPet.focus') || event.affectsConfiguration('yuukaPet.reminders')) {
        void productivity.refreshSettings();
      }
    })
  );

  const idleTimer = setInterval(() => {
    const settings = getReactionSettings();
    if (!settings.enabled) return;
    if (policy.checkIdle(Date.now(), settings.idleThresholdMs)) provider.notify('idle');
  }, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(idleTimer) });
}

module.exports = { activate, deactivate };
