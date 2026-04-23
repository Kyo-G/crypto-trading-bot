// 测试脚本 - 验证API配置是否正确
import BinanceClient from './binance-client.js';
import ClaudeDecisionEngine from './claude-engine.js';
import { config } from '../config/config.js';

console.log('🧪 开始测试API配置...\n');

// 测试Binance API
async function testBinance() {
  console.log('1️⃣ 测试Binance API连接...');
  try {
    const binance = new BinanceClient();
    
    const ticker = await binance.getCurrentPrice('BTC/USDT');
    console.log(`✅ 价格获取成功: $${ticker.price.toFixed(2)}`);
    
    const balance = await binance.getBalance();
    console.log(`✅ 余额获取成功: $${balance.USDT.toFixed(2)} USDT`);
    
    const ohlcv = await binance.getOHLCV('BTC/USDT', '4h', 10);
    console.log(`✅ K线获取成功: ${ohlcv.length}条数据`);
    
    console.log('✅ Binance API测试通过!\n');
    return true;
  } catch (error) {
    console.error('❌ Binance API测试失败:', error.message);
    console.log('\n请检查:');
    console.log('1. API Key和Secret是否正确');
    console.log('2. 是否已在 https://testnet.binance.vision 注册');
    console.log('3. 网络连接是否正常\n');
    return false;
  }
}

// 测试Claude API
async function testClaude() {
  console.log('2️⃣ 测试Claude API连接...');
  try {
    const claude = new ClaudeDecisionEngine();
    
    const testMarketData = {
      symbol: 'BTC/USDT',
      price: 67234.50,
      change24h: 2.34,
      high24h: 68000,
      low24h: 66500,
    };
    
    const testIndicators = {
      rsi: '58.5',
      sma20: '66800',
      sma50: '65000',
      trend: '上升',
    };
    
    const testBalance = { USDT: 10000, BTC: 0 };
    const testPositions = [];
    
    console.log('正在请求Claude分析测试数据...');
    const decision = await claude.getDecision(
      testMarketData,
      testIndicators,
      testBalance,
      testPositions
    );
    
    console.log(`✅ Claude决策获取成功:`);
    console.log(`   操作: ${decision.action}`);
    console.log(`   信心: ${decision.confidence}/10`);
    console.log(`   理由: ${decision.reasoning}`);
    console.log(`   成本: $${decision.cost?.toFixed(4)}\n`);
    
    console.log('✅ Claude API测试通过!\n');
    return true;
  } catch (error) {
    console.error('❌ Claude API测试失败:', error.message);
    console.log('\n请检查:');
    console.log('1. Anthropic API Key是否正确');
    console.log('2. API Key是否有足够余额');
    console.log('3. 网络是否能访问Anthropic服务\n');
    return false;
  }
}

// 运行测试
async function runTests() {
  const binanceOk = await testBinance();
  const claudeOk = await testClaude();
  
  console.log('='.repeat(60));
  if (binanceOk && claudeOk) {
    console.log('🎉 所有测试通过!你可以运行 npm start 启动机器人了');
    console.log('\n💡 提示:');
    console.log('- 首次运行会进入"观察模式",只分析不交易');
    console.log('- Binance Testnet的资金是虚拟的,可以放心测试');
    console.log('- 观察几天后,可以在config.js中改为"交易模式"');
    console.log('- 日志文件会保存在 logs/ 目录\n');
  } else {
    console.log('❌ 部分测试失败,请修复配置后重试');
    console.log('\n可以运行: npm test 再次测试\n');
  }
  console.log('='.repeat(60));
}

runTests();
