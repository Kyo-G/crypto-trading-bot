# 🤖 AI加密货币交易机器人 (Binance Testnet版)

基于Claude AI的智能加密货币交易机器人,使用Binance Testnet进行零风险测试。

## ✨ 特性

- 🧠 **Claude AI决策** - 使用Claude Sonnet 4分析市场
- 🧪 **Binance Testnet** - 零风险,无需KYC,完全免费
- 📊 **技术指标分析** - RSI、SMA等技术指标
- 🛡️ **多层风控** - 仓位、止损、每日交易次数限制
- 📝 **完整日志** - 记录所有决策和交易
- 👁️ **观察模式** - 先模拟,后实战

## 🚀 快速开始

### 1. 注册Binance Testnet

访问 https://testnet.binance.vision

用GitHub账号登录,自动获得测试资金!

### 2. 安装项目

```bash
cd crypto-trading-bot
npm install
```

### 3. 配置API

编辑 `config/config.js`,填入:
- Binance Testnet API Key
- Claude API Key

### 4. 测试并启动

```bash
npm test    # 测试连接
npm start   # 启动机器人
```

## 📊 运行模式

### 观察模式 (默认)
```javascript
mode: 'observe'
```
只分析市场,记录决策,不实际交易

### 交易模式
```javascript
mode: 'trade'
```
在Testnet上实际交易(虚拟资金)

## 💰 成本

- Binance Testnet: 完全免费
- Claude API: 每次决策约$0.006,每月约¥15-30

## 📁 项目结构

```
crypto-trading-bot/
├── config/
│   └── config.js         # 配置文件
├── src/
│   ├── index.js          # 主程序
│   ├── binance-client.js # Binance API
│   ├── claude-engine.js  # AI决策引擎
│   ├── risk-manager.js   # 风控系统
│   ├── logger.js         # 日志管理
│   └── test.js           # 测试脚本
├── logs/                 # 日志文件
└── README.md
```

## 🛡️ 风控参数

```javascript
trading: {
  maxPositionSize: 20,      // 单次最大仓位20%
  stopLossPercent: 3,       // 止损3%
  takeProfitPercent: 6,     // 止盈6%
  maxDailyTrades: 2,        // 每日最多2笔
},
risk: {
  maxDailyLoss: 2,          // 每日最大亏损2%
  maxTotalPositions: 3,     // 最多3个仓位
}
```

## 📖 详细教程

查看 **QUICKSTART.md** 获取详细的一步步教程!

## ⚠️ 重要提示

1. Binance Testnet是纯测试环境,资金是虚拟的
2. 建议先观察1-2周,再启用交易模式
3. 定期查看logs/目录分析决策质量
4. 如果要切换到实盘,需要修改配置并通过KYC

## 🎯 路线图

```
Week 1: 观察模式,了解AI决策
Week 2-3: 启用交易,测试完整流程
Week 4+: 优化参数,调整策略
1-2个月后: 如果效果好,考虑实盘小额测试
```

## 📝 License

MIT

---

**开始你的AI交易实验吧! 🚀**
