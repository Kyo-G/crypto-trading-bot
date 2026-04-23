import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYMBOL       = 'BTCUSDT';
const MIN_RATE     = 0.0001;   // 0.01%，低于此不开仓
const CAPITAL_PCT  = 0.8;      // 用80%资金做套利
const FUNDING_HOURS = 8;       // Binance每8小时结算一次

class FundingStrategy {
  constructor() {
    this.dataFile = path.join(__dirname, '..', 'data', 'funding-account.json');
    this.account  = this.load();
  }

  load() {
    try { return JSON.parse(fs.readFileSync(this.dataFile, 'utf-8')); } catch {}
    const d = {
      initialUSDT: 10000,
      currentUSDT: 10000,
      totalFundingEarned: 0,
      position: null,
      history: [],
    };
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    fs.writeFileSync(this.dataFile, JSON.stringify(d, null, 2));
    return d;
  }

  save() {
    fs.writeFileSync(this.dataFile, JSON.stringify(this.account, null, 2));
  }

  async fetchFunding() {
    return new Promise(resolve => {
      https.get(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${SYMBOL}`, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const d = JSON.parse(data);
            resolve({
              rate:            parseFloat(d.lastFundingRate),
              markPrice:       parseFloat(d.markPrice),
              nextFundingTime: d.nextFundingTime,
            });
          } catch { resolve(null); }
        });
      }).on('error', () => resolve(null));
    });
  }

  // 尝试收取本次结算的资金费
  tryCollect(info) {
    const pos = this.account.position;
    if (!pos) return 0;

    const lastCollected = new Date(pos.lastFundingCollected);
    const hoursSince    = (Date.now() - lastCollected) / 3600000;
    if (hoursSince < FUNDING_HOURS * 0.9) return 0; // 还没到结算时间

    const posValue  = pos.spotAmount * info.markPrice;
    // rate>0: 多头付给空头（我方是空头，收入）; rate<0: 空头付给多头（我方是空头，支出）
    const earned    = posValue * info.rate;

    this.account.totalFundingEarned += earned;
    this.account.currentUSDT        += earned;
    pos.lastFundingCollected = new Date().toISOString();

    this.account.history.push({
      type: 'funding', rate: info.rate, posValue, earned,
      timestamp: new Date().toISOString(),
    });
    return earned;
  }

  openPosition(info) {
    const capital     = this.account.currentUSDT * CAPITAL_PCT;
    const halfCapital = capital / 2;
    const spotAmount  = halfCapital / info.markPrice;

    this.account.position = {
      spotAmount,
      entryPrice:          info.markPrice,
      margin:              halfCapital,
      openingRate:         info.rate,
      openedAt:            new Date().toISOString(),
      lastFundingCollected: new Date().toISOString(),
    };

    this.account.history.push({
      type: 'open', rate: info.rate, markPrice: info.markPrice,
      spotAmount, capital, timestamp: new Date().toISOString(),
    });
  }

  closePosition(info) {
    const pos = this.account.position;
    // 现货和期货价格变动相互抵消（delta中性），净收益来自资金费
    // 模拟中用mark price计算微小价差损益
    const spotPnl    = (info.markPrice - pos.entryPrice) * pos.spotAmount;
    const futuresPnl = (pos.entryPrice  - info.markPrice) * pos.spotAmount; // 空头
    const netPnl     = spotPnl + futuresPnl; // ≈ 0

    this.account.currentUSDT += netPnl;
    this.account.history.push({
      type: 'close', markPrice: info.markPrice, netPnl,
      timestamp: new Date().toISOString(),
    });
    this.account.position = null;
  }

  async run() {
    const info = await this.fetchFunding();
    if (!info) { console.log('⚠️  资金费率策略: 无法获取数据'); return null; }

    const ratePct   = (info.rate * 100).toFixed(4);
    const nextTime  = new Date(info.nextFundingTime)
      .toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, hour: '2-digit', minute: '2-digit' });

    console.log(`\n💰 资金费率策略: 当前费率 ${info.rate >= 0 ? '+' : ''}${ratePct}% | 下次结算 ${nextTime}`);

    if (this.account.position) {
      const earned = this.tryCollect(info);
      if (Math.abs(earned) > 0) {
        console.log(`  💵 收取资金费: ${earned >= 0 ? '+' : ''}$${earned.toFixed(4)} | 累计 $${this.account.totalFundingEarned.toFixed(4)}`);
      }

      if (Math.abs(info.rate) < MIN_RATE / 2) {
        console.log(`  📤 费率过低，平仓`);
        this.closePosition(info);
      } else {
        const posValue = this.account.position.spotAmount * info.markPrice;
        console.log(`  ✅ 持仓中 | 仓位价值 $${posValue.toFixed(2)} | 累计收益 $${this.account.totalFundingEarned.toFixed(4)}`);
      }
    } else {
      if (Math.abs(info.rate) >= MIN_RATE) {
        this.openPosition(info);
        console.log(`  📥 费率 ${info.rate >= 0 ? '+' : ''}${ratePct}% 达阈值，已开仓套利`);
        console.log(`  ✅ 持有 ${this.account.position.spotAmount.toFixed(4)} BTC现货 + 做${info.rate >= 0 ? '空' : '多'}同量期货`);
      } else {
        console.log(`  ⏸️  费率 ${info.rate >= 0 ? '+' : ''}${ratePct}% 过低，等待机会`);
      }
    }

    this.save();
    return info;
  }
}

export default FundingStrategy;
