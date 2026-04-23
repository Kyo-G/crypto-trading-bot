import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COINS = ['BTC', 'ETH', 'BNB', 'SOL'];
const THRESHOLD = 0.005; // 触发换币的最低预期收益（0.5%）
const FEE = 0.001;       // Binance手续费（0.1%，每笔）

// 纯数学轮换策略 — 不需要任何AI或API Key
class RotationStrategy {
  constructor() {
    this.stateFile  = path.join(__dirname, '..', 'data', 'rotation-state.json');
    this.accountFile = path.join(__dirname, '..', 'data', 'rotation-account.json');
    this.state   = this.loadState();
    this.account = this.loadAccount();
  }

  loadState() {
    try { return JSON.parse(fs.readFileSync(this.stateFile, 'utf-8')); } catch {}
    return { currentCoin: 'BTC', ratios: {}, initialized: false };
  }

  loadAccount() {
    try {
      const d = JSON.parse(fs.readFileSync(this.accountFile, 'utf-8'));
      console.log(`📂 轮换策略: 持有 ${d.coinAmount.toFixed(4)} ${d.currentCoin}`);
      return d;
    } catch {}
    return { currentCoin: 'BTC', coinAmount: 0, initialUSDT: 10000, tradeHistory: [], initialized: false };
  }

  save() {
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.stateFile,   JSON.stringify(this.state,   null, 2));
    fs.writeFileSync(this.accountFile, JSON.stringify(this.account, null, 2));
  }

  async fetchPrices() {
    const symbols = COINS.map(c => `"${c}USDT"`).join(',');
    return new Promise(resolve => {
      https.get(`https://api.binance.com/api/v3/ticker/price?symbols=[${symbols}]`, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const prices = {};
            JSON.parse(data).forEach(item => {
              prices[item.symbol.replace('USDT', '')] = parseFloat(item.price);
            });
            resolve(prices);
          } catch { resolve(null); }
        });
      }).on('error', () => resolve(null));
    });
  }

  initialize(prices) {
    // 用初始资金买入BTC作为起点
    const price = prices.BTC;
    this.account.coinAmount = (this.account.initialUSDT * (1 - FEE)) / price;
    this.account.currentCoin = 'BTC';
    this.account.initialized = true;

    // 记录所有币对的初始比价
    for (const a of COINS) for (const b of COINS) {
      if (a !== b) this.state.ratios[`${a}-${b}`] = prices[a] / prices[b];
    }
    this.state.currentCoin = 'BTC';
    this.state.initialized = true;
    this.save();
    console.log(`\n🔄 轮换策略初始化: 买入 ${this.account.coinAmount.toFixed(4)} BTC @ $${price.toFixed(2)}`);
  }

  // 核心逻辑：找出最值得切换的目标币
  scout(prices) {
    const cur = this.account.currentCoin;
    let bestCoin = null;
    let bestProfit = 0;

    for (const target of COINS) {
      if (target === cur) continue;
      const key = `${cur}-${target}`;
      const historical = this.state.ratios[key];
      if (!historical) continue;

      const current = prices[cur] / prices[target];
      // 当前比值 > 历史比值：持有的币相对升值了 → 是卖出换目标币的好时机
      const profit = current / historical - 1 - 2 * FEE;

      if (profit > THRESHOLD && profit > bestProfit) {
        bestProfit = profit;
        bestCoin = target;
      }
    }

    // 慢速更新历史比价（EMA，平滑避免噪音）
    for (const target of COINS) {
      if (target === cur) continue;
      const key = `${cur}-${target}`;
      const newRatio = prices[cur] / prices[target];
      this.state.ratios[key] = (this.state.ratios[key] ?? newRatio) * 0.98 + newRatio * 0.02;
    }

    return { bestCoin, bestProfit };
  }

  switchCoin(toCoin, prices) {
    const fromCoin = this.account.currentCoin;
    const fromPrice = prices[fromCoin];
    const toPrice   = prices[toCoin];

    const usdtValue = this.account.coinAmount * fromPrice * (1 - FEE); // 卖出
    const newAmount = usdtValue / toPrice * (1 - FEE);                  // 买入

    this.account.tradeHistory.push({
      fromCoin, toCoin, fromPrice, toPrice,
      fromAmount: this.account.coinAmount,
      toAmount: newAmount,
      usdtValue,
      timestamp: new Date().toISOString(),
    });

    this.account.coinAmount  = newAmount;
    this.account.currentCoin = toCoin;
    this.state.currentCoin   = toCoin;
    // 交易后重置比价基准
    this.state.ratios[`${fromCoin}-${toCoin}`] = fromPrice / toPrice;
    this.state.ratios[`${toCoin}-${fromCoin}`] = toPrice / fromPrice;
    this.save();
  }

  currentValueUSDT(prices) {
    if (!this.account.initialized) return this.account.initialUSDT;
    return this.account.coinAmount * prices[this.account.currentCoin];
  }

  async run() {
    const prices = await this.fetchPrices();
    if (!prices) { console.log('⚠️  轮换策略: 无法获取行情'); return null; }

    if (!this.account.initialized) { this.initialize(prices); return { prices }; }

    const { bestCoin, bestProfit } = this.scout(prices);
    const value = this.currentValueUSDT(prices);
    const ret = ((value - this.account.initialUSDT) / this.account.initialUSDT * 100).toFixed(2);
    const sign = ret >= 0 ? '+' : '';

    console.log(`\n🔄 轮换策略: ${this.account.coinAmount.toFixed(4)} ${this.account.currentCoin} = $${value.toFixed(2)} (${sign}${ret}%)`);

    if (bestCoin) {
      console.log(`  💡 切换: ${this.account.currentCoin} → ${bestCoin} (预期收益 +${(bestProfit * 100).toFixed(2)}%)`);
      this.switchCoin(bestCoin, prices);
      console.log(`  ✅ 现持有 ${this.account.coinAmount.toFixed(4)} ${this.account.currentCoin}`);
    } else {
      console.log(`  ⏸️  暂无切换机会，继续持有 ${this.account.currentCoin}`);
      this.save();
    }

    return { prices };
  }
}

export default RotationStrategy;
