const TEST_RESULTS_SHEET = 'Результаты теста';
const FINAL_ANSWERS_SHEET = 'Ответы итогового теста';
const MODULE_RESULTS_SHEET = 'Мини-тесты';
const OPEN_ANSWERS_SHEET = 'Открытые вопросы';
const PRACTICE_ANSWERS_SHEET = 'Практические задания';
const USERS_SHEET = 'Пользователи';

// Необязательно: задайте секрет, чтобы статистику в admin.html видел только владелец.
// Пустая строка = статистика доступна без ключа. Если задать, в admin.html введите тот же ключ.
const OWNER_KEY = '';

function doGet(e) {
  const callback = e.parameter.callback || 'callback';
  const action = e.parameter.action || '';
  let response;

  try {
    if (action === 'register') {
      response = registerUser_({
        name: e.parameter.name || '',
        department: e.parameter.department || '',
        passwordHash: e.parameter.passwordHash || ''
      });
    } else if (action === 'login') {
      response = loginUser_({
        name: e.parameter.name || '',
        passwordHash: e.parameter.passwordHash || ''
      });
    } else if (action === 'health') {
      response = {
        ok: true,
        version: '2026-06-15-v3',
        capabilities: {
          register: true,
          login: true,
          stats: true,
          submitModuleResult: true,
          submitFinalSummary: true,
          submitFinalAnswers: true,
          submitOpenAnswer: true,
          submitPracticeAnswer: true
        }
      };
    } else if (action === 'submitModuleResult') {
      response = submitModuleResultGet_(e.parameter);
    } else if (action === 'submitFinalSummary') {
      response = submitFinalSummaryGet_(e.parameter);
    } else if (action === 'submitFinalAnswers') {
      response = submitFinalAnswersGet_(e.parameter);
    } else if (action === 'submitOpenAnswer') {
      response = submitOpenAnswerGet_(e.parameter);
    } else if (action === 'submitPracticeAnswer') {
      response = submitPracticeAnswerGet_(e.parameter);
    } else if (action === 'stats') {
      response = computeStats_(e.parameter.ownerKey || '');
    } else {
      response = { ok: false, error: 'Неизвестное действие.' };
    }
  } catch (error) {
    response = { ok: false, error: String(error) };
  }

  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(response) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const payload = JSON.parse(e.postData.contents);
    const submittedAt = payload.submittedAt ? new Date(payload.submittedAt) : new Date();
    const participant = payload.participant || {};

    const userCheck = findUser_(participant.name || '', participant.passwordHash || '');
    if (!userCheck.ok) {
      throw new Error(userCheck.error || 'Пользователь не найден или отключен.');
    }

    appendTestResult_(payload, participant, submittedAt);
    appendFinalAnswers_(payload.finalAnswers || [], participant, submittedAt, payload.build || '');
    appendOpenAnswers_(payload, participant, submittedAt);
    appendPracticeAnswers_(payload, participant, submittedAt);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function registerUser_(user) {
  const name = normalizeName_(user.name);
  const department = String(user.department || '').trim();
  const passwordHash = String(user.passwordHash || '').trim();

  if (!name || !department || !passwordHash) {
    return { ok: false, error: 'Заполните ФИО, подразделение и пароль.' };
  }

  const sheet = getSheet_(USERS_SHEET);
  ensureHeader_(sheet, [
    'Дата регистрации',
    'ФИО',
    'Подразделение',
    'Хэш пароля',
    'Статус',
    'Последний вход',
    'Комментарий'
  ]);

  const existing = findUserRow_(sheet, name);
  if (existing.rowIndex > 0) {
    const status = String(existing.values[4] || '').toLowerCase();
    if (status === 'blocked' || status === 'deleted') {
      return { ok: false, error: 'Пользователь отключен владельцем курса.' };
    }
    return { ok: false, error: 'Пользователь с таким ФИО уже зарегистрирован. Используйте вход.' };
  }

  sheet.appendRow([new Date(), name, department, passwordHash, 'active', new Date(), '']);
  return { ok: true, name: name, department: department, status: 'active' };
}

function loginUser_(user) {
  const name = normalizeName_(user.name);
  const passwordHash = String(user.passwordHash || '').trim();

  if (!name || !passwordHash) {
    return { ok: false, error: 'Заполните ФИО и пароль.' };
  }

  const result = findUser_(name, passwordHash);
  if (!result.ok) return result;

  const sheet = getSheet_(USERS_SHEET);
  sheet.getRange(result.rowIndex, 6).setValue(new Date());
  return { ok: true, name: result.name, department: result.department, status: result.status };
}

function findUser_(name, passwordHash) {
  const sheet = getSheet_(USERS_SHEET);
  ensureHeader_(sheet, [
    'Дата регистрации',
    'ФИО',
    'Подразделение',
    'Хэш пароля',
    'Статус',
    'Последний вход',
    'Комментарий'
  ]);

  const normalized = normalizeName_(name);
  const row = findUserRow_(sheet, normalized);
  if (row.rowIndex < 1) return { ok: false, error: 'Пользователь не найден. Сначала зарегистрируйтесь.' };

  const status = String(row.values[4] || '').toLowerCase();
  if (status === 'blocked' || status === 'deleted') {
    return { ok: false, error: 'Пользователь отключен владельцем курса.' };
  }

  if (String(row.values[3] || '') !== String(passwordHash || '')) {
    return { ok: false, error: 'Неверный пароль.' };
  }

  return {
    ok: true,
    rowIndex: row.rowIndex,
    name: row.values[1] || normalized,
    department: row.values[2] || '',
    status: row.values[4] || 'active'
  };
}

function findUserRow_(sheet, normalizedName) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { rowIndex: -1, values: [] };
  const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  for (let index = 0; index < values.length; index += 1) {
    if (normalizeName_(values[index][1]) === normalizedName) {
      return { rowIndex: index + 2, values: values[index] };
    }
  }
  return { rowIndex: -1, values: [] };
}

function normalizeName_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function appendTestResult_(payload, participant, submittedAt) {
  const sheet = getSheet_(TEST_RESULTS_SHEET);
  ensureHeader_(sheet, [
    'Дата',
    'ФИО',
    'Подразделение',
    'Процент',
    'Правильно',
    'Всего',
    'Уровень',
    'Баллы по темам',
    'Пройденные блоки',
    'Ответы итогового теста'
  ]);

  sheet.appendRow([
    submittedAt,
    participant.name || '',
    participant.department || '',
    payload.score?.percent || 0,
    payload.score?.correct || 0,
    payload.score?.total || 0,
    payload.score?.level || '',
    JSON.stringify(payload.categoryScores || {}),
    JSON.stringify(payload.completedModules || []),
    JSON.stringify(payload.finalAnswers || [])
  ]);
}

// Развёрнутые ответы итогового теста: по одной строке на вопрос (читаемо).
function appendFinalAnswers_(answers, participant, submittedAt, build) {
  if (!answers || !answers.length) return;
  const sheet = getSheet_(FINAL_ANSWERS_SHEET);
  ensureHeader_(sheet, [
    'Дата',
    'ФИО',
    'Подразделение',
    '№',
    'Категория',
    'Вопрос',
    'Ваш ответ',
    'Правильный ответ',
    'Верно',
    'Сборка'
  ]);

  const rows = answers.map((a, index) => [
    submittedAt,
    participant.name || '',
    participant.department || '',
    (Number(a.number) || index + 1),
    a.category || '',
    a.question || '',
    a.selected != null ? a.selected : '',
    a.correct != null ? a.correct : '',
    a.isCorrect ? 'да' : 'нет',
    build || ''
  ]);

  // Пишем пачкой — быстрее и без гонок при нескольких строках.
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function submitFinalAnswersGet_(params) {
  const participant = {
    name: params.name || '',
    department: params.department || '',
    passwordHash: params.passwordHash || ''
  };
  const userCheck = findUser_(participant.name, participant.passwordHash);
  if (!userCheck.ok) return userCheck;

  const answers = safeJsonParse_(params.answers, []);
  appendFinalAnswers_(answers, {
    name: userCheck.name,
    department: userCheck.department || participant.department || ''
  }, params.submittedAt ? new Date(params.submittedAt) : new Date(), params.build || '');

  return { ok: true, saved: answers.length };
}

function appendModuleResult_(payload, participant, submittedAt) {
  const sheet = getSheet_(MODULE_RESULTS_SHEET);
  ensureHeader_(sheet, [
    'Дата',
    'ФИО',
    'Подразделение',
    'ID блока',
    'Блок',
    'Процент',
    'Правильно',
    'Всего',
    'Сборка'
  ]);

  sheet.appendRow([
    submittedAt,
    participant.name || '',
    participant.department || '',
    payload.moduleId || '',
    payload.moduleTitle || '',
    payload.percent || 0,
    payload.correct || 0,
    payload.total || 0,
    payload.build || ''
  ]);
}

function appendOpenAnswers_(payload, participant, submittedAt) {
  const sheet = getSheet_(OPEN_ANSWERS_SHEET);
  ensureHeader_(sheet, [
    'Дата',
    'ФИО',
    'Подразделение',
    'ID блока',
    'Блок',
    'Вопрос',
    'Ответ'
  ]);

  const rows = payload.openAnswerRows || [];
  rows.forEach((row) => {
    sheet.appendRow([
      submittedAt,
      participant.name || '',
      participant.department || '',
      row.moduleId || '',
      row.moduleTitle || '',
      row.question || '',
      row.answer || ''
    ]);
  });
}

function appendPracticeAnswers_(payload, participant, submittedAt) {
  const sheet = getSheet_(PRACTICE_ANSWERS_SHEET);
  ensureHeader_(sheet, [
    'Дата',
    'ФИО',
    'Подразделение',
    'ID блока',
    'Блок',
    'Практическое задание',
    'Ответ'
  ]);

  const rows = payload.practiceAnswerRows || [];
  rows.forEach((row) => {
    sheet.appendRow([
      submittedAt,
      participant.name || '',
      participant.department || '',
      row.moduleId || '',
      row.moduleTitle || '',
      row.task || '',
      row.answer || ''
    ]);
  });
}

function getSheet_(name) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function ensureHeader_(sheet, header) {
  if (sheet.getLastRow() > 0) return;
  sheet.appendRow(header);
}

function submitModuleResultGet_(params) {
  const participant = {
    name: params.name || '',
    department: params.department || '',
    passwordHash: params.passwordHash || ''
  };
  const userCheck = findUser_(participant.name, participant.passwordHash);
  if (!userCheck.ok) return userCheck;

  appendModuleResult_({
    moduleId: params.moduleId || '',
    moduleTitle: params.moduleTitle || '',
    percent: Number(params.percent || 0),
    correct: Number(params.correct || 0),
    total: Number(params.total || 0),
    build: params.build || ''
  }, {
    name: userCheck.name,
    department: userCheck.department || participant.department || ''
  }, params.submittedAt ? new Date(params.submittedAt) : new Date());

  return { ok: true };
}

function submitFinalSummaryGet_(params) {
  const participant = {
    name: params.name || '',
    department: params.department || '',
    passwordHash: params.passwordHash || ''
  };
  const userCheck = findUser_(participant.name, participant.passwordHash);
  if (!userCheck.ok) return userCheck;

  appendTestResult_({
    score: {
      percent: Number(params.percent || 0),
      correct: Number(params.correct || 0),
      total: Number(params.total || 0),
      level: params.level || ''
    },
    categoryScores: safeJsonParse_(params.categoryScores, {}),
    completedModules: safeJsonParse_(params.completedModules, []),
    finalAnswers: String(params.finalAnswerIndexes || '')
  }, {
    name: userCheck.name,
    department: userCheck.department || participant.department || ''
  }, params.submittedAt ? new Date(params.submittedAt) : new Date());

  return { ok: true };
}

function submitOpenAnswerGet_(params) {
  const participant = {
    name: params.name || '',
    department: params.department || '',
    passwordHash: params.passwordHash || ''
  };
  const userCheck = findUser_(participant.name, participant.passwordHash);
  if (!userCheck.ok) return userCheck;

  appendOpenAnswers_({
    openAnswerRows: [{
      moduleId: params.moduleId || '',
      moduleTitle: params.moduleTitle || '',
      question: params.question || '',
      answer: params.answer || ''
    }]
  }, {
    name: userCheck.name,
    department: userCheck.department || participant.department || ''
  }, params.submittedAt ? new Date(params.submittedAt) : new Date());

  return { ok: true };
}

function submitPracticeAnswerGet_(params) {
  const participant = {
    name: params.name || '',
    department: params.department || '',
    passwordHash: params.passwordHash || ''
  };
  const userCheck = findUser_(participant.name, participant.passwordHash);
  if (!userCheck.ok) return userCheck;

  appendPracticeAnswers_({
    practiceAnswerRows: [{
      moduleId: params.moduleId || '',
      moduleTitle: params.moduleTitle || '',
      task: params.task || '',
      answer: params.answer || ''
    }]
  }, {
    name: userCheck.name,
    department: userCheck.department || participant.department || ''
  }, params.submittedAt ? new Date(params.submittedAt) : new Date());

  return { ok: true };
}

function safeJsonParse_(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch (error) {
    return fallback;
  }
}

/* ====== Сводная статистика для admin.html (только чтение) ====== */
function computeStats_(ownerKey) {
  if (OWNER_KEY && String(ownerKey || '') !== String(OWNER_KEY)) {
    return { ok: false, error: 'Неверный ключ владельца.' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName(USERS_SHEET);
  const resultsSheet = ss.getSheetByName(TEST_RESULTS_SHEET);

  // Пользователи
  let users = { total: 0, active: 0, blocked: 0 };
  if (usersSheet && usersSheet.getLastRow() > 1) {
    const rows = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 7).getValues();
    rows.forEach((r) => {
      users.total += 1;
      const status = String(r[4] || 'active').toLowerCase();
      if (status === 'blocked' || status === 'deleted') users.blocked += 1; else users.active += 1;
    });
  }

  // Результаты теста
  const levels = {};
  const categories = {}; // { cat: { correct, total } }
  const departments = {}; // { dept: { sum, n } }
  const moduleCompletions = {}; // { moduleId: count }
  const recent = [];
  let count = 0, percentSum = 0;

  if (resultsSheet && resultsSheet.getLastRow() > 1) {
    const rows = resultsSheet.getRange(2, 1, resultsSheet.getLastRow() - 1, 10).getValues();
    rows.forEach((r) => {
      count += 1;
      const percent = Number(r[3]) || 0;
      percentSum += percent;
      const dept = String(r[2] || '—');
      const level = String(r[6] || '—');
      levels[level] = (levels[level] || 0) + 1;
      if (!departments[dept]) departments[dept] = { sum: 0, n: 0 };
      departments[dept].sum += percent; departments[dept].n += 1;

      try {
        const cats = JSON.parse(r[7] || '{}');
        Object.keys(cats).forEach((c) => {
          if (!categories[c]) categories[c] = { correct: 0, total: 0 };
          categories[c].correct += Number(cats[c].correct) || 0;
          categories[c].total += Number(cats[c].total) || 0;
        });
      } catch (err) {}

      try {
        const mods = JSON.parse(r[8] || '[]');
        mods.forEach((m) => {
          const id = (m && m.id) ? m.id : m;
          if (id) moduleCompletions[id] = (moduleCompletions[id] || 0) + 1;
        });
      } catch (err) {}

      recent.push({ date: r[0] ? new Date(r[0]).toISOString() : '', name: String(r[1] || ''), department: dept, percent: percent, level: level });
    });
  }

  recent.sort((a, b) => (a.date < b.date ? 1 : -1));

  const departmentsArr = Object.keys(departments).map((d) => ({
    department: d, avgPercent: Math.round(departments[d].sum / departments[d].n), count: departments[d].n
  })).sort((a, b) => b.count - a.count);

  const categoriesArr = Object.keys(categories).map((c) => ({
    category: c, correct: categories[c].correct, total: categories[c].total,
    percent: categories[c].total ? Math.round((categories[c].correct / categories[c].total) * 100) : 0
  })).sort((a, b) => a.percent - b.percent);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    users: users,
    results: { count: count, avgPercent: count ? Math.round(percentSum / count) : 0 },
    levels: levels,
    categories: categoriesArr,
    departments: departmentsArr,
    moduleCompletions: moduleCompletions,
    recent: recent.slice(0, 25)
  };
}
