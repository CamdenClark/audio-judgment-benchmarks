"use strict";

(() => {
  const list = document.getElementById("examples");
  const template = document.getElementById("example-template");
  const status = document.getElementById("load-status");
  const errorBox = document.getElementById("load-error");
  const retry = document.getElementById("retry-data");
  const filterButtons = [...document.querySelectorAll("[data-filter]")];
  const filterLabels = { all: "All", matches: "Matches", mistakes: "Mistakes" };
  let dataset = null;
  let activeFilter = "all";
  let loading = false;

  const isJudged = ({ judgment }) => judgment !== null && typeof judgment === "object" &&
    typeof judgment.isCorrect === "boolean" && Number.isFinite(judgment.probabilityCorrect) &&
    judgment.probabilityCorrect >= 0 && judgment.probabilityCorrect <= 1;
  const grade = (correct) => correct ? "Correct" : "Incorrect";
  const isMatch = (example) => isJudged(example) && example.judgment.isCorrect === example.expectedCorrect;
  const matchesFilter = (example) => activeFilter === "all" ||
    (activeFilter === "matches" && isMatch(example)) ||
    (activeFilter === "mistakes" && isJudged(example) && !isMatch(example));

  function validateDataset(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.examples) ||
      !Number.isFinite(data.threshold) || data.threshold < 0 || data.threshold > 1) {
      throw new Error("The examples file has an unsupported format.");
    }
    for (const example of data.examples) {
      if (!example || ["id", "prompt", "expectedText", "spokenText"].some((key) => typeof example[key] !== "string") ||
        typeof example.expectedCorrect !== "boolean" || !example.audio || typeof example.audio.src !== "string" ||
        (example.judgment !== null && !isJudged(example))) {
        throw new Error("An example has incomplete audio or judgment data.");
      }
    }
    return data;
  }

  function localAudioUrl(src) {
    try {
      const url = new URL(src, window.location.href);
      return url.origin === window.location.origin && url.pathname.startsWith("/audio/") ? url.href : null;
    } catch {
      return null;
    }
  }

  function makeExample(example, index) {
    const item = template.content.firstElementChild.cloneNode(true);
    item.id = `example-${example.id}`;
    item.value = index + 1;
    const prompt = item.querySelector(".prompt");
    prompt.id = `${item.id}-prompt`;
    prompt.textContent = example.prompt;
    item.setAttribute("aria-labelledby", prompt.id);
    item.querySelector(".expected-text").textContent = example.expectedText;
    item.querySelector(".spoken-text").textContent = example.spokenText;
    for (const side of ["expected", "spoken"]) {
      const translation = example[`${side}Translation`];
      item.querySelector(`.${side}-translation`).textContent = translation ? `(${translation})` : "";
    }
    const judged = isJudged(example);
    const matched = isMatch(example);
    const badge = item.querySelector(".result-badge");
    badge.textContent = judged ? (matched ? "Matched expected" : "Model mistake") : "Not judged";
    item.classList.toggle("model-mistake", judged && !matched);
    badge.classList.toggle("mistake", judged && !matched);
    item.querySelector(".expected-grade").textContent = grade(example.expectedCorrect);
    item.querySelector(".judged-grade").textContent = judged ? grade(example.judgment.isCorrect) : "Not yet judged";
    item.querySelector(".probability").textContent = judged ? String(example.judgment.probabilityCorrect) : "—";

    const audio = item.querySelector("audio");
    const audioError = item.querySelector(".audio-error");
    const retryAudio = item.querySelector(".retry-audio");
    const audioFile = item.querySelector(".audio-file");
    const url = localAudioUrl(example.audio.src);
    audio.setAttribute("aria-label", `Recording: ${example.spokenText}`);
    audio.textContent = "Your browser does not support audio playback.";
    if (url) {
      audio.src = url;
      audioFile.href = url;
    } else {
      audioError.hidden = false;
      retryAudio.hidden = true;
      audioFile.hidden = true;
    }
    audio.addEventListener("error", () => { audioError.hidden = false; });
    audio.addEventListener("canplay", () => { audioError.hidden = true; });
    retryAudio.addEventListener("click", () => {
      audioError.hidden = true;
      audio.load();
    });
    return item;
  }

  function renderExamples() {
    list.querySelectorAll("audio").forEach((audio) => audio.pause());
    const counts = { all: dataset.examples.length, matches: 0, mistakes: 0 };
    const fragment = document.createDocumentFragment();
    let shown = 0;
    dataset.examples.forEach((example, index) => {
      if (isJudged(example)) counts[isMatch(example) ? "matches" : "mistakes"]++;
      if (matchesFilter(example)) {
        fragment.append(makeExample(example, index));
        shown++;
      }
    });
    list.replaceChildren(fragment);
    filterButtons.forEach((button) => {
      button.textContent = `${filterLabels[button.dataset.filter]} (${counts[button.dataset.filter]})`;
      button.setAttribute("aria-pressed", String(button.dataset.filter === activeFilter));
    });
    status.hidden = shown > 0;
    status.textContent = !dataset.examples.length ? "No examples available." :
      activeFilter === "mistakes" ? "No model mistakes in these examples." : "No matching judgments in these examples.";
  }

  function scrollToExample() {
    if (!dataset) return;
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); }
    catch { return; }
    if (!id.startsWith("example-")) return;
    const example = dataset.examples.find((entry) => `example-${entry.id}` === id);
    if (!example) return;
    if (!matchesFilter(example)) {
      activeFilter = "all";
      renderExamples();
    }
    const target = document.getElementById(id);
    if (!target?.classList.contains("example")) return;
    target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
  }

  async function loadExamples() {
    if (loading) return;
    loading = true;
    dataset = null;
    list.querySelectorAll("audio").forEach((audio) => audio.pause());
    list.replaceChildren();
    status.textContent = "Loading examples…";
    status.hidden = false;
    errorBox.hidden = true;
    retry.disabled = true;
    filterButtons.forEach((button) => { button.disabled = true; });
    try {
      const response = await fetch("/data/examples.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`Could not load the examples (HTTP ${response.status}).`);
      dataset = validateDataset(await response.json());
      renderExamples();
      scrollToExample();
    } catch (error) {
      dataset = null;
      status.hidden = true;
      errorBox.hidden = false;
      document.getElementById("load-error-message").textContent = error instanceof SyntaxError ?
        "The examples file is not valid JSON." : error instanceof Error ? error.message : "Could not load the examples.";
    } finally {
      loading = false;
      retry.disabled = false;
      filterButtons.forEach((button) => { button.disabled = !dataset; });
    }
  }

  filterButtons.forEach((button) => button.addEventListener("click", () => {
    if (!dataset || button.dataset.filter === activeFilter) return;
    activeFilter = button.dataset.filter;
    renderExamples();
  }));

  list.addEventListener("play", (event) => {
    if (!(event.target instanceof HTMLAudioElement)) return;
    list.querySelectorAll("audio").forEach((audio) => { if (audio !== event.target) audio.pause(); });
  }, true);
  window.addEventListener("hashchange", scrollToExample);
  retry.addEventListener("click", loadExamples);
  loadExamples();
})();
