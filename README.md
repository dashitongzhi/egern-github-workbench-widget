# GitHub Workbench for Egern

GitHub PR 状态和统计小组件，支持两种登录方式：

- 直接填写 `GITHUB_TOKEN`
- 使用内置 OAuth App 的 GitHub Device Flow 登录

## 安装

在 Egern 中添加模块：

```text
https://raw.githubusercontent.com/dashitongzhi/egern-github-workbench-widget/main/GitHubWorkbench.yaml
```

一键添加：

```text
egern:/modules/new?name=GitHub%20Workbench&url=https%3A%2F%2Fraw.githubusercontent.com%2Fdashitongzhi%2Fegern-github-workbench-widget%2Fmain%2FGitHubWorkbench.yaml
```

## 登录方式

### 方式一：Token

在模块环境变量里填 `GITHUB_TOKEN`。私有仓库需要 token 具备读取仓库和 Pull Request 的权限。

### 方式二：GitHub 第三方登录

GitHub 的 Device Flow 不需要 `client_secret`，适合 Egern 这种无浏览器回调的小组件。模块已经内置公开 `Client ID`，默认可以直接使用。

1. 添加模块后先把小组件放到桌面。
2. 小组件会显示一次性 code。
3. 打开 `https://github.com/login/device` 输入 code 授权。
4. 授权完成后，小组件会把 access token 存入 Egern 本地 `ctx.storage`。

如果你想使用自己的 GitHub OAuth App，可以创建 OAuth App、开启 Device Flow，然后把它的 Client ID 填到 `GITHUB_CLIENT_ID` 覆盖默认值。默认内置的公开 Client ID 是 `Ov23licgvm9aj2TFVGhC`。

注意：`https://github.com/login/device` 页面只负责输入 code，不会生成 code。code 是 Egern 小组件调用 GitHub Device Flow 后显示出来的。

## 配置

- `REPOS`: 可选。逗号分隔，例如 `dashitongzhi/MingJian,dashitongzhi/OpenWriting`。不填则统计与你相关的 open PR。
- `OPEN_URL`: 点击小组件打开的页面，默认 `https://github.com/pulls`。
- `CACHE_TTL_MINUTES`: 本地缓存分钟数，默认 5 分钟。多次手动刷新会优先显示缓存，减少 GitHub API 限流。

## 显示内容

- 第一行：累计 Open / Close / Merge 数量
- 第二行：今日 Open / Close / Merge 数量

## 稳定性说明

小组件使用 GitHub GraphQL 一次请求拉取全部计数，并把结果缓存到 Egern 本地 `ctx.storage`。如果 GitHub 短时间限流或网络失败，会显示上一次缓存结果，而不是立刻清掉登录状态。
