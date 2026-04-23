import cron from 'node-cron';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import BinanceClient from './binance-client.js';
import PaperAccount from './paper-account.js';
import ClaudeDecisionEngine from './claude-engine.js';
import RiskManager from './risk-manager.js';
import Logger from './logger.js';
import { config } from '../config/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function pushToGitHub() {
  try {
    execSync('git add data/ logs/ && git diff --cached --quiet || git commit -m "📊 自动同步数据" && git push', {
      cwd: ROOT, stdio: 'pipe',
    });
    console.log('☁️  数据已同步到GitHub');
  } catch {
    // 无新变化或网络问题时静默忽略
  }
}

class TradingBot {
  constructor() {
    this.market = new BinanceClient();
    this.paper = new PaperAccount();
    this.claude = new ClaudeDecisionEngine();
    this.risk = new RiskManager();
    this.logger = new Logger();
    this.lastPrice = null;
    this.isRunning = false;
  }

  async initialize() {
    console.log('🤖 虚拟合约交易机器人启动中...\n');

    console.log('⚙️  当前配置:');
    console.log(`  - 模式: 纸面交易 📝 (使用真实行情，虚拟资金)`);
    console.log(`  - 交易对: ${config.trading.symbol}`);
    console.log(`  - 模拟杠杆: ${config.trading.leverage}x`);
    console.log(`  - 检查间隔: ${config.trading.checkInterval}分钟`);
    console.log(`  - 最大保证金: ${config.trading.maxPositionSize}% → 实际敞口${config.trading.maxPositionSize * config.trading.leverage}%`);
    console.log(`  - 止损/止盈: ${config.trading.stopLossPercent}% / ${config.trading.takeProfitPercent}%`);
    console.log(`  - 执行模式: ${config.mode === 'trade' ? '💰 自动开仓' : '👁️  仅观察'}\n`);

    // 测试市场数据连接（公开API，不需要Key）
    try {
      const ticker = await this.market.getCurrentPrice(config.trading.symbol);
      console.log(`✅ Binance行情连接成功`);
      console.log(`   当前BTC价格: $${ticker.price.toFixed(2)}\n`);
      this.lastPrice = ticker.price;
    } catch (error) {
      console.error('❌ 获取行情失败:', error.message);
      console.log('请检查网络连接\n');
      process.exit(1);
    }

    // 显示虚拟账户状态
    const balance = this.paper.getBalance();
    const positions = this.paper.getPositions(this.lastPrice);
    console.log(`✅ 虚拟账户:`);
    console.log(`   可用USDT: $${balance.USDT.toFixed(2)}`);

    if (positions.length > 0) {
      console.log(`   当前持仓:`);
      positions.forEach(p => {
        const sign = p.unrealizedPnl >= 0 ? '+' : '';
        console.log(`     ${p.side.toUpperCase()} ${p.contracts.toFixed(4)} BTC @ $${p.entryPrice.toFixed(2)} | 盈亏: ${sign}$${p.unrealizedPnl.toFixed(2)} (${sign}${p.percentage.toFixed(2)}%)`);
      });
    }
    console.log('');

    // 测试Claude API
    try {
      console.log('🧪 测试Claude API...');
      const testData = { symbol: 'BTC/USDT:USDT', price: 80000, change24h: 1.5, high24h: 81000, low24h: 79000 };
      const testIndicators = { rsi: '52', sma20: '79500', sma50: '77000', macd: '150', macdSignal: '120', macdHistogram: '30', trend: '上升' };
      await this.claude.getDecision(testData, testIndicators, { USDT: 10000, used: 0 }, []);
      console.log('✅ Claude API连接成功\n');
    } catch (error) {
      console.error('❌ Claude API连接失败:', error.message);
      process.exit(1);
    }

    console.log('🎉 启动完成！开始监控市场...\n');
  }

  async run() {
    if (this.isRunning) {
      console.log('⏭️  上次检查还在进行中，跳过...');
      return;
    }

    this.isRunning = true;

    try {
      const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      console.log(`\n⏰ [${now}] 开始检查...`);

      const ticker = await this.market.getCurrentPrice(config.trading.symbol);
      const currentPrice = ticker.price;

      const priceChange = this.lastPrice
        ? Math.abs((currentPrice - this.lastPrice) / this.lastPrice * 100)
        : 999;

      console.log(`📈 BTC价格: $${currentPrice.toFixed(2)} (较上次: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)`);

      // 获取虚拟持仓（含实时盈亏）
      const positions = this.paper.getPositions(currentPrice);

      if (positions.length > 0) {
        positions.forEach(p => {
          const sign = p.unrealizedPnl >= 0 ? '+' : '';
          console.log(`📌 持仓: ${p.side.toUpperCase()} | 盈亏: ${sign}$${p.unrealizedPnl.toFixed(2)} (${sign}${p.percentage.toFixed(2)}%) | 爆仓价: $${p.liquidationPrice.toFixed(2)}`);

          // 紧急止损
          if (this.risk.shouldEmergencyStop(p.entryPrice, currentPrice, p.side)) {
            console.log('🚨 触发紧急止损，强制平仓！');
            const results = this.paper.closeAll(currentPrice);
            results.forEach(r => {
              const sign = r.pnl >= 0 ? '+' : '';
              console.log(`   平仓盈亏: ${sign}$${r.pnl.toFixed(2)}`);
            });
          }
        });
      }

      // 有持仓时不跳过（随时监控止盈止损）
      if (priceChange < config.trading.priceChangeThreshold && positions.length === 0) {
        console.log(`✋ 空仓且价格变化不足${config.trading.priceChangeThreshold}%，跳过分析\n`);
        this.lastPrice = currentPrice;
        return;
      }

      // 获取K线和技术指标
      const ohlcv = await this.market.getOHLCV(config.trading.symbol, '4h', 100);
      const indicators = this.market.calculateIndicators(ohlcv);

      console.log('🔔 价格变化达到阈值，调用Claude分析...');

      const balance = this.paper.getBalance();
      const decision = await this.claude.getDecision(ticker, indicators, balance, positions);

      await this.logger.logDecision(ticker, indicators, decision, false);

      if (decision.action !== 'hold') {
        const riskCheck = this.risk.canTrade(decision, balance, positions);

        if (riskCheck.allowed && config.mode === 'trade') {
          await this.executeTrade(decision, currentPrice, balance, positions);
          this.paper.printSummary(currentPrice);
        } else if (!riskCheck.allowed) {
          console.log('⛔ 风控不通过，不执行交易');
        } else {
          console.log('👁️  观察模式，不执行交易');
        }
      }

      this.lastPrice = currentPrice;

      // 同步数据到GitHub（仪表盘用）
      pushToGitHub();

      // 10%概率打印每日统计
      if (Math.random() < 0.1) await this.logger.printTodayStats();

    } catch (error) {
      console.error('❌ 执行出错:', error.message);
      await this.logger.logError(error, { step: 'main_run' });
    } finally {
      this.isRunning = false;
    }
  }

  async executeTrade(decision, currentPrice, balance, positions) {
    try {
      // 平仓
      if (decision.action === 'close') {
        if (positions.length === 0) {
          console.log('ℹ️  没有持仓可平仓');
          return;
        }
        const results = this.paper.closeAll(currentPrice);
        for (const r of results) {
          const sign = r.pnl >= 0 ? '+' : '';
          console.log(`\n🟡 平仓完成: ${r.side.toUpperCase()} | 盈亏: ${sign}$${r.pnl.toFixed(2)} (${sign}${r.pnlPercent}%)`);
          await this.logger.logTrade({
            side: `close-${r.side}`,
            amount: r.contracts,
            price: currentPrice,
            usdt: r.contracts * currentPrice,
            pnl: r.pnl,
          });
        }
        this.risk.recordTrade();
        return;
      }

      // 开仓 (buy=开多, sell=开空)
      const margin = balance.USDT * (decision.position_size_percent / 100);
      const positionValue = margin * config.trading.leverage;
      const contracts = positionValue / currentPrice;
      const side = decision.action === 'buy' ? 'long' : 'short';

      console.log(`\n💰 执行虚拟${side === 'long' ? '开多' : '开空'}:`);
      console.log(`  保证金: $${margin.toFixed(2)} | 仓位价值: $${positionValue.toFixed(2)} | 数量: ${contracts.toFixed(4)} BTC`);
      console.log(`  止损价: $${decision.stop_loss_price.toFixed(2)} | 止盈价: $${decision.take_profit_price.toFixed(2)}`);

      const pos = this.paper.openPosition(side, contracts, currentPrice, margin);

      await this.logger.logTrade({
        side: decision.action,
        amount: contracts,
        price: currentPrice,
        usdt: positionValue,
        margin,
        stopLoss: decision.stop_loss_price,
        takeProfit: decision.take_profit_price,
        liquidationPrice: pos.liquidationPrice,
      });

      this.risk.recordTrade();
      console.log(`✅ 开仓成功！爆仓价: $${pos.liquidationPrice.toFixed(2)}\n`);

    } catch (error) {
      console.error('❌ 执行失败:', error.message);
      await this.logger.logError(error, { step: 'execute_trade', decision });
    }
  }

  start() {
    this.run();

    const cronExpr = `*/${config.trading.checkInterval} * * * *`;
    cron.schedule(cronExpr, () => this.run());
    console.log(`⏰ 定时任务: 每${config.trading.checkInterval}分钟检查一次\n`);

    cron.schedule('0 0 * * *', async () => {
      console.log('\n📊 每日总结:');
      await this.logger.printTodayStats();
    });
  }
}

const bot = new TradingBot();

bot.initialize().then(() => {
  bot.start();
  console.log('✨ 机器人运行中... 按Ctrl+C停止\n');
}).catch(error => {
  console.error('启动失败:', error.message);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n\n👋 正在停止...');
  const ticker = await bot.market.getCurrentPrice(config.trading.symbol).catch(() => ({ price: bot.lastPrice || 0 }));
  bot.paper.printSummary(ticker.price);
  await bot.logger.printTodayStats();
  console.log('✅ 再见！\n');
  process.exit(0);
});
