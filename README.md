# 咖屋 · CoffeeRoom

给家人朋友用的咖啡小程序：记配方、按分类点单、管咖啡豆。

## 功能

| 模块 | 说明 |
|------|------|
| **点单** | 按分类标签（浓缩/奶咖/手冲/冷饮/特调/其他）浏览配方，加减杯数，填写「给谁做」和备注后提交，写入点单记录 |
| **配方** | 记录咖啡豆用量、粉水比、器具、研磨度、水温、萃取时间、分步骤做法、自定义标签；支持设「常喝」 |
| **咖啡豆** | 产地/处理法/烘焙度、养豆期与保质期自动计算、余量百分比、风味标签、临期与过期提醒 |
| **记录** | 点单历史（可标记完成/删除）、本月与累计杯数、数据模式查看 |

### 养豆 / 保质期时间轴

从烘焙日起算，三个节点可自定义（默认 7 / 45 / 90 天）：

```
0 ─── 养豆期 7 天 ─── 最佳风味到 45 天 ─── 衰退到 90 天 ─── 已过保质期
      蓝色「养豆中」        绿色「最佳风味」      橙色「风味衰退」      红色「已过保质期」
```

## 运行

1. 用**微信开发者工具**打开本项目目录（`F:\CoffeeRoom`）
2. 填入自己的 AppID（`project.config.json` 里 `appid` 现在是 `touristappid`）

### 本地模式（零配置，先跑通界面）

`app.js` 里 `ENV_ID` 留空即可，数据存在手机本地 Storage：
- 打开「记录」页 → 点「示例数据」，会灌入 2 支豆 + 5 个配方

### 云开发模式（家人共享）

当前项目已配置：

| 项 | 值 |
|---|---|
| AppID | `wxaa402d1ea6ebb696` |
| 云环境 ID | `cloud1-d9gprhrt7893ab698`（已写入 `app.js` 的 `ENV_ID`） |

三个集合（`recipes` / `beans` / `orders`）由云函数 **`initDb`** 自动创建，
无需手动新建——在「记录」页点「示例数据」时会先调用它建集合，再灌入示例数据。
（`cloudfunctions/initDb/index.js`，已部署到云端）

**剩下唯一要手动做的一步：改集合权限**

云开发控制台 → 数据库 → 分别点开 `recipes`、`beans`、`orders` →
「权限设置」→ 选**自定义安全规则**，填：

```json
{ "read": "true", "write": "true" }
```

> ⚠️ 两个注意点：
> 1. 基础权限只有 4 种预设（**没有"所有用户可读写"**），想让家人共享编辑必须用「自定义安全规则」。
> 2. 规则值要写成**字符串** `"true"`。写布尔 `true` 会被拒绝，报 `InvalidParameter, rule invalid`。
>
> 若只在自己设备用，选预设的「仅创建者可读写」即可，不用自定义。

改完后「记录」页点「重新检测」，应显示「云开发数据库（家人可共享）」。

### 命令行（需先在 IDE 里开启：设置 → 安全设置 → 服务端口）

```bash
cd "C:\Program Files (x86)\Tencent\微信web开发者工具"

cli.bat islogin                                   # 检查登录
cli.bat cloud env list --project F:\CoffeeRoom    # 查云环境
cli.bat preview --project F:\CoffeeRoom -f image -o qr.png   # 编译 + 生成预览二维码
cli.bat cloud functions deploy -e cloud1-d9gprhrt7893ab698 -n initDb --project F:\CoffeeRoom
```

## 目录结构

```
app.js / app.json / app.wxss      全局配置与主题变量
utils/
  constants.js                    分类、器具、烘焙度等枚举
  util.js                         日期计算、养豆状态、粉水比
  store.js                        统一数据层（云开发 ↔ 本地自动切换）
  seed.js                         示例数据
pages/
  order/                          点单（分类标签 + 购物车 + 下单弹层）
  recipe/ recipe-edit/            配方列表与编辑
  bean/   bean-edit/              咖啡豆管理与编辑
  record/                         点单历史与数据设置
```

## 数据层说明

`utils/store.js` 对外只暴露 `recipes / beans / orders` 三个对象的
`list / get / add / update / remove`，内部自动判断用云数据库还是本地 Storage：

- 云模式：一次性翻页取回（小程序端单次 `get` 上限 20 条），在内存里过滤排序，避开 `where + orderBy` 的索引问题
- 云环境不可用（未填 ID、未开通、无权限）时自动降级本地，功能照常可用

## 已知限制

- 图片上传仅在云模式下会落到云存储；本地模式保存的是临时路径，重启后失效
- 配方与咖啡豆是「记名字 + 记 ID」的软关联，删除咖啡豆不会自动清掉配方上的引用
- 点单不扣减咖啡豆余量（如需联动可在 `pages/order/order.js` 的 `onSubmit` 里加扣减逻辑）
