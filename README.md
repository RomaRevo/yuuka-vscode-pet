# Yuuka VS Code Pet

独立的早濑优香 VS Code 桌宠扩展，提供像素动画、克制的编辑器联动和本地角色互动，不依赖 VS Code Pets 或 Codex Pets。

## 安装

1. 从 GitHub Releases 下载 `yuuka-vscode-pet-1.3.1.vsix`。
2. 在 VS Code 中运行 `Extensions: Install from VSIX...`。
3. 选择下载的 VSIX，然后运行 `Developer: Reload Window`。

也可以在终端中安装：

```text
code --install-extension yuuka-vscode-pet-1.3.1.vsix
```

当前版本：`1.3.1`。完整变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 使用

安装后点击活动栏中的“优香桌宠”图标，或打开命令面板运行：

- `Yuuka Pet: Show Yuuka`
- `Yuuka Pet: Play with Yuuka`
- `Yuuka Pet: Ask Yuuka to Work`
- `Yuuka Pet: Reset Position`
- `Yuuka Pet: Jump`
- `Yuuka Pet: Think`
- `Yuuka Pet: Celebrate Milestone`
- `Yuuka Pet: Reset Mood and Affinity`

在视图中点击地面可以让优香走到指定位置。点击头部是摸头，点击身体是轻戳；拖动优香可以调整位置。空闲时，鼠标短暂停留后优香才会看向对应方向，普通滑动不会立即让她转身。

进入“工作”后，优香会以正常表情留在原位持续处理电脑；此时点击地面或优香只会让她短暂露出生气表情，不会移动或打断工作。点击“互动”按钮或“复位”可退出工作状态。

## VS Code 联动

- 保存文件时低频确认，不读取文件名或内容。
- 连续输入达到设定时长后提醒休息。
- 编辑器空闲或窗口重新获得焦点时提供克制反馈。
- 根据 VS Code Task 提供的退出码反馈成功或失败，不读取终端输出。
- Git/阶段目标只通过 `Celebrate Milestone` 命令显式庆祝，不读取或修改 Git。

可在 VS Code Settings 中搜索 `Yuuka VS Code Pet` 调整联动冷却、提醒时长、空闲时长、任务反馈、随机事件频率和心情系统开关。

心情和亲密度仅影响低频台词与互动/空闲动作，保存在本机 Webview 状态中；可关闭或通过 `Reset Mood and Affinity` 清零。

## 设置

在 VS Code Settings 中搜索 `Yuuka VS Code Pet`，可以调整：

- 编辑器联动总开关
- 保存、连续输入、空闲和重新聚焦的反馈频率
- VS Code Task 结果反馈
- 随机事件频率
- 心情与亲密度开关

## 隐私

扩展不访问网络，不读取项目文件内容、文件名、终端文本或 Git 提交内容，不收集或上传数据，也不会自动执行任务、提交或 Git 操作。

详细说明见 [PRIVACY.md](PRIVACY.md)。

## 本地开发

扩展没有运行时第三方依赖。验证和构建命令：

```text
npm run check
python build_vsix.py
```

## 免责声明

这是非官方同人项目，与《碧蓝档案》的开发商、发行商及相关权利方没有隶属或合作关系。角色名称、设定和相关知识产权归其各自权利方所有。本仓库不授予对相关角色素材进行再分发或商业使用的权利。
