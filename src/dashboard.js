import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

// 从Binance公开API获取当前BTC价格
function fetchBTCPrice() {
  return new Promise((resolve) => {
    https.get('https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(parseFloat(JSON.parse(data).price)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function getAccountData() {
  const accountFile = path.join(__dirname, '..', 'data', 'paper-account.json');
  return readJSON(accountFile) || {
    balance: { USDT: 10000, used: 0 },
    positions: [],
    tradeHistory: [],
    initialBalance: 10000,
  };
}

function getTodayDecisions() {
  const date = new Date().toISOString().split('T')[0];
  const file = path.join(__dirname, '..', 'logs', `decisions-${date}.json`);
  return readJSON(file) || [];
}

async function buildAPIData() {
  const account = getAccountData();
  const decisions = getTodayDecisions();
  const currentPrice = await fetchBTCPrice();

  if (!account) return { error: '读取账户数据失败' };

  // 计算持仓实时盈亏
  const positions = (account.positions || []).map(p => {
    const pnl = p.side === 'long'
      ? (currentPrice - p.entryPrice) * p.contracts
      : (p.entryPrice - currentPrice) * p.contracts;
    return { ...p, unrealizedPnl: pnl, percentage: (pnl / p.margin) * 100 };
  });

  const unrealized = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const equity = account.balance.USDT + account.balance.used + unrealized;
  const totalReturn = ((equity - account.initialBalance) / account.initialBalance * 100);
  const history = account.tradeHistory || [];
  const wins = history.filter(t => t.pnl > 0).length;
  const totalPnl = history.reduce((s, t) => s + t.pnl, 0);

  return {
    currentPrice,
    account: {
      equity,
      available: account.balance.USDT,
      usedMargin: account.balance.used,
      unrealizedPnl: unrealized,
      totalReturn,
      initialBalance: account.initialBalance,
    },
    positions,
    history: history.slice(-20).reverse(), // 最近20笔
    decisions: decisions.slice(-10).reverse(), // 最近10次决策
    stats: {
      totalTrades: history.length,
      wins,
      losses: history.length - wins,
      winRate: history.length > 0 ? (wins / history.length * 100).toFixed(1) : '0.0',
      totalPnl,
    },
    updatedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
  };
}

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BTC 模拟交易仪表盘</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      min-height: 100vh;
    }
    .header {
      background: #161b22;
      border-bottom: 1px solid #30363d;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header h1 { font-size: 18px; font-weight: 600; }
    .header h1 span { color: #f0b429; }
    .price-badge {
      background: #1c2128;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 6px 16px;
      font-size: 20px;
      font-weight: 700;
      color: #58a6ff;
    }
    .refresh-note { color: #8b949e; font-size: 12px; }

    .container { max-width: 1100px; margin: 0 auto; padding: 20px; }

    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 20px;
    }
    .card-label { color: #8b949e; font-size: 12px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .card-value { font-size: 28px; font-weight: 700; }
    .card-sub { font-size: 12px; color: #8b949e; margin-top: 4px; }
    .up { color: #3fb950; }
    .down { color: #f85149; }
    .neutral { color: #e6edf3; }

    .section { background: #161b22; border: 1px solid #30363d; border-radius: 12px; margin-bottom: 20px; overflow: hidden; }
    .section-title {
      padding: 14px 20px;
      border-bottom: 1px solid #30363d;
      font-weight: 600;
      font-size: 13px;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .empty { padding: 32px; text-align: center; color: #8b949e; }

    /* 持仓 */
    .position-card { padding: 20px; }
    .position-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .position-side {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 1px;
    }
    .side-long { background: rgba(63, 185, 80, 0.15); color: #3fb950; border: 1px solid #3fb950; }
    .side-short { background: rgba(248, 81, 73, 0.15); color: #f85149; border: 1px solid #f85149; }
    .position-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .pos-item label { display: block; color: #8b949e; font-size: 11px; margin-bottom: 4px; }
    .pos-item span { font-size: 16px; font-weight: 600; }
    .pnl-bar { margin-top: 16px; height: 4px; background: #21262d; border-radius: 2px; overflow: hidden; }
    .pnl-bar-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }

    /* 表格 */
    table { width: 100%; border-collapse: collapse; }
    th { padding: 10px 16px; text-align: left; color: #8b949e; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #21262d; font-weight: 500; }
    td { padding: 10px 16px; border-bottom: 1px solid #21262d; font-size: 13px; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #1c2128; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-buy { background: rgba(63,185,80,0.15); color: #3fb950; }
    .badge-sell { background: rgba(248,81,73,0.15); color: #f85149; }
    .badge-close { background: rgba(240,180,41,0.15); color: #f0b429; }
    .badge-hold { background: rgba(139,148,158,0.15); color: #8b949e; }

    .conf-bar { display: inline-block; width: 60px; height: 6px; background: #21262d; border-radius: 3px; vertical-align: middle; margin-left: 6px; overflow: hidden; }
    .conf-fill { height: 100%; border-radius: 3px; background: #58a6ff; }

    .error { padding: 40px; text-align: center; color: #f85149; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #3fb950; animation: pulse 2s infinite; margin-right: 6px; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  </style>
</head>
<body>
  <div class="header">
    <h1>🤖 BTC <span>模拟合约</span> 仪表盘</h1>
    <div class="price-badge" id="btc-price">--</div>
    <div class="refresh-note"><span class="dot"></span>每5秒自动刷新</div>
  </div>

  <div class="container">
    <div id="error" style="display:none" class="section"><div class="error" id="error-msg"></div></div>
    <div id="main" style="display:none">

      <!-- 账户概览 -->
      <div class="cards">
        <div class="card">
          <div class="card-label">总资产</div>
          <div class="card-value" id="equity">--</div>
          <div class="card-sub" id="initial">初始 $10,000</div>
        </div>
        <div class="card">
          <div class="card-label">累计收益率</div>
          <div class="card-value" id="total-return">--</div>
          <div class="card-sub" id="total-pnl">累计盈亏 --</div>
        </div>
        <div class="card">
          <div class="card-label">可用保证金</div>
          <div class="card-value" id="available">--</div>
          <div class="card-sub" id="used-margin">占用 --</div>
        </div>
        <div class="card">
          <div class="card-label">胜率</div>
          <div class="card-value" id="win-rate">--</div>
          <div class="card-sub" id="trade-count">共 0 笔交易</div>
        </div>
      </div>

      <!-- 当前持仓 -->
      <div class="section">
        <div class="section-title">当前持仓</div>
        <div id="positions-content"></div>
      </div>

      <!-- 历史交易 -->
      <div class="section">
        <div class="section-title">历史交易（最近20笔）</div>
        <div id="history-content"></div>
      </div>

      <!-- Claude决策 -->
      <div class="section">
        <div class="section-title">Claude 今日决策记录</div>
        <div id="decisions-content"></div>
      </div>

    </div>
  </div>

  <script>
    const fmt = (n, dec=2) => '$' + parseFloat(n).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const fmtPct = (n) => (n >= 0 ? '+' : '') + parseFloat(n).toFixed(2) + '%';
    const colorClass = (n) => parseFloat(n) > 0 ? 'up' : parseFloat(n) < 0 ? 'down' : 'neutral';
    const timeStr = (iso) => new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });

    async function refresh() {
      try {
        const res = await fetch('/api/data');
        const d = await res.json();

        if (d.error) {
          document.getElementById('error').style.display = '';
          document.getElementById('main').style.display = 'none';
          document.getElementById('error-msg').textContent = d.error;
          return;
        }

        document.getElementById('error').style.display = 'none';
        document.getElementById('main').style.display = '';

        // 价格
        document.getElementById('btc-price').textContent = fmt(d.currentPrice);

        // 账户卡片
        const a = d.account;
        document.getElementById('equity').innerHTML = \`<span class="\${colorClass(a.totalReturn)}">\${fmt(a.equity)}</span>\`;
        document.getElementById('initial').textContent = '初始 ' + fmt(a.initialBalance);
        const retEl = document.getElementById('total-return');
        retEl.innerHTML = \`<span class="\${colorClass(a.totalReturn)}">\${fmtPct(a.totalReturn)}</span>\`;
        document.getElementById('total-pnl').innerHTML = \`累计盈亏 <span class="\${colorClass(d.stats.totalPnl)}">\${fmt(d.stats.totalPnl)}</span>\`;
        document.getElementById('available').textContent = fmt(a.available);
        document.getElementById('used-margin').textContent = '占用 ' + fmt(a.usedMargin);
        document.getElementById('win-rate').innerHTML = \`<span class="up">\${d.stats.winRate}%</span>\`;
        document.getElementById('trade-count').textContent = \`共 \${d.stats.totalTrades} 笔  胜\${d.stats.wins} 负\${d.stats.losses}\`;

        // 持仓
        const posEl = document.getElementById('positions-content');
        if (d.positions.length === 0) {
          posEl.innerHTML = '<div class="empty">当前空仓</div>';
        } else {
          posEl.innerHTML = d.positions.map(p => {
            const pct = Math.min(Math.abs(p.percentage), 100);
            const barColor = p.unrealizedPnl >= 0 ? '#3fb950' : '#f85149';
            return \`
              <div class="position-card">
                <div class="position-top">
                  <span class="position-side \${p.side === 'long' ? 'side-long' : 'side-short'}">\${p.side === 'long' ? '做多 LONG' : '做空 SHORT'}</span>
                  <span class="\${colorClass(p.unrealizedPnl)}" style="font-size:20px;font-weight:700">\${fmt(p.unrealizedPnl)} <span style="font-size:14px">(\${fmtPct(p.percentage)})</span></span>
                </div>
                <div class="position-grid">
                  <div class="pos-item"><label>数量</label><span>\${p.contracts.toFixed(4)} BTC</span></div>
                  <div class="pos-item"><label>开仓价</label><span>\${fmt(p.entryPrice)}</span></div>
                  <div class="pos-item"><label>当前价</label><span>\${fmt(d.currentPrice)}</span></div>
                  <div class="pos-item"><label>爆仓价</label><span style="color:#f0b429">\${fmt(p.liquidationPrice)}</span></div>
                  <div class="pos-item"><label>保证金</label><span>\${fmt(p.margin)}</span></div>
                  <div class="pos-item"><label>杠杆</label><span>\${p.leverage}x</span></div>
                </div>
                <div class="pnl-bar"><div class="pnl-bar-fill" style="width:\${pct}%;background:\${barColor}"></div></div>
              </div>\`;
          }).join('');
        }

        // 历史交易
        const histEl = document.getElementById('history-content');
        if (d.history.length === 0) {
          histEl.innerHTML = '<div class="empty">暂无交易记录</div>';
        } else {
          histEl.innerHTML = '<table><thead><tr><th>时间</th><th>方向</th><th>开仓价</th><th>平仓价</th><th>数量</th><th>盈亏</th><th>收益率</th></tr></thead><tbody>' +
            d.history.map(t => {
              const isBuy = t.side === 'buy' || t.side === 'long';
              const isClose = t.side?.startsWith('close');
              const badge = isClose ? 'badge-close' : isBuy ? 'badge-buy' : 'badge-sell';
              const label = isClose ? (t.side.includes('long') ? '平多' : '平空') : (isBuy ? '开多' : '开空');
              return \`<tr>
                <td>\${timeStr(t.openedAt || t.closedAt)}</td>
                <td><span class="badge \${badge}">\${label}</span></td>
                <td>\${t.entryPrice ? fmt(t.entryPrice) : '-'}</td>
                <td>\${t.closePrice ? fmt(t.closePrice) : '-'}</td>
                <td>\${(t.contracts || 0).toFixed(4)} BTC</td>
                <td class="\${colorClass(t.pnl)}">\${t.pnl >= 0 ? '+' : ''}\${fmt(t.pnl)}</td>
                <td class="\${colorClass(t.pnlPercent)}">\${fmtPct(t.pnlPercent)}</td>
              </tr>\`;
            }).join('') + '</tbody></table>';
        }

        // Claude决策
        const decEl = document.getElementById('decisions-content');
        if (d.decisions.length === 0) {
          decEl.innerHTML = '<div class="empty">今日暂无决策记录</div>';
        } else {
          decEl.innerHTML = '<table><thead><tr><th>时间</th><th>决策</th><th>信心</th><th>价格</th><th>RSI</th><th>理由</th></tr></thead><tbody>' +
            d.decisions.map(dec => {
              const action = dec.decision?.action || 'hold';
              const badges = { buy:'badge-buy', sell:'badge-sell', close:'badge-close', hold:'badge-hold' };
              const labels = { buy:'开多', sell:'开空', close:'平仓', hold:'观望' };
              const conf = dec.decision?.confidence || 0;
              return \`<tr>
                <td>\${timeStr(dec.timestamp)}</td>
                <td><span class="badge \${badges[action] || 'badge-hold'}">\${labels[action] || action}</span></td>
                <td>
                  \${conf}/10
                  <span class="conf-bar"><span class="conf-fill" style="width:\${conf*10}%"></span></span>
                </td>
                <td>\${dec.price ? fmt(dec.price) : '-'}</td>
                <td>\${dec.rsi || '-'}</td>
                <td style="color:#8b949e;max-width:280px">\${dec.decision?.reasoning || ''}</td>
              </tr>\`;
            }).join('') + '</tbody></table>';
        }

      } catch (e) {
        console.error(e);
      }
    }

    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    const data = await buildAPIData();
    res.end(JSON.stringify(data));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
  }
});

server.listen(PORT, () => {
  console.log(`\n🖥️  仪表盘已启动: http://localhost:${PORT}\n`);
});
