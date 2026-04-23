import { config } from '../config/config.js';

class RiskManager {
  constructor() {
    this.dailyTrades = 0;
    this.dailyLoss = 0;
    this.lastResetDate = new Date().toDateString();
  }

  resetIfNewDay() {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyTrades = 0;
      this.dailyLoss = 0;
      this.lastResetDate = today;
      console.log('🔄 每日风控计数器已重置');
    }
  }

  canTrade(decision, balance, positions) {
    this.resetIfNewDay();

    // 平仓操作永远放行
    if (decision.action === 'close') {
      return { allowed: true, checks: [{ passed: true, reason: '平仓操作无限制' }] };
    }

    const checks = [];

    // 1. 每日交易次数
    checks.push(
      this.dailyTrades >= config.trading.maxDailyTrades
        ? { passed: false, reason: `已达每日最大交易次数 (${config.trading.maxDailyTrades})` }
        : { passed: true, reason: `每日交易: ${this.dailyTrades}/${config.trading.maxDailyTrades}` }
    );

    // 2. 每日亏损上限
    checks.push(
      this.dailyLoss >= config.risk.maxDailyLoss
        ? { passed: false, reason: `已达每日最大亏损 (${config.risk.maxDailyLoss}%)` }
        : { passed: true, reason: `每日亏损: ${this.dailyLoss.toFixed(2)}%/${config.risk.maxDailyLoss}%` }
    );

    // 3. 持仓数量（合约建议只持一个方向）
    checks.push(
      positions.length >= config.risk.maxTotalPositions
        ? { passed: false, reason: `已有持仓，请先平仓再开新仓 (最大${config.risk.maxTotalPositions}个)` }
        : { passed: true, reason: `当前持仓: ${positions.length}/${config.risk.maxTotalPositions}` }
    );

    // 4. 保证金余额充足
    const margin = balance.USDT * (decision.position_size_percent / 100);
    checks.push(
      margin > balance.USDT
        ? { passed: false, reason: `保证金不足 (需要: $${margin.toFixed(2)}, 可用: $${balance.USDT.toFixed(2)})` }
        : { passed: true, reason: `保证金充足: $${balance.USDT.toFixed(2)} 可用` }
    );

    // 5. 信心阈值 (≥6才执行)
    const minConfidence = 6;
    checks.push(
      decision.confidence < minConfidence
        ? { passed: false, reason: `信心不足 (${decision.confidence}/10, 需要≥${minConfidence})` }
        : { passed: true, reason: `信心: ${decision.confidence}/10` }
    );

    console.log('\n🛡️  风控检查:');
    checks.forEach((c, i) => console.log(`  ${i + 1}. ${c.passed ? '✅' : '❌'} ${c.reason}`));

    const allowed = checks.every(c => c.passed);
    console.log(`\n结论: ${allowed ? '✅ 允许交易' : '❌ 拒绝交易'}\n`);

    return { allowed, checks };
  }

  // 计算实际交易数量（考虑杠杆）
  calculateTradeAmount(decision, balance, currentPrice) {
    const margin = balance.USDT * (decision.position_size_percent / 100);
    const positionValue = margin * config.trading.leverage; // 实际控制的仓位价值
    const contracts = positionValue / currentPrice;          // BTC数量

    return {
      marginAmount: margin,       // 实际花掉的保证金
      usdtAmount: positionValue,  // 控制的总仓位价值
      btcAmount: contracts,
      stopLossPrice: decision.stop_loss_price,
      takeProfitPrice: decision.take_profit_price,
    };
  }

  recordTrade() {
    this.dailyTrades += 1;
  }

  recordLoss(lossPercent) {
    this.dailyLoss += lossPercent;
  }

  shouldEmergencyStop(entryPrice, currentPrice, side) {
    const lossPercent = side === 'long'
      ? ((entryPrice - currentPrice) / entryPrice) * 100
      : ((currentPrice - entryPrice) / entryPrice) * 100;

    if (lossPercent >= config.risk.emergencyStopLoss) {
      console.log(`\n🚨 触发紧急止损！亏损: ${lossPercent.toFixed(2)}%`);
      return true;
    }
    return false;
  }

  getStatus() {
    this.resetIfNewDay();
    return {
      dailyTrades: this.dailyTrades,
      maxDailyTrades: config.trading.maxDailyTrades,
      dailyLoss: this.dailyLoss,
      maxDailyLoss: config.risk.maxDailyLoss,
      tradesRemaining: config.trading.maxDailyTrades - this.dailyTrades,
    };
  }
}

export default RiskManager;
