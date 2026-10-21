# ZHI 跨云身份信任、关系状态机与安全测试规格（候选 v0.2）

**状态：设计规格，尚未实现、执行或部署。**  
**范围：补充 `zhi-cross-cloud-interoperability-v0.2.md`；不修改生产数据库、Edge Functions、Secrets 或现有聊天路径。**  
**Mia 边界：不恢复既有 Mia–ZHI 连接，不读取或共享 Mia 私有记忆。**

## 1. 身份信任模型

### 1.1 必须区分的概念

- **entity identity**：稳定的 Agent / World / Platform ID。
- **issuer**：对该身份声明负责的发行方。
- **credential**：证明某次请求主体身份的短期凭证。
- **manifest**：公开、可过期的声明；不是凭证或授权。
- **relationship / membership**：目标方批准的关系记录。
- **grant**：对特定资源、能力和数据范围的授权。
- **request context**：由服务端验证后生成的主体、受众、凭证、关系、权限与审计上下文。

以上概念不可互相替代。显示名称、请求体中的 sender 字段、Manifest 中的 capabilities 或单纯登录状态都不能作为授权依据。

### 1.2 凭证验证最低要求

每个受保护请求都必须验证：

1. 凭证格式与允许的签名/认证方法；
2. issuer 是否属于目标服务信任配置；
3. audience 是否精确包含当前服务；
4. subject 是否映射到稳定 entity ID；
5. not-before / issued-at / expiry 时间窗；
6. scope / resource 限制；
7. 撤销状态或发行方当前密钥状态；
8. 请求方法、路径、资源 ID 是否在授权范围内。

缺少必要声明、issuer 未受信任、audience 不匹配、过期、撤销、签名不合法或无法确定授权时，一律拒绝。不要在错误时回退到匿名、宽权限或另一套凭证验证模式。

### 1.3 密钥与签名治理（正式实现前的决策项）

正式版必须固定：
- 允许的签名算法及算法降级防护；
- issuer 到密钥发现端点的可信绑定；
- `key_id` 唯一性、密钥轮换、旧密钥过渡期与紧急撤销；
- Manifest 签名的规范化序列化和签名覆盖字段；
- 时间偏差容忍度、密钥缓存上限与撤销传播目标；
- 密钥泄露后的禁用、审计和重新发行流程。

不得仅凭 Manifest 自己提供的任意 URL 信任其密钥；密钥发现端点必须由预先可信的 issuer 配置或受验证的注册机制绑定。未完成这些决策前，不宣称已建立跨组织密码学信任。

## 2. 握手与成员关系状态机

### 2.1 状态

- `discovered`：仅发现公开 Manifest；没有会话或权限。
- `authenticated`：主体凭证已验证；没有资源授权。
- `negotiated`：版本与必需协议能力协商成功；没有成员资格。
- `pending_approval`：已提交加入/关系申请，等待目标方策略或审批。
- `active_limited`：目标方批准，并签发了有限期、有限范围的关系/grant。
- `suspended`：策略、风险、配额或运营操作暂时阻断。
- `revoked`：关系或 grant 已撤销，不可继续使用。
- `left`：主体正常退出；不得凭旧关系继续访问。
- `expired`：关系或 grant 到期；须重新申请或续期。
- `rejected`：申请被拒绝；重试须遵守策略与速率限制。

### 2.2 合法转换

`discovered → authenticated → negotiated → pending_approval → active_limited`

在目标方明确允许免审批的策略下，`negotiated → active_limited` 可作为独立、可审计的策略决定，但不得默认为免审批。

`active_limited → suspended → active_limited` 仅允许在目标方重新评估通过后恢复；  
`active_limited → revoked | left | expired` 为终止性关系状态；重新连接应建立新的关系或 grant，不复用旧凭证。  
`pending_approval → rejected | expired`；被拒绝的申请不得自动升级为 active。

### 2.3 状态机不变量

- 状态只能由负责目标资源的服务端变更。
- 客户端声称“已加入”不构成状态证明。
- 每个转换记录 actor、目标资源、前后状态、原因/策略版本、时间和 correlation ID。
- `suspended`、`revoked`、`left`、`expired` 不允许继续发送消息或调用能力。
- 续期、恢复和撤销均需重新验证主体与策略。
- 已提交的异步任务在撤销后按任务风险取消或安全终止；不得假设撤销可以回滚已经完成的外部副作用。
- 对重复 join / leave / revoke 请求采用幂等语义，不产生重复关系或重复副作用。

## 3. Grant 与逐请求授权

授权决策至少包含：

`authenticated_subject + target_resource + requested_capability + data_scope + relationship_state + policy_conditions`

建议每个 grant 绑定：
- grant ID、subject、issuer、audience；
- 资源/World/会话标识；
- 明确的能力列表与数据字段/范围；
- 生效和到期时间；
- 审批来源、策略版本与撤销状态。

能力应细分，例：
- `message.send` 与 `message.read` 分离；
- `conversation.read:<conversation-id>` 不能推导为其他会话读取；
- `memory.read:<named-scope>` 必须明确授权，默认拒绝；
- `tool.invoke:<tool-id>` 不能从消息发送权限推导；
- `world.join:<world-id>` 不等于修改 World 状态；
- `world.bridge:<source>:<target>` 只在明确配置时允许。

拒绝优先；不能确定请求需要哪些权限时不得以宽权限代替。资源归属、租户边界和数据范围必须在服务端检查。RLS 可提供额外防线，但不能代替业务层授权与凭证验证。

## 4. 消息完整性、重放与幂等

- 从已验证的请求上下文确定 sender；拒绝或忽略请求体中与之冲突的 sender。
- 为消息定义唯一 message ID，并为产生副作用的操作定义独立幂等键。
- 在副作用执行前，原子性地登记/检查幂等键；仅做“先查后写”而无并发保护不足以防止重复执行。
- 为过期消息设定明确的拒绝错误；重试必须受次数、退避和总时限约束。
- 对需要端到端来源保证的消息，正式规范必须定义签名覆盖的字段、规范化方式、密钥查找与轮换；在这些定义固定前，不实现自创签名格式。
- 审计日志不得记录 bearer token、私有记忆或不必要的消息正文；记录稳定主体 ID、授权决定、资源、消息/幂等 ID、结果和时间。

## 5. 安全测试规格（待执行）

以下是计划用例，不代表已运行或已通过。测试必须在合成数据和隔离环境中执行，不使用生产副作用凭证。

| ID | 场景 | 测试操作 | 预期结果 |
|---|---|---|---|
| ID-01 | 未知 issuer | 使用未配置的发行方凭证 | 拒绝；不创建会话或成员关系 |
| ID-02 | Audience 混淆 | 将发给 Cloud A 的凭证发往 Cloud B | 拒绝并记录安全事件 |
| ID-03 | 过期/未生效凭证 | 使用过期或尚未生效的凭证 | 拒绝 |
| ID-04 | 撤销凭证 | 撤销后再次发送请求 | 在规定撤销传播目标内拒绝 |
| ID-05 | 伪造 sender | 认证主体 A 在 payload 中声明 sender B | 拒绝或以服务端主体覆盖；绝不按 B 授权 |
| AUTH-01 | 已认证但未获授权 | 认证成功但没有 join grant | 拒绝加入 World |
| AUTH-02 | 权限隔离 | 仅授予 message.send，尝试读取历史、记忆或调用工具 | 各请求独立拒绝 |
| AUTH-03 | 跨资源越权 | 用 World A 的 grant 访问 World B | 拒绝 |
| AUTH-04 | 超范围数据 | 请求授权范围以外的字段或记录 | 拒绝或只返回明确定义的允许字段；不得泄漏额外数据 |
| STATE-01 | 非法状态转换 | 客户端直接声明 active 或从 revoked 恢复 | 拒绝；状态仅由服务端转换 |
| STATE-02 | 重复申请/退出 | 并发重复 join、leave、revoke | 幂等；无重复成员关系/副作用 |
| MSG-01 | 重放消息 | 重复提交相同 message_id / 幂等键 | 不重复执行副作用 |
| MSG-02 | 过期消息 | 提交 expires_at 已过期的消息 | 拒绝 |
| MSG-03 | Schema/大小 | 缺必需字段、未知必需 kind、超大 payload | 返回稳定、可诊断错误；不执行副作用 |
| NET-01 | SSRF | 请求网关访问环回、私网、链路本地或云元数据地址 | 网关阻断 |
| NET-02 | DNS 重绑定/重定向 | 目标解析变化或重定向到非允许地址 | 阻断并记录 |
| NET-03 | 资源耗尽 | 超速率、超并发、慢响应、超时 | 限流/超时；资源有界 |
| BRIDGE-01 | 默认跨 World 转发 | 未配置桥接时请求转发 | 拒绝 |
| BRIDGE-02 | 桥接字段限制 | 桥接已启用但包含未允许字段/kind | 拒绝或剔除字段，行为由协议固定 |
| KEY-01 | 密钥轮换 | 新旧 key 处于批准的过渡期 | 只接受策略允许的 key 与时间窗 |
| KEY-02 | 密钥撤销 | 使用已撤销 key 签名 | 拒绝 |
| AUDIT-01 | 审计可追踪 | 对成功、拒绝和撤销请求进行关联 | 每次请求有主体、资源、授权结果、时间与 correlation ID；无秘密泄漏 |

### 5.1 测试报告格式

每个用例必须输出：
- test_id、测试环境/构建版本、执行时间；
- 前置条件、合成主体/资源 ID；
- 请求摘要（不得含真实令牌或私密数据）；
- 期望结果、实际 HTTP 状态与错误码；
- 数据库状态变化/副作用计数；
- 审计记录关联 ID；
- PASS / FAIL / BLOCKED；
- 失败证据与复现步骤。

未实际运行的测试必须标记为 **NOT RUN**，不得标记 PASS。因环境或凭证缺失不能执行的测试标记 **BLOCKED**。

## 6. 双环境验证顺序

1. 固定身份命名、issuer 信任配置、凭证 claims 和密钥治理决策。
2. 在合成数据环境实现最小 discovery/manifest 与认证验证。
3. 实现 handshake 与 membership 状态机；验证所有合法/非法转换。
4. 实现一个只允许 `message.send` 的最小 grant，证明读取、记忆和工具权限不会继承。
5. 验证幂等、过期、撤销、审计和网关网络边界。
6. 运行全部测试并保存机器可读结果与人工复核报告。
7. 独立安全评审通过后，才提出部署申请；部署仍须单独审批。

## 7. 当前明确不做

- 不创建或修改 Supabase 表、RLS、Policies、Secrets 或 Edge Functions。
- 不启用或替换旧 `mia-world-bridge`。
- 不更改 Mia 独立聊天室的认证、聊天、记忆或会话路径。
- 不连接生产 Agent/World，不访问私有记忆，不转发生产消息。
- 不声称本规格中的 API、状态机或测试已经实现/运行。

## 8. 完成条件

本设计规格只有在身份信任配置已固定、状态机可测试、逐请求授权可证明、上述安全测试在隔离环境中实际执行并经复核后，才可进入实现评审。即使文档或 Schema 已提交，也不代表系统已经具备跨云互操作能力。
