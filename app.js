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
  return phrase.reviewer.trim() ? 'Reviewed by ' + phrase.reviewer : 'Unreviewed';
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
  $('large-status').textContent = p.source_id ? '' : reviewLabel(t);
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

  if (!p.source_id) {
    const badge = document.createElement('span');
    badge.className = 'badge ' + (t.reviewer.trim() ? 'reviewed' : 'draft');
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
  $('search-form').hidden = false;
  $('page-heading').hidden = home;
  if ($('search').value !== phraseQuery) $('search').value = phraseQuery;
  $('page-heading').textContent = home ? 'Find a phrase' : searching ? 'Search results'
    : state.page === 'sources' ? 'Sources' : state.area?.title || 'Page not found';
  $('results').setAttribute('role', 'region');
  $('results').setAttribute('aria-labelledby', 'page-heading');
  $('count').hidden = home || ['missing', 'sources'].includes(state.page);
  const fragment = document.createDocumentFragment();
  if (home) {
    const grid = document.createElement('div');
    grid.className = 'areas';
    for (const area of data.fields) {
      const ownCount = data.own_counts[code]?.[area.id] || 0;
      const count = ownCount || data.sources.reduce(
        (total, source) => total + (source.counts[code]?.[area.id] || 0), 0
      );
      const tile = document.createElement('a');
      tile.className = 'area-tile';
      tile.href = '#/area/' + encodeURIComponent(area.id);
      const title = document.createElement('h2');
      title.textContent = area.title;
      tile.append(title, line('area-count', count ? `${count} phrases` : 'Coming soon'));
      grid.append(tile);
    }
    fragment.append(grid);
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
        'No MyHealthPhrase match. Showing results from other sources.'));
    }
    $('count').textContent = `${total} phrase${total === 1 ? '' : 's'}${
      searching && total > 200 ? ' · Showing the first 200. Refine your search to see more.' : ''
    }`;
    for (const stage of searching ? [{ id: null }] : data.stages) {
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
