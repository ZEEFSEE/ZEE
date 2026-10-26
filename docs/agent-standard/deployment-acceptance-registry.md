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