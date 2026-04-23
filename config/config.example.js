// 配置文件示例 - 复制为config.js并填入你的API密钥
export const config = {
  // 欧易API配置
  // 获取方式: 欧易网站 → 个人中心 → API管理 → 创建API
  // 注意: 先申请"模拟盘"API进行测试
  okx: {
    apiKey: 'YOUR_OKX_API_KEY_HERE',
    secret: 'YOUR_OKX_SECRET_HERE',
    password: 'YOUR_OKX_PASSWORD_HERE',
    sandbox: true, // true=模拟盘(推荐), false=实盘(谨慎!)
  },

  // Anthropic Claude API配置
  // 获取方式: https://console.anthropic.com → API Keys
  anthropic: {
    apiKey: 'YOUR_ANTHROPIC_API_KEY_HERE',
  },

  // 交易参数
  trading: {
    symbol: 'BTC/USDT',           // 交易对
    checkInterval: 5,              // 检查间隔(分钟)
    priceChangeThreshold: 2,       // 价格变化>2%才调用AI
    maxPositionSize: 20,           // 单次最大仓位(%)
    stopLossPercent: 3,            // 止损百分比
    takeProfitPercent: 6,          // 止盈百分比
    maxDailyTrades: 2,             // 每日最大交易次数
  },

  // 风控参数
  risk: {
    maxDailyLoss: 2,               // 每日最大亏损(%)
    maxTotalPositions: 3,          // 最大同时持仓数
    emergencyStopLoss: 8,          // 紧急止损(%)
  },

  // 运行模式
  mode: 'observe',                 // 'observe'=只观察, 'trade'=实际交易
};
