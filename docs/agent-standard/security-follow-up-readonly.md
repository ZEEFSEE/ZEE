# 安全与性能复核清单（只读）— 2026-10-26

> 本文件仅记录观测和后续审查步骤。不是数据库变更授权，也不是生产修复脚本。

## 1. 本轮复核范围

- Supabase 项目：`zee-extension`
- Project Reference：`dbooikzqprnqbgpfwsze`
- 只读查询与 Advisors 观测时间：约 2026-10-26 00:05 UTC
- 未执行 DDL、DML、权限变更、索引变更、函数部署或生产写入。

## 2. 表权限与 RLS 观察

对以下三张表查询了 `pg_class`、`pg_policies` 和 `information_schema.role_table_grants`：

| 表 | RLS | FORCE RLS | Policy 数 | anon/authenticated 表级权限 |
|---|---|---|---:|---|
| `mia_exploration_runs` | enabled | false | 0 | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `mia_virtual_spaces` | enabled | false | 0 | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `mia_world_action_audit` | enabled | false | 0 | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |

只读 grants 查询也显示 `service_role` 在这三张表上拥有相同列出的表级权限。

### 风险解释

- 没有 RLS policy 时，RLS 对通过常规受策略约束的角色发起的行访问通常采取默认拒绝；但这不等于“整套系统已经证明安全”。
- 表级 grants 仍然很宽，特别是 `TRUNCATE`、`TRIGGER` 和写权限；应确认这些 grants 是否是预期配置，以及是否存在绕过 RLS 的函数、视图或其他访问路径。
- `service_role` 通常绕过 RLS。其权限应仅在可信服务端使用，绝不能暴露在浏览器或客户端。
- `FORCE RLS=false` 是一个需要结合表所有者、执行角色和访问路径审查的事实，不可单独推断漏洞已被利用。
- 本次没有做匿名 API 写入/读取探测，以免触碰 Mia 独立聊天室或改变生产状态。

### 建议的后续只读验证

1. 审查相关 Edge Functions 是否仅在服务端持有高权限凭据。
2. 审查调用者认证、目标身份/行归属校验、参数校验与错误处理。
3. 逐一确认三张表是否真的需要给 `anon` 或 `authenticated` 任何表级权限。
4. 在获得单独授权后，先于隔离环境验证最小权限方案，再提交单独 migration PR。
5. 不要为了消除 Advisor 的 INFO 告警而添加宽泛的 `USING (true)` 或 `WITH CHECK (true)` 策略。

参考：
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/postgres/row-level-security

## 3. Performance Advisor 观察

- 6 项未覆盖索引的外键提示；涉及 `mia_evolution_candidate_events`、`mia_evolution_candidates`、`mia_evolution_rollback_events`、`mia_exploration_runs`、`mia_growth_state_versions` 和 `zhi_world_builder_proposals`。
- 9 项未使用索引提示；观测包括 Mia 成长/回滚/审计表，以及现有 ZHI 相关 archive/ledger/proposals 表。

这些是平台 Advisor 的信息级提示，不是必须立即执行的变更。创建索引会消耗空间并影响写入；删除索引可能损害低频管理、审计或回滚查询。任何索引改动都应先查真实查询计划、索引定义、工作负载和观测周期，并单独审核。

## 4. Mia 聊天日志观察

对 `mia-chat` 函数在 UTC 窗口 `2026-10-25T00:00:00Z` 至 `2026-10-26T00:00:00Z` 的边缘日志做状态码汇总：

- 200：1,297
- 502：7
- 401：2

只读取了聚合状态码，没有读取消息正文或秘密。当前数据不足以确定 502 根因；401 也可能是正常的未认证/过期会话请求。不得据此宣称故障已修复或系统整体健康。

## 5. 严格保护范围

- 不触碰或恢复已删除的 ZHI Core。
- 不修改 Mia 独立聊天室的数据库、数据、密钥、聊天/auth 函数、部署版本或运行配置。
- 不修改任何 Supabase 权限、RLS policy、索引或 migration。
- 任何生产修复都需要单独审批，并先有测试环境验证与回滚计划。
