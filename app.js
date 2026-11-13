'use strict';

const $ = id => document.getElementById(id);
const formatCount = value => value.toLocaleString('en');
const authorNames = [
  'Dr. Karanvir Gill',
  'Arvin Zaker',
  'Dr. Bipandeep Singh Biran',
  'Dr. Arshbir Aulakh',
];
$('footer-authors').textContent = authorNames.join(' · ');

// Keep route and action focus accessible without inheriting a keyboard focus ring.
function focusProgrammatically(element) {
  if (!element) return;
  element.classList.add('programmatic-focus');
  element.addEventListener('blur', () => element.classList.remove('programmatic-focus'), { once: true });
  element.focus({ preventScroll: true });
}
// Text inputs can match :focus-visible after a pointer click; track keyboard use explicitly.
document.addEventListener('keydown', event => {
  if (!event.altKey && !event.ctrlKey && !event.metaKey) {
    document.documentElement.classList.add('keyboard-navigation');
  }
});
document.addEventListener('pointerdown', () => {
  document.documentElement.classList.remove('keyboard-navigation');
});

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
  $('large-translation').style.fontSize = (size / 16) + 'rem';
  $('large-transliteration').textContent = t.transliteration || '';
  $('large-english').textContent = p.english;
  const source = data.sources.find(item => item.id === p.source_id);
  $('large-source').replaceChildren();
  $('large-source').hidden = !source;
  if (source) {
    const pill = document.createElement('span');
    pill.className = 'source-tag';
    pill.textContent = source.tag;
    $('large-source').append(pill);
  }
  $('large-context').textContent = phraseContext(p);
  $('large-status').textContent = reviewLabel(t);
  $('large-status').hidden = !reviewLabel(t);
  $('fullscreen').showModal();
  focusProgrammatically($('close'));
}

function phraseContext(p) {
  const field = data.fields.find(item => item.id === p.field)?.title || p.field;
  const stage = data.stages.find(item => item.id === p.stage)?.title || p.stage;
  return [field, stage].filter(Boolean).join(' / ');
}

function card(p, words, state) {
  const t = p;
  const button = document.createElement('button');
  button.className = 'card-content';
  button.type = 'button';

  const translation = line(
    'translation',
    t.translation,
    words
  );
  translation.dir = data.languages.find(l => l.code === language).direction;
  translation.lang = language;
  const english = document.createElement('h3');
  english.className = 'english';
  english.lang = 'en';
  english.dir = 'ltr';
  marked(english, p.english, words);
  button.append(english, translation);
  if (t.transliteration) {
    button.append(line('transliteration', t.transliteration, words));
  }
  if (state.page === 'search') button.append(line('context', phraseContext(p)));
  const tags = document.createElement('div');
  tags.className = 'tags';

  if (t.reviewer?.trim()) {
    const badge = document.createElement('span');
    badge.className = 'badge reviewed';
    badge.textContent = reviewLabel(t);
    tags.append(badge);
  }
  button.addEventListener('click', () => openCard(p, button));
  const article = document.createElement('article');
  article.className = 'card';
  article.append(button);
  // Only outside sources get a tag; our own phrases have none.
  if (p.source_id) tags.append(sourceTag(p.source_id));
  article.append(tags);
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
  const activeTab = state.page.startsWith('quiz') ? '#/quiz'
    : state.page === 'about' ? '#/about' : '#/';
  for (const tab of document.querySelectorAll('.app-nav nav a')) {
    if (tab.getAttribute('href') === activeTab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (state.page === 'quiz-play' && !quizRound) {
    location.replace('#/quiz');
    return;
  }
  if (['quiz', 'quiz-play'].includes(state.page)) {
    ++renderVersion;
    await loadQuizLanguage(language);
    renderQuiz();
    if (focusHeading) {
      window.scrollTo(0, 0);
      focusProgrammatically($('page-heading'));
    }
    return;
  }
  if ($('language-control').parentElement !== $('language-home').parentElement) {
    $('language-home').after($('language-control'));
  }
  $('language-control').hidden = false;
  document.querySelector('.language-label').textContent = 'Patient language';
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
  // Search keeps the home header so the search box does not move while typing.
  document.querySelector('main').classList.toggle('searching', searching);
  $('back').hidden = true;
  const showSearch = ['home', 'search', 'area'].includes(state.page);
  document.querySelector('.search-tools').hidden = !showSearch;
  $('search-form').hidden = !showSearch;
  $('language-control').hidden = !showSearch;
  $('page-heading').hidden = false;
  if ($('search').value !== phraseQuery) $('search').value = phraseQuery;
  $('page-heading').textContent = home ? 'mdlingo' : searching ? 'Search results'
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
      tile.append(title, line('area-count', count ? `${formatCount(count)} phrases` : 'Coming soon'));
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
    $('count').textContent = `${formatCount(total)} phrase${total === 1 ? '' : 's'}${
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
        for (const p of phrases.slice(shown, shown + 200)) grid.append(card(p, words, state));
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
  if (focusHeading && changed && document.activeElement !== $('search')) {
    window.scrollTo(0, 0);
    focusProgrammatically($('page-heading'));
  }
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
  return data.own_counts[code]?.[id] || 0;
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
  const languages = availableLanguages.map(item => ({
    name: item.name,
    count: data.fields.reduce((total, field) => total + (data.own_counts[item.code]?.[field.id] || 0), 0),
  }));
  const specialties = data.fields.map(item => ({
    name: item.title, count: data.specialty_counts[item.id] || 0,
  })).filter(item => item.count);
  const phrases = Object.values(data.specialty_counts).reduce((total, count) => total + count, 0);
  section.append(line('', `We made mdlingo so clinicians can learn simple instructions and questions in their patients' languages, and use them without waiting for an interpreter. Search a phrase, show the translation on the screen, and use the pronunciation to practice saying it. The Quiz tab tests you on the phrases. There are ${formatCount(phrases)} phrases across ${formatCount(specialties.length)} specialties in ${formatCount(availableLanguages.length)} languages.`));
  section.append(radialChart('Phrases per language', languages, 'language'),
    radialChart('Phrases per specialty', specialties, 'specialty'));
  const authors = document.createElement('h3');
  authors.textContent = 'Authors';
  const authorList = document.createElement('ul');
  authorList.className = 'authors';
  for (const name of authorNames) {
    const author = document.createElement('li');
    author.textContent = name;
    authorList.append(author);
  }
  const sourcesHeading = document.createElement('h3');
  sourcesHeading.textContent = 'Sources';
  const sources = document.createElement('div');
  sources.className = 'sources';
  sources.append(sourceArticle(data.sources[0]));
  section.append(authors, authorList, sourcesHeading,
    line('', `mdlingo also keeps the Medical Questionnaire (${formatCount(data.sources[0].count)} phrases) as a backup. It is used only when a search finds no mdlingo match.`), sources);
  return section;
}

// Pure geometry and label layout shared with the non-browser checks.
function roseGeometry(entries, radius) {
  const names = entries.map(item => item.name).sort();
  const slots = [6, 11, 7, 1, 14, 2, 13, 9, 4, 12, 5, 3, 10, 8];
  const sorted = [...entries].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const total = sorted.reduce((sum, item) => sum + item.count, 0);
  const step = 2 * Math.PI / sorted.length;
  return sorted.map((item, index) => {
    const start = index * step;
    const end = (index + 1) * step;
    const r = radius * Math.sqrt(item.count / sorted[0].count);
    const point = angle => [r * Math.sin(angle), -r * Math.cos(angle)];
    const [x, y] = point((start + end) / 2);
    const path = sorted.length === 1
      ? `M 0 0 L 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`
      : `M 0 0 L ${point(start)} A ${r} ${r} 0 ${step > Math.PI ? 1 : 0} 1 ${point(end)} Z`;
    return { ...item, color: slots[names.indexOf(item.name)], index, start, end, r, x, y, path, percent: item.count / total * 100 };
  });
}

function roseLabels(wedges) {
  const labels = wedges.filter(w => w.percent >= 2).map(w => ({ ...w, members: [w.index] }));
  for (const side of [-1, 1]) {
    const items = labels.filter(w => (w.x >= 0 ? 1 : -1) === side);
    items.sort((a, b) => a.y / a.r - b.y / b.r);
    let previous = -Infinity;
    for (const w of items) {
      w.outerX = 205 * w.x / w.r;
      w.outerY = 205 * w.y / w.r;
      w.labelY = Math.max(w.outerY, previous + 44);
      w.edge = side * 235;
      previous = w.labelY;
    }
  }
  return labels;
}

function rosePercent(value) {
  return value > 0 && value < .1 ? '<0.1%' : value.toFixed(1) + '%';
}

// Paired views share one selection and support standard tab keyboard navigation.
function viewTabs(id, label, chart, table, tableSelected = false) {
  const tabs = document.createElement('div');
  tabs.className = 'view-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', label);
  const panels = [chart, table];
  function select(index) {
    Array.from(tabs.children).forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (id === 'quiz-history') quizTable = index === 1;
  }
  ['Chart', 'Table'].forEach((name, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = name;
    tab.id = `${id}-tab-${i}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `${id}-panel-${i}`);
    panels[i].id = `${id}-panel-${i}`;
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - i;
      select(next);
      tabs.children[next].focus({ preventScroll: true });
    });
    tabs.append(tab);
  });
  select(Number(tableSelected));
  return tabs;
}

function radialChart(title, entries, id) {
  const section = document.createElement('section');
  section.className = 'radial-chart';
  const heading = document.createElement('h3');
  heading.id = id + '-heading';
  heading.textContent = title;
  const narrow = innerWidth < 600;
  const width = narrow ? 340 : 1000;
  const wedges = roseGeometry(entries, narrow ? 145 : 175);
  const labels = narrow ? [] : roseLabels(wedges);
  const halfHeight = narrow ? 158 : Math.max(205, ...labels.map(w => Math.abs(w.labelY) + 40));
  const verticalPoints = wedges.flatMap(w => {
    const angles = [w.start, w.end, Math.PI, 2 * Math.PI]
      .filter(angle => angle >= w.start && angle <= w.end);
    return angles.map(angle => -w.r * Math.cos(angle));
  });
  const top = narrow ? Math.min(0, ...verticalPoints) - 12 : -halfHeight;
  const bottom = narrow ? Math.max(0, ...verticalPoints) + 12 : halfHeight;
  const svg = svgElement('svg', {
    viewBox: `${-width / 2} ${top} ${width} ${bottom - top}`, role: 'group',
    'aria-labelledby': heading.id, class: 'radial-svg' });
  const groups = [];
  const labelGroups = [];
  const reset = () => {
    section.classList.remove('has-active');
    [...groups, ...labelGroups].forEach(g => g.classList.remove('active'));
  };
  const show = members => {
    reset();
    section.classList.add('has-active');
    members.forEach(i => groups[i].classList.add('active'));
    labelGroups.forEach(g => g.classList.toggle('active', g.members.some(i => members.includes(i))));
  };
  const description = w => `${w.name}: ${formatCount(w.count)} (${rosePercent(w.percent)})`;
  const interactive = (element, members) => {
    element.addEventListener('pointerenter', () => show(members));
    element.addEventListener('pointerleave', reset);
    element.addEventListener('focus', () => show(members));
    element.addEventListener('blur', reset);
    element.addEventListener('click', () => show(members));
    element.addEventListener('keydown', event => {
      if (['Enter', ' '].includes(event.key)) { event.preventDefault(); show(members); }
      if (event.key === 'Escape') reset();
    });
  };
  for (const w of wedges) {
    const group = svgElement('g', { class: 'rose-item' });
    const path = svgElement('path', { d: w.path, class: 'rose-wedge', tabindex: 0, role: 'button',
      'aria-label': description(w) });
    path.style.fill = `var(--chart-${w.color})`;
    path.append(svgElement('title', {}, description(w)));
    interactive(path, [w.index]);
    group.append(path);
    groups.push(group);
    svg.append(group);
  }
  for (const w of labels) {
    const group = svgElement('g', { class: 'rose-annotation', tabindex: 0, role: 'button',
      'aria-label': description(w) });
    group.members = w.members;
    const anchor = w.x < 0 ? 'end' : 'start';
    group.append(svgElement('polyline', { points:
      `${w.x},${w.y} ${w.outerX},${w.outerY} ${w.edge},${w.labelY + 12}`,
      class: 'rose-leader' }));
    group.append(svgElement('circle', { cx: w.x, cy: w.y, r: 2, class: 'rose-dot' }));
    const name = svgElement('text', {
      x: w.edge, y: w.labelY - 10, class: 'rose-label', 'text-anchor': anchor,
      'text-decoration': 'underline' }, w.name);
    group.append(name);
    group.append(svgElement('text', {
      x: w.edge, y: w.labelY + 6, class: 'rose-label', 'text-anchor': anchor,
    }, `${formatCount(w.count)} (${rosePercent(w.percent)})`));
    interactive(group, w.members);
    labelGroups.push(group);
    svg.append(group);
  }
  const legend = document.createElement('ol');
  legend.className = 'rose-legend';
  for (const w of wedges) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rose-legend-item';
    button.members = [w.index];
    const swatch = document.createElement('span');
    swatch.className = 'rose-swatch';
    swatch.style.background = groups[w.index].firstChild.style.fill;
    swatch.setAttribute('aria-hidden', 'true');
    button.append(swatch, line('rose-name', w.name),
      line('rose-value', `${formatCount(w.count)} · ${rosePercent(w.percent)}`));
    interactive(button, [w.index]);
    labelGroups.push(button);
    item.append(button);
    legend.append(item);
  }
  const table = document.createElement('table');
  table.id = id + '-table';
  table.hidden = true;
  table.createCaption().textContent = title;
  const header = table.createTHead().insertRow();
  for (const name of ['Category', 'Value', '%']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = name;
    header.append(th);
  }
  const body = table.createTBody();
  for (const w of wedges) {
    const row = body.insertRow();
    for (const value of [w.name, formatCount(w.count), rosePercent(w.percent)]) {
      row.insertCell().textContent = value;
    }
  }
  const chart = document.createElement('div');
  chart.append(svg, legend);
  const tabs = viewTabs(id, title, chart, table);
  section.append(heading, tabs, chart, table);
  return section;
}

function sourceArticle(source) {
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
  article.append(title, line('', source.authors), licence, line('', `${formatCount(source.count)} phrases`));
  article.append(line('', 'Changes: ' + source.change_note));
  return article;
}

function sourcesPage() {
  const section = document.createElement('section');
  section.className = 'sources';
  for (const source of data.sources) {
    section.append(sourceArticle(source));
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

function positionLanguages() {
  const list = $('language-options');
  if (list.hidden) return;
  const input = $('language').getBoundingClientRect();
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop || 0;
  const bottom = top + (viewport?.height || window.innerHeight);
  const below = bottom - input.bottom - 8;
  const above = input.top - top - 8;
  const openAbove = below < 160 && above > below;
  const height = Math.max(0, Math.min(288, bottom - top - 16, openAbove ? above : below));
  list.style.width = input.width + 'px';
  list.style.left = input.left + 'px';
  list.style.maxHeight = height + 'px';
  const listHeight = Math.min(list.scrollHeight, height);
  const preferredTop = openAbove ? input.top - listHeight - 4 : input.bottom + 4;
  list.style.top = Math.max(top + 4, Math.min(preferredTop, bottom - listHeight - 4)) + 'px';
}

function highlightLanguage() {
  Array.from($('language-options').children).forEach((option, index) => {
    option.classList.toggle('active', index === activeLanguage);
  });
  const option = $('language-options').children[activeLanguage];
  if (option) {
    $('language').setAttribute('aria-activedescendant', option.id);
    const list = $('language-options');
    list.scrollTop = Math.max(0, option.offsetTop - list.clientHeight + option.offsetHeight);
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
  positionLanguages();
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
  // Touch browsers can blur the input before an option's click arrives.
  // Close on an outside interaction instead, keeping option taps and scrolling intact.
  const combo = $('language').closest('.language-combo');
  document.addEventListener('pointerdown', event => {
    if (!combo.contains(event.target)) closeLanguages();
  });
  document.addEventListener('focusin', event => {
    if (!combo.contains(event.target)) closeLanguages();
  });
  window.addEventListener('resize', positionLanguages);
  window.addEventListener('scroll', event => {
    if (event.target !== $('language-options')) positionLanguages();
  }, true);
  window.visualViewport?.addEventListener('resize', positionLanguages);
  window.visualViewport?.addEventListener('scroll', positionLanguages);
  $('language').addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      closeLanguages();
    } else if (event.key === 'Escape') {
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
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  $('theme').title = label;
  $('theme').setAttribute('aria-pressed', String(theme === 'dark'));
  $('theme').setAttribute('aria-label', label);
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
    const counts = data.own_counts[item.code];
    return counts && Object.values(counts).some(value => value > 0);
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
  });
  window.addEventListener('hashchange', () => render(true));
  window.addEventListener('popstate', () => render(true));
  render(true);
}

$('close').addEventListener('click', () => $('fullscreen').close());
$('fullscreen').addEventListener('close', () => focusProgrammatically(opener));
for (const [id, delta] of [['smaller', -8], ['larger', 8]]) {
  $(id).addEventListener('click', () => {
    size = Math.max(24, Math.min(144, size + delta));
    $('large-translation').style.fontSize = (size / 16) + 'rem';
  });
}
init().catch(error => {
  $('count').textContent = error.message;
});

let quizArea = '';
let quizEnglishPrompt = true;
let quizReviewed = false;
let quizRound = null;
const quizFilters = { specialty: '', language: '', direction: '' };
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
  if (/^(Start|Next|See results|Play again)/.test(text)) button.className = 'primary';
  button.addEventListener('click', action);
  return button;
}

function quizRows() {
  // Fragments such as 'for one day?' start lowercase and make no sense alone.
  return (translations[language] || []).filter(p => p.field === quizArea && p.translation?.trim()
    && p.english?.trim() && !/^[a-z]/.test(p.english.trim()) && (!quizReviewed || p.reviewer?.trim()));
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
  round.choicePhrases = new Map([[correct, phrase]]);
  const candidates = quizRows().map(p => ({
    phrase: p,
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
    round.choicePhrases.set(candidate.text, candidate.phrase);
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
    focusProgrammatically($('quiz-prompt'));
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
  focusProgrammatically($('quiz-next'));
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
  focusProgrammatically(quizRound.done ? $('quiz-score') : $('quiz-prompt'));
}

function renderQuiz() {
  const playing = route().page === 'quiz-play';
  currentPage = playing ? 'quiz-play' : 'quiz';
  document.querySelector('main').classList.remove('home');
  $('search-form').hidden = true;
  $('count').hidden = true;
  $('back').hidden = !playing;
  document.querySelector('.search-tools').hidden = true;
  $('page-heading').hidden = false;
  $('page-heading').textContent = playing ? 'Quiz round' : 'Quiz';
  // Keep the existing combobox and its listeners alive while rebuilding the quiz.
  if ($('language-control').parentElement !== $('language-home').parentElement) {
    $('language-home').after($('language-control'));
  }
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
    swap.setAttribute('aria-label', 'Swap languages');
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
    if (quizHistory().length) section.append(quizChart());
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
    if (!quizEnglishPrompt && phrase.transliteration) {
      const pronunciation = line('transliteration', phrase.transliteration);
      pronunciation.dir = 'ltr';
      section.append(pronunciation);
    }
    const choices = document.createElement('div');
    choices.className = 'quiz-choices';
    if (round.answered) {
      const correct = round.choices[round.selected] === round.correct;
      const verdict = line('quiz-verdict', correct ? '✓ Correct' : '✗ Incorrect');
      verdict.dir = 'ltr';
      verdict.lang = 'en';
      verdict.setAttribute('role', 'status');
      section.append(verdict);
    }
    round.choices.forEach((text, i) => {
      const button = quizButton(`${i + 1}. ${text}`, () => answerQuiz(i));
      button.lang = quizEnglishPrompt ? language : 'en';
      button.dir = quizEnglishPrompt ? data.languages.find(l => l.code === language).direction : 'ltr';
      const choice = round.choicePhrases.get(text);
      if (quizEnglishPrompt && choice?.transliteration) {
        const pronunciation = line('transliteration', choice.transliteration);
        pronunciation.dir = 'ltr';
        button.append(pronunciation);
      }
      button.disabled = round.answered;
      button.setAttribute('aria-pressed', String(round.answered && i === round.selected));
      if (round.answered && text === round.correct) {
        button.classList.add('correct');
      }
      if (round.answered && i === round.selected && text !== round.correct) {
        button.classList.add('incorrect');
      }
      choices.append(button);
    });
    section.append(choices);
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
  const filters = document.createElement('div');
  filters.className = 'quiz-history-filters';
  const choices = {
    specialty: data.fields.map(f => [f.id, f.title]),
    language: data.languages.map(l => [l.code, l.name]),
    direction: [['en-to-patient', 'From English'], ['patient-to-en', 'To English']],
  };
  for (const key of ['specialty', 'language', 'direction']) {
    const label = document.createElement('label');
    label.textContent = key[0].toUpperCase() + key.slice(1);
    const filter = document.createElement('select');
    filter.id = 'quiz-history-' + key;
    filter.add(new Option('All', ''));
    for (const [value, name] of choices[key]) filter.add(new Option(name, value));
    filter.value = quizFilters[key];
    filter.addEventListener('change', () => {
      quizFilters[key] = filter.value;
      renderQuiz();
    });
    label.append(filter);
    filters.append(label);
  }
  section.append(title, filters);
  const rounds = quizHistory().filter(r => Object.entries(quizFilters)
    .every(([key, value]) => !value || r[key] === value));
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
  if (rounds.length) svg.append(svgElement('text', { x: 58, y: 240, 'text-anchor': 'middle' }, '1'));
  if (rounds.length > 1) svg.append(svgElement('text', { x: right - 10, y: 240 }, formatCount(rounds.length)));
  svg.append(svgElement('text', { x: width / 2, y: 257, 'text-anchor': 'middle' }, 'Round'));
  section.append(svg, tooltip);
  const wrap = document.createElement('div');
  wrap.className = 'quiz-table-wrap';
  const chart = document.createElement('div');
  chart.append(svg, tooltip);
  section.append(viewTabs('quiz-history', 'Quiz history view', chart, wrap, quizTable), chart, wrap);
  {
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

let layoutWidth = innerWidth;
window.addEventListener('resize', () => {
  if (layoutWidth === innerWidth) return;
  layoutWidth = innerWidth;
  if (data && route().page === 'quiz') renderQuiz();
  if (data && route().page === 'about') render();
});
