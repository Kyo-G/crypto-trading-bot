import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 虚拟合约账户 — 模拟真实杠杆交易，数据持久化到本地文件
class PaperAccount {
  constructor() {
    this.dataFile = path.join(__dirname, '..', 'data', 'paper-account.json');
    this.ensureDataDir();
    this.state = this.load();
  }

  ensureDataDir() {
    const dir = path.dirname(this.dataFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  load() {
    if (fs.existsSync(this.dataFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf-8'));
        console.log(`📂 已加载虚拟账户 (历史交易: ${data.tradeHistory?.length || 0}笔)`);
        return data;
      } catch { }
    }
    const initial = config.paper.initialBalance;
    console.log(`🆕 创建新虚拟账户，初始资金: $${initial}`);
    const defaultState = {
      balance: { USDT: initial, used: 0 },
      positions: [],
      tradeHistory: [],
      initialBalance: initial,
    };
    // 立即写入文件，让仪表盘能读到
    fs.writeFileSync(this.dataFile, JSON.stringify(defaultState, null, 2));
    return defaultState;
  }

  save() {
    fs.writeFileSync(this.dataFile, JSON.stringify(this.state, null, 2));
  }

  getBalance() {
    return { ...this.state.balance };
  }

  // 获取持仓（传入当前价格实时计算盈亏）
  getPositions(currentPrice) {
    return this.state.positions.map(p => {
      const pnl = p.side === 'long'
        ? (currentPrice - p.entryPrice) * p.contracts
        : (p.entryPrice - currentPrice) * p.contracts;
      const percentage = (pnl / p.margin) * 100;
      return { ...p, unrealizedPnl: pnl, percentage };
    });
  }

  // 开仓
  openPosition(side, contracts, entryPrice, margin) {
    const leverage = config.trading.leverage;

    // 简化爆仓价估算（忽略手续费和资金费率）
    const liquidationPrice = side === 'long'
      ? entryPrice * (1 - 1 / leverage + 0.005)
      : entryPrice * (1 + 1 / leverage - 0.005);

    const position = {
      symbol: config.trading.symbol,
      side,
      contracts,
      entryPrice,
      margin,
      leverage,
      liquidationPrice,
      openedAt: new Date().toISOString(),
    };

    this.state.positions.push(position);
    this.state.balance.USDT -= margin;
    this.state.balance.used += margin;
    this.save();

    return position;
  }

  // 平仓（支持按symbol平，默认平所有）
  closeAll(currentPrice) {
    if (this.state.positions.length === 0) return [];

    const results = [];

    for (const pos of [...this.state.positions]) {
      const pnl = pos.side === 'long'
        ? (currentPrice - pos.entryPrice) * pos.contracts
        : (pos.entryPrice - currentPrice) * pos.contracts;

      const returned = Math.max(pos.margin + pnl, 0); // 爆仓时最多损失保证金
      this.state.balance.USDT += returned;
      this.state.balance.used -= pos.margin;

      const record = {
        ...pos,
        closePrice: currentPrice,
        closedAt: new Date().toISOString(),
        pnl: parseFloat(pnl.toFixed(4)),
        pnlPercent: parseFloat(((pnl / pos.margin) * 100).toFixed(2)),
      };
      this.state.tradeHistory.push(record);
      results.push(record);
    }

    this.state.positions = [];
    this.save();
    return results;
  }

  // 账户总结
  getSummary(currentPrice) {
    const positions = this.getPositions(currentPrice);
    const unrealizedTotal = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
    const equity = this.state.balance.USDT + this.state.balance.used + unrealizedTotal;
    const history = this.state.tradeHistory;
    const wins = history.filter(t => t.pnl > 0).length;
    const totalPnl = history.reduce((s, t) => s + t.pnl, 0);

    return {
      equity,
      availableUSDT: this.state.balance.USDT,
      usedMargin: this.state.balance.used,
      unrealizedPnl: unrealizedTotal,
      totalReturn: ((equity - this.state.initialBalance) / this.state.initialBalance * 100).toFixed(2),
      totalTrades: history.length,
      winRate: history.length > 0 ? (wins / history.length * 100).toFixed(1) : '0.0',
      totalPnl: totalPnl.toFixed(2),
    };
  }

  printSummary(currentPrice) {
    const s = this.getSummary(currentPrice);
    const pnlSign = parseFloat(s.totalPnl) >= 0 ? '+' : '';
    const returnSign = parseFloat(s.totalReturn) >= 0 ? '+' : '';

    console.log('\n' + '💼 虚拟账户 '.padEnd(60, '='));
    console.log(`总资产: $${parseFloat(s.equity).toFixed(2)}  (${returnSign}${s.totalReturn}%)`);
    console.log(`可用: $${parseFloat(s.availableUSDT).toFixed(2)}  占用保证金: $${parseFloat(s.usedMargin).toFixed(2)}  未实现盈亏: ${parseFloat(s.unrealizedPnl) >= 0 ? '+' : ''}$${parseFloat(s.unrealizedPnl).toFixed(2)}`);
    console.log(`历史交易: ${s.totalTrades}笔 | 胜率: ${s.winRate}% | 累计盈亏: ${pnlSign}$${s.totalPnl}`);
    console.log('='.repeat(60) + '\n');
  }

  // 重置账户（谨慎使用）
  reset() {
    const initial = config.paper.initialBalance;
    this.state = {
      balance: { USDT: initial, used: 0 },
      positions: [],
      tradeHistory: [],
      initialBalance: initial,
    };
    this.save();
    console.log(`🔄 账户已重置，初始资金: $${initial}`);
  }
}

export default PaperAccount;
