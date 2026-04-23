# 🚀 Binance Testnet 快速入门指南

## 为什么选择Binance Testnet?

✅ **完全免费** - 不需要充值任何真钱  
✅ **零风险** - 所有资金都是虚拟的  
✅ **无需KYC** - 不需要上传身份证/护照  
✅ **功能完整** - API和真实币安完全一样  
✅ **合法合规** - 纯测试环境,没有任何政策风险  

---

## 第一步: 注册Binance Testnet

访问: **https://testnet.binance.vision**

用GitHub或Google账号登录即可,自动获得1000 USDT测试资金!

---

## 第二步: 创建API Key

1. 登录后点击右上角头像 → **API Management**
2. 点击 **Create API**
3. 权限勾选: ✅ Enable Reading / ✅ Enable Spot Trading
4. 保存显示的 **API Key** 和 **Secret Key**

---

## 第三步: 配置项目

```bash
# 1. 解压
tar -xzf crypto-trading-bot.tar.gz
cd crypto-trading-bot

# 2. 安装依赖
npm install

# 3. 编辑配置
nano config/config.js  # 或用任何编辑器
```

填入你的API密钥:
```javascript
binance: {
  apiKey: 'YOUR_API_KEY_HERE',
  secret: 'YOUR_SECRET_HERE',
},
anthropic: {
  apiKey: 'YOUR_CLAUDE_API_KEY',  // 从console.anthropic.com获取
},
```

---

## 第四步: 测试和启动

```bash
# 测试连接
npm test

# 启动机器人
npm start
```

机器人会每5分钟检查BTC价格,价格变化>2%时调用Claude分析!

---

## 运行效果示例

```
⏰ [2026-04-22 15:30] 开始检查...
📈 当前价格: $67,234.50 (变化: 2.34%)
🔔 调用Claude分析...

🎯 决策: 🟢 BUY
💪 信心: 7/10
💭 理由: RSI健康,上升趋势明确
👁️ 仅观察 (不实际交易)

💰 API成本: $0.0057
```

---

## 切换到交易模式

观察几天后,编辑config.js:
```javascript
mode: 'trade',  // 改成'trade'
```

重启机器人,它就会在testnet上实际交易(虚拟资金)!

---

详细文档请查看 **README.md**
