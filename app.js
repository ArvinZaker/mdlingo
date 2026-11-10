'use strict';

const $ = id => document.getElementById(id);
const variants = {
  'ي': 'ی',
  'ى': 'ی',
  'ك': 'ک',
  'ة': 'ه',
  'أ': 'ا',
  'إ': 'ا',
  'آ': 'ا',
};

function normalize(text) {
  return Array.from(text, ch => ch.toLowerCase())
    .join('')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u200c\u0640]/g, '')
    .replace(/[يىكةأإآ]/g, character => variants[character]);
}

function saved(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be disabled.
  }
}

let data, language, indexed, opener, size = 56;
let currentPage;
let phraseQuery = '';
let availableLanguages = [];
let filteredLanguages = [];
let activeLanguage = -1;
const translations = {};
const languageLoads = {};
const fallbackLoads = {};
let renderVersion = 0;

function sourceTag(sourceId) {
  const source = data.sources.find(item => item.id === sourceId);
  const link = document.createElement('a');
  link.className = 'source-tag';
  link.href = '#/sources/' + encodeURIComponent(source.id);
  link.textContent = source.tag;
  link.addEventListener('click', () => {
    if ($('fullscreen').open) $('fullscreen').close();
  });
  return link;
}

function marked(element, text, words) {
  if (!words.length) {
    element.textContent = text;
    return;
  }

  let normalized = '', mapping = [];
  let offset = 0;
  for (const ch of text) {
    const n = normalize(ch);
    normalized += n;
    for (let i = 0; i < n.length; i++) {
      mapping.push([offset, offset + ch.length]);
    }
    offset += ch.length;
  }

  const ranges = [];
  for (const word of words) {
    let at = normalized.indexOf(word);
    while (at !== -1) {
      ranges.push([mapping[at][0], mapping[at + word.length - 1][1]]);
      at = normalized.indexOf(word, at + word.length);
    }
  }

  ranges.sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (let i = 0; i < ranges.length; i++) {
    let [start, end] = ranges[i];
    while (i + 1 < ranges.length && ranges[i + 1][0] <= end) {
      end = Math.max(end, ranges[++i][1]);
    }
    element.append(document.createTextNode(text.slice(cursor, start)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(start, end);
    element.append(mark);
    cursor = end;
  }
  element.append(document.createTextNode(text.slice(cursor)));
}

function line(className, text, words = []) {
  const el = document.createElement('p');
  el.className = className;
  marked(el, text, words);
  return el;
}

function reviewLabel(phrase) {
  return phrase.reviewer?.trim() ? 'Reviewed' : '';
}

function openCard(p, button) {
  const t = p;
  opener = button;
  size = 56;
  $('large-translation').textContent = t.translation;
  $('large-translation').dir = data.languages.find(
    l => l.code === language
  ).direction;
  $('large-translation').lang = language;
  $('large-translation').style.fontSize = size + 'px';
  $('large-transliteration').textContent = t.transliteration || '';
  $('large-english').textContent = p.english;
  $('large-source').replaceChildren(...(p.source_id ? [sourceTag(p.source_id)] : []));
  $('large-status').textContent = reviewLabel(t);
  $('large-status').hidden = !reviewLabel(t);
  $('fullscreen').showModal();
  $('close').focus();
}

function card(p, words, searching) {
  const t = p;
  const button = document.createElement('button');
  button.className = 'card-content';
  button.type = 'button';
  if (searching) {
    const context = data.fields.find(f => f.id === p.field).title + ' / ' +
      data.stages.find(s => s.id === p.stage).title;
    button.append(line('context', context));
  }

  const translation = line(
    'translation',
    t.translation,
    words
  );
  translation.dir = data.languages.find(l => l.code === language).direction;
  translation.lang = language;
  button.append(translation);
  if (t.transliteration) {
    button.append(line('transliteration', t.transliteration, words));
  }
  button.append(line('english', p.english, words));

  if (t.reviewer?.trim()) {
    const badge = document.createElement('span');
    badge.className = 'badge reviewed';
    badge.textContent = reviewLabel(t);
    button.append(badge);
  }
  button.addEventListener('click', () => openCard(p, button));
  const article = document.createElement('article');
  article.className = 'card';
  article.append(button);
  if (p.source_id) article.append(sourceTag(p.source_id));
  return article;
}

function route() {
  const hash = location.hash.slice(1) || '/';
  const [path, query = ''] = hash.split('?');
  if (path === '/sources' || path.startsWith('/sources/')) {
    return { page: 'sources', source: path.slice('/sources/'.length) };
  }
  if (path === '/quiz/play') return { page: 'quiz-play' };
  if (path === '/about') return { page: 'about' };
  if (path === '/quiz') return { page: 'quiz' };
  if (path === '/') return { page: 'home' };
  if (path === '/search') {
    const q = new URLSearchParams(query).get('q') || '';
    return q.trim() ? { page: 'search', q } : { page: 'home' };
  }
  if (path.startsWith('/area/')) {
    let id;
    try {
      id = decodeURIComponent(path.slice(6));
    } catch {
      return { page: 'missing' };
    }
    const area = data.fields.find(f => f.id === id);
    if (area) return { page: 'area', area };
  }
  return { page: 'missing' };
}

async function render(focusHeading = false) {
  const state = route();
  if (state.page === 'quiz-play' && !quizRound) {
    location.replace('#/quiz');
    return;
  }
  if (['quiz', 'quiz-play'].includes(state.page)) {
    ++renderVersion;
    await loadQuizLanguage(language);
    renderQuiz();
    return;
  }
  $('language-home').after($('language-control'));
  $('language-control').hidden = false;
  document.querySelector('.language-label').textContent = 'Patient language';
  $('back').href = '#/';
  $('back').textContent = '← Home';
  if (state.page === 'search') phraseQuery = state.q;
  const version = ++renderVersion;
  const code = language;
  let selected;
  try {
    selected = await selectPhrases(state, code);
  } catch (error) {
    if (version === renderVersion) $('count').textContent = error.message;
    return;
  }
  if (version !== renderVersion || code !== language) return;
  const searching = state.page === 'search';
  const home = state.page === 'home';
  const pageKey = state.page + (state.area?.id || '');
  const changed = currentPage !== pageKey;
  currentPage = pageKey;
  document.querySelector('main').classList.toggle('home', home);
  $('back').hidden = home;
  $('search-form').hidden = state.page === 'about';
  $('language-control').hidden = state.page === 'about';
  $('page-heading').hidden = home;
  if ($('search').value !== phraseQuery) $('search').value = phraseQuery;
  $('page-heading').textContent = home ? 'Find a phrase' : searching ? 'Search results'
    : state.page === 'about' ? 'About us'
    : state.page === 'sources' ? 'Sources' : state.area?.title || 'Page not found';
  $('results').setAttribute('role', 'region');
  $('results').setAttribute('aria-labelledby', 'page-heading');
  $('count').hidden = home || ['missing', 'sources', 'about'].includes(state.page);
  const fragment = document.createDocumentFragment();
  if (home) {
    const grid = document.createElement('div');
    grid.className = 'areas';
    for (const area of availableAreas(code)) {
      const count = areaCount(area.id, code);
      const tile = document.createElement('a');
      tile.className = 'area-tile';
      tile.href = '#/area/' + encodeURIComponent(area.id);
      const title = document.createElement('h2');
      title.textContent = area.title;
      tile.append(title, line('area-count', count ? `${count} phrases` : 'Coming soon'));
      grid.append(tile);
    }
    fragment.append(grid);
  } else if (state.page === 'about') {
    fragment.append(aboutPage());
  } else if (state.page === 'sources') {
    fragment.append(sourcesPage());
  } else if (state.page === 'missing') {
    fragment.append(line('empty', 'This page could not be found.'));
  } else {
    const words = normalize(state.q || '').trim().split(/\s+/).filter(Boolean);
    const total = selected.phrases.length;
    const hits = searching ? selected.phrases.slice(0, 200) : selected.phrases;
    if (searching && selected.fallback && total) {
      fragment.append(line('fallback-notice',
        'No mdlingo match. Showing results from other sources.'));
    }
    $('count').textContent = `${total} phrase${total === 1 ? '' : 's'}${
      searching && total > 200 ? ' · Showing the first 200. Refine your search to see more.' : ''
    }`;
    const scaffold = data.field_stages[state.area?.id] || data.stages.map(stage => stage.id);
    const stages = [...new Set([...scaffold, ...hits.map(phrase => phrase.stage)])];
    const stageOrder = stages.map(id => ({ id, title: id }));
    for (const stage of searching ? [{ id: null }] : stageOrder) {
      const phrases = searching ? hits : hits.filter(p => p.stage === stage.id);
      if (!phrases.length) continue;
      if (!searching) {
        const heading = document.createElement('h2');
        heading.textContent = stage.title;
        fragment.append(heading);
      }
      const grid = document.createElement('div');
      grid.className = 'cards';
      let shown = 0;
      const more = document.createElement('button');
      more.className = 'show-more';
      more.textContent = 'Show more';
      const appendBatch = () => {
        for (const p of phrases.slice(shown, shown + 200)) grid.append(card(p, words, searching));
        shown += 200;
        more.hidden = shown >= phrases.length;
      };
      appendBatch();
      more.addEventListener('click', appendBatch);
      fragment.append(grid);
      if (!searching) fragment.append(more);
    }
    if (!total) {
      fragment.append(line('empty', searching ? 'No matching phrases. Try another word.' : 'No phrases yet'));
    }
  }
  $('results').replaceChildren(fragment);
  if (focusHeading && changed && document.activeElement !== $('search')) $('page-heading').focus();
  if (state.page === 'sources' && state.source) {
    document.getElementById('source-' + state.source)?.scrollIntoView();
  }
}

function search(submitted = false) {
  const query = $('search').value;
  const target = query.trim() ? '#/search?q=' + encodeURIComponent(query) : '#/';
  phraseQuery = query;
  remember('phraseQuery', query);
  history.replaceState(null, '', target);
  render();
}

function areaCount(id, code) {
  return (data.own_counts[code]?.[id] || 0) + data.sources.reduce(
    (total, source) => total + (source.counts[code]?.[id] || 0), 0
  );
}

function availableAreas(code) {
  return data.fields.filter(area => areaCount(area.id, code) > 0)
    .sort((a, b) => areaCount(b.id, code) - areaCount(a.id, code));
}

async function loadQuizLanguage(code) {
  await loadLanguage(code);
  if (data.own_counts[code]) return;
  const sources = data.sources.filter(source => source.counts[code]);
  const entries = (await Promise.all(sources.map(source => loadFallback(source, code)))).flat();
  translations[code] = entries.map(entry => entry.phrase);
}

function prepare(phrases) {
  return phrases.map(phrase => {
    const text = normalize([
      phrase.english, phrase.translation, phrase.transliteration, ...(phrase.linked_terms || []),
    ].join(' '));
    return { phrase, text, starts: text.split(/[^\p{L}\p{N}]+/u) };
  });
}

async function fetchPhrases(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Unable to load phrases');
  return response.json();
}

async function loadLanguage(code) {
  if (!languageLoads[code]) {
    languageLoads[code] = (async () => {
      translations[code] = data.own_counts[code]
        ? await fetchPhrases(`lang/${encodeURIComponent(code)}.json`) : [];
      indexed[code] = prepare(translations[code]);
    })().catch(error => {
      delete languageLoads[code];
      throw error;
    });
  }
  await languageLoads[code];
}

async function loadFallback(source, code) {
  const key = source.id + '/' + code;
  if (!fallbackLoads[key]) {
    fallbackLoads[key] = fetchPhrases(`fallback/${source.id}/${encodeURIComponent(code)}.json`)
      .then(phrases => prepare(phrases.map(phrase => ({ ...phrase, source_id: source.id }))))
      .catch(error => {
        delete fallbackLoads[key];
        throw error;
      });
  }
  return fallbackLoads[key];
}

function matches(entries, state) {
  if (state.page === 'area') {
    return entries.filter(entry => entry.phrase.field === state.area.id).map(entry => entry.phrase);
  }
  const words = normalize(state.q).trim().split(/\s+/).filter(Boolean);
  const start = [], substring = [];
  for (const entry of entries) {
    if (!words.every(word => entry.text.includes(word))) continue;
    const wordStart = words.every(word => entry.starts.some(token => token.startsWith(word)));
    (wordStart ? start : substring).push(entry.phrase);
  }
  return start.concat(substring);
}

async function selectPhrases(state, code) {
  if (!['search', 'area'].includes(state.page)) return { phrases: [], fallback: false };
  const own = matches(indexed[code], state);
  if (own.length) return { phrases: own, fallback: false };
  const sources = data.sources.filter(source => state.page === 'area'
    ? source.counts[code]?.[state.area.id] : source.counts[code]);
  const entries = (await Promise.all(sources.map(source => loadFallback(source, code)))).flat();
  return { phrases: matches(entries, state), fallback: true };
}

function aboutPage() {
  const section = document.createElement('section');
  section.className = 'about';
  section.append(line('', 'Find a phrase and show it to your patient. '
    + 'mdlingo was built by Karanvir Gill, Arvin Zaker and Luka Vukovic.'));
  const languages = availableLanguages.map(item => ({
    name: item.name,
    count: data.fields.reduce((total, field) => total + areaCount(field.id, item.code), 0),
  }));
  const specialties = data.fields.map(item => ({
    name: item.title, count: data.specialty_counts[item.id] || 0,
  })).filter(item => item.count);
  section.append(radialChart('Phrases per language', languages, 'language'),
    radialChart('Phrases per specialty', specialties, 'specialty'));
  return section;
}

function radialChart(title, entries, id) {
  entries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const section = document.createElement('section');
  section.className = 'radial-chart';
  const heading = document.createElement('h3');
  heading.id = id + '-heading';
  heading.textContent = title;
  const svg = svgElement('svg', { viewBox: '-320 -320 640 640', role: 'group',
    'aria-labelledby': heading.id, class: 'radial-svg' });
  const radius = 78;
  const maximum = Math.max(...entries.map(item => item.count));
  const scale = Math.max(1, Math.min(680, $('results').clientWidth)) / 640;
  const width = Math.max(1, 2 * radius * Math.sin(Math.PI / entries.length) - 2 / scale);
  const tooltip = document.createElement('p');
  tooltip.id = id + '-tooltip';
  tooltip.className = 'radial-tooltip';
  tooltip.setAttribute('role', 'status');
  tooltip.textContent = 'Hover, tap or focus a bar for its count.';
  const reset = () => {
    svg.classList.remove('has-active');
    svg.querySelector('.active')?.classList.remove('active');
    tooltip.textContent = 'Hover, tap or focus a bar for its count.';
  };
  const labels = [];
  const labelSize = Math.max(14, 11 / scale);
  entries.forEach((item, index) => {
    const angle = index * 360 / entries.length;
    const radians = angle * Math.PI / 180;
    const length = 152 * Math.sqrt(item.count / maximum);
    const group = svgElement('g', { transform: `rotate(${angle})` });
    const bar = svgElement('rect', { x: -width / 2, y: -radius - length,
      width, height: length + width / 2, rx: width / 2, class: 'radial-bar',
      tabindex: 0, role: 'button', 'aria-label': `${item.name}: ${item.count.toLocaleString()} phrases` });
    bar.style.transformOrigin = `0px ${-radius}px`;
    const show = () => {
      svg.querySelector('.active')?.classList.remove('active');
      svg.classList.add('has-active');
      bar.classList.add('active');
      tooltip.textContent = `${item.name}: ${item.count.toLocaleString()} phrases`;
    };
    bar.addEventListener('pointerenter', show);
    bar.addEventListener('pointerleave', () => { if (document.activeElement !== bar) reset(); });
    bar.addEventListener('focus', show);
    bar.addEventListener('blur', reset);
    bar.addEventListener('click', show);
    bar.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); }
      if (event.key === 'Escape') reset();
    });
    group.append(bar);
    svg.append(group);
    // Keep only labels that fit inside the chart and do not overlap earlier labels.
    if (index < 6) {
      const distance = radius + length + 22;
      const x = Math.sin(radians) * distance;
      const y = -Math.cos(radians) * distance;
      const anchor = Math.abs(x) < 10 ? 'middle' : x > 0 ? 'start' : 'end';
      const textWidth = item.name.length * labelSize * .55;
      const left = anchor === 'middle' ? x - textWidth / 2 : anchor === 'start' ? x : x - textWidth;
      const box = { left, right: left + textWidth, top: y - labelSize, bottom: y + 5 };
      if (box.left > -310 && box.right < 310 && !labels.some(b =>
        box.left < b.right + 8 && box.right > b.left - 8 && box.top < b.bottom + 8 && box.bottom > b.top - 8)) {
        labels.push(box);
        svg.append(svgElement('text', { x, y, 'text-anchor': anchor, class: 'radial-label',
          'font-size': labelSize }, item.name));
      }
    }
  });
  svg.append(svgElement('circle', { r: radius, class: 'radial-center' }));
  const total = entries.reduce((sum, item) => sum + item.count, 0);
  svg.append(svgElement('text', { y: -2, 'text-anchor': 'middle', class: 'radial-total' }, total.toLocaleString()));
  svg.append(svgElement('text', { y: 23, 'text-anchor': 'middle', class: 'radial-label' }, 'phrases'));
  const caption = line('radial-caption', 'Bar length scaled to the square root of the count.');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'Show table';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', id + '-table');
  const table = document.createElement('table');
  table.id = id + '-table';
  table.hidden = true;
  table.createCaption().textContent = title;
  const header = table.createTHead().insertRow();
  for (const name of ['Category', 'Phrases']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = name;
    header.append(th);
  }
  const body = table.createTBody();
  for (const item of entries) {
    const row = body.insertRow();
    row.insertCell().textContent = item.name;
    row.insertCell().textContent = item.count.toLocaleString();
  }
  toggle.addEventListener('click', () => {
    table.hidden = !table.hidden;
    toggle.textContent = table.hidden ? 'Show table' : 'Hide table';
    toggle.setAttribute('aria-expanded', String(!table.hidden));
  });
  section.append(heading, svg, tooltip, caption, toggle, table);
  const observer = new IntersectionObserver(items => {
    if (items.some(item => item.isIntersecting)) {
      svg.classList.add('animate');
      observer.disconnect();
    }
  });
  observer.observe(svg);
  return section;
}

function sourcesPage() {
  const section = document.createElement('section');
  section.className = 'sources';
  const sources = data.sources;
  for (const source of sources) {
    const article = document.createElement('article');
    article.id = 'source-' + source.id;
    const title = document.createElement('h2');
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = source.title;
    title.append(link);
    const licence = document.createElement('a');
    licence.href = source.licence_url;
    licence.textContent = source.licence;
    article.append(title, line('', source.authors), licence, line('', `${source.count} phrases`));
    article.append(line('', 'Changes: ' + source.change_note));
    section.append(article);
  }
  return section;
}

function languageLabel(item) {
  return item.native_name + ' · ' + item.name;
}

function closeLanguages() {
  $('language-options').hidden = true;
  $('language').setAttribute('aria-expanded', 'false');
  $('language').removeAttribute('aria-activedescendant');
  $('language').value = languageLabel(availableLanguages.find(item => item.code === language));
}

function highlightLanguage() {
  Array.from($('language-options').children).forEach((option, index) => {
    option.classList.toggle('active', index === activeLanguage);
  });
  const option = $('language-options').children[activeLanguage];
  if (option) {
    $('language').setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
  } else {
    $('language').removeAttribute('aria-activedescendant');
  }
}

function showLanguages(filter = '') {
  const query = normalize(filter);
  filteredLanguages = availableLanguages.filter(item =>
    normalize([item.name, item.native_name, item.code].join(' ')).includes(query));
  activeLanguage = -1;
  $('language-options').replaceChildren(...filteredLanguages.map(item => {
    const option = document.createElement('li');
    option.id = 'language-' + item.code;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(item.code === language));
    option.textContent = languageLabel(item);
    option.addEventListener('pointerdown', event => event.preventDefault());
    option.addEventListener('click', () => chooseLanguage(item));
    return option;
  }));
  $('language-options').hidden = false;
  $('language').setAttribute('aria-expanded', 'true');
  $('language').removeAttribute('aria-activedescendant');
}

async function chooseLanguage(item) {
  quizRound = null;
  language = item.code;
  remember('language', language);
  closeLanguages();
  try {
    await loadLanguage(item.code);
    if (language === item.code) await render();
  } catch (error) {
    $('count').textContent = error.message;
  }
}

function setupLanguageCombo() {
  closeLanguages();
  $('language').addEventListener('focus', () => {
    $('language').select();
    showLanguages();
  });
  $('language').addEventListener('click', () => {
    if ($('language-options').hidden) {
      $('language').select();
      showLanguages();
    }
  });
  $('language').addEventListener('input', () => showLanguages($('language').value));
  $('language').addEventListener('blur', closeLanguages);
  $('language').addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLanguages();
    } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if ($('language-options').hidden) showLanguages();
      const count = filteredLanguages.length;
      if (!count) return;
      activeLanguage = (activeLanguage + (event.key === 'ArrowDown' ? 1 : count - 1) + count) % count;
      highlightLanguage();
    } else if (event.key === 'Enter' && !$('language-options').hidden) {
      event.preventDefault();
      if (activeLanguage >= 0) chooseLanguage(filteredLanguages[activeLanguage]);
    }
  });
}

const systemTheme = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const theme = saved('theme', systemTheme.matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  $('theme').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  $('theme').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
}
$('theme').addEventListener('click', () => {
  remember('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  applyTheme();
});
systemTheme.addEventListener('change', applyTheme);
applyTheme();

async function init() {
  const response = await fetch('phrases.json');
  if (!response.ok) throw new Error('Unable to load phrases');
  data = await response.json();

  availableLanguages = data.languages.filter(item => {
    const counts = [data.own_counts[item.code], ...data.sources.map(source => source.counts[item.code])];
    return counts.some(count => count && Object.values(count).some(value => value > 0));
  }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  language = saved('language', availableLanguages[0].code);
  if (!availableLanguages.some(item => item.code === language)) language = availableLanguages[0].code;
  indexed = {};
  phraseQuery = route().q || saved('phraseQuery', '');
  setupLanguageCombo();
  await loadLanguage(language);
  $('search').addEventListener('input', () => search());
  $('search-form').addEventListener('submit', event => {
    event.preventDefault();
    search(true);
    $('page-heading').focus();
  });
  window.addEventListener('hashchange', () => render(true));
  window.addEventListener('popstate', () => render(true));
  render(true);
}

$('close').addEventListener('click', () => $('fullscreen').close());
$('fullscreen').addEventListener('close', () => opener?.focus());
for (const [id, delta] of [['smaller', -8], ['larger', 8]]) {
  $(id).addEventListener('click', () => {
    size = Math.max(24, Math.min(144, size + delta));
    $('large-translation').style.fontSize = size + 'px';
  });
}
init().catch(error => {
  $('count').textContent = error.message;
});

let quizArea = '';
let quizEnglishPrompt = true;
let quizReviewed = false;
let quizRound = null;
let quizAll = false;
let quizTable = false;

function quizHistory() {
  try {
    const rounds = JSON.parse(saved('quizHistory', '[]'));
    return Array.isArray(rounds) ? rounds.filter(r => r.total > 0 && Number.isFinite(r.correct)) : [];
  } catch {
    return [];
  }
}

function quizButton(text, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.addEventListener('click', action);
  return button;
}

function quizRows() {
  return (translations[language] || []).filter(p => p.field === quizArea && p.translation?.trim()
    && p.english?.trim() && (!quizReviewed || p.reviewer?.trim()));
}

function answerText(p) {
  return (quizEnglishPrompt ? p.translation : p.english).trim();
}

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function quizQuestion() {
  const round = quizRound;
  const phrase = round.questions[round.index];
  const correct = answerText(phrase);
  const words = new Set(normalize(correct).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const seen = new Set([normalize(correct)]);
  const candidates = quizRows().map(p => ({
    text: answerText(p),
    stage: Number(p.stage === phrase.stage),
    overlap: [...new Set(normalize(answerText(p)).split(/[^\p{L}\p{N}]+/u))]
      .filter(word => words.has(word)).length,
    tie: Math.random(),
  })).sort((a, b) => b.stage - a.stage || b.overlap - a.overlap || a.tie - b.tie);
  const wrong = [];
  for (const candidate of candidates) {
    const key = normalize(candidate.text);
    if (seen.has(key)) continue;
    seen.add(key);
    wrong.push(candidate.text);
    if (wrong.length === 3) break;
  }
  round.choices = shuffled([correct, ...wrong]);
  round.correct = correct;
  round.answered = false;
}

function startQuiz() {
  const rows = quizRows();
  if (new Set(rows.map(p => normalize(answerText(p)))).size < 4) return;
  const questions = [];
  while (questions.length < 10) questions.push(...shuffled(rows).slice(0, 10 - questions.length));
  quizRound = { questions, index: 0, score: 0, done: false };
  quizQuestion();
  if (route().page === 'quiz-play') {
    renderQuiz();
    $('quiz-prompt').focus();
  } else {
    location.hash = '/quiz/play';
  }
}

function answerQuiz(index) {
  if (!quizRound || quizRound.answered || quizRound.done) return;
  quizRound.answered = true;
  quizRound.selected = index;
  if (quizRound.choices[index] === quizRound.correct) quizRound.score++;
  renderQuiz();
  $('quiz-next').focus();
}

function nextQuiz() {
  if (!quizRound?.answered || quizRound.done) return;
  quizRound.index++;
  if (quizRound.index === 10) {
    quizRound.done = true;
    const rounds = quizHistory();
    rounds.push({ date: new Date().toISOString(), specialty: quizArea, language,
      direction: quizEnglishPrompt ? 'en-to-patient' : 'patient-to-en', correct: quizRound.score, total: 10 });
    remember('quizHistory', JSON.stringify(rounds));
  } else {
    quizQuestion();
  }
  renderQuiz();
  (quizRound.done ? $('quiz-score') : $('quiz-prompt')).focus();
}

function renderQuiz() {
  const playing = route().page === 'quiz-play';
  currentPage = playing ? 'quiz-play' : 'quiz';
  document.querySelector('main').classList.remove('home');
  $('search-form').hidden = true;
  $('count').hidden = true;
  $('back').hidden = false;
  $('page-heading').hidden = false;
  $('page-heading').textContent = playing ? 'Quiz round' : 'Quiz';
  $('back').href = playing ? '#/quiz' : '#/';
  $('back').textContent = playing ? '← Back to quiz setup' : '← Home';
  // Keep the existing combobox and its listeners alive while rebuilding the quiz.
  $('language-home').after($('language-control'));
  const section = document.createElement('section');
  section.className = 'quiz';
  $('language-control').hidden = playing;
  if (!playing) {
    const areas = availableAreas(language);
    if (!areas.some(f => f.id === quizArea)) quizArea = areas[0]?.id || '';
    const label = document.createElement('label');
    label.textContent = 'Specialty';
    const picker = document.createElement('select');
    picker.id = 'quiz-specialty';
    for (const area of areas) picker.add(new Option(area.title, area.id));
    picker.value = quizArea;
    picker.addEventListener('change', () => {
      quizArea = picker.value;
      quizRound = null;
      renderQuiz();
    });
    label.append(picker);
    section.append(label);
    const bar = document.createElement('div');
    bar.className = 'quiz-language-bar';
    const english = document.createElement('div');
    english.className = 'quiz-language-box';
    const englishLabel = line('quiz-language-label', quizEnglishPrompt ? 'From' : 'To');
    const englishValue = line('quiz-english', 'English');
    english.append(englishLabel, englishValue);
    const swap = quizButton('⇄', () => {
      quizEnglishPrompt = !quizEnglishPrompt;
      quizRound = null;
      renderQuiz();
    });
    swap.id = 'quiz-swap';
    swap.setAttribute('aria-label', 'Swap prompt and answer languages');
    const control = $('language-control');
    document.querySelector('.language-label').textContent = quizEnglishPrompt ? 'To' : 'From';
    bar.append(...(quizEnglishPrompt ? [english, swap, control] : [control, swap, english]));
    section.append(bar);
    const reviewed = document.createElement('label');
    reviewed.className = 'quiz-check';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = quizReviewed;
    check.addEventListener('change', () => {
      quizReviewed = check.checked;
      quizRound = null;
      renderQuiz();
    });
    reviewed.append(check, 'Reviewed only');
    section.append(reviewed);
    {
      const enough = new Set(quizRows().map(p => normalize(answerText(p)))).size >= 4;
      const start = quizButton('Start', startQuiz);
      start.id = 'quiz-start';
      start.disabled = !enough;
      section.append(start);
      if (!enough) section.append(line('empty', 'Not enough translated phrases for four distinct choices.'));
    }
    section.append(quizChart());
  } else if (quizRound.done) {
    const score = line('quiz-score', `You scored ${quizRound.score} / 10`);
    score.id = 'quiz-score';
    score.tabIndex = -1;
    const setup = document.createElement('a');
    setup.href = '#/quiz';
    setup.textContent = 'Back to setup';
    setup.className = 'quiz-setup-link';
    section.append(score, quizButton('Play again', startQuiz), setup);
  } else {
    const round = quizRound;
    section.append(line('quiz-hint', `Question ${round.index + 1} of 10`));
    const phrase = round.questions[round.index];
    const prompt = line('quiz-prompt', quizEnglishPrompt ? phrase.english : phrase.translation);
    prompt.id = 'quiz-prompt';
    prompt.tabIndex = -1;
    prompt.lang = quizEnglishPrompt ? 'en' : language;
    prompt.dir = quizEnglishPrompt ? 'ltr' : data.languages.find(l => l.code === language).direction;
    section.append(prompt);
    const choices = document.createElement('div');
    choices.className = 'quiz-choices';
    round.choices.forEach((text, i) => {
      const button = quizButton(`${i + 1}. ${text}`, () => answerQuiz(i));
      button.lang = quizEnglishPrompt ? language : 'en';
      button.dir = quizEnglishPrompt ? data.languages.find(l => l.code === language).direction : 'ltr';
      button.disabled = round.answered;
      if (round.answered && text === round.correct) button.classList.add('correct');
      if (round.answered && i === round.selected && text !== round.correct) button.classList.add('incorrect');
      choices.append(button);
    });
    section.append(choices);
    const feedback = line('', round.answered
      ? (round.choices[round.selected] === round.correct ? 'Correct!' : 'Incorrect. Answer: ' + round.correct) : '');
    feedback.setAttribute('role', 'status');
    section.append(feedback);
    if (round.answered) {
      const next = quizButton(round.index === 9 ? 'See results (Enter)' : 'Next (Enter)', nextQuiz);
      next.id = 'quiz-next';
      section.append(next);
    }
  }
  $('results').replaceChildren(section);
}

function svgElement(tag, attributes, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function quizChart() {
  const section = document.createElement('section');
  section.className = 'quiz-history';
  const title = document.createElement('h2');
  title.textContent = 'Quiz accuracy over time';
  const label = document.createElement('label');
  label.textContent = 'History filter';
  const filter = document.createElement('select');
  filter.id = 'quiz-history-filter';
  filter.add(new Option('Current specialty, language & direction', 'current'));
  filter.add(new Option('All', 'all'));
  filter.value = quizAll ? 'all' : 'current';
  filter.addEventListener('change', () => {
    quizAll = filter.value === 'all';
    renderQuiz();
  });
  label.append(filter);
  section.append(title, label);
  const rounds = quizHistory().filter(r => quizAll || (r.specialty === quizArea && r.language === language
    && r.direction === (quizEnglishPrompt ? 'en-to-patient' : 'patient-to-en')));
  if (!rounds.length) {
    section.append(line('empty', 'No rounds yet. Finish a quiz to see your accuracy over time.'));
    return section;
  }
  const width = Math.max(300, $('results').clientWidth);
  const right = width - 18;
  const svg = svgElement('svg', { viewBox: `0 0 ${width} 260`, role: 'group',
    'aria-label': 'Quiz accuracy over time, from zero to one hundred percent' });
  for (const accuracy of [0, 25, 50, 75, 100]) {
    const y = 218 - accuracy * 1.8;
    svg.append(svgElement('line', { x1: 48, x2: right, y1: y, y2: y, class: 'chart-grid' }));
    svg.append(svgElement('text', { x: 40, y: y + 5, 'text-anchor': 'end' }, accuracy + '%'));
  }
  svg.append(svgElement('line', { x1: 48, x2: 48, y1: 38, y2: 218, class: 'chart-grid' }));
  const points = rounds.map((r, i) => ({ x: rounds.length === 1 ? 58 : 58 + i * (right - 68) / (rounds.length - 1),
    y: 218 - r.correct / r.total * 180 }));
  svg.append(svgElement('polyline', { points: points.map(p => `${p.x},${p.y}`).join(' '),
    class: 'chart-series', fill: 'none', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }));
  const tooltip = document.createElement('p');
  tooltip.className = 'chart-tooltip';
  tooltip.setAttribute('role', 'status');
  tooltip.hidden = true;
  rounds.forEach((r, i) => {
    const area = data.fields.find(f => f.id === r.specialty)?.title || r.specialty;
    const name = data.languages.find(l => l.code === r.language)?.name || r.language;
    const text = `${new Date(r.date).toLocaleString()} · ${area} · ${name} · ${r.correct}/${r.total}`;
    const point = svgElement('circle', { cx: points[i].x, cy: points[i].y, r: 4,
      tabindex: 0, role: 'button', 'aria-label': text, class: 'chart-point' });
    const show = () => { tooltip.textContent = text; tooltip.hidden = false; };
    point.addEventListener('pointerenter', show);
    point.addEventListener('focus', show);
    point.addEventListener('click', show);
    point.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); }
    });
    point.addEventListener('pointerleave', () => { tooltip.hidden = true; });
    point.addEventListener('blur', () => { tooltip.hidden = true; });
    svg.append(point);
  });
  svg.append(svgElement('text', { x: 58, y: 240, 'text-anchor': 'middle' }, '1'));
  if (rounds.length > 1) svg.append(svgElement('text', { x: right - 10, y: 240 }, rounds.length));
  svg.append(svgElement('text', { x: width / 2, y: 257, 'text-anchor': 'middle' }, 'Round'));
  section.append(svg, tooltip);
  const toggle = quizButton(quizTable ? 'Hide table' : 'Show table', () => {
    quizTable = !quizTable;
    renderQuiz();
  });
  toggle.setAttribute('aria-expanded', String(quizTable));
  section.append(toggle);
  if (quizTable) {
    const wrap = document.createElement('div');
    wrap.className = 'quiz-table-wrap';
    const table = document.createElement('table');
    const caption = table.createCaption();
    caption.textContent = 'Quiz accuracy over time — same rounds as the chart';
    const header = table.createTHead().insertRow();
    for (const text of ['Date', 'Specialty', 'Language', 'Direction', 'Score', 'Accuracy']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = text;
      header.append(th);
    }
    const body = table.createTBody();
    for (const r of rounds) {
      const row = body.insertRow();
      const area = data.fields.find(f => f.id === r.specialty)?.title || r.specialty;
      const name = data.languages.find(l => l.code === r.language)?.name || r.language;
      const direction = r.direction === 'en-to-patient' ? 'English → ' + name : name + ' → English';
      const cells = [new Date(r.date).toLocaleString(), area, name, direction,
        `${r.correct}/${r.total}`, Math.round(r.correct / r.total * 100) + '%'];
      for (const text of cells) row.insertCell().textContent = text;
    }
    wrap.append(table);
    section.append(wrap);
  }
  return section;
}

window.addEventListener('keydown', event => {
  if (route().page !== 'quiz-play' || !quizRound || quizRound.done || event.altKey || event.ctrlKey
    || event.metaKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (/^[1-4]$/.test(event.key) && !quizRound.answered) {
    event.preventDefault();
    answerQuiz(Number(event.key) - 1);
  } else if (event.key === 'Enter' && quizRound.answered) {
    event.preventDefault();
    nextQuiz();
  }
});

window.addEventListener('resize', () => {
  if (data && route().page === 'quiz') renderQuiz();
});
