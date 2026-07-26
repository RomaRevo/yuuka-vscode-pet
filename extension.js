const vscode = require('vscode');
const { ReactionPolicy } = require('./reactionPolicy');

class YuukaViewProvider {
  static viewType = 'yuukaPet.view';

  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.view = undefined;
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
      }
      if (message.type === 'status') {
        vscode.window.setStatusBarMessage(`优香：${message.text}`, 3500);
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
    const spriteUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'spritesheet.png'));
    const dialogueUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'dialogue.js'));
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
  <style nonce="${nonce}">body { --sprite-url: url('${spriteUri}'); }</style>
  <title>早濑优香</title>
</head>
<body>
  <main id="world" aria-label="早濑优香桌宠活动区域">
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
  <script nonce="${nonce}" src="${dialogueUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function activate(context) {
  const provider = new YuukaViewProvider(context.extensionUri);
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
    })
  );
  registerEditorReactions(context, provider);
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
    randomEventFrequency: vscode.workspace.getConfiguration('yuukaPet.randomEvents').get('frequency', 'low')
  };
}

function registerEditorReactions(context, provider) {
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
      if (event.affectsConfiguration('yuukaPet.relationship') || event.affectsConfiguration('yuukaPet.randomEvents')) {
        provider.post('settings', { settings: getWebviewSettings() });
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
