import cron from 'node-cron';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import RotationStrategy from './rotation-strategy.js';
import MACrossStrategy from './ma-cross-strategy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function saveEquitySnapshot(rotEquity, maEquity) {
  try {
    const file = path.join(ROOT, 'data', 'equity-log.json');
    let log = [];
    try { log = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch {}
    log.push({ timestamp: new Date().toISOString(), rotation: rotEquity, ma: maEquity });
    if (log.length > 2016) log = log.slice(-2016);
    fs.writeFileSync(file, JSON.stringify(log));
  } catch {}
}

function pushToGitHub() {
  try {
    execSync('git add data/ logs/ && git diff --cached --quiet || git commit -m "📊 自动同步数据" && git push', {
      cwd: ROOT, stdio: 'pipe',
    });
    console.log('☁️  数据已同步到GitHub');
  } catch {}
}

const rotation = new RotationStrategy();
const maCross  = new MACrossStrategy();
let isRunning  = false;

async function run() {
  if (isRunning) { console.log('⏭️  上次检查还在进行中，跳过...'); return; }
  isRunning = true;
  try {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.log(`\n⏰ [${now}] 开始检查...`);

    const [rotResult, maResult] = await Promise.all([rotation.run(), maCross.run()]);

    const rotAcc       = rotation.account;
    const rotCoinPrice = (rotResult?.prices || {})[rotAcc?.currentCoin] || 0;
    const rotEquity    = rotAcc?.initialized
      ? parseFloat(((rotAcc.coinAmount || 0) * rotCoinPrice).toFixed(2))
      : 10000;
    const maEquity = parseFloat((maResult?.equity ?? maCross.account.currentUSDT ?? 10000).toFixed(2));

    saveEquitySnapshot(rotEquity, maEquity);
    pushToGitHub();

  } catch (err) {
    console.error('❌ 执行出错:', err.message);
  } finally {
    isRunning = false;
  }
}

console.log('🤖 模拟交易机器人启动中...');
console.log('  📐 策略一: 币种轮换 (BTC/ETH/BNB/SOL)');
console.log('  📊 策略二: 均线交叉 MA7/MA25 (BTC/USDT 1h)');
console.log('  ⏱️  检查间隔: 每5分钟\n');

run();
cron.schedule('*/5 * * * *', run);
console.log('✨ 机器人运行中... 按Ctrl+C停止\n');
