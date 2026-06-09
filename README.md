# 合同续约追踪服务 (Contract Renewal Tracker)

基于 **Node.js + Express + SQLite** 的合同续约追踪后端服务，专为中小团队设计，提供合同台账管理、续约提醒、负责人跟进状态追踪等核心功能。

---

## 功能特性

- 📋 **合同台账管理**：合同的增删改查，支持多条件筛选和分页
- 🔔 **智能续约提醒**：自动为每份合同生成 90/60/30/14/7 天 5 级提醒，支持手动创建提醒和状态流转
- 📝 **跟进记录追踪**：记录每次跟进的方式、结果、下次跟进时间，支持待办跟进汇总
- 👥 **负责人工作负载**：按负责人统计合同数、到期合同、待处理提醒、待跟进等
- 📊 **Dashboard 仪表盘**：到期预警分级统计、时间线、到期合同明细
- 🔍 **强大筛选体验**：按到期时间、负责人、状态、客户名称、合同类型、剩余天数等多维度筛选
- 📱 **RESTful API**：统一的响应格式，完整的参数校验和错误处理

---

## 快速开始

### 环境要求
- Node.js >= 18
- npm

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 初始化数据库（创建表结构）
npm run init-db

# 3. 填充示例数据（可选，包含7条合同及提醒）
npm run seed

# 4. 启动服务
npm start

# 开发模式（带热重载）
npm run dev
```

服务默认启动在 `http://localhost:3000`

> 💡 **首次启动**：如果数据库文件不存在，服务会自动创建表结构，无需手动执行 `init-db`。

### 环境变量配置

编辑 `.env` 文件：

```
PORT=3000                 # 服务端口
DB_PATH=./db/contracts.db # SQLite 数据库文件路径
NODE_ENV=development      # 运行环境
```

---

## 项目结构

```
27-contract-renewal-tracker/
├── src/
│   ├── server.js                 # 服务入口
│   ├── middleware/
│   │   ├── errorHandler.js       # 错误处理 & 异步包装
│   │   └── validator.js          # 参数校验中间件
│   ├── routes/
│   │   ├── contracts.js          # 合同相关路由
│   │   ├── reminders.js          # 续约提醒路由
│   │   ├── followups.js          # 跟进记录路由
│   │   └── dashboard.js          # Dashboard 路由
│   └── controllers/
│       ├── contractController.js # 合同业务逻辑
│       ├── reminderController.js # 提醒业务逻辑
│       ├── followUpController.js # 跟进业务逻辑
│       └── dashboardController.js# 仪表盘业务逻辑
├── db/
│   ├── config.js                 # 数据库连接 & Promise 包装
│   ├── init.js                   # 建表脚本
│   └── seed.js                   # 示例数据脚本
├── package.json
└── .env
```

---

## 数据模型

### contracts（合同表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| contract_no | TEXT | 合同编号（唯一） |
| customer_name | TEXT | 客户名称 |
| contract_type | TEXT | 合同类型（年度服务/采购/SaaS订阅等） |
| amount | REAL | 合同金额 |
| sign_date / start_date / end_date | TEXT | 签署/开始/结束日期（YYYY-MM-DD） |
| owner_name / email / phone | TEXT | 负责人信息 |
| status | TEXT | active/expired/terminated/renewed |
| description | TEXT | 描述 |
| created_at / updated_at | TEXT | 自动时间戳 |

### renewal_reminders（续约提醒表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| contract_id | INTEGER | 关联合同 |
| remind_date | TEXT | 提醒日期 |
| days_before_expiry | INTEGER | 到期前多少天（90/60/30/14/7） |
| status | TEXT | pending/notified/in_progress/resolved/ignored |
| priority | TEXT | critical/high/medium/normal/low |
| message | TEXT | 提醒内容 |

### follow_ups（跟进记录表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| contract_id / reminder_id | INTEGER | 关联合同/提醒 |
| owner_name | TEXT | 跟进负责人 |
| action | TEXT | 跟进方式（电话/邮件/拜访等） |
| result | TEXT | 跟进结果 |
| next_follow_date | TEXT | 下次跟进日期 |
| follow_date | TEXT | 本次跟进时间（默认当前时间） |

---

## API 列表

统一响应格式：
```json
{ "success": true, "data": {...}, "message": "..." }
```
失败格式：
```json
{ "error": true, "message": "错误说明", "code": "ERROR_CODE" }
```

### 🔗 基础接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 服务健康检查 |

---

### 📋 合同台账 `/api/contracts`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/contracts` | 合同列表（支持筛选、分页、排序） |
| GET | `/api/contracts/:id` | 合同详情（含提醒和跟进记录） |
| POST | `/api/contracts` | 创建合同（自动生成5级续约提醒） |
| PUT | `/api/contracts/:id` | 更新合同（修改结束日期会重新生成提醒） |
| DELETE | `/api/contracts/:id` | 删除合同（级联删除提醒和跟进） |
| GET | `/api/contracts/stats` | 统计概览（总数/到期分级/按负责人/按类型） |
| GET | `/api/contracts/owners` | 负责人下拉列表 |
| GET | `/api/contracts/types` | 合同类型下拉列表 |

**列表筛选参数**：

| 参数 | 示例 | 说明 |
|------|------|------|
| `keyword` | `?keyword=北京` | 客户名称/合同编号/描述模糊搜索 |
| `status` | `?status=active` | 合同状态 |
| `owner_name` | `?owner_name=张三` | 按负责人筛选 |
| `contract_type` | `?contract_type=年度服务` | 按合同类型筛选 |
| `expiry_status` | `?expiry_status=critical` | 到期状态：critical(≤7天)/warning(≤30天)/attention(≤90天)/normal/expired |
| `days_from` `days_to` | `?days_from=0&days_to=30` | 剩余天数范围 |
| `date_from` `date_to` | `?date_from=2025-01-01` | 到期日期范围 |
| `sort_by` `sort_order` | `?sort_by=end_date&sort_order=asc` | 排序字段和顺序 |
| `page` `page_size` | `?page=1&page_size=20` | 分页 |

---

### 🔔 续约提醒 `/api/reminders`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/reminders` | 提醒列表（筛选+分页） |
| GET | `/api/reminders/upcoming` | 即将到期提醒（按优先级分组） |
| GET | `/api/reminders/:id` | 提醒详情（含关联跟进记录） |
| POST | `/api/reminders` | 手动创建提醒 |
| PUT | `/api/reminders/:id` | 更新提醒信息 |
| PATCH | `/api/reminders/:id/status` | 标记提醒状态（状态流转时可添加备注自动生成跟进记录） |
| DELETE | `/api/reminders/:id` | 删除提醒 |

**列表筛选参数**：`status`, `priority`, `contract_id`, `owner_name`, `date_from`, `date_to`, `sort_by`, `sort_order`, `page`, `page_size`

**即将到期提醒参数**：
- `days`: 未来 N 天内，默认 30
- `owner_name`: 按负责人过滤

**标记状态请求体**：
```json
{ "status": "in_progress", "note": "备注内容，状态为in_progress时自动写入跟进记录" }
```

---

### 📝 跟进记录 `/api/followups`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/followups` | 跟进列表（筛选+分页） |
| GET | `/api/followups/pending` | 待办跟进（逾期/今日/即将分组） |
| GET | `/api/followups/:id` | 跟进详情 |
| POST | `/api/followups` | 创建跟进（关联提醒时自动将提醒置为进行中） |
| PUT | `/api/followups/:id` | 更新跟进 |
| DELETE | `/api/followups/:id` | 删除跟进 |

**列表筛选参数**：`contract_id`, `reminder_id`, `owner_name`, `date_from`, `date_to`, `has_next=true/false`, `sort_by`, `sort_order`, `page`, `page_size`

**待办跟进参数**：`owner_name` 过滤负责人

**创建跟进请求体**：
```json
{
  "contract_id": 1,
  "reminder_id": 5,
  "owner_name": "张三",
  "action": "电话沟通",
  "result": "客户有续约意愿",
  "next_follow_date": "2026-06-15",
  "follow_date": "2026-06-10"
}
```

---

### 📊 Dashboard 仪表盘 `/api/dashboard`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dashboard/overview` | 总览卡片数据（合同/到期/提醒/跟进全局统计） |
| GET | `/api/dashboard/expiring` | 即将到期合同明细（按优先级分组+金额统计） |
| GET | `/api/dashboard/workload` | 负责人工作负载排名（到期压力排序） |
| GET | `/api/dashboard/timeline` | 全局时间线（合同+提醒+跟进混合，最近事件） |

**即将到期合同参数**：`days=N`（默认30天内）

**时间线参数**：`limit=N`（默认50条）

---

## 使用示例

### 1. 查看 7 天内紧急到期的合同
```bash
curl "http://localhost:3000/api/contracts?expiry_status=critical"
```

### 2. 查看张三负责的所有合同
```bash
curl "http://localhost:3000/api/contracts?owner_name=%E5%BC%A0%E4%B8%89"
```

### 3. 获取未来 30 天的待办跟进
```bash
curl "http://localhost:3000/api/followups/pending"
```

### 4. 创建跟进记录
```bash
curl -X POST http://localhost:3000/api/followups \
  -H "Content-Type: application/json" \
  -d '{
    "contract_id": 1,
    "owner_name": "张三",
    "action": "上门拜访",
    "result": "客户确认续约，待走内部流程",
    "next_follow_date": "2026-06-20"
  }'
```

### 5. 将提醒标记为已解决
```bash
curl -X PATCH http://localhost:3000/api/reminders/5/status \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved"}'
```

---

## 到期预警规则

每份合同在创建/修改结束日期时，会自动生成 5 级提前预警：

| 提前天数 | 优先级 | 默认状态 | 用途 |
|---------|--------|---------|------|
| 90 天 | normal | notified | 提前规划续约事宜 |
| 60 天 | medium | notified | 初步沟通续约意向 |
| 30 天 | high | pending | 正式启动续约谈判 |
| 14 天 | critical | pending | 加快进度 |
| 7 天  | critical | pending | 必须立即处理 |

`days_remaining` ≤ 7 → `critical`（红色）
`days_remaining` ≤ 30 → `warning`（橙色）
`days_remaining` ≤ 90 → `attention`（黄色）
其他 → `normal`（绿色）
已过期 → `expired`

---

## 常用脚本

```bash
npm start       # 生产模式启动
npm run dev     # 开发模式（nodemon 热重载）
npm run init-db # 初始化数据库表结构
npm run seed    # 填充示例数据（先执行 init-db）
```
