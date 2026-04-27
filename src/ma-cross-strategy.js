import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYMBOL   = 'BTCUSDT';
const FAST_MA  = 7;
const SLOW_MA  = 25;
const INTERVAL = '1h';

class MACrossStrategy {
  constructor() {
    this.dataFile = path.join(__dirname, '..', 'data', 'ma-account.json');
    this.account  = this.load();
  }

  load() {
    try { return JSON.parse(fs.readFileSync(this.dataFile, 'utf-8')); } catch {}
    return {
      initialUSDT:       10000,
      currentUSDT:       10000,
      position:          null,
      tradeHistory:      [],
      prevFastAboveSlow: null,
      lastMAState:       null,
    };
  }

  save() {
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    fs.writeFileSync(this.dataFile, JSON.stringify(this.account, null, 2));
  }

  async fetchKlines() {
    return new Promise(resolve => {
      https.get(
        `https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=${INTERVAL}&limit=${SLOW_MA + 5}`,
        res => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try { resolve(JSON.parse(data).map(k => parseFloat(k[4]))); }
            catch { resolve(null); }
          });
        }
      ).on('error', () => resolve(null));
    });
  }

  sma(prices, period) {
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  currentEquity(price) {
    return this.account.position
      ? this.account.position.btcAmount * price
      : this.account.currentUSDT;
  }

  _buy(price, fastMA, slowMA) {
    const btcAmount = this.account.currentUSDT / price;
    this.account.position = { btcAmount, entryPrice: price, entryTime: new Date().toISOString(), fastMAAtEntry: fastMA, slowMAAtEntry: slowMA };
    this.account.currentUSDT = 0;
  }

  _sell(price) {
    const { btcAmount, entryPrice, entryTime } = this.account.position;
    const proceeds = btcAmount * price;
    const pnl      = proceeds - btcAmount * entryPrice;
    this.account.tradeHistory.push({
      entryPrice, exitPrice: price, btcAmount,
      pnl:        parseFloat(pnl.toFixed(2)),
      pnlPercent: parseFloat(((pnl / (btcAmount * entryPrice)) * 100).toFixed(2)),
      entryTime,  exitTime: new Date().toISOString(),
    });
    this.account.currentUSDT = proceeds;
    this.account.position    = null;
    return pnl;
  }

  async run() {
    const closes = await this.fetchKlines();
    if (!closes || closes.length < SLOW_MA) {
      console.log('⚠️  均线策略: 无法获取K线数据');
      return null;
    }

    const price         = closes[closes.length - 1];
    const fastMA        = this.sma(closes, FAST_MA);
    const slowMA        = this.sma(closes, SLOW_MA);
    const fastAboveSlow = fastMA > slowMA;
    const prev          = this.account.prevFastAboveSlow;

    const equity = this.currentEquity(price);
    const ret    = ((equity - this.account.initialUSDT) / this.account.initialUSDT * 100).toFixed(2);
    const sign   = ret >= 0 ? '+' : '';

    console.log(`\n📊 均线策略: ${this.account.position ? `持有 ${this.account.position.btcAmount.toFixed(4)} BTC` : '空仓 USDT'} | 总资产 $${equity.toFixed(2)} (${sign}${ret}%)`);
    console.log(`   MA${FAST_MA}: $${fastMA.toFixed(2)} | MA${SLOW_MA}: $${slowMA.toFixed(2)} | ${fastAboveSlow ? '多头排列📈' : '空头排列📉'}`);

    if (prev === null) {
      // 首次运行：多头排列直接建仓，否则等待金叉
      if (fastAboveSlow) {
        this._buy(price, fastMA, slowMA);
        console.log(`  🟢 初始化：当前多头排列，买入 ${this.account.position.btcAmount.toFixed(4)} BTC @ $${price.toFixed(2)}`);
      } else {
        console.log(`  🔍 初始化：当前空头排列，等待金叉信号`);
      }
    } else if (!prev && fastAboveSlow) {
      // 金叉
      if (!this.account.position) {
        this._buy(price, fastMA, slowMA);
        console.log(`  🟢 金叉！买入 ${this.account.position.btcAmount.toFixed(4)} BTC @ $${price.toFixed(2)}`);
      }
    } else if (prev && !fastAboveSlow) {
      // 死叉
      if (this.account.position) {
        const pnl     = this._sell(price);
        const pnlSign = pnl >= 0 ? '+' : '';
        console.log(`  🔴 死叉！卖出 @ $${price.toFixed(2)} | 盈亏 ${pnlSign}$${pnl.toFixed(2)}`);
      }
    } else {
      console.log(`  ⏸️  ${fastAboveSlow ? '多头排列持仓中' : '空头排列等待金叉'}`);
    }

    this.account.prevFastAboveSlow = fastAboveSlow;
    this.account.lastMAState = { price, fastMA, slowMA, fastAboveSlow, timestamp: new Date().toISOString() };
    this.save();

    return { price, fastMA, slowMA, equity: this.currentEquity(price) };
  }
}

export default MACrossStrategy;
