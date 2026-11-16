/*Помощники */

const $ = id => document.getElementById(id);
const load = (key, def) => JSON.parse(localStorage.getItem(key)) ?? def;
const save = (key, val) => localStorage.setItem(key, JSON.stringify(val));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const ic = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
const initials = name => esc(name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
const empty = (title, extra = '') => `<div class="box empty"><h2>${title}</h2>${extra}</div>`;
const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  const word = a == 1 && b != 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
  return `${n} ${word}`;
};

const user = () => load('user', { name: 'Гость', role: 'student' });
const logged = () => !!load('user');
const myGuides = () => load('my', []);
const allGuides = () => [...GUIDES, ...myGuides()];
const find = id => allGuides().find(g => g.id == id);
const isMine = id => myGuides().some(g => g.id == id);
const progress = id => {
  const p = { step: 0, checks: {}, seen: [], ...load('p' + id, {}) };
  const g = find(id);
  if (g) p.step = Math.max(0, Math.min(p.step, g.steps.length - 1));
  return p;
};
const commentsOf = id => load('c' + id, COMMENTS[id] || []);
const a11y = () => ({ on: false, size: 2, scheme: 'base', images: true, spacing: false, ...load('a11y', {}) });
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || a11y().on;

const person = (name, expert) => `
  <span class="who"><span class="ava">${initials(name)}</span>${esc(name)}${expert ? ' <span class="badge">эксперт</span>' : ''}</span>`;

function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('toast').classList.remove('show'), 2200);
}

function openModal(html, wide) {
  $('modal').innerHTML = `<div class="box ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  $('modal').classList.add('show');
}

function closeModal() {
  $('modal').classList.remove('show');
}

function copy(text, button) {
  navigator.clipboard.writeText(text)
    .then(() => {
      toast('Скопировано');
      if (button) copied(button);
    })
    .catch(() => toast('Не получилось скопировать'));
}

function copied(button) {
  if (button.dataset.html) return;
  button.dataset.html = button.innerHTML;
  button.classList.add('copied');
  button.innerHTML = `${ic('check')} Скопировано`;
  setTimeout(() => {
    button.innerHTML = button.dataset.html;
    delete button.dataset.html;
    button.classList.remove('copied');
  }, 1600);
}

function needLogin() {
  if (logged()) return false;
  toast('Сначала войдите');
  sessionStorage.setItem('back', location.hash);
  location.hash = '#/login';
  return true;
}

/* Статистика инструкции/тнструкций*/

function stats(g) {
  const local = load('s' + g.id, { reach: [], time: [], count: [] });
  const reach = g.steps.map((s, i) => Math.round((g.starts || 0) * (s[4] || 0) / 100) + (local.reach[i] || 0));
  const sum = Object.values(load('v' + g.id, {})).reduce((a, v) => a + v, 0);
  const yes = sum > 0 ? 1 : 0;
  const no = sum < 0 ? 1 : 0;
  const weight = g.useful ? 50 : 0;
  return {
    reach,
    started: reach[0] || 0,
    done: reach[0] ? Math.round(reach.at(-1) / reach[0] * 100) : 0,
    useful: weight + yes + no ? Math.round((g.useful * weight + yes * 100) / (weight + yes + no)) : 0,
    lost: i => reach[0] ? Math.round((reach[i] - (reach[i + 1] ?? reach[i])) / reach[0] * 100) : 0,
    minutes: i => local.count[i] ? Math.ceil(local.time[i] / local.count[i] / 60000) : null
  };
}

// подсказки автору: что стоит улучшить
function hints(g) {
  const st = stats(g);
  const votes = load('v' + g.id, {});
  const comments = commentsOf(g.id);
  const out = [];
  g.steps.forEach((s, i) => {
    const n = `Шаг ${i + 1}`;
    const c = comments.filter(c => c.step == i).length;
    if (s[1].length > 300 || s[2].length > 6) out.push(`${n} слишком длинный — разделите его на два.`);
    if (!s[2].length) out.push(`${n}: нет чек-листа — читателю нечего отмечать.`);
    if (st.lost(i) > 10) out.push(`${n}: после него бросают ${st.lost(i)}% читателей — добавьте фото или предупреждение.`);
    if (votes[i] < 0) out.push(`${n} отметили как «не полезно».`);
    if (s[5] && !s[5].alt) out.push(`${n}: у картинки нет описания — его читает экранный диктор.`);
    if (c >= 2) out.push(`${n}: ${plural(c, 'комментарий', 'комментария', 'комментариев')} — проверьте, что непонятно.`);
  });
  return out;
}

/*Каталог*/

let filter = { q: '', cat: -1, sort: 'useful', expert: false };

function catalogPage() {
  const last = find(load('last'));
  const p = last && progress(last.id);
  return `
    <section class="hero">
      <div>
        <p class="eyebrow">Для людей.</p>
        <h1>Делайте впервые - как будто уже делали</h1>
        <p class="lead muted">Пошаговые инструкции с чек-листами: от сборки ПК до справки в деканате. Отмечайте шаги, не теряйте порядок и подсказывайте автору, где было непонятно.</p>
        <div class="search">
          <input id="q" value="${esc(filter.q)}" placeholder="Что нужно сделать? Например: справка" oninput="filter.q = this.value; showList()" aria-label="Поиск">
          <button class="btn" onclick="$('list').scrollIntoView({ behavior: 'smooth' })">${ic('search')} Найти</button>
        </div>
      </div>
      ${last && !p.finished ? continueCard(last, p) : howItWorks()}
    </section>

    <div class="cats">
      ${CATS.map((c, i) => `
        <button class="cat ${filter.cat == i ? 'on' : ''}" onclick="setFilter('cat', ${filter.cat == i ? -1 : i})">
          <span class="spot c${i}"><img src="${emoji(i)}" alt="" width="30" height="30"></span>
          <b>${c}</b>
          <span class="muted small">${plural(allGuides().filter(g => g.cat == i).length, 'инструкция', 'инструкции', 'инструкций')}</span>
        </button>`).join('')}
    </div>

    <div class="row" style="margin-bottom: 16px">
      <h2 class="grow" style="margin: 0">${filter.cat < 0 ? 'Все инструкции' : CATS[filter.cat]}</h2>
      <div class="seg" id="sortSeg"><span class="pill"></span>${[['useful', 'Полезные'], ['new', 'Новые'], ['short', 'Короткие']].map(([key, text]) => `
        <button class="chip ${filter.sort == key ? 'on' : ''}" onclick="setFilter('sort', '${key}')">${text}</button>`).join('')}</div>
      <button class="chip ${filter.expert ? 'on' : ''}" onclick="setFilter('expert', ${!filter.expert})">Проверено экспертом</button>
    </div>
    <div class="grid" id="list">${cards()}</div>`;
}

function continueCard(g, p) {
  return `
    <div class="box">
      <p class="muted small">Вы остановились на шаге ${p.step + 1} из ${g.steps.length}</p>
      <h3>${esc(g.title)}</h3>
      <div class="bar" style="margin: 14px 0 6px"><i style="width: ${p.step / g.steps.length * 100}%"></i></div>
      ${g.steps.slice(p.step, p.step + 3).map((s, i) => `
        <div class="how-step"><span class="num ${i ? '' : 'cur'}">${p.step + i + 1}</span>${esc(s[0])}</div>`).join('')}
      <a class="btn green wide" href="#/guide/${g.id}">Продолжить ${ic('next')}</a>
    </div>`;
}

function howItWorks() {
  return `
    <div class="box">
      <h3>Как это работает</h3>
      <div class="how-step"><span class="num cur">1</span><div><b>Отмечайте шаг — идите дальше</b><div class="muted small">Прогресс сохраняется даже без интернета.</div></div></div>
      <div class="how-step"><span class="num cur">2</span><div><b>Пишите, где было сложно</b><div class="muted small">Комментарий и оценка на каждом шаге.</div></div></div>
      <div class="how-step"><span class="num cur">3</span><div><b>Автор видит узкие места</b><div class="muted small">И исправляет инструкцию в новой версии.</div></div></div>
    </div>`;
}

function emoji(i) {
  return `https://fonts.gstatic.com/s/e/notoemoji/latest/${CAT_EMOJI[i]}/${calm() ? 'emoji.svg' : '512.webp'}`;
}

function setFilter(key, value) {
  filter[key] = value;
  render();
}

function showList() {
  $('list').innerHTML = cards();
}

//умный поиск
function cards() {
  const words = filter.q.toLowerCase().split(/\s+/).filter(w => w).map(w => w.slice(0, 4));
  const sorts = {
    useful: (a, b) => stats(b).useful - stats(a).useful,
    new: (a, b) => b.created - a.created,
    short: (a, b) => a.steps.length - b.steps.length
  };
  const list = allGuides()
    .filter(g => filter.cat < 0 || g.cat == filter.cat)
    .filter(g => !filter.expert || g.expert)
    .filter(g => {
      const text = [g.title, CATS[g.cat], ...g.steps.map(s => [s[0], s[1], ...s[2], s[3], s[6] || ''].join(' '))].join(' ').toLowerCase();
      return words.every(w => text.includes(w));
    })
    .sort(sorts[filter.sort]);
  return list.map(card).join('') || empty('Ничего не нашлось', '<a class="btn" href="#/new">Написать такую инструкцию</a>');
}

function card(g) {
  const s = stats(g);
  return `
    <a class="card" href="#/guide/${g.id}">
      <div class="row small">
        <span class="tag c${g.cat}">${CATS[g.cat]}</span>
        <span class="muted grow" style="text-align: right">${g.forkOf ? `форк «${esc(g.forkOf)}»` : `версия ${g.version}`}</span>
      </div>
      <h3>${esc(g.title)}</h3>
      <div class="muted small">${plural(g.steps.length, 'шаг', 'шага', 'шагов')}, ${esc(g.time)}</div>
      ${s.started
        ? `<div class="row small"><div class="bar grow"><i style="width: ${s.done}%"></i></div><span><b>${s.done}%</b> дошли до конца</span></div>`
        : '<div class="muted small">Новая — ещё никто не прошёл</div>'}
      <div class="card-foot">
        ${person(g.author, g.expert)}
        <span>${s.useful ? `<b>${s.useful}%</b> <span class="muted">полезно</span>` : ''}</span>
      </div>
    </a>`;
}

/*Прохождение */

function guidePage(id) {
  const g = find(id);
  if (!g) return empty('Инструкция не найдена', '<a class="btn" href="#/">В каталог</a>');
  const p = progress(id);
  if (p.finished) return finishedPage(g);

  const st = stats(g);
  const n = p.step;
  const [title, text, items, warn, , image, more] = g.steps[n];
  const votes = load('v' + id, {});
  const comments = commentsOf(id).filter(c => c.step == n);
  const checked = items.filter((x, j) => p.checks[n + '-' + j]).length;

  return `
    <div class="row noprint">
      <div class="segs grow">${g.steps.map((s, i) => `<i class="${i < n ? 'ok' : i == n ? 'now' : ''}${moved > 0 && i == n - 1 ? ' fill' : ''}"></i>`).join('')}</div>
      <b class="small">Шаг ${n + 1} из ${g.steps.length}, пройдено ${Math.round(n / g.steps.length * 100)}%</b>
    </div>

    <div class="layout">
      <nav class="steps">
        <h3>${esc(g.title)}</h3>
        <p class="muted small">Версия ${g.version}, автор ${esc(g.author)}</p>
        ${g.steps.map((s, i) => `
          <button class="${i == n ? 'now' : i < n ? 'ok' : ''}" ${i > Math.max(...p.seen) ? 'disabled' : ''} onclick="go(${id}, ${i})">
            <span class="num">${i < n ? ic('check') : i + 1}</span>
            <span>${esc(s[0])}${st.lost(i) > 10 ? `<span class="stuck">здесь бросают ${st.lost(i)}%</span>` : ''}</span>
          </button>`).join('')}
      </nav>

      <div class="main">
        <article class="box ${moved > 0 ? 'enter-next' : moved < 0 ? 'enter-prev' : ''}">
          <p class="muted small">Шаг ${n + 1}${navigator.onLine ? '' : ' (офлайн, прогресс сохранится)'}</p>
          <h1>${esc(title)}</h1>
          ${text ? `<p class="lead">${esc(text)}</p>` : ''}
          ${image ? stepImage(image) : ''}
          ${more ? `
            <details class="more">
              <summary>Подробнее</summary>
              <p>${esc(more).replace(/\n/g, '<br>')}</p>
            </details>` : ''}
          ${items.map((item, j) => `
            <label class="check">
              <input type="checkbox" ${p.checks[n + '-' + j] ? 'checked' : ''} onchange="check(${id}, '${n}-${j}')">
              <span><span class="txt">${esc(item)}</span></span>
            </label>`).join('')}
          ${warn ? `<div class="warn">${ic('warn')}<div><b>Частая ошибка.</b> ${esc(warn)}</div></div>` : ''}
          <div class="row" style="margin-top: 24px">
            ${n > 0 ? `<button class="btn light" onclick="go(${id}, ${n - 1})">${ic('back')} Назад</button>` : ''}
            <span class="grow"></span>
            ${items.length ? `<span class="muted small" id="checked-count">Отмечено ${checked} из ${items.length}</span>` : ''}
            ${n < g.steps.length - 1
              ? `<button class="btn green" onclick="go(${id}, ${n + 1})">Готово, к шагу ${n + 2} ${ic('next')}</button>`
              : `<button class="btn green" onclick="go(${id}, ${n + 1})">${ic('check')} Завершить</button>`}
          </div>
        </article>

        <section class="box row">
          <b class="grow">Этот шаг был понятен?</b>
          <button class="btn light ${votes[n] > 0 ? 'on' : ''}" data-vote="1" onclick="vote(${id}, ${n}, 1)">${ic('like')} Полезно</button>
          <button class="btn light ${votes[n] < 0 ? 'on bad' : ''}" onclick="vote(${id}, ${n}, -1)">${ic('dislike')} Не полезно</button>
        </section>

        <section class="box">
          <h2>Комментарии к шагу (${comments.length})</h2>
          <textarea id="text" rows="3" placeholder="Что было непонятно? Как улучшить шаг?"></textarea>
          <div class="row" style="margin-top: 10px">
            <label class="row small grow"><input type="checkbox" id="idea"> Это предложение улучшения</label>
            <button class="btn" onclick="addComment(${id}, ${n})">Отправить</button>
          </div>
          ${comments.map(commentHtml).join('')}
        </section>
      </div>

      <aside class="side">
        <div class="box">
          ${person(g.author, g.expert)}
          <div class="row" style="margin-top: 14px; gap: 24px">
            <div><b class="big">${st.useful ? st.useful + '%' : '—'}</b><span class="muted small">полезно</span></div>
            <div><b class="big">${st.started}</b><span class="muted small">прохождений</span></div>
          </div>
        </div>
        ${isMine(id) ? `<a class="btn light" href="#/edit/${id}">${ic('edit')} Редактировать</a>` : ''}
        <a class="btn light" href="#/fork/${id}">${ic('fork')} Сделать форк</a>
        <button class="btn light" onclick="print()">${ic('pdf')} Скачать PDF</button>
        <button class="btn light" onclick="embed(${id})">${ic('code')} Встроить на сайт</button>
        <button class="btn light" onclick="copy(location.href, this)">${ic('share')} Поделиться</button>
        <a class="btn light" href="#/stats/${id}">${ic('chart')} Аналитика</a>
        ${g.forkOf ? `<p class="muted small">Это форк инструкции «${esc(g.forkOf)}»</p>` : ''}
      </aside>
    </div>
    ${printVersion(g)}`;
}

function stepImage(img) {
  return `
    <figure class="step-img">
      <button class="zoom" onclick="zoomImage(this)" aria-label="Открыть картинку крупно">
        <img src="${esc(img.src)}" alt="${esc(img.alt)}" loading="lazy" onerror="this.onerror = null; this.src = 'img/placeholder.svg'">
      </button>
      ${img.alt ? `<figcaption class="muted small" aria-hidden="true">${esc(img.alt)}</figcaption>` : ''}
    </figure>`;
}

function zoomImage(button) {
  const img = button.querySelector('img');
  openModal(`
    <img class="full" src="${esc(img.src)}" alt="${esc(img.alt)}">
    <div class="row" style="margin-top: 12px">
      <p class="grow" style="margin: 0">${esc(img.alt)}</p>
      <button class="btn" onclick="closeModal()">Закрыть</button>
    </div>`, true);
}

function commentHtml(c) {
  return `
    <div class="comment">
      <span class="ava">${initials(c.name)}</span>
      <div>
        <div class="small">
          <b>${esc(c.name)}</b> ${c.role == 'expert' ? '<span class="badge">эксперт</span>' : ''}
          <span class="muted">${esc(c.date)}</span>
          ${c.idea ? `<span class="tag ${c.accepted ? 'c0' : 'c4'}">${c.accepted ? 'улучшение принято' : 'предложение'}</span>` : ''}
        </div>
        <p>${esc(c.text)}</p>
      </div>
    </div>`;
}

function finishedPage(g) {
  return `
    <div class="box empty">
      <h1>Готово! Инструкция пройдена</h1>
      <p class="muted lead">«${esc(g.title)}» — ${plural(g.steps.length, 'шаг', 'шага', 'шагов')}. Если что-то было непонятно, оставьте комментарий к шагу: автор увидит.</p>
      <div class="row" style="justify-content: center">
        <button class="btn light" onclick="restart(${g.id})">Пройти заново</button>
        <a class="btn light" href="#/fork/${g.id}">${ic('fork')} Сделать свою версию</a>
        <a class="btn" href="#/">В каталог</a>
      </div>
    </div>`;
}

//версия для пеЧати и PDF все шаги сразу
function printVersion(g) {
  return `
    <div class="print-only">
      <h1>${esc(g.title)}</h1>
      ${g.steps.map((s, i) => `
        <h3>${i + 1}. ${esc(s[0])}</h3>
        <p>${esc(s[1])}</p>
        ${s[5] ? `<img src="${esc(s[5].src)}" alt="${esc(s[5].alt)}" onerror="this.remove()">` : ''}
        ${s[6] ? `<p>${esc(s[6]).replace(/\n/g, '<br>')}</p>` : ''}
        ${s[2].map(item => `<p>☐ ${esc(item)}</p>`).join('')}
        ${s[3] ? `<p><b>Частая ошибка:</b> ${esc(s[3])}</p>` : ''}`).join('')}
    </div>`;
}

// переход на шаг и подсчет статистики
let moved = 0;

function go(id, step) {
  const g = find(id);
  const p = progress(id);
  const from = p.step;
  const maxSeen = Math.max(-1, ...p.seen);
  if (step > maxSeen + 1) return toast('Сначала пройдите предыдущие шаги');
  if (step > p.step && p.seen.length) {
    const items = g.steps[p.step][2];
    const left = items.filter((x, j) => !p.checks[p.step + '-' + j]).length;
    if (left && !confirm(`Не отмечено пунктов: ${left}. Всё равно перейти дальше?`)) return;
  }
  const s = load('s' + id, { reach: [], time: [], count: [] });
  if (p.at) {
    s.time[p.step] = (s.time[p.step] || 0) + Math.min(Date.now() - p.at, 3600000);
    s.count[p.step] = (s.count[p.step] || 0) + 1;
  }
  const finish = step >= g.steps.length;
  if (finish) {
    p.finished = true;
  } else {
    p.step = step;
    if (!p.seen.includes(step)) {
      p.seen.push(step);
      s.reach[step] = (s.reach[step] || 0) + 1;
    }
  }
  p.at = Date.now();
  save('p' + id, p);
  save('s' + id, s);
  save('last', id);
  moved = finish ? 0 : Math.sign(step - from);
  render();
  scrollTo(0, 0);
  if (finish) celebrate();
}

/* Салют после прохождения */

function celebrate() {
  if (!window.confetti || calm()) return;
  const colors = ['#1e7f55', '#6fd39e', '#f2c94c', '#5b3f99', '#d9772f', '#4a90e2'];
  const burst = (x, angle, count) => confetti({
    particleCount: count, angle, spread: 65, startVelocity: 60, gravity: 1.1,
    ticks: 220, origin: { x, y: 1 }, colors, zIndex: 30
  });
  burst(0, 60, 90);
  burst(1, 120, 90);
  setTimeout(() => { burst(0.15, 75, 60); burst(0.85, 105, 60); }, 300);
}

function restart(id) {
  localStorage.removeItem('p' + id);
  go(id, 0);
}

function rerender() {
  const text = $('text') ? $('text').value : '';
  const idea = $('idea') ? $('idea').checked : false;
  render();
  if ($('text')) {
    $('text').value = text;
    $('idea').checked = idea;
  }
}

function check(id, key) {
  const p = progress(id);
  p.checks[key] = !p.checks[key];
  save('p' + id, p);
  const boxes = document.querySelectorAll('.check input');
  $('checked-count').textContent = `Отмечено ${[...boxes].filter(b => b.checked).length} из ${boxes.length}`;
}

function vote(id, step, value) {
  const votes = load('v' + id, {});
  votes[step] = votes[step] == value ? 0 : value;
  save('v' + id, votes);
  if (votes[step]) toast('Спасибо! Автор увидит вашу оценку');
  rerender();
  if (votes[step] > 0) burst(document.querySelector('[data-vote="1"]'));
}

/* Анимации */

function burst(button) {
  if (!button || calm()) return;
  button.classList.add('pop');
  const box = document.createElement('span');
  box.className = 'burst';
  box.innerHTML = Array.from({ length: 8 }, (_, i) => `<i style="--a: ${i * 45}deg"></i>`).join('');
  button.append(box);
  setTimeout(() => box.remove(), 700);
}

let pillAt = null;

function placePill() {
  const seg = $('sortSeg');
  if (!seg) return;
  const pill = seg.querySelector('.pill');
  const on = seg.querySelector('.chip.on');
  const to = { x: on.offsetLeft, w: on.offsetWidth };
  const move = at => {
    pill.style.transform = `translateX(${at.x}px)`;
    pill.style.width = at.w + 'px';
  };
  pill.style.transition = 'none';
  move(pillAt && !calm() ? pillAt : to);
  pill.offsetWidth;
  pill.style.transition = '';
  move(to);
  pillAt = to;
}

function countUp() {
  if (calm()) return;
  document.querySelectorAll('[data-count]').forEach(el => {
    const end = +el.dataset.count;
    const suffix = el.dataset.suffix || '';
    const start = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - start) / 800);
      el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))) + suffix;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function addComment(id, step) {
    if (needLogin()) return;
  const text = $('text').value.trim();
  if (!text) return toast('Сначала напишите комментарий');
  const u = user();
  const comment = { step, text, name: u.name, role: u.role, idea: $('idea').checked, date: new Date().toLocaleDateString('ru') };
  save('c' + id, [comment, ...commentsOf(id)]);
  toast('Комментарий отправлен');
  render();
}

function embed(id) {
  const code = `<iframe src="${location.href.split(/[?#]/)[0]}?embed=1#/guide/${id}" width="100%" height="700" style="border:0"></iframe>`;
  openModal(`
    <h2>Встроить на сайт</h2>
    <p class="muted">Вставьте этот код в HTML своей страницы — инструкция откроется без шапки сайта.</p>
    <textarea id="code" rows="4" readonly>${esc(code)}</textarea>
    <div class="row" style="justify-content: flex-end; margin-top: 12px">
      <button class="btn light" onclick="closeModal()">Закрыть</button>
      <button class="btn" onclick="copy($('code').value, this)">Скопировать код</button>
    </div>`);
}

/* Стаитистика "Моих" прохождений */

function myPage() {
  const list = allGuides().filter(g => progress(g.id).seen.length);
  return `
    <h1>Мои прохождения</h1>
    <div class="grid">
      ${list.map(g => {
        const p = progress(g.id);
        const pct = p.finished ? 100 : Math.round(p.step / g.steps.length * 100);
        return `
          <a class="card" href="#/guide/${g.id}">
            <span><span class="tag c${g.cat}">${CATS[g.cat]}</span></span>
            <h3>${esc(g.title)}</h3>
            <div class="row small">
              <div class="bar grow"><i style="width: ${pct}%"></i></div>
              <b>${p.finished ? 'пройдено' : `шаг ${p.step + 1} из ${g.steps.length}`}</b>
            </div>
          </a>`;
      }).join('') || empty('Вы ещё ничего не начали', '<a class="btn" href="#/">Открыть каталог</a>')}
    </div>`;
}

/* Кабинет автора*/

function authorPage() {
  const mine = myGuides();
  const ideas = mine
    .flatMap(g => commentsOf(g.id).map((c, i) => ({ ...c, g, i })))
    .filter(c => c.idea && !c.accepted);

  if (!mine.length) {
    return empty('У вас пока нет инструкций', `
      <p class="muted">Создайте свою — или сделайте форк чужой и улучшите её.</p>
      <a class="btn green" href="#/new">${ic('plus')} Создать инструкцию</a>`);
  }

  return `
    <div class="row" style="margin-bottom: 20px">
      <h1 class="grow" style="margin: 0">Кабинет автора</h1>
      <a class="btn green" href="#/new">${ic('plus')} Новая инструкция</a>
    </div>

    <div class="box table">
      <table>
        <tr><th>Инструкция</th><th>Версия</th><th>Начали</th><th>Дошли</th><th>Полезно</th><th></th></tr>
        ${mine.map(g => {
          const s = stats(g);
          return `
            <tr>
              <td><a href="#/guide/${g.id}"><b>${esc(g.title)}</b></a><div class="muted">${plural(g.steps.length, 'шаг', 'шага', 'шагов')}, ${CATS[g.cat]}</div></td>
              <td>${g.version}</td>
              <td>${s.started}</td>
              <td>${s.done}%</td>
              <td>${s.useful ? s.useful + '%' : '—'}</td>
              <td>
                <div class="row" style="justify-content: flex-end; flex-wrap: nowrap">
                  <a class="btn light small" href="#/edit/${g.id}">${ic('edit')} Изменить</a>
                  <a class="btn light small" href="#/stats/${g.id}" aria-label="Аналитика">${ic('chart')}</a>
                  <button class="btn light small" onclick="removeGuide(${g.id})" aria-label="Удалить">${ic('trash')}</button>
                </div>
              </td>
            </tr>`;
        }).join('')}
      </table>
    </div>

    <div class="box">
      <h2>Предложения читателей (${ideas.length})</h2>
      ${ideas.map(c => `
        <div class="comment">
          <span class="ava">${initials(c.name)}</span>
          <div class="grow">
            <div class="small"><b>${esc(c.name)}</b> <span class="muted">«${esc(c.g.title)}», шаг ${c.step + 1}</span></div>
            <p style="margin-bottom: 10px">${esc(c.text)}</p>
            <div class="row">
              <a class="btn small" href="#/edit/${c.g.id}" onclick="answerIdea(${c.g.id}, ${c.i}, true)">Принять и исправить</a>
              <button class="btn light small" onclick="answerIdea(${c.g.id}, ${c.i}, false)">Отклонить</button>
            </div>
          </div>
        </div>`).join('') || '<p class="muted">Пока предложений нет.</p>'}
    </div>`;
}

function answerIdea(id, index, accepted) {
  const list = commentsOf(id);
  if (accepted) list[index].accepted = true;
  else list.splice(index, 1);
  save('c' + id, list);
  if (!accepted) render();
}

function removeGuide(id) {
  if (!confirm('Удалить инструкцию? Это нельзя отменить.')) return;
  save('my', myGuides().filter(g => g.id != id));
  toast('Инструкция удалена');
  render();
}

/*Редактор */

function editorPage(id, mode) {
  if (!logged()) {
    return empty('Войдите, чтобы писать инструкции', `
      <p class="muted">Так написанное точно не потеряется при публикации.</p>
      <a class="btn green" href="#/login" onclick="sessionStorage.setItem('back', location.hash)">Войти</a>`);
  }
  if (mode != 'new' && !find(id)) return empty('Инструкция не найдена', '<a class="btn" href="#/">В каталог</a>');
  if (mode == 'edit' && !isMine(id)) {
    return empty('Это не ваша инструкция', `
      <p class="muted">Чужую инструкцию нельзя менять, но можно сделать свою улучшенную версию.</p>
      <a class="btn" href="#/fork/${id}">${ic('fork')} Сделать форк</a>`);
  }
  const g = find(id) || { title: '', cat: 0, time: '', steps: [['', '', [], '']] };
  const heading = { new: 'Новая инструкция', edit: 'Редактирование', fork: 'Форк инструкции' }[mode];
  const note = {
    new: 'Кабинет автора',
    edit: `Будет опубликована версия ${g.version + 1}`,
    fork: `Ваша улучшенная версия «${esc(g.title)}»`
  }[mode];

  return `
    <div class="row" style="margin-bottom: 20px">
      <div class="grow"><p class="muted small" style="margin: 0">${note}</p><h1 style="margin: 0">${heading}</h1></div>
      <button class="btn green" onclick="publish(${id}, '${mode}')">${ic('check')} Опубликовать</button>
    </div>

    <div class="editor">
      <div>
        <div class="box">
          <label class="field">Название<input id="title" value="${esc(g.title)}" placeholder="Например: как оформить справку в деканате"></label>
          <div class="row">
            <label class="field grow">Раздел
              <select id="cat">${CATS.map((c, i) => `<option value="${i}" ${i == g.cat ? 'selected' : ''}>${c}</option>`).join('')}</select>
            </label>
            <label class="field grow">Время прохождения<input id="time" value="${esc(g.time)}" placeholder="30 мин"></label>
          </div>
        </div>
        <h2>Шаги</h2>
        <div id="steps">${g.steps.map(stepForm).join('')}</div>
        <button class="btn light wide" onclick="addStep()">${ic('plus')} Добавить шаг</button>
      </div>

      <aside>
        <div class="box">
          <h3>${ic('spark')} Помощник</h3>
          <p class="muted small">Вставьте текст с форума или конспект. Каждый абзац станет шагом: первая строка — заголовок, строки с «-» — пункты чек-листа.</p>
          <textarea id="raw" rows="6" placeholder="Сдать заявление&#10;Окно 3, с 10 до 16&#10;- взять паспорт"></textarea>
          <button class="btn violet wide" onclick="splitText()">Разбить на шаги</button>
        </div>
        <div class="box">
          <h3>Проверка</h3>
          <div id="hints"><p class="muted small">Найдёт длинные шаги, шаги без чек-листа и места, где застревают читатели.</p></div>
          <button class="btn light wide" onclick="checkDraft(${id})">Проверить инструкцию</button>
        </div>
      </aside>
    </div>`;
}

function stepForm(s) {
  return `
    <div class="box step-form">
      <div class="row" style="flex-wrap: nowrap">
        <span class="num cur"></span>
        <input class="grow s-title" placeholder="Заголовок шага" value="${esc(s[0])}">
        <button class="btn light" onclick="moveStep(this, -1)" aria-label="Выше">${ic('up')}</button>
        <button class="btn light" onclick="moveStep(this, 1)" aria-label="Ниже">${ic('down')}</button>
        <button class="btn light" onclick="this.closest('.step-form').remove()" aria-label="Удалить шаг">${ic('trash')}</button>
      </div>
      <textarea class="s-text" rows="2" placeholder="Что сделать и зачем">${esc(s[1])}</textarea>
      <textarea class="s-items" rows="3" placeholder="Пункты чек-листа — по одному в строке">${esc(s[2].join('\n'))}</textarea>
      <input class="s-warn" placeholder="Частая ошибка (необязательно)" value="${esc(s[3])}">
      <details class="extra" ${s[5] || s[6] ? 'open' : ''}>
        <summary>Картинка и подробности</summary>
        <div class="row" style="flex-wrap: nowrap">
          <input class="grow s-src" placeholder="Ссылка на картинку: https://…" value="${esc(s[5] ? s[5].src : '')}" oninput="previewImage(this)">
          <label class="btn light upload">Загрузить<input type="file" accept="image/*" hidden onchange="uploadImage(this)"></label>
        </div>
        <img class="s-preview" src="${esc(s[5] ? s[5].src : '')}" alt="" ${s[5] ? '' : 'hidden'}>
        <input class="s-alt" placeholder="Что на картинке (обязательно, если есть картинка)" value="${esc(s[5] ? s[5].alt : '')}">
        <textarea class="s-more" rows="3" placeholder="Подробнее: советы и детали для новичка (необязательно)">${esc(s[6] || '')}</textarea>
      </details>
    </div>`;
}

function previewImage(input) {
  const img = input.closest('.step-form').querySelector('.s-preview');
  img.src = input.value.trim();
  img.hidden = !input.value.trim();
}

function uploadImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const pic = new Image();
    pic.onload = () => {
      const scale = Math.min(1, 1000 / Math.max(pic.width, pic.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(pic.width * scale);
      canvas.height = Math.round(pic.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(pic, 0, 0, canvas.width, canvas.height);
      const src = input.closest('.step-form').querySelector('.s-src');
      src.value = canvas.toDataURL('image/jpeg', 0.8);
      previewImage(src);
      toast('Картинка добавлена');
    };
    pic.onerror = () => toast('Это не картинка — выберите JPG, PNG или WebP');
    pic.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function addStep() {
  $('steps').insertAdjacentHTML('beforeend', stepForm(['', '', [], '']));
}

function moveStep(button, dir) {
  const el = button.closest('.step-form');
  const other = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
  if (!other) return;
  if (dir < 0) other.before(el);
  else other.after(el);
}

function readSteps() {
  return [...document.querySelectorAll('.step-form')]
    .map(el => {
      const val = cls => el.querySelector(cls).value.trim();
      const src = val('.s-src');
      return [
        val('.s-title'), val('.s-text'),
        val('.s-items').split('\n').map(x => x.trim()).filter(x => x),
        val('.s-warn'), 0,
        src ? { src, alt: val('.s-alt') } : null,
        val('.s-more')
      ];
    })
    .filter(s => s[0]);
}

// Система редактора
function splitText() {
  const parts = $('raw').value.split(/\n\s*\n/).filter(p => p.trim());
  if (!parts.length) return toast('Вставьте текст');
  parts.forEach(part => {
    const [title, ...lines] = part.trim().split('\n').map(l => l.trim());
    const isItem = l => /^[-•*]/.test(l);
    const items = lines.filter(isItem).map(l => l.replace(/^[-•*]\s*/, ''));
    const text = lines.filter(l => !isItem(l)).join(' ');
    $('steps').insertAdjacentHTML('beforeend', stepForm([title, text, items, '']));
  });
  $('raw').value = '';
  toast(`Добавлено шагов: ${parts.length}`);
}

function checkDraft(id) {
  const tips = hints({ ...find(id), id, steps: readSteps() });
  $('hints').innerHTML = tips.length
    ? tips.map(t => `<div class="hint">${t}</div>`).join('')
    : '<div class="hint">Всё хорошо — можно публиковать.</div>';
}

function publish(id, mode) {
    if (needLogin()) return;
  const steps = readSteps();
  const title = $('title').value.trim();
  if (!title || !steps.length) return toast('Нужно название и хотя бы один шаг');
  const noAlt = steps.findIndex(s => s[5] && !s[5].alt);
  if (noAlt >= 0) return toast(`Шаг ${noAlt + 1}: опишите, что на картинке`);

  const old = find(id);
  const u = user();
  const base = mode == 'edit' ? old : { id: Date.now(), version: 0, starts: 0, useful: 0, forkOf: mode == 'fork' ? old.title : '' };
  const g = {
    ...base, title, steps,
    cat: +$('cat').value,
    time: $('time').value.trim() || '—',
    author: u.name,
    expert: u.role == 'expert',
    version: base.version + 1,
    created: Date.now()
  };
  try {
    save('my', [...myGuides().filter(x => x.id != g.id), g]);
  } catch {
    return toast('Не хватает места: картинки слишком большие. Вставьте их ссылками');
  }
  toast(mode == 'edit' ? `Опубликована версия ${g.version}` : 'Инструкция опубликована');
  location.hash = '#/guide/' + g.id;
}

/*Аналитика*/

function statsPage(id) {
  const g = find(id);
  if (!g) return empty('Инструкция не найдена');
  const st = stats(g);
  const votes = load('v' + id, {});
  const comments = commentsOf(id);
  const pct = i => st.started ? Math.round(st.reach[i] / st.started * 100) : 0;
  const order = g.steps.map((s, i) => i).sort((a, b) => st.lost(b) - st.lost(a));
  const tips = hints(g);

  return `
    <div class="row" style="margin-bottom: 20px">
      <div class="grow"><p class="muted small" style="margin: 0">Аналитика, версия ${g.version}</p><h1 style="margin: 0">${esc(g.title)}</h1></div>
      <a class="btn light" href="#/guide/${id}">${ic('open')} Открыть инструкцию</a>
    </div>

    <div class="tiles">
      <div class="box">Начали<b class="big" data-count="${st.started}">${st.started}</b></div>
      <div class="box">Дошли до конца<b class="big" data-count="${st.done}" data-suffix="%">${st.done}%</b></div>
      <div class="box">Оценили «полезно»${st.useful ? `<b class="big" data-count="${st.useful}" data-suffix="%">${st.useful}%</b>` : '<b class="big">—</b>'}</div>
      <div class="box">Комментариев<b class="big" data-count="${comments.length}">${comments.length}</b></div>
    </div>

    <div class="box">
      <h2>Сколько людей дошло до каждого шага</h2>
      <p class="muted small">Оранжевым — шаги, после которых бросают больше 10% читателей</p>
      <div class="chart">
        ${g.steps.map((s, i) => `<div class="${st.lost(i) > 10 ? 'bad' : ''}">${pct(i)}%<i style="height: ${pct(i) * 2}px; --i: ${i}"></i></div>`).join('')}
      </div>
      <div class="axis">${g.steps.map((s, i) => `<span>${i + 1}</span>`).join('')}</div>
    </div>

    <div class="two">
      <div class="box table">
        <h2>Узкие места</h2>
        <table>
          <tr><th>Шаг</th><th>Бросили</th><th>Время</th><th>Ваша оценка</th><th>Комм.</th></tr>
          ${order.map(i => `
            <tr class="${st.lost(i) > 10 ? 'hot' : ''}">
              <td>${i + 1}. ${esc(g.steps[i][0])}</td>
              <td>${st.lost(i)}%</td>
              <td>${st.minutes(i) ? st.minutes(i) + ' мин' : '—'}</td>
              <td>${votes[i] > 0 ? 'полезно' : votes[i] < 0 ? 'не полезно' : '—'}</td>
              <td>${comments.filter(c => c.step == i).length}</td>
            </tr>`).join('')}
        </table>
      </div>
      <div class="box">
        <h2>${ic('spark')} Что улучшить</h2>
        ${tips.map(t => `<div class="hint">${t}</div>`).join('') || '<p class="muted">Явных проблем не найдено.</p>'}
        ${isMine(id)
          ? `<a class="btn wide" href="#/edit/${id}">${ic('edit')} Редактировать</a>`
          : `<a class="btn light wide" href="#/fork/${id}">${ic('fork')} Сделать улучшенный форк</a>`}
      </div>
    </div>`;
}
/*Вход*/

function loginPage() {
  if (logged()) {
    const u = user();
    return `
      <div class="box auth">
        <span class="ava">${initials(u.name)}</span>
        <h1 style="margin-top: 16px">${esc(u.name)}</h1>
        <p class="muted">${u.role == 'expert' ? 'Эксперт — ваши инструкции и комментарии получают отметку' : 'Ученик'}</p>
        <button class="btn light wide" onclick="logout()">Выйти</button>
      </div>`;
  }
  return `
    <div class="box auth">
      <h1>Вход</h1>
      <p class="muted">Чтобы комментировать и публиковать инструкции, представьтесь.</p>
      <label class="field">Имя<input id="name" placeholder="Например: Дима К."></label>
      <label class="field">Кто вы
        <select id="newRole">
          <option value="student">Ученик — прохожу инструкции</option>
          <option value="expert">Эксперт — проверяю и пишу</option>
        </select>
      </label>
      <button class="btn green wide" onclick="login()">Войти</button>
    </div>`;
}

function login() {
  const name = $('name').value.trim();
  if (!name) return toast('Введите имя');
  save('user', { name, role: $('newRole').value });
  toast('Добро пожаловать, ' + name);
  location.hash = sessionStorage.getItem('back') || '#/';
  sessionStorage.removeItem('back');
}

function logout() {
  localStorage.removeItem('user');
  toast('Вы вышли');
  render();
}

/* Версия для слабовидящих */

function a11yPanel() {
  const a = a11y();
  const opt = (key, value, text, cls = '') => `
    <button class="chip ${cls} ${a[key] === value ? 'on' : ''}" aria-pressed="${a[key] === value}"
      onclick="setA11y('${key}', ${typeof value == 'string' ? `'${value}'` : value})">${text}</button>`;
  openModal(`
    <h2>Версия для слабовидящих</h2>
    <label class="switch">
      <input type="checkbox" role="switch" ${a.on ? 'checked' : ''} onchange="setA11y('on', this.checked)">
      <span>${a.on ? 'Включена' : 'Выключена'}</span>
    </label>
    ${a.on ? `
      <div class="a11y-group"><b>Размер текста</b><div class="row">
        ${opt('size', 1, 'А', 'fs1')}${opt('size', 2, 'А', 'fs2')}${opt('size', 3, 'А', 'fs3')}
      </div></div>
      <div class="a11y-group"><b>Цвета</b><div class="row">
        ${opt('scheme', 'base', 'Обычные')}
        ${opt('scheme', 'bw', 'Чёрный на белом', 'sw-bw')}
        ${opt('scheme', 'wb', 'Белый на чёрном', 'sw-wb')}
        ${opt('scheme', 'blue', 'Синий на голубом', 'sw-blue')}
      </div></div>
      <div class="a11y-group"><b>Картинки</b><div class="row">
        ${opt('images', true, 'Показывать')}${opt('images', false, 'Скрыть')}
      </div></div>
      <div class="a11y-group"><b>Расстояние между буквами</b><div class="row">
        ${opt('spacing', false, 'Обычное')}${opt('spacing', true, 'Увеличенное')}
      </div></div>
      <p class="muted small">Анимация и салют в этом режиме отключены.</p>` : ''}
    <div class="row" style="justify-content: flex-end; margin-top: 16px">
      <button class="btn" onclick="closeModal()">Готово</button>
    </div>`);
}

function setA11y(key, value) {
  save('a11y', { ...a11y(), [key]: value });
  applyA11y();
  a11yPanel();
  document.querySelectorAll('.spot img').forEach((img, i) => { img.src = emoji(i); });
}

function applyA11y() {
  const a = a11y();
  const cls = !a.on ? [] : [
    'a11y', 'size-' + a.size,
    a.scheme != 'base' && 'contrast scheme-' + a.scheme,
    !a.images && 'no-img',
    a.spacing && 'spaced'
  ].filter(Boolean);
  document.documentElement.className = cls.join(' ');
  $('eye').classList.toggle('on', a.on);
}

/*Запуск*/

const ROUTES = {
  '': catalogPage, my: myPage, author: authorPage, guide: guidePage, stats: statsPage,
  new: editorPage, edit: editorPage, fork: editorPage, login: loginPage
};

function render() {
  let [page = '', id] = location.hash.slice(2).split('/');
  if (!/^\d+$/.test(id)) id = undefined;
  if (page == 'guide' && find(id) && !progress(id).seen.length) return go(+id, 0);
  $('app').innerHTML = (ROUTES[page] || catalogPage)(id, page);
  document.querySelectorAll('.menu a').forEach(a => a.classList.toggle('active', a.hash == '#/' + page));
  $('me').textContent = logged() ? user().name : 'Войти';
  moved = 0;
  placePill();
  countUp();
}

if (location.search.includes('embed')) document.body.classList.add('embed');
applyA11y();
document.addEventListener('keydown', e => { if (e.key == 'Escape') closeModal(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
window.addEventListener('offline', () => toast('Нет интернета — всё продолжит работать'));
window.onhashchange = () => { render(); scrollTo(0, 0); };
render();