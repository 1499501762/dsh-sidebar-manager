# dsh-sidebar-manager

把 DSH 的**左侧边栏**和**对话顶栏**当成一棵可编辑的菜单来管理：排序、分组、换图标、隐藏、拖拽，
外加一个给 Agent 用的 `window.__dshSidebarManager` 接口。

A menu editor for the DeepSeek Harness **sidebar** and **conversation top bar**:
reorder, group, custom icons, hide, drag & drop — plus a small window API an agent can drive.

---

## 它解决什么

- **侧边栏被撑爆**：DSH 的左侧栏是定高 flex 列，中间那截（工作区/会话树）是 `flex:1; min-height:0`，
  上面的入口一多，会话树就被压成 0px 消失了。本插件给它留一个保底高度（默认窗口的一半，可在设置里改）。
- **入口没法整理**：全局面板、插件快捷入口、底部动作挤在一起，没法排序、分组、隐藏。
- **顶栏太杂**：智能体团队、创造模式、撤销/快照…用不上也藏不掉。
- **想换个图标**：每个条目、每个分组都可以换（24 个内置线性图标 / 粘贴 SVG / 上传图片）。

## 安装

```sh
dsh plugin --profile web add github:1499501762/dsh-sidebar-manager
```

装完重启 `dsh web`，然后在 **设置 → 侧边栏/顶栏管理** 里调整。

要求：DSH Web **0.1.7 及以上**。插件对用到的一切都是"有就接、没有就空转"——
宿主没有对应 slot 时相关卡片自动消失，不会报错。

## 功能

| 区域 | 能力 |
| --- | --- |
| 侧边栏条目 | 上移/下移、拖拽排序、归入分组、隐藏、换图标 |
| 分组 | 新建、重命名、自定义图标、向右展开的悬浮二级菜单、展开查看子项、子项拖进拖出 |
| 顶栏 | 同样的排序/分组/隐藏；分组渲染成 `▤ 名称 N ▾` 按钮，**向下**展开 |
| 工作区高度 | 保底高度设置（默认 `50vh`，可填 px，超限自动收敛） |
| 跨区搬移（实验） | 侧边栏入口 ↔ 顶栏组件互换位置，走代理：点击/悬浮/右键/中键全部转发 |
| Agent | `window.__dshSidebarManager`（entries / state / move / addGroup / setEntryIcon / reset…） |

## Agent 接口

```js
__dshSidebarManager.entries()                       // [{key,label,kind,pool}]
__dshSidebarManager.state()                         // {sidebar, header, config, aggressive}
__dshSidebarManager.move(key, {pool, groupId, index})
__dshSidebarManager.addGroup('sidebar', '常用', 'svg:folder')
__dshSidebarManager.setEntryIcon('panel:ssh', 'svg:shield')
__dshSidebarManager.setHidden(key, true)            // false 恢复
__dshSidebarManager.reset()
```

配套技能 `sidebar-manager`，装了本插件后 Agent 可以自己整理侧边栏。

## 排查

```js
__dshSidebarManager.diagnostics()   // 老插件桥接健康度：{label, elementConnected, registered}
__dshSidebarManager.bridge()        // {slotContext, adopted, retryAt}
```

## 反馈

- 有 bug 或想法 → [Issues](https://github.com/1499501762/dsh-sidebar-manager/issues)（附上 DSH 版本 + `diagnostics()` 输出最快）
- 闲聊 / 展示你的整理方案 → [Discussions](https://github.com/1499501762/dsh-sidebar-manager/discussions)

## License

[MIT](LICENSE)

---

# dsh-sidebar-manager

左侧边栏管理器：**修布局** + **把老插件提升成全局面板** + **像管理右键菜单那样调整侧边栏**（排序 / 分组 / 显示状态）。

## 更多技术细节

见 [docs/internals.md](docs/internals.md)。
