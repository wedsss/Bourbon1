"use strict";

const catalog = window.BourbonCatalog;
const material = window.BourbonStudy;
const app = document.querySelector("#app");
const progressKey = "bourbon-training-v2";
const sections = new Map(catalog.map(section => [section.id, section]));
const photos = [
  ["01-kitchen-and-soft-drinks.jpg", "Кухня и безалкогольные напитки"],
  ["02-special-offers.jpg", "Акции"],
  ["03-beer-and-cocktails.jpg", "Пиво, коктейли и настойки"],
  ["04-spirits-and-wine.jpg", "Крепкие напитки и вина"]
];

function normalize(text) {
  return text.normalize("NFKC").toLowerCase().replaceAll("ё", "е").replace(/[^+\p{L}\p{N}]/gu, "");
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

const spellings = {
  "С грушей и горгондзолой": ["С грушей и горгонзолой"],
  "Бэрри Джин": ["Берри Джин"],
  "Блэк Шип И.П.А.": ["Блэк Шип IPA"],
  "Jack Daniel’s 1+1=3": ["Джек Дэниелс 1+1=3"],
  "Finlandia 1+1=3": ["Финляндия 1+1=3"],
  "Jim Beam Apple 1+1=3": ["Джим Бим Яблоко 1+1=3"],
  "Jägermeister 1+1=3": ["Ягермейстер 1+1=3"]
};

const items = catalog.flatMap(section => section.entries.map(([name, cue, price, amount, unit]) => ({
  id: section.id + "/" + normalize(name),
  section: section.id,
  name,
  cue,
  price,
  amount,
  unit,
  answers: [name, ...(spellings[name] ?? [])].map(normalize)
})));
const itemById = new Map(items.map(item => [item.id, item]));
const kitchenQuestions = material.questions
  .filter(question => question.mode === "Кухня")
  .map(question => ({...question, id: "kitchen/" + normalize(question.prompt)}));
const barQuestions = material.questions
  .filter(question => question.mode === "Бар")
  .map(question => ({...question, id: "bar/" + normalize(question.prompt)}));
const guestQuestions = material.questions
  .filter(question => question.mode === "Гость")
  .map(question => ({...question, id: "guest/" + normalize(question.prompt)}));
const definitions = material.definitions.map(question => ({
  ...question, id: "term/" + normalize(question.title)
}));
const recipes = items.filter(item => sections.get(item.section).area === "food" && material.kitchen[item.name]?.[0])
  .map(item => ({
    id: "recipe/" + item.id,
    prompt: "Расскажи повару, из чего состоит «" + item.name + "». Затем раскрой соус или заготовку, если они есть в записи.",
    answer: material.kitchen[item.name].filter(Boolean).join(" "),
    topic: item.name
  }));
const cocktails = items.filter(item => item.section.startsWith("cocktails") && material.bar[item.name]?.[0])
  .map(item => ({
    id: "drink/" + item.id,
    prompt: "Разбери «" + item.name + "» по карте Bourbon. Назови основу и остальные ингредиенты. Как опишешь напиток гостю одним предложением?",
    answer: material.bar[item.name].filter(Boolean).join(" "),
    topic: item.name
  }));
const levels = {
  details: {title: "Составы и термины"},
  guest: {title: "Разговор с гостем", bank: guestQuestions},
  kitchen: {title: "Сдача кухни", bank: [...kitchenQuestions, ...recipes], exam: true},
  bar: {title: "Сдача бара", bank: [...barQuestions, ...definitions, ...cocktails], exam: true}
};

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey));
    return {names: {}, practice: {}, exams: [], ...saved};
  } catch {
    return {names: {}, practice: {}, exams: []};
  }
}

const progress = readProgress();
let storageAvailable = true;
let sectionId = items.find(item => !progress.names[item.id]?.known)?.section ?? catalog[0].id;
let cardStart = 0;
let session = null;
let catalogFilter = "";
let catalogSection = "";
let practiceMode = "details";
let practiceArea = "food";

function saveProgress() {
  try {
    localStorage.setItem(progressKey, JSON.stringify(progress));
  } catch {
    storageAvailable = false;
  }
}

function nameStatus(item) {
  return progress.names[item.id]?.last ?? "new";
}

function stats() {
  return {
    known: items.filter(item => progress.names[item.id]?.known).length,
    again: items.filter(item => ["help", "again"].includes(nameStatus(item))).length,
    seen: items.filter(item => nameStatus(item) !== "new").length
  };
}

function markName(item, status) {
  const previous = progress.names[item.id];
  progress.names[item.id] = {known: status === "known" || !!previous?.known, last: status};
}

function shuffle(list) {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function preferredNames(source) {
  const needsReview = source.filter(item => ["again", "help"].includes(nameStatus(item)));
  const unseen = source.filter(item => nameStatus(item) === "new");
  const practiced = source.filter(item => nameStatus(item) === "known");
  return [...shuffle(needsReview), ...shuffle(unseen), ...shuffle(practiced)];
}

function practiceOrder(bank) {
  const priority = {again: 0, partial: 1, new: 2, full: 3};
  return shuffle(bank).sort((first, second) =>
    priority[progress.practice[first.id] ?? "new"] - priority[progress.practice[second.id] ?? "new"]);
}

function button(label, action, style = "") {
  return `<button class="button ${style}" type="button" data-action="${action}">${label}</button>`;
}

function link(label, route, style = "") {
  return `<a class="button ${style}" href="#${route}">${label}</a>`;
}

function navigate(route) {
  if (location.hash === "#" + route) render();
  else location.hash = route;
}

function route() {
  return location.hash.slice(1) || "home";
}

function showHome() {
  const count = stats();
  const tasks = [
    ["Составы и термины", "Разбери блюда, заготовки и напитки по меню Bourbon.", "details"],
    ["Разговор с гостем", "Предложи позицию и объясни свой выбор своими словами.", "guest"],
    ["Сдача кухни", "Устная тренировка по ТТК и подаче. Ответы открываются в конце.", "kitchen"],
    ["Сдача бара", "Устная тренировка по коктейлям и напиткам. Ответы открываются в конце.", "bar"]
  ];
  app.innerHTML = `<section class="hero">
    <div><p class="eyebrow">Тренажёр меню</p><h1>Выучи названия</h1>
      <p>Начни с одного раздела. Прочитай названия, затем вспомни их без вариантов ответа.</p>
      ${link(count.seen ? "Продолжить с названиями" : "Начать с названий", "names", "light")}
    </div>
    <div class="hero-progress"><strong>${count.known} из ${items.length}</strong>
      <progress value="${count.known}" max="${items.length}" aria-label="Названия, вспомненные самостоятельно"></progress>
      <p>Вспомнила самостоятельно</p>
    </div>
  </section>
  <section><h2>После названий</h2><div class="grid">
    ${tasks.map(([title, text, to]) => `<button class="card" type="button" data-action="route" data-to="${to}"><h3>${title}</h3><p class="muted">${text}</p></button>`).join("")}
  </div></section>`;
}

function sectionOptions(current, includeAll = false) {
  return (includeAll ? '<option value="">Всё меню</option>' : "") +
    [["food", "Кухня"], ["bar", "Бар и акции"]].map(([area, name]) =>
      `<optgroup label="${name}">${catalog.filter(section => section.area === area).map(section =>
        `<option value="${section.id}" ${section.id === current ? "selected" : ""}>${escapeHtml(section.title)}</option>`
      ).join("")}</optgroup>`
    ).join("");
}

function sectionItems(id) {
  return items.filter(item => item.section === id);
}

function showNames() {
  const group = sections.get(sectionId);
  const source = sectionItems(sectionId);
  const current = source.slice(cardStart, cardStart + 5);
  const known = source.filter(item => progress.names[item.id]?.known).length;
  app.innerHTML = `<div class="narrow">
    <h1>Названия</h1>
    <p class="muted">Сначала прочитай названия. Когда будешь готова, проверь, что вспомнишь сама.</p>
    <label class="field">Раздел меню <select id="name-section">${sectionOptions(sectionId)}</select></label>
    <section class="panel">
      <p class="eyebrow">${known} из ${source.length} вспомнила сама</p>
      <h2>${escapeHtml(group.title)}</h2>
      <ul class="item-list">${current.map(item => `<li><strong>${escapeHtml(item.name)}</strong>${item.cue ? `<span class="muted">${escapeHtml(item.cue)}</span>` : ""}</li>`).join("")}</ul>
      ${source.length > 5 ? `<div class="toolbar"><span class="muted small">${cardStart + 1}–${cardStart + current.length} из ${source.length}</span>
        ${cardStart ? button("Предыдущие названия", "previous-cards", "light") : ""}
        ${cardStart + current.length < source.length ? button("Следующие названия", "next-cards", "light") : ""}</div>` : ""}
    </section>
    <section aria-label="Проверка названий">
      <div class="toolbar">${button("Вспомнить по подсказке", "name-quiz")}
        ${button("Назвать весь раздел", "list-quiz")}
        ${button("Назвать раздел по позиции", "section-quiz", "light")}</div>
      <div class="toolbar">${button("Смешать всё меню", "mixed-quiz", "light")}
        ${stats().again ? button("Повторить сложные названия", "weak-quiz", "light") : ""}</div>
    </section></div>`;
}

function titleFor(kind) {
  return {name: "Названия по памяти", list: "Весь раздел по памяти", section: "Ориентирование в меню"}[kind] ??
    levels[kind]?.title ?? "Составы и термины";
}

function nameQuestion(item) {
  const cue = item.cue
    ? item.cue + ". Как эта позиция называется в меню?"
    : "Восстанови название по начальным буквам каждого слова.";
  return {id: item.id, item, prompt: cue, masked: item.cue ? "" : mask(item.name, 1)};
}

function mask(name, length) {
  return name.replace(/\p{L}{2,}/gu, word => word.slice(0, length) + "·".repeat(Math.max(0, word.length - length)));
}

function startNames(kind, source) {
  const order = preferredNames(source).slice(0, 10);
  let questions = order.map(nameQuestion);
  if (kind === "list") {
    questions = [{id: "list/" + sectionId, items: source, prompt: "Назови все позиции раздела «" + sections.get(sectionId).title + "»."}];
  }
  if (kind === "section") {
    questions = order.map(item => ({id: item.id, item, prompt: "В каком разделе меню искать «" +
      item.name + "»?", answer: sections.get(item.section).title}));
  }
  startSession(kind, questions);
}

function startSession(kind, questions) {
  if (!questions.length) return;
  session = {kind, index: 0, questions, results: [], repeated: new Set(), result: null, hint: false, finished: false};
  navigate("session");
}

function showPractice(mode) {
  practiceMode = mode;
  const level = levels[mode];
  const texts = {
    details: "Выбери кухню или бар. Вспомни свой ответ и сверь его с разбором.",
    guest: "Ответь как на смене. Назови позицию и объясни гостю, почему она подходит.",
    kitchen: "Шесть устных или письменных вопросов. После последнего откроются ответы для самопроверки.",
    bar: "Шесть устных или письменных вопросов. После последнего откроются ответы для самопроверки."
  };
  app.innerHTML = `<div class="panel narrow">
    <h1>${level.title}</h1><p class="muted">${texts[mode]}</p>
    ${level.exam ? '<p>Результат показывает пробную сдачу и темы для повторения.</p>' : ""}
    ${mode === "details" ? `<label class="field">Что учим<select id="practice-area">
      <option value="food" ${practiceArea === "food" ? "selected" : ""}>Кухня</option>
      <option value="bar" ${practiceArea === "bar" ? "selected" : ""}>Бар</option>
    </select></label>` : ""}
    <div class="toolbar">${button(level.exam ? "Начать пробную сдачу" : "Начать тренировку", "practice-start")}</div>
    </div>`;
}

function pickExam(bank, mode) {
  const constraints = mode === "kitchen" ? [
    kitchenQuestions.filter(question => /что такое/i.test(question.prompt)),
    kitchenQuestions.filter(question => /сравни|отлич/i.test(question.prompt)),
    guestQuestions.filter(question => /креветк|салат|цезар|антипасти|суп/i.test(question.prompt)),
    recipes
  ] : [
    definitions.filter(question => /как объяснишь гостю|что означает/i.test(question.prompt)),
    definitions.filter(question => /разница/i.test(question.prompt)),
    guestQuestions.filter(question => /имбир|напитк|коктейл|джин|белое вино/i.test(question.prompt)),
    cocktails
  ];
  const chosen = new Set();
  for (const pool of [...constraints, bank, bank]) {
    const next = practiceOrder(pool).find(question => !chosen.has(question));
    if (next) chosen.add(next);
    if (chosen.size >= 6) break;
  }
  return shuffle(chosen);
}

function startPractice() {
  const level = levels[practiceMode];
  const bank = practiceMode === "details"
    ? (practiceArea === "food" ? [...recipes, ...kitchenQuestions] : [...cocktails, ...definitions, ...barQuestions]) : level.bank;
  startSession(practiceMode, level.exam ? pickExam(bank, practiceMode) : practiceOrder(bank).slice(0, 6));
}

function focusAfterRender() {
  document.querySelector("#question-answer")?.focus({preventScroll: true});
}

function answerArea(multiline, list) {
  const placeholder = list ? "Каждое название с новой строки" : "Твой ответ";
  return `<label class="field" for="question-answer">${placeholder}
  ${multiline
    ? '<textarea id="question-answer" name="answer" placeholder="' + placeholder + '"></textarea>'
    : '<input id="question-answer" name="answer" type="text" autocomplete="off" autocapitalize="sentences">'}
  </label>`;
}

function questionPanel() {
  if (!session) return showHome();
  if (session.finished) return showResults();
  const {kind, questions, index, result} = session;
  const question = questions[index];
  const isNames = ["name", "list", "section"].includes(kind);
  const isExam = !!levels[kind]?.exam;
  const progressLabel = "Задание " + (index + 1) + " из " + questions.length;
  const actionLabel = isNames ? "Проверить" : isExam ? "Записать ответ" : "Сверить ответ";
  app.innerHTML = `<div class="narrow">
    <p class="eyebrow">${escapeHtml(titleFor(kind))}</p>
    <section class="panel">
      <p class="muted small">${progressLabel}</p>
      <progress value="${index + Number(!!result)}" max="${questions.length}" aria-label="${progressLabel}"></progress>
      <h1 class="question">${escapeHtml(question.prompt)}</h1>
      ${question.masked ? `<p class="hint">${escapeHtml(question.masked)}</p>` : ""}
      ${result && !result.selfCheck ? nameFeedback(result) : ""}
      ${result?.selfCheck ? practiceFeedback(question, result.typed) : ""}
      ${!result ? `<form id="answer-form">${answerArea(!isNames || kind === "list", kind === "list")}
        <div class="toolbar"><button class="button" type="submit">${actionLabel}</button>
          ${!isNames ? button("Ответила вслух", "oral", "light") : ""}
          ${isNames ? button("Пропустить", "skip", "light") : ""}
          ${kind === "name" && !session.hint ? button("Подсказка", "hint", "light") : ""}
        </div><p id="answer-error" class="muted small" role="status" hidden>Введи ответ или выбери «Пропустить».</p></form>
        ${session.hint ? `<p class="hint">${escapeHtml(mask(question.item.name, 2))}</p>` : ""}
      ` : ""}
    </section>
    <div class="toolbar">${link("К разделам", isNames ? "names" : kind, "light")}</div>
  </div>`;
}

function practiceFeedback(question, typed) {
  return `<div class="feedback" role="status"><h2>Сверь ответ</h2>
    ${typed ? `<p class="muted">Твой ответ: ${escapeHtml(typed)}</p>` : ""}
    <p>${escapeHtml(question.answer)}</p>
    ${question.url ? `<p><a href="${escapeHtml(question.url)}" target="_blank" rel="noopener">Источник определения</a></p>` : ""}
    </div>
    <div class="toolbar">${button("Вспомнила полностью", "rate-full")}
      ${button("Частично", "rate-partial", "light")}
      ${button("Нужно повторить", "rate-again", "light")}</div>`;
}

function nameFeedback(result) {
  return `<div class="feedback ${result.correct ? "good" : ""}" role="status">
      <p><strong>${escapeHtml(result.heading)}</strong></p>
      ${result.typed && !result.correct ? `<p>Твой ответ: ${escapeHtml(result.typed)}</p>` : ""}
      <p>${escapeHtml(result.answer)}</p>
    </div><div class="toolbar">${button(session.index + 1 === session.questions.length ? "Результат" : "Дальше", "next")}</div>`;
}

function scoreList(question, typed) {
  const tokens = typed.split(/[\r\n;]+/).map(token => token.trim()).filter(Boolean);
  const matches = new Set();
  const extra = [];
  for (const token of tokens) {
    const key = normalize(token);
    const item = question.items.find(entry => entry.answers.includes(key));
    if (item) matches.add(item);
    else extra.push(token);
  }
  const missing = question.items.filter(item => !matches.has(item));
  for (const item of question.items) markName(item, matches.has(item) ? "known" : "again");
  const messages = ["Вспомнила " + matches.size + " из " + question.items.length + "."];
  if (missing.length) messages.push("Повтори: " + missing.map(item => item.name).join("; ") + ".");
  if (extra.length) messages.push("Сверь написание: " + extra.join("; ") + ".");
  return {
    correct: missing.length === 0 && extra.length === 0,
    heading: messages[0], answer: messages.slice(1).join(" ") || "Все названия на месте.",
    missing: missing.map(item => item.name)
  };
}

function scoreName(question, typed) {
  const correct = question.item.answers.includes(normalize(typed));
  const helped = correct && session.hint;
  markName(question.item, helped ? "help" : correct ? "known" : "again");
  if ((!correct || helped) && !session.repeated.has(question.id) && session.questions.length > session.index + 2) {
    session.repeated.add(question.id);
    session.questions.splice(Math.min(session.index + 4, session.questions.length), 0, question);
  }
  const sameSection = sectionItems(question.item.section);
  const key = normalize(typed);
  const unclear = !correct && key.length > 2 && sameSection.filter(item => item.answers.some(answer => answer.startsWith(key))).length > 1;
  return {
    correct: correct && !helped,
    heading: helped ? "Вспомнила с подсказкой" : correct ? "Верно" : unclear ? "Этого названия недостаточно" : "Повтори название",
    answer: question.item.name
  };
}

function scoreSection(question, typed) {
  const answer = normalize(question.answer);
  const key = normalize(typed);
  const aliases = {андердог: ["бургеры", "underdog"], горячиеблюда: ["горячее"], римскаяпицца: ["пицца"]};
  const correct = key === answer || (aliases[answer] ?? []).includes(key);
  return {correct, heading: correct ? "Верно" : "Сверь раздел", answer: question.answer};
}

function submitAnswer(typed) {
  if (!session || session.result) return;
  const {kind, questions, index} = session;
  const question = questions[index];
  if (levels[kind]?.exam) {
    session.results.push({question, typed, rating: ""});
    return nextQuestion();
  }
  if (["name", "list", "section"].includes(kind)) {
    const scored = kind === "name" ? scoreName(question, typed) :
      kind === "list" ? scoreList(question, typed) : scoreSection(question, typed);
    session.result = {...scored, typed};
    session.results.push({...scored, title: question.item?.name ?? sections.get(sectionId).title});
    saveProgress();
  } else {
    session.result = {selfCheck: true, typed};
  }
  questionPanel();
  document.querySelector("section .feedback + .toolbar button")?.focus({preventScroll: true});
}

function nextQuestion() {
  session.index++;
  session.result = null;
  session.hint = false;
  session.finished = session.index >= session.questions.length;
  questionPanel();
  focusAfterRender();
}

function ratePractice(rating) {
  if (!session?.result?.selfCheck) return;
  const question = session.questions[session.index];
  progress.practice[question.id] = rating;
  session.results.push({...question, rating});
  saveProgress();
  nextQuestion();
}

function showResults() {
  const exam = levels[session.kind]?.exam;
  const isNames = ["name", "list", "section"].includes(session.kind);
  const count = stats();
  if (exam) {
    app.innerHTML = `<div class="panel narrow"><h1>Разбор сдачи</h1>
      <p class="muted">Открой эталон под каждым ответом и отметь, что нужно повторить.</p>
      <ul class="item-list">${session.results.map(({question, typed, rating}, index) =>
        `<li><details><summary>${escapeHtml(question.prompt)}</summary>
          <p class="muted">${typed ? "Твой ответ: " + escapeHtml(typed) : "Ответ вслух"}</p>
          <p>${escapeHtml(question.answer)}</p>
          ${question.url ? `<p><a href="${escapeHtml(question.url)}" target="_blank" rel="noopener">Источник определения</a></p>` : ""}
          <label class="field">Как ответила<select data-rate="${index}">
            <option value="">Выбери оценку</option>
            <option value="full" ${rating === "full" ? "selected" : ""}>Вспомнила полностью</option>
            <option value="partial" ${rating === "partial" ? "selected" : ""}>Частично</option>
            <option value="again" ${rating === "again" ? "selected" : ""}>Нужно повторить</option>
          </select></label></details></li>`).join("")}</ul>
      <p id="exam-count" class="muted" role="status">Оценила ${session.results.filter(result => result.rating).length} из ${session.results.length}</p>
      <div class="toolbar">${button("Сохранить результат", "save-exam")}${link("На главную", "home", "light")}</div>
      <p id="exam-status" role="status"></p></div>`;
    return;
  }
  const weak = session.results.filter(result => isNames ? !result.correct : result.rating !== "full");
  app.innerHTML = `<div class="panel narrow"><h1>Итог тренировки</h1>
    ${isNames ? `<p><strong>${count.known} из ${items.length}</strong> названий вспомнила самостоятельно.</p>` :
      `<p><strong>${session.results.length - weak.length} из ${session.results.length}</strong> ответов полностью.</p>`}
    <h2>${weak.length ? "Что повторить" : "Все задания выполнены"}</h2>
    ${weak.length ? `<ul class="item-list">${weak.map(result =>
      `<li><strong>${escapeHtml(result.title ?? result.topic ?? result.prompt)}</strong><span class="muted">${escapeHtml(result.answer)}</span></li>`
    ).join("")}</ul>` : ""}
    <div class="toolbar">${isNames && count.again ? button("Повторить сложные названия", "weak-quiz") : ""}
      ${!isNames && weak.length ? button("Повторить эти вопросы", "repeat-practice") : ""}
      ${link(isNames ? "К названиям" : "К режиму", isNames ? "names" : session.kind, "light")}
      ${link("Прогресс", "progress", "light")}</div></div>`;
}

function recordExam() {
  const status = document.querySelector("#exam-status");
  if (session.results.some(result => !result.rating)) {
    status.textContent = "Отметь оценку под каждым из шести ответов.";
    return;
  }
  if (!session.saved) {
    for (const result of session.results) progress.practice[result.question.id] = result.rating;
    progress.exams.unshift({
      mode: session.kind, completed: new Date().toISOString(),
      full: session.results.filter(result => result.rating === "full").length, total: session.results.length
    });
    progress.exams = progress.exams.slice(0, 12);
    saveProgress();
    session.saved = true;
    document.querySelectorAll("[data-rate]").forEach(select => { select.disabled = true; });
  }
  status.textContent = storageAvailable ? "Результат сохранён в прогрессе." : "Браузер не разрешил сохранить результат.";
}

function photoTiles() {
  return photos.map(([file, name], index) => `<button type="button" data-action="photo" data-index="${index}">
    <img src="assets/menu/${file}" alt="" loading="lazy"><span>${escapeHtml(name)}</span></button>`).join("");
}

function showMenu() {
  app.innerHTML = `<h1>Меню Bourbon</h1>
  <section><h2>Фото меню</h2><div class="photos">${photoTiles()}</div></section>
  <section class="panel"><h2>Справочник</h2>
    <div class="filters">
      <label class="field">Название<input id="menu-search" type="search" autocomplete="off" value="${escapeHtml(catalogFilter)}"></label>
      <label class="field">Раздел<select id="menu-section">${sectionOptions(catalogSection, true)}</select></label>
    </div><div id="menu-results"></div>
  </section>`;
  renderCatalog();
}

function orderInformation(item) {
  if (!item.amount && !item.price) return "";
  const amounts = item.amount?.split("/") ?? [];
  const prices = item.price?.split("/") ?? [];
  if (amounts.length > 1 && amounts.length === prices.length) {
    return amounts.map((amount, index) => amount + " " + item.unit + " — " + prices[index] + " ₽").join(" · ");
  }
  return [
    item.amount && item.amount + " " + item.unit,
    item.price && item.price + " ₽"
  ].filter(Boolean).join(" · ");
}

function renderCatalog() {
  const query = normalize(catalogFilter);
  const filtered = items.filter(item => (!catalogSection || catalogSection === item.section) &&
    (!query || item.answers.some(answer => answer.includes(query))));
  document.querySelector("#menu-results").innerHTML = filtered.length
    ? `<p class="muted small" role="status">Позиций: ${filtered.length}</p><ul class="item-list">
      ${filtered.map(item => {
        const fields = material.kitchen[item.name] ?? material.bar[item.name];
        const order = orderInformation(item);
        return `<li><details><summary>${escapeHtml(item.name)}</summary>
          <p class="muted small">${escapeHtml([sections.get(item.section).title, order].filter(Boolean).join(" · "))}</p>
          ${(fields ?? [item.cue || "Название из фото меню."]).filter(Boolean).map(field => `<p>${escapeHtml(field)}</p>`).join("")}
          </details></li>`;
      }).join("")}</ul>`
    : '<p role="status">Совпадений нет. Проверь написание или выбери другой раздел.</p>';
}

function downloadProgress() {
  const blob = new Blob([JSON.stringify({version: 2, ...progress}, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "bourbon-progress.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importProgress(file) {
  const feedback = document.querySelector("#backup-status");
  if (!file || !feedback) return;
  try {
    const data = JSON.parse(await file.text());
    if (data?.version !== 2 || !data.names || !data.practice || !Array.isArray(data.exams)) {
      throw new Error("unknown format");
    }
    for (const item of items) {
      const entry = data.names[item.id];
      if (!entry || typeof entry.known !== "boolean" || !["known", "help", "again"].includes(entry.last)) continue;
      const existing = progress.names[item.id];
      if (!existing) progress.names[item.id] = entry;
      else if (entry.known) existing.known = true;
    }
    for (const question of [...kitchenQuestions, ...barQuestions, ...guestQuestions, ...definitions, ...recipes, ...cocktails]) {
      if (["full", "partial", "again"].includes(data.practice[question.id]) && !progress.practice[question.id]) {
        progress.practice[question.id] = data.practice[question.id];
      }
    }
    const exams = data.exams.filter(exam => exam && ["kitchen", "bar"].includes(exam.mode) &&
      typeof exam.completed === "string" && Number.isFinite(Date.parse(exam.completed)) &&
      Number.isInteger(exam.full) && exam.full >= 0 && exam.total === 6 && exam.full <= exam.total);
    const merged = new Map([...exams, ...progress.exams].map(exam => [exam.mode + exam.completed, exam]));
    progress.exams = [...merged.values()].sort((first, second) => Date.parse(second.completed) - Date.parse(first.completed)).slice(0, 12);
    saveProgress();
    showProgress();
    document.querySelector("#backup-status").textContent = storageAvailable ? "Прогресс добавлен." : "Браузер не разрешил сохранить прогресс.";
  } catch {
    feedback.textContent = "Выбери файл прогресса, экспортированный из этой версии тренажёра.";
  }
}

function showProgress() {
  const count = stats();
  const statusNames = {new: "Ещё не проверяла", known: "Вспомнила сама", help: "Вспомнила с подсказкой", again: "Нужно повторить"};
  const openItems = storageAvailable ? "" : '<p role="status">Браузер не разрешил сохранить прогресс между занятиями.</p>';
  app.innerHTML = `<h1>Прогресс</h1>${openItems}
    <section><h2>Названия</h2><div class="grid">
      <div class="card"><strong class="stat">${count.known}/${items.length}</strong>Вспомнила самостоятельно</div>
      <div class="card"><strong class="stat">${items.length - count.seen}</strong>Ещё не проверяла</div>
      <div class="card"><strong class="stat">${count.again}</strong>Нужно повторить</div>
    </div><div class="toolbar">${count.again ? button("Повторить сложные названия", "weak-quiz") : ""}
      ${link("К названиям", "names", "light")}</div>
    <section class="panel"><h2>По разделам</h2><ul class="item-list">
    ${catalog.map(section => {
      const group = sectionItems(section.id);
      const known = group.filter(item => progress.names[item.id]?.known).length;
      return `<li><details><summary>${escapeHtml(section.title)} · ${known}/${group.length}</summary>
        <ul>${group.map(item => `<li>${escapeHtml(item.name)} <span class="muted">— ${statusNames[nameStatus(item)]}</span></li>`).join("")}</ul>
      </details></li>`;
    }).join("")}</ul></section></section>
    <section class="panel"><h2>Пробные сдачи</h2>
      ${progress.exams.length ? `<ul class="item-list">${progress.exams.map(exam =>
        `<li><strong>${escapeHtml(levels[exam.mode]?.title)}</strong><span class="muted">
        ${escapeHtml(new Date(exam.completed).toLocaleDateString("ru-RU"))} · ${exam.full} из ${exam.total} полностью</span></li>`
      ).join("")}</ul>` : '<p class="muted">Здесь появятся результаты сдачи кухни и бара.</p>'}</section>
    <div class="toolbar">${button("Экспорт прогресса", "export", "light")}${button("Импорт прогресса", "import", "light")}</div>
    <input type="file" id="progress-file" accept=".json,application/json" hidden><p id="backup-status" role="status"></p>`;
}

function render() {
  const page = route();
  document.querySelectorAll("nav a").forEach(anchor => {
    const active = anchor.hash === "#" + page || (anchor.hash === "#home" && !["menu", "progress"].includes(page));
    if (active) anchor.setAttribute("aria-current", "page");
    else anchor.removeAttribute("aria-current");
  });
  if (page === "names") showNames();
  else if (page === "menu") showMenu();
  else if (page === "progress") showProgress();
  else if (page === "session") questionPanel();
  else if (page in levels) showPractice(page);
  else showHome();
  window.scrollTo(0, 0);
  app.focus({preventScroll: true});
}

const actions = {
  route: element => navigate(element.dataset.to),
  "previous-cards": () => { cardStart = Math.max(0, cardStart - 5); showNames(); },
  "next-cards": () => { cardStart += 5; showNames(); },
  "name-quiz": () => startNames("name", sectionItems(sectionId)),
  "list-quiz": () => startNames("list", sectionItems(sectionId)),
  "section-quiz": () => startNames("section", items),
  "mixed-quiz": () => startNames("name", items),
  "weak-quiz": () => startNames("name", items.filter(item => ["help", "again"].includes(nameStatus(item)))),
  "practice-start": startPractice,
  "save-exam": recordExam,
  export: downloadProgress,
  import: () => document.querySelector("#progress-file").click(),
  "repeat-practice": () => startSession(session.kind, session.results.filter(result => result.rating !== "full")),
  skip: () => submitAnswer(""),
  oral: () => submitAnswer(""),
  hint: () => {
    const typed = document.querySelector("#question-answer").value;
    session.hint = true;
    questionPanel();
    document.querySelector("#question-answer").value = typed;
    focusAfterRender();
  },
  next: nextQuestion,
  "rate-full": () => ratePractice("full"),
  "rate-partial": () => ratePractice("partial"),
  "rate-again": () => ratePractice("again"),
  photo: element => {
    const [file, name] = photos[Number(element.dataset.index)];
    const photo = document.querySelector("#full-photo");
    photo.src = "assets/menu/" + file;
    photo.alt = name;
    document.querySelector("#photo-dialog").showModal();
  }
};

app.addEventListener("click", event => {
  const control = event.target.closest("button[data-action]");
  if (control) actions[control.dataset.action]?.(control);
});
app.addEventListener("submit", event => {
  if (event.target.id !== "answer-form") return;
  event.preventDefault();
  const field = document.querySelector("#question-answer");
  if (field.value.trim()) submitAnswer(field.value.trim());
  else {
    document.querySelector("#answer-error").hidden = false;
    field.focus();
  }
});
app.addEventListener("input", event => {
  if (event.target.id === "menu-search") {
    catalogFilter = event.target.value;
    renderCatalog();
  }
});
app.addEventListener("change", event => {
  const field = event.target;
  if (field.id === "name-section") {
    sectionId = field.value;
    cardStart = 0;
    showNames();
    document.querySelector("#name-section")?.focus({preventScroll: true});
  } else if (field.id === "menu-section") {
    catalogSection = field.value;
    renderCatalog();
  } else if (field.id === "progress-file") {
    importProgress(field.files[0]);
  } else if (field.id === "practice-area") {
    practiceArea = field.value;
  } else if (field.hasAttribute("data-rate")) {
    session.results[Number(field.dataset.rate)].rating = field.value;
    document.querySelector("#exam-count").textContent =
      "Оценила " + session.results.filter(result => result.rating).length + " из " + session.results.length;
  }
});

window.addEventListener("hashchange", render);
render();
