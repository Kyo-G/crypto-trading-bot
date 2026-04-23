import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/config.js';

// 系统提示词独立出来，配合缓存使用（每次调用只需支付一次写入费，后续命中缓存省90%费用）
const SYSTEM_PROMPT = `你是一个专业的加密货币合约交易分析师，擅长技术分析和风险管理。

你的职责：
1. 分析市场数据和技术指标，给出交易决策
2. 严格控制风险，避免追涨杀跌
3. 在趋势不明朗时优先选择观望(hold)

可用操作说明：
- buy = 开多仓（看涨，做多）
- sell = 开空仓（看跌，做空）
- close = 平掉当前持仓（无论多空）
- hold = 观望，不操作

交易纪律：
- RSI > 80 不开多，RSI < 20 不开空（避免追顶/追底）
- MACD柱状图方向应与操作方向一致
- 已有持仓时，若信号相反，先close再开新方向
- 无明确信号时一律hold，保护资金`;

class ClaudeDecisionEngine {
  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
  }

  buildUserPrompt(marketData, indicators, balance, positions) {
    const positionStr = positions.length > 0
      ? positions.map(p =>
          `  ${p.side.toUpperCase()} ${p.contracts}张 | 开仓价: $${p.entryPrice?.toFixed(2)} | 未实现盈亏: $${p.unrealizedPnl?.toFixed(2)} (${p.percentage?.toFixed(2)}%) | 爆仓价: $${p.liquidationPrice?.toFixed(2)}`
        ).join('\n')
      : '  空仓';

    const macdDir = parseFloat(indicators.macdHistogram) > 0 ? '↑多头' : '↓空头';

    return `## 当前市场数据
- 交易对: ${marketData.symbol} | 杠杆: ${config.trading.leverage}x
- 当前价格: $${marketData.price.toFixed(2)}
- 24h涨跌: ${marketData.change24h?.toFixed(2)}%
- 24h高/低: $${marketData.high24h?.toFixed(2)} / $${marketData.low24h?.toFixed(2)}

## 技术指标
- RSI(14): ${indicators.rsi} ${parseFloat(indicators.rsi) > 75 ? '⚠️超买' : parseFloat(indicators.rsi) < 25 ? '⚠️超卖' : '正常'}
- SMA20: $${indicators.sma20} | SMA50: $${indicators.sma50}
- MACD: ${indicators.macd} | 信号线: ${indicators.macdSignal} | 柱状图: ${indicators.macdHistogram} (${macdDir})
- 趋势: ${indicators.trend}

## 账户状态
- 可用保证金: $${balance.USDT?.toFixed(2)} | 已占用: $${balance.used?.toFixed(2)}
- 当前持仓:
${positionStr}

## 你的决策
严格输出JSON，无其他内容：

{
  "action": "buy" | "sell" | "close" | "hold",
  "confidence": 1-10,
  "position_size_percent": 0-${config.trading.maxPositionSize},
  "stop_loss_price": 具体数字,
  "take_profit_price": 具体数字,
  "reasoning": "50字以内的核心理由"
}

规则：hold/close时position_size_percent填0，stop_loss_price和take_profit_price仍需填当前价附近的合理值`;
  }

  async getDecision(marketData, indicators, balance, positions) {
    try {
      const userPrompt = this.buildUserPrompt(marketData, indicators, balance, positions);

      console.log('\n🤔 正在请求Claude分析...');

      const message = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }, // 缓存系统提示词，省90%费用
          },
        ],
        messages: [{ role: 'user', content: userPrompt }],
      });

      const responseText = message.content[0].text;
      console.log('\n📝 Claude响应:', responseText);

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Claude未返回有效JSON');

      const decision = JSON.parse(jsonMatch[0]);
      this.validateDecision(decision);

      const {
        input_tokens,
        output_tokens,
        cache_creation_input_tokens = 0,
        cache_read_input_tokens = 0,
      } = message.usage;

      // 计费: 普通输入$3/M, 输出$15/M, 缓存写入$3.75/M, 缓存命中$0.30/M
      const cost =
        (input_tokens / 1e6) * 3 +
        (output_tokens / 1e6) * 15 +
        (cache_creation_input_tokens / 1e6) * 3.75 +
        (cache_read_input_tokens / 1e6) * 0.3;

      const cacheNote = cache_read_input_tokens > 0 ? ' ✨缓存命中' : '';
      console.log(`\n💰 API成本: $${cost.toFixed(5)}${cacheNote} (输入:${input_tokens} 输出:${output_tokens} 缓存读:${cache_read_input_tokens})`);

      return { ...decision, cost, timestamp: new Date().toISOString() };

    } catch (error) {
      console.error('❌ Claude决策失败:', error.message);
      return {
        action: 'hold',
        confidence: 0,
        position_size_percent: 0,
        stop_loss_price: 0,
        take_profit_price: 0,
        reasoning: `决策失败: ${error.message}`,
        cost: 0,
        error: true,
      };
    }
  }

  validateDecision(decision) {
    const required = ['action', 'confidence', 'position_size_percent', 'stop_loss_price', 'take_profit_price', 'reasoning'];
    for (const field of required) {
      if (!(field in decision)) throw new Error(`缺少必需字段: ${field}`);
    }
    if (!['buy', 'sell', 'close', 'hold'].includes(decision.action)) {
      throw new Error(`无效action: ${decision.action}`);
    }
    if (decision.confidence < 1 || decision.confidence > 10) {
      throw new Error(`confidence超范围: ${decision.confidence}`);
    }
    if (decision.position_size_percent < 0 || decision.position_size_percent > config.trading.maxPositionSize) {
      throw new Error(`position_size_percent超范围: ${decision.position_size_percent}`);
    }
  }
}

export default ClaudeDecisionEngine;
