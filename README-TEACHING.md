# Simewu 原版内置教学扩展

打开 index.html 后即为原版 Blockchain Simulator v1.2。顶部 File / Network / Topology / Display 菜单、节点列表、JSON 编辑器、拓扑、Time Plot、矿工统计表与 Blockchain Explorer 使用原有布局和实现。只新增一个“教学实验”入口，点击展开同页 Bootstrap 深色附属面板。

## 使用

1. 用任意静态服务器托管仓库根目录，打开 index.html。
2. 点击“教学实验”，从原版网络中选择攻击节点与商家观察节点。
3. 选 51% / 芬尼 / 竞争 / 双花，配置确认数、随机种子和防范措施。
4. 加载实验会清空当前区块。勾选全连接教学拓扑时会通过原版连接函数连接当前节点，默认 30 个节点继续使用。
5. 点击“下一步”或“自动运行”。原版 Start All Miners 在教学会话中同样用于启动 / 暂停教学，单矿工菜单推进一个教学步。
6. 在原版统计、节点 JSON 和 Blockchain Explorer 观察原生 Header 和 transactions；附属面板显示商家教学币余额、商品状态和 UTXO 防范结果。
7. “防范对照”在同一批原版节点上先后重跑两组；结束后页面展示防范组的原生链。记录可导出 JSON。
8. “退出教学”恢复加载前节点的算力和连接，清空教学区块，再继续原版挖矿。

## 与原版的集成

- 保留原始代码 original.html，以它和 native-panel.html 为输入，运行 npm run build 产生集成后的 index.html。
- native-bridge.js 在同一个页面直接访问原版 Network、Miner、Header、NetworkBuffer，不加载另一套模拟器。
- 每个教学区块通过原版 Miner.mine()、Header.guessNonce()、Header.isBlock() 产生，奖励和矿工统计由原版更新。
- 私有分支使用攻击节点本身的 blockchain。公布时调用原版 submit()，沿原 outgoingPeers 投递 Header，再由原版 receive()、queryBlockAtHeight() 回溯和 setBlock() 更新分支。
- Header 克隆及反序列化增加教学交易字段。接收候选块前重放该分支的 UTXO，阻止重复消费。
- 单步模式接管 NetworkBuffer 的传递调度，在受控队列中同步投递，方便逐步截图和复现；拓扑仍来自原版连接表。没有运行第二份独立链。
- 原版 Account balance 为挖矿奖励，附属面板内的商家余额为教学付款，两者明确区分。

## 模型边界

所有身份、商品、UTXO 和交易均为教学对象。哈希使用原版简化模式。教学步按算力抽样矿工，再调用原矿工挖矿至找到块，不对应真实秒数。竞争交易传播与手续费偏好为简化权重，实际区块仍由原版矿工产生。

51% 防范对照模拟降低算力集中度，将攻击份额限制到最多 30%，不是宣称在攻击者持续持有多数算力时能靠确认数阻止重组。芬尼防范为拒绝零确认交付。竞争防范假设冲突告警及时到达。双花实验中关闭的是收款应用登记核验，节点共识校验始终开启。50 步内未发生重组不能推断永久安全。

## 验证与发布

执行 npm test。测试使用 VM 加载实际上游 Network / Header / NetworkBuffer / Miner 类与同一浏览器桥接，验证资金守恒、原生接收与克隆、重复消费拒绝、拓扑隔离、种子复现和无效参数。

GitHub Pages 可发布仓库根目录，或使用附带 pages.yml 工作流。公开发布尚需用户 GitHub 登录权限。

## 来源和许可

上游 https://github.com/Simewu/blockchain-simulator ，提交 89d8d2cc4f84ae896466a65dd65d8bdfbfc74187 。MIT License，Copyright (c) 2019 Simeon。完整原许可保留在 LICENSE。

付款原理参考 https://developer.bitcoin.org/devguide/payment_processing.html 。
