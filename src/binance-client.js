import ccxt from 'ccxt';

// 只用公开API获取市场数据，完全不需要API Key
class BinanceClient {
  constructor() {
    this.exchange = new ccxt.binanceusdm({
      enableRateLimit: true,
    });
  }

  async getCurrentPrice(symbol) {
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      return {
        symbol,
        price: ticker.last,
        high24h: ticker.high,
        low24h: ticker.low,
        volume24h: ticker.quoteVolume,
        change24h: ticker.percentage,
        timestamp: ticker.timestamp,
      };
    } catch (error) {
      console.error('获取价格失败:', error.message);
      throw error;
    }
  }

  async getOHLCV(symbol, timeframe = '4h', limit = 100) {
    try {
      const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
      return ohlcv.map(c => ({
        timestamp: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
      }));
    } catch (error) {
      console.error('获取K线失败:', error.message);
      throw error;
    }
  }

  calculateIndicators(ohlcv) {
    const closes = ohlcv.map(c => c.close);
    const latest = closes[closes.length - 1];

    const rsi = this._calcRSI(closes, 14);
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);
    const macd = this._calcMACD(closes);

    return {
      rsi: rsi.toFixed(2),
      sma20: sma20.toFixed(2),
      sma50: sma50.toFixed(2),
      macd: macd.macd.toFixed(2),
      macdSignal: macd.signal.toFixed(2),
      macdHistogram: macd.histogram.toFixed(2),
      trend: latest > sma20 ? '上升' : latest < sma20 ? '下降' : '震荡',
    };
  }

  _calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    const changes = closes.map((c, i) => i === 0 ? 0 : c - closes[i - 1]).slice(1);
    let avgGain = changes.slice(0, period).reduce((s, c) => s + Math.max(c, 0), 0) / period;
    let avgLoss = changes.slice(0, period).reduce((s, c) => s + Math.max(-c, 0), 0) / period;
    for (let i = period; i < changes.length; i++) {
      avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-changes[i], 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
  }

  _calcEMAFull(data, period) {
    const k = 2 / (period + 1);
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  _calcMACD(closes, fast = 12, slow = 26, signal = 9) {
    if (closes.length < slow + signal) return { macd: 0, signal: 0, histogram: 0 };
    const ema12 = this._calcEMAFull(closes, fast);
    const ema26 = this._calcEMAFull(closes, slow);
    const macdLine = ema12.map((v, i) => v - ema26[i]).slice(slow - 1);
    const signalLine = this._calcEMAFull(macdLine, signal);
    const lastMACD = macdLine[macdLine.length - 1];
    const lastSignal = signalLine[signalLine.length - 1];
    return { macd: lastMACD, signal: lastSignal, histogram: lastMACD - lastSignal };
  }
}

export default BinanceClient;
