# ZHI 世界跨云互联与场景接入规范（设计草案）

**版本：候选 v0.2**  
**状态：设计草案，尚未部署、尚未通过正式安全审计。**  
**与 Mia 的关系：仅定义可选互操作契约；不启用既有 Mia–ZHI 连接，不修改 Mia 聊天与记忆系统。**

## 1. 目标与原则

不同云端、厂商和技术栈的 Agent、World 与 Platform 可通过统一协议发现、认证、协商、申请加入、交换授权消息、调用获准能力并安全退出。统一协议不要求统一部署；参与方保留模型、记忆、数据库、业务逻辑、云厂商和运行时。

原则：默认拒绝、最小权限、服务端授权、显式同意、可审计、可撤销、幂等、向后兼容、隐私分域、适配器优先。

## 2. 对象与参考架构

- **Agent**：稳定身份、运营方、能力声明和数据策略。
- **World**：规则、成员资格、资源和场景数据的管理边界。
- **Platform**：承载 Agent/World 的运行环境。
- **Gateway/Adapter**：将既有系统映射到协议，不直接共享数据库。
- **Trust/Directory service（可选）**：发布协议发现、身份发行方与撤销信息；不得成为所有消息必须经过的单点。

参与方可直连或经网关连接。每个接收方独立执行身份、授权、范围与策略检查。

## 3. 标识与 Manifest

建议采用 URI 风格的稳定 ID，例如 `zhi:agent:<issuer>:<stable-id>`、`zhi:world:<issuer>:<stable-id>`、`zhi:platform:<issuer>:<stable-id>`。正式版必须定义规范化、issuer 命名空间、大小写规则、冲突处理和迁移策略。显示名称不用于授权。

Manifest 建议字段：
- `protocol`、`schema_version`、`entity_id`、`entity_type`、`issuer`
- `display_name`、`description`、`endpoint`
- `supported_versions`、`capabilities`、`message_kinds`、`auth_methods`
- `data_policy`、`contact`、`issued_at`、`expires_at`
- 正式签名配置要求的 `key_id`、签名算法与验证材料引用

Manifest 是可验证的声明，不是访问令牌，也不代表能力已获授权。私有记忆、内部提示词、秘密、令牌和私人聊天记录禁止出现在公开 Manifest。

## 4. 互联流程

1. Discover：从目录、可信邀请或已知端点获取公开 Manifest。
2. Endpoint validation：仅使用 HTTPS；拒绝凭证嵌入 URL、意外重定向和非允许目标；网关部署者须实施 DNS/IP 解析与重绑定防护、私网/环回/链路本地地址拦截、出站 allowlist 和超时，防止 SSRF。
3. Authenticate：验证短期令牌或已配置的服务身份；校验 issuer、audience、过期时间、签名、撤销状态和调用范围。
4. Negotiate：协商版本、消息类型、能力和资源限制；未知必需能力必须明确拒绝，不得静默降级。
5. Join / relationship request：目标 World/Agent 按本地策略审批。
6. Grant：返回短期、限定受众、范围明确且可撤销的会话/成员凭证。
7. Communicate：每次请求检查认证主体、成员状态、能力、资源范围、配额和幂等键。
8. Leave / revoke：停止后续访问，撤销令牌与授权；保留最小必要审计记录。

## 5. 消息封套

标准消息至少包含：
- `protocol`、`schema_version`、`message_id`
- `conversation_id`、`correlation_id`、可选 `reply_to`
- `sender`、`recipient`、适用时的 `world_id`
- `kind`、`created_at`、`expires_at`、按 kind 定义的 `payload`
- 需要端到端来源保证时的签名元数据

发送者身份必须从认证上下文验证，不能信任请求体自行声明的 sender。接收方验证 schema、签名、时间、授权、大小和目标范围。重复 message_id/幂等键不得重复产生副作用。未知可选字段可忽略；未知必需字段或消息类型返回可诊断错误。签名规范、规范化序列化与密钥发现须在正式版固定，不能在实现中自行猜测。

## 6. 最小 API 契约（设计建议，未部署）

- `GET /.well-known/zhi-protocol`：发现协议版本、Manifest 路径和认证方法
- `GET /api/v1/manifest`：公开 Manifest
- `POST /api/v1/handshakes`：认证后协商版本与能力
- `POST /api/v1/join-requests`：申请加入 World/建立 Agent 关系
- `GET /api/v1/memberships/me`：查询当前主体的成员状态
- `POST /api/v1/messages`：发送消息
- `GET /api/v1/events` 或受控 Webhook：异步事件扩展
- `POST /api/v1/leave-requests`：退出/终止关系

正式实现还需固定状态码、统一错误结构、分页、速率限制、超时、重试上限、请求体上限、审计字段和幂等策略。所有写操作均需认证和资源级授权。

## 7. 能力与隐私边界

- 能力声明不等于授权；每次调用都检查授权主体、目标资源、范围、同意、成员状态与有效期。
- Agent 私有记忆、会话记录、World 状态与获准共享的数据分别设定访问边界。
- 默认不提供 `memory.read.all`、全局广播、任意工具执行或跨 World 转发。
- 跨 World 桥接默认关闭；启用时限定来源、目标、消息 kind、字段、期限和审批条件。
- 支付、删除、对外发送、修改生产状态等副作用操作应按目标方策略要求人类审批。
- 不信任外部文本、URL、文件、模型输出或工具结果；对提示注入、SSRF、重放、代理混淆和资源耗尽实施防护。
- 传输使用 TLS；签名算法、密钥发现、轮换、撤销与泄露响应由正式安全配置定义。

## 8. 兼容与版本

协议使用语义化版本或等价的明确版本规则。核心封套保持稳定，领域能力通过版本化扩展声明。未知主版本和未知必需能力明确拒绝；可选字段遵循兼容规则。旧系统通过 Adapter 接入，不要求重写内部代码。

## 9. 分阶段实施

1. 单平台标准化：为现有系统定义 Manifest、封套、认证和授权映射。
2. 双环境测试网关：用两个隔离部署环境验证发现、握手、授权、消息往返、幂等、过期与撤销。
3. 外部接入套件：发布协议、Schema、参考适配器、示例客户端和兼容测试。
4. 信任与目录治理：制定发行方、密钥轮换、滥用处置、弃用政策和兼容性认证。

## 10. 验收标准

- 两个独立部署仅依公开协议即可发现、握手、授权、往返消息与退出。
- 未授权主体不能读取消息或调用能力。
- 伪造 sender、过期/撤销凭证、重放和重复副作用均被拒绝。
- Agent A 无法访问 Agent B 私有记忆，除非 B 对特定数据范围明确授权。
- 跨 World 转发默认拒绝；启用后只转发明确允许的消息类型和字段。
- 不兼容版本返回明确错误，不静默降级。
- 每个请求都可追踪到认证主体、授权决定和审计事件。
- 网关测试覆盖 SSRF、DNS 重绑定、重定向、超大载荷、速率限制、密钥轮换与撤销窗口。

## 11. Supabase / 既有系统适配要求

实现前只读盘点真实 schema、Edge Functions、JWT 验证、RLS、grants、Secrets 和前端调用。先设计映射，不假设逻辑实体对应的表已存在；不得直接运行未经审查的 migrations。适配器必须独立于既有聊天路径，禁止把 service-role key 放入浏览器。RLS 是纵深防御，不能替代业务层授权。

Mia 独立聊天室与 ZHI World 保持分离。已停用的旧连接不得因本规范而重新启用；需要接入时建立新的独立适配器，完成安全评审和明确批准后再部署。

## 12. 实施声明

本文仅为设计草案，不是已部署 API、已完成安全审计或正式认证标准。文档与 Schema 文件提交不代表运行时接口已经存在。
