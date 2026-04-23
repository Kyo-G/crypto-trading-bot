import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '..', 'logs'); // 日志保存在项目根目录的 logs/ 下
    this.ensureLogsDir();
  }

  ensureLogsDir() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  getLogFilePath(type = 'main') {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logsDir, `${type}-${date}.json`);
  }

  async logDecision(marketData, indicators, decision, executed = false) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      price: marketData.price,
      change24h: marketData.change24h,
      rsi: indicators.rsi,
      macd: indicators.macdHistogram,
      trend: indicators.trend,
      decision: {
        action: decision.action,
        confidence: decision.confidence,
        position_size: decision.position_size_percent,
        reasoning: decision.reasoning,
      },
      executed,
      cost: decision.cost || 0,
    };

    await this.appendToLog('decisions', logEntry);
    this.printDecision(logEntry);
  }

  printDecision(entry) {
    const timestamp = new Date(entry.timestamp).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
    });

    console.log('\n' + '='.repeat(60));
    console.log(`⏰ ${timestamp}`);
    console.log(`💵 价格: $${entry.price.toFixed(2)} (24h: ${entry.change24h?.toFixed(2)}%)`);
    console.log(`📊 RSI: ${entry.rsi} | MACD柱: ${entry.macd} | 趋势: ${entry.trend}`);
    console.log(`\n🎯 决策: ${this.getActionEmoji(entry.decision.action)} ${entry.decision.action.toUpperCase()}`);
    console.log(`💪 信心: ${entry.decision.confidence}/10`);
    if (entry.decision.position_size > 0) {
      console.log(`📦 仓位: ${entry.decision.position_size}%`);
    }
    console.log(`💭 理由: ${entry.decision.reasoning}`);
    console.log(`${entry.executed ? '✅ 已执行' : '👁️  仅观察'}`);
    console.log('='.repeat(60) + '\n');
  }

  getActionEmoji(action) {
    return { buy: '🟢', sell: '🔴', close: '🟡', hold: '⚪' }[action] || '⚫';
  }

  async logTrade(trade) {
    await this.appendToLog('trades', {
      timestamp: new Date().toISOString(),
      ...trade,
    });
    console.log(`\n📝 交易记录: ${trade.side} ${trade.amount?.toFixed(4)} BTC @ $${trade.price?.toFixed(2)}`);
  }

  async logError(error, context = {}) {
    await this.appendToLog('errors', {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      context,
    });
  }

  async appendToLog(type, entry) {
    const filePath = this.getLogFilePath(type);
    let logs = [];
    if (fs.existsSync(filePath)) {
      try {
        logs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        logs = [];
      }
    }
    logs.push(entry);
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
  }

  async getTodayStats() {
    const decisionsFile = this.getLogFilePath('decisions');
    const tradesFile = this.getLogFilePath('trades');

    let decisions = [];
    let trades = [];

    if (fs.existsSync(decisionsFile)) decisions = JSON.parse(fs.readFileSync(decisionsFile, 'utf-8'));
    if (fs.existsSync(tradesFile)) trades = JSON.parse(fs.readFileSync(tradesFile, 'utf-8'));

    const totalCost = decisions.reduce((s, d) => s + (d.cost || 0), 0);

    return {
      totalDecisions: decisions.length,
      buySignals: decisions.filter(d => d.decision.action === 'buy').length,
      sellSignals: decisions.filter(d => d.decision.action === 'sell').length,
      closeSignals: decisions.filter(d => d.decision.action === 'close').length,
      holdSignals: decisions.filter(d => d.decision.action === 'hold').length,
      totalTrades: trades.length,
      totalAPICost: totalCost,
    };
  }

  async printTodayStats() {
    const stats = await this.getTodayStats();
    console.log('\n' + '📊 今日统计 '.padEnd(60, '='));
    console.log(`总决策: ${stats.totalDecisions} 次`);
    console.log(`  开多 🟢: ${stats.buySignals}  开空 🔴: ${stats.sellSignals}  平仓 🟡: ${stats.closeSignals}  观望 ⚪: ${stats.holdSignals}`);
    console.log(`执行交易: ${stats.totalTrades} 次`);
    console.log(`Claude费用: $${stats.totalAPICost.toFixed(5)} (≈¥${(stats.totalAPICost * 7.2).toFixed(3)})`);
    console.log('='.repeat(60) + '\n');
  }
}

export default Logger;
