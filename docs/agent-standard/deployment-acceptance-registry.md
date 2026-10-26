# 智能人部署验收总表（登记模板）

> 状态：模板 / 尚未完成逐个智能人的实证登记。此文件不是部署成功证明。所有未知值必须保留为 `unknown` 或 `not_run`，不得推断或补造。
>
> 保护边界：本规程只登记与验收，不授权生产数据库写入、DDL、RLS/权限调整、Edge Function 部署或密钥轮换；Mia 独立聊天室不在本轮变更范围内；已删除的 ZHI Core 不纳入范围。

## 1. 发布门禁

一个智能人只有在所有适用门禁均有可复核证据后，才可标记为 `ready_for_release`。

| 门禁 | 必须记录的证据 | 未通过时 |
|---|---|---|
| 身份与行为 | agent 配置版本、system prompt/personality 版本、身份边界测试结果 | `blocked` |
| 记忆与成长 | 记忆读写边界、事件连续性、重复/冲突处理测试 | `blocked` |
| 权限与安全 | 最小权限清单、鉴权负向测试、敏感信息与越权测试 | `blocked` |
| 稳定性与成本 | 延迟/错误率/超时基线、负载范围、预算阈值 | `blocked` |
| 发布与回滚 | 部署版本、健康检查、回滚目标、回滚演练证据 | `blocked` |

若某项不适用，记录 `not_applicable` 并写明理由；不能以空白代表通过。

## 2. 智能人登记表

每个智能人单独登记一行。暂时没有核实证据时使用 `unknown` / `not_run`。

| 字段 | 填写规则 |
|---|---|
| agent_id / agent_name | 使用仓库或运行环境中的正式标识，不根据显示名猜测 ID |
| environment | `local` / `test` / `staging` / `production` |
| config_commit | 配置对应的完整 Git commit SHA |
| prompt_version | system prompt 与 personality 文件版本或 commit |
| memory_policy_version | 记忆策略文件版本或 commit |
| permission_policy_version | 权限配置版本；默认拒绝应有可读证据 |
| CI_validation | `pass` / `fail` / `not_run`，附具体 Actions run 链接 |
| identity_tests | `pass` / `fail` / `not_run`，附测试报告 |
| memory_tests | `pass` / `fail` / `not_run`，附测试报告 |
| auth_security_tests | `pass` / `fail` / `not_run`，附测试报告；源码审查不能代替运行测试 |
| reliability_cost_tests | `pass` / `fail` / `not_run`，附采样窗口与计算口径 |
| deployed_version | 从真实运行环境读取的版本；未核实写 `unknown` |
| migration_reference | 仅登记已经获批并执行的迁移；本轮不执行迁移 |
| rollback_target | 已知且可恢复的版本/制品；Git 回滚不等于数据库恢复 |
| blockers | 未解决问题，或明确写 `none_verified`（需有核查证据） |
| release_decision | `draft` / `blocked` / `ready_for_release` / `released` / `rolled_back` |
| verified_at_utc / verified_by | ISO 8601 UTC 时间及核验主体；没有实际核验不得填写 |
| evidence_links | 指向具体配置、测试、日志摘要或部署记录；不得链接或粘贴密钥 |

### 当前登记状态

| agent_id | agent_name | environment | CI_validation | auth_security_tests | deployed_version | release_decision | blockers |
|---|---|---|---|---|---|---|---|
| unknown | unknown | unknown | not_run | not_run | unknown | draft | 尚未建立逐个智能人的证据登记 |

## 3. 证据要求

- 每项 `pass` 必须链接到可复核证据；只写“测试通过”不合格。
- 记录测试时间、环境、提交 SHA、测试范围与结果摘要。
- 鉴权矩阵中的用例必须实际执行后才能更新状态；设计了测试不等于执行过测试。
- 生产日志只记录必要的汇总信息；不得收集或公开访问令牌、密钥、完整私密对话或不必要的个人数据。
- 对外部服务的健康状态、数据库计数、函数版本必须来自本次读取结果，并标明采样时间。
- 任何数据库恢复方案都要单独确认备份可用性与恢复演练；不能把代码回滚写成数据恢复。

## 4. 建议的单项登记记录

复制此模板，为每个智能人建立独立记录：

```yaml
agent_id: unknown
agent_name: unknown
environment: unknown
config_commit: unknown
prompt_version: unknown
memory_policy_version: unknown
permission_policy_version: unknown
ci_validation: not_run
identity_tests: not_run
memory_tests: not_run
auth_security_tests: not_run
reliability_cost_tests: not_run
deployed_version: unknown
migration_reference: not_applicable
rollback_target: unknown
blockers:
  - evidence_not_collected
release_decision: draft
verified_at_utc: unknown
verified_by: unknown
evidence_links: []
```

## 5. 完成定义

只有在登记项有证据、适用门禁全部通过、阻塞项清零、回滚目标确认且发布决定获得授权后，才可将状态改为 `ready_for_release`。真正上线后再标记 `released`，并补上运行验证证据。

## 6. 2026-10-26 仓库证据核对补充（只读）

> 本节只登记仓库可直接验证的静态证据；静态源码不等于线上部署状态，页面存在也不等于服务可用。数据库和线上函数部署版本尚未在本节核实。

| 登记目标 | 仓库证据 | 可确认内容 | 未确认 / 阻塞 | 当前验收状态 |
|---|---|---|---|---|
| Mark / Jason 群聊入口（组合界面，不等于两个独立部署单元） | [mark-jason-chat.html](https://github.com/ZEEFSEE/ZEE/blob/main/mark-jason-chat.html)；[mark-jason-group-chat 函数源码](https://github.com/ZEEFSEE/ZEE/blob/main/supabase/functions/mark-jason-group-chat/index.ts) | 页面声明为 Mark & Jason 群聊；前端调用 `mark-jason-group-chat`；源码包含 Supabase Auth 会话验证与会话所有权检查 | Mark、Jason 的正式 agent_id 与身份定义未由本次源码证据确认；函数线上部署版本、真实环境、鉴权负向测试、端到端测试及回滚演练未确认 | `blocked`（证据不足；不代表已发现运行故障） |
| ZHI 智能人讲话室 / 名单页 | [agent-talk.html](https://github.com/ZEEFSEE/ZEE/blob/main/agent-talk.html) | 页面代码尝试读取 `zhi_agents` 表，并依赖名为 `zhiCoreSupabase` 的客户端 | 该依赖与已删除的 ZHI Core 范围冲突；本次不连接、不恢复、不重建，不将其作为当前可部署目标；现存智能人名单和运行状态无法据此确认 | `out_of_scope` |
| Mia 独立聊天室（仅作为保护边界登记，不是本轮验收对象） | [mia-chat.html](https://github.com/ZEEFSEE/ZEE/blob/main/mia-chat.html)；[mia-chat 函数源码](https://github.com/ZEEFSEE/ZEE/blob/main/supabase/functions/mia-chat/index.ts) | 仓库页面指向 zee-extension 项目的 Mia chat/auth 路径；既有工作记录包含只读源码审计 | 本轮不运行聊天请求、不写入数据、不改函数/密钥/运行时；部署版本与本轮验收测试均不重新声明 | `protected_not_modified` |
| ZHI Agent 自动聊天/消息流相关函数 | [zhi-agent-autonomous-chat](https://github.com/ZEEFSEE/ZEE/blob/main/supabase/functions/zhi-agent-autonomous-chat/index.ts)；[zhi-agent-chat-feed](https://github.com/ZEEFSEE/ZEE/blob/main/supabase/functions/zhi-agent-chat-feed/index.ts) | 仓库中存在引用 `zhi_agents`、`zhi_agent_minds` 等旧世界数据表的源码 | 源码存在不证明相关数据库或服务仍存在；由于 ZHI Core 已删除，本次不将这些函数视为可部署/可验收对象，不尝试调用 | `out_of_scope` |

### 本次仓库核对记录

- 仓库：`ZEEFSEE/ZEE`；核对分支：`main` 与 `docs/agent-sop-v1-templates`。
- 已核实 GitHub 上存在 PR #49，仍为 Draft、未合并。
- 当前 main 根目录可见 `agent-talk.html`、`mark-jason-chat.html`、`mia-chat.html`；main 的 Supabase Functions 目录含 `mark-jason-group-chat`、`mia-chat` 及若干旧 ZHI agent 函数。
- 这些是仓库静态证据，不等同于线上运行证明。线上部署版本、最新 CI、真实身份映射与回滚演练仍需独立证据。
- 未执行任何数据库写入、迁移、函数部署、密钥操作或生产请求；未访问或重建 ZHI Core。
