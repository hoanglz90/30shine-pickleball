// ============================================================
// 30Shine PickleBall Club — Google Apps Script Backend
// Deploy: Google Apps Script → Web App (Anyone can access)
// ============================================================

const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID'; // ← Thay bằng ID Google Sheet thực tế

function getSpreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

// ── Router ──────────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action || '';
  let result;
  try {
    switch (action) {
      case 'getMembers':
        result = handleGetMembers();
        break;
      case 'getMatches':
        result = handleGetMatches(e.parameter);
        break;
      case 'getLeaderboard':
        result = handleGetLeaderboard(e.parameter);
        break;
      case 'getFund':
        result = handleGetFund(e.parameter);
        break;
      case 'getBadges':
        result = handleGetBadges(e.parameter);
        break;
      case 'getConfig':
        result = handleGetConfig();
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action || '';
  let result;
  try {
    switch (action) {
      case 'recordMatch':
        result = handleRecordMatch(body);
        break;
      case 'deleteMatch':
        result = handleDeleteMatch(body);
        break;
      case 'reportPayment':
        result = handleReportPayment(body);
        break;
      case 'confirmPayment':
        result = handleConfirmPayment(body);
        break;
      case 'addGuest':
        result = handleAddGuest(body);
        break;
      case 'updateAttendance':
        result = handleUpdateAttendance(body);
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Helpers ─────────────────────────────────────────────────

function sheetToJSON(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
}

function generateId(prefix) {
  const now = new Date();
  const dateStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  const timeStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'HHmmss');
  return prefix + dateStr + '_' + timeStr;
}

function todayStr() {
  return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
}

function parseJSON(val) {
  if (!val) return [];
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch (e) { return []; }
}

// ── GET: Members ────────────────────────────────────────────

function handleGetMembers() {
  const rows = sheetToJSON(getSheet('Members'));
  return { success: true, data: rows.filter(r => r.status !== 'inactive') };
}

// ── GET: Matches ────────────────────────────────────────────

function handleGetMatches(params) {
  const filter = params.filter || 'today';
  const rows = sheetToJSON(getSheet('Matches'));
  const today = todayStr();

  let filtered;
  if (filter === 'today') {
    filtered = rows.filter(r => r.session_date === today);
  } else if (filter === 'month') {
    const month = today.substring(0, 7);
    filtered = rows.filter(r => String(r.session_date).startsWith(month));
  } else {
    filtered = rows;
  }

  // Parse JSON fields
  filtered = filtered.map(r => ({
    ...r,
    team_a: parseJSON(r.team_a),
    team_b: parseJSON(r.team_b),
    scores: parseJSON(r.scores)
  }));

  return { success: true, data: filtered };
}

// ── GET: Leaderboard ────────────────────────────────────────

function handleGetLeaderboard(params) {
  const period = params.period || 'month';
  const allMatches = sheetToJSON(getSheet('Matches'));
  const today = todayStr();

  // Filter by period
  let matches;
  if (period === 'week') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const weekAgo = Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    matches = allMatches.filter(r => r.session_date >= weekAgo);
  } else if (period === 'month') {
    const month = today.substring(0, 7);
    matches = allMatches.filter(r => String(r.session_date).startsWith(month));
  } else if (period === 'year') {
    const year = today.substring(0, 4);
    matches = allMatches.filter(r => String(r.session_date).startsWith(year));
  } else {
    matches = allMatches;
  }

  // Aggregate stats per player
  const stats = {};
  matches.forEach(m => {
    const teamA = parseJSON(m.team_a);
    const teamB = parseJSON(m.team_b);
    const winners = m.winner === 'team_a' ? teamA : teamB;
    const losers = m.winner === 'team_a' ? teamB : teamA;

    winners.forEach(name => {
      if (!stats[name]) stats[name] = { name, wins: 0, losses: 0, matches: 0 };
      stats[name].wins++;
      stats[name].matches++;
    });
    losers.forEach(name => {
      if (!stats[name]) stats[name] = { name, wins: 0, losses: 0, matches: 0 };
      stats[name].losses++;
      stats[name].matches++;
    });
  });

  // Calculate win rate and sort
  const leaderboard = Object.values(stats).map(s => ({
    ...s,
    winRate: s.matches > 0 ? Math.round((s.wins / s.matches) * 100) : 0
  }));
  leaderboard.sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);

  return { success: true, data: leaderboard, period };
}

// ── GET: Fund ───────────────────────────────────────────────

function handleGetFund() {
  const rows = sheetToJSON(getSheet('Fund_Transactions'));
  let totalIn = 0, totalOut = 0;
  const transactions = rows.map(r => {
    const amt = Number(r.amount) || 0;
    if (r.type === 'expense') {
      totalOut += amt;
    } else if (r.status === 'confirmed') {
      totalIn += amt;
    }
    return r;
  });

  // Pending payments (match fees not yet paid)
  const pending = transactions.filter(r => r.status === 'pending');
  const confirmed = transactions.filter(r => r.status === 'confirmed');

  return {
    success: true,
    balance: totalIn - totalOut,
    totalIn,
    totalOut,
    pending,
    confirmed,
    all: transactions
  };
}

// ── GET: Badges ─────────────────────────────────────────────

function handleGetBadges(params) {
  const period = (params && params.period) || 'month';
  const lb = handleGetLeaderboard({ period });
  const allMatches = sheetToJSON(getSheet('Matches'));
  const today = todayStr();

  // Filter matches for period
  let matches;
  if (period === 'month') {
    const month = today.substring(0, 7);
    matches = allMatches.filter(r => String(r.session_date).startsWith(month));
  } else {
    matches = allMatches;
  }

  const badges = [];
  const players = lb.data;

  if (players.length === 0) return { success: true, data: [] };

  // Vua trận — most matches played
  const vuaTran = players.reduce((a, b) => a.matches >= b.matches ? a : b);
  if (vuaTran.matches > 0) {
    badges.push({ id: 'vua_tran', label: 'Vua trận', icon: '👑', player: vuaTran.name, value: vuaTran.matches + ' trận' });
  }

  // Tướng gà — most losses
  const tuongGa = players.reduce((a, b) => a.losses >= b.losses ? a : b);
  if (tuongGa.losses > 0) {
    badges.push({ id: 'tuong_ga', label: 'Tướng gà', icon: '🐔', player: tuongGa.name, value: tuongGa.losses + ' thua' });
  }

  // Mạnh thường quân — most fund contributions
  const fundRows = sheetToJSON(getSheet('Fund_Transactions'));
  const contribs = {};
  fundRows.forEach(r => {
    if (r.type !== 'expense' && r.status === 'confirmed') {
      contribs[r.member] = (contribs[r.member] || 0) + Number(r.amount);
    }
  });
  const topDonor = Object.entries(contribs).sort((a, b) => b[1] - a[1])[0];
  if (topDonor) {
    badges.push({ id: 'manh_thuong_quan', label: 'Mạnh thường quân', icon: '💵', player: topDonor[0], value: formatVND(topDonor[1]) });
  }

  // Streaks — Chuỗi Bất Bại / Chuỗi Thất Bại
  const playerStreaks = calcStreaks(matches);
  Object.entries(playerStreaks).forEach(([name, s]) => {
    if (s.currentWin >= 3) {
      badges.push({ id: 'dang_nong_' + name, label: 'Chuỗi Bất Bại', icon: '🔥', player: name, value: s.currentWin + ' win liên tiếp' });
    }
    if (s.currentLoss >= 3) {
      badges.push({ id: 'dang_lanh_' + name, label: 'Chuỗi Thất Bại', icon: '🥶', player: name, value: s.currentLoss + ' thua liên tiếp' });
    }
  });

  // Cặp đôi vàng — best doubles pair (win rate, min 3 matches)
  const pairs = calcPairs(matches);
  const bestPair = pairs.filter(p => p.matches >= 3).sort((a, b) => b.winRate - a.winRate)[0];
  if (bestPair) {
    badges.push({ id: 'cap_doi_vang', label: 'Cặp đôi vàng', icon: '💎', player: bestPair.pair, value: 'Win ' + bestPair.winRate + '% · ' + bestPair.matches + ' trận' });
  }

  // Cạ Cứng — most frequent pair
  const freqPair = pairs.sort((a, b) => b.matches - a.matches)[0];
  if (freqPair && freqPair.matches >= 2) {
    badges.push({ id: 'anh_em_ruot', label: 'Cạ Cứng', icon: '🤝', player: freqPair.pair, value: freqPair.matches + ' trận chung' });
  }

  // Khắc tinh — best record vs specific opponent
  const rivals = calcRivals(matches);
  if (rivals.length > 0) {
    const top = rivals[0];
    badges.push({ id: 'khac_tinh', label: 'Khắc tinh', icon: '👿', player: top.player + ' → ' + top.victim, value: top.wins + '/' + top.total + ' trận thắng' });
  }

  return { success: true, data: badges };
}

function calcStreaks(matches) {
  // Sort matches by date
  const sorted = matches.slice().sort((a, b) => (a.session_date + a.created_at) > (b.session_date + b.created_at) ? 1 : -1);
  const streaks = {};

  sorted.forEach(m => {
    const teamA = parseJSON(m.team_a);
    const teamB = parseJSON(m.team_b);
    const winners = m.winner === 'team_a' ? teamA : teamB;
    const losers = m.winner === 'team_a' ? teamB : teamA;

    winners.forEach(name => {
      if (!streaks[name]) streaks[name] = { currentWin: 0, currentLoss: 0 };
      streaks[name].currentWin++;
      streaks[name].currentLoss = 0;
    });
    losers.forEach(name => {
      if (!streaks[name]) streaks[name] = { currentWin: 0, currentLoss: 0 };
      streaks[name].currentLoss++;
      streaks[name].currentWin = 0;
    });
  });

  return streaks;
}

function calcPairs(matches) {
  const pairStats = {};
  matches.filter(m => m.type === 'doubles').forEach(m => {
    const teamA = parseJSON(m.team_a).sort();
    const teamB = parseJSON(m.team_b).sort();
    const keyA = teamA.join(' & ');
    const keyB = teamB.join(' & ');

    if (!pairStats[keyA]) pairStats[keyA] = { pair: keyA, wins: 0, losses: 0, matches: 0 };
    if (!pairStats[keyB]) pairStats[keyB] = { pair: keyB, wins: 0, losses: 0, matches: 0 };

    if (m.winner === 'team_a') {
      pairStats[keyA].wins++;
      pairStats[keyB].losses++;
    } else {
      pairStats[keyB].wins++;
      pairStats[keyA].losses++;
    }
    pairStats[keyA].matches++;
    pairStats[keyB].matches++;
  });

  return Object.values(pairStats).map(p => ({
    ...p,
    winRate: p.matches > 0 ? Math.round((p.wins / p.matches) * 100) : 0
  }));
}

function calcRivals(matches) {
  const h2h = {};
  matches.forEach(m => {
    const teamA = parseJSON(m.team_a);
    const teamB = parseJSON(m.team_b);
    const winners = m.winner === 'team_a' ? teamA : teamB;
    const losers = m.winner === 'team_a' ? teamB : teamA;

    winners.forEach(w => {
      losers.forEach(l => {
        const key = w + '>' + l;
        if (!h2h[key]) h2h[key] = { player: w, victim: l, wins: 0, total: 0 };
        h2h[key].wins++;
        h2h[key].total++;
        // Also count reverse
        const rkey = l + '>' + w;
        if (!h2h[rkey]) h2h[rkey] = { player: l, victim: w, wins: 0, total: 0 };
        h2h[rkey].total++;
      });
    });
  });

  return Object.values(h2h)
    .filter(r => r.total >= 3 && r.wins / r.total >= 0.7)
    .sort((a, b) => (b.wins / b.total) - (a.wins / a.total));
}

function formatVND(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'tr';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return n + 'đ';
}

// ── GET: Config ─────────────────────────────────────────────

function handleGetConfig() {
  const sheet = getSheet('Config');
  const data = sheet.getDataRange().getValues();
  const config = {};
  data.forEach(row => {
    if (row[0]) config[row[0]] = row[1];
  });
  return { success: true, data: config };
}

// ── POST: Record Match ──────────────────────────────────────

function handleRecordMatch(body) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet = getSheet('Matches');
    const matchId = generateId('MT');
    const now = new Date();
    const sessionDate = body.session_date || todayStr();

    sheet.appendRow([
      matchId,
      sessionDate,
      body.type,
      JSON.stringify(body.team_a),
      JSON.stringify(body.team_b),
      JSON.stringify(body.scores),
      body.winner,
      body.best_of || 1,
      body.bet_amount || 0,
      body.recorded_by || '',
      now.toISOString()
    ]);

    // Auto-create fund transactions for losing team
    if (body.bet_amount > 0) {
      const losers = body.winner === 'team_a' ? body.team_b : body.team_a;
      const fundSheet = getSheet('Fund_Transactions');
      losers.forEach(name => {
        const txId = generateId('TX');
        fundSheet.appendRow([
          txId,
          sessionDate,
          name,
          body.bet_amount,
          'match_fee',
          'pending',
          matchId,
          'Thua trận ' + matchId.slice(-6),
          '',
          ''
        ]);
      });
    }

    return { success: true, matchId };
  } finally {
    lock.releaseLock();
  }
}

// ── POST: Delete Match (Admin) ──────────────────────────────

function handleDeleteMatch(body) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    // Verify admin
    const members = sheetToJSON(getSheet('Members'));
    const admin = members.find(m => m.name === body.admin_name && m.role === 'admin');
    if (!admin) return { success: false, error: 'Không có quyền admin' };

    const sheet = getSheet('Matches');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === body.match_id) {
        sheet.deleteRow(i + 1);
        // Also delete related fund transactions
        deleteRelatedFundTx(body.match_id);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy trận' };
  } finally {
    lock.releaseLock();
  }
}

function deleteRelatedFundTx(matchId) {
  const sheet = getSheet('Fund_Transactions');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][6] === matchId) {
      sheet.deleteRow(i + 1);
    }
  }
}

// ── POST: Report Payment ────────────────────────────────────

function handleReportPayment(body) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet = getSheet('Fund_Transactions');

    // If reporting for a specific pending tx, update its status
    if (body.tx_id) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === body.tx_id) {
          sheet.getRange(i + 1, 6).setValue('reported');
          sheet.getRange(i + 1, 8).setValue(body.note || 'Đã CK');
          return { success: true };
        }
      }
      return { success: false, error: 'Không tìm thấy giao dịch' };
    }

    // Create new donation/payment
    const txId = generateId('TX');
    sheet.appendRow([
      txId,
      todayStr(),
      body.member,
      body.amount,
      body.type || 'donation',
      'reported',
      '',
      body.note || '',
      '',
      ''
    ]);

    return { success: true, txId };
  } finally {
    lock.releaseLock();
  }
}

// ── POST: Confirm Payment (Admin) ───────────────────────────

function handleConfirmPayment(body) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    // Verify admin
    const members = sheetToJSON(getSheet('Members'));
    const admin = members.find(m => m.name === body.admin_name && m.role === 'admin');
    if (!admin) return { success: false, error: 'Không có quyền admin' };

    const sheet = getSheet('Fund_Transactions');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === body.tx_id) {
        sheet.getRange(i + 1, 6).setValue('confirmed');
        sheet.getRange(i + 1, 9).setValue(body.admin_name);
        sheet.getRange(i + 1, 10).setValue(new Date().toISOString());
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy giao dịch' };
  } finally {
    lock.releaseLock();
  }
}

// ── POST: Add Guest ─────────────────────────────────────────

function handleAddGuest(body) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet = getSheet('Members');
    const existing = sheetToJSON(sheet);
    if (existing.find(m => m.name === body.name)) {
      return { success: false, error: 'Tên đã tồn tại' };
    }

    const id = 'M' + String(existing.length + 1).padStart(3, '0');
    sheet.appendRow([id, body.name, 'member', 'guest', todayStr(), '🏓']);
    return { success: true, id };
  } finally {
    lock.releaseLock();
  }
}

// ── POST: Update Attendance ─────────────────────────────────

function handleUpdateAttendance(body) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet = getSheet('Sessions');
    const data = sheet.getDataRange().getValues();
    const sessionDate = body.date || todayStr();

    // Find existing session for this date
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === sessionDate) {
        sheet.getRange(i + 1, 3).setValue(JSON.stringify(body.attendees));
        return { success: true, updated: true };
      }
    }

    // Create new session
    const sessionId = 'S' + sessionDate.replace(/-/g, '');
    sheet.appendRow([sessionId, sessionDate, JSON.stringify(body.attendees), body.notes || '', body.created_by || '']);
    return { success: true, created: true };
  } finally {
    lock.releaseLock();
  }
}

// ── Recap Generator ─────────────────────────────────────────

function handleGenerateRecap(params) {
  const date = params.date || todayStr();
  const matches = sheetToJSON(getSheet('Matches')).filter(m => m.session_date === date);

  if (matches.length === 0) return { success: true, text: 'Hôm nay chưa có trận nào 🏓' };

  let text = '🏓 30SHINE PICKLEBALL CLUB\n';
  text += '📅 ' + date + ' · ' + matches.length + ' trận\n';
  text += '─────────────────\n';

  matches.forEach((m, i) => {
    const teamA = parseJSON(m.team_a);
    const teamB = parseJSON(m.team_b);
    const scores = parseJSON(m.scores);
    const scoreStr = scores.map(s => s.a + '-' + s.b).join(', ');
    const winIcon = m.winner === 'team_a' ? '🏆' : '';
    const loseIcon = m.winner === 'team_b' ? '🏆' : '';

    text += '\n' + (i + 1) + '. ' + (m.type === 'doubles' ? 'Đôi' : 'Đơn') + '\n';
    text += winIcon + ' ' + teamA.join(' & ') + '\n';
    text += '   vs\n';
    text += loseIcon + ' ' + teamB.join(' & ') + '\n';
    text += '   📊 ' + scoreStr + '\n';
  });

  text += '\n─────────────────\n';
  text += '💪 Hẹn buổi sau anh em!\n';

  return { success: true, text };
}

// ── Init: Create sheets if not exist ────────────────────────

function initSheets() {
  const ss = getSpreadsheet();
  const sheetsConfig = {
    'Members': ['id', 'name', 'role', 'status', 'join_date', 'avatar_emoji'],
    'Sessions': ['session_id', 'date', 'attendees', 'notes', 'created_by'],
    'Matches': ['match_id', 'session_date', 'type', 'team_a', 'team_b', 'scores', 'winner', 'best_of', 'bet_amount', 'recorded_by', 'created_at'],
    'Fund_Transactions': ['tx_id', 'date', 'member', 'amount', 'type', 'status', 'match_id', 'note', 'confirmed_by', 'confirmed_at'],
    'Config': ['key', 'value']
  };

  Object.entries(sheetsConfig).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (!existing[0]) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  });

  // Add default config
  const configSheet = ss.getSheetByName('Config');
  if (configSheet.getLastRow() < 2) {
    configSheet.appendRow(['bank_name', 'MB Bank']);
    configSheet.appendRow(['bank_account', '5000199991996']);
    configSheet.appendRow(['account_holder', 'NGUYEN THANH TRUNG']);
    configSheet.appendRow(['default_bet', '50000']);
  }
}
