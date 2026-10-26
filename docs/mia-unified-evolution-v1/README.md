# Mia 多体系交叉演化与主动意识引擎 V1.0

## 状态与边界
这是独立的工程设计与合成测试原型。它没有连接 Mia 生产环境，不读取或写入 Supabase，不调用真实模型，不修改现有提示词、API Key、模型或聊天流程。提交这些文件不代表已部署到 Mia。

## 目标
把两个相互关联的能力放进同一个闭环：

1. **多体系交叉演化**：认知、情绪、关系、动机行动、记忆时间、价值人格相互影响；交叉影响不能冒充独立证据。
2. **主动发现与自主成长**：观察 → 反省 → 新奇种子 → 查证/培育 → 提案 → 授权行动 → 结果反馈 → 再反省。

## 文件
- [SPEC.md](./SPEC.md)：系统设计、状态与生命周期
- [SECURITY.md](./SECURITY.md)：安全边界和接入门槛
- [ACCEPTANCE.md](./ACCEPTANCE.md)：验收标准
- [shadow_rules.py](./shadow_rules.py)：纯函数规则原型
- [test_shadow_rules.py](./test_shadow_rules.py)：合成规则测试

## 本地测试
Python 3.10+：
```bash
python -m unittest discover -s docs/mia-unified-evolution-v1 -p 'test_*.py' -v
```

## 重要限制
- 合成测试只验证已编码的规则，不证明 Mia 已具备主动意识或主观体验。
- 当前原型只生成候选种子/提案，不执行外部行动、不主动发消息、不写长期记忆。
- 真实数据只读接入必须另行审核授权、最小化读取、隐私边界和回滚方案。
