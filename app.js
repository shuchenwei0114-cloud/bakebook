let allRecipes = [];
let categories = [];
let activeCategory = "全部";
let selectedRecipe = null;
let editingId = null;

const byId = id => document.getElementById(id);
const categoryTabs = byId("categoryTabs");
const recipeGrid = byId("recipeGrid");
const searchInput = byId("searchInput");
const sectionTitle = byId("sectionTitle");
const recipeCount = byId("recipeCount");
const recipeDialog = byId("recipeDialog");
const editorDialog = byId("editorDialog");
const categoryDialog = byId("categoryDialog");
const messageDialog = byId("messageDialog");

async function loadData() {
  const [categoriesRes, recipesRes] = await Promise.all([
    fetch("data/categories.json?v=6", { cache: "no-store" }),
    fetch("data/recipes.json?v=6", { cache: "no-store" })
  ]);
  categories = await categoriesRes.json();
  allRecipes = (await recipesRes.json()).map(normalizeRecipe);
  renderAll();
}

function normalizeRecipe(recipe) {
  let steps = recipe.steps || [];
  if (steps.length && typeof steps[0] === "string") steps = steps.map(text => ({ text, minutes: 0 }));
  return { id: recipe.id, name: recipe.name || "未命名食谱", category: recipe.category || "其他", ingredients: recipe.ingredients || [], steps, notes: recipe.notes || "" };
}
function totalMinutes(recipe) { return (recipe.steps || []).reduce((sum, step) => sum + (Number(step.minutes) || 0), 0); }
function renderAll() { renderCategories(); renderRecipes(); renderCategoryManager(); populateCategorySelect(); }

function renderCategories() {
  categoryTabs.innerHTML = "";
  categories.forEach(category => {
    const button = document.createElement("button");
    button.className = `category-tab${category === activeCategory ? " active" : ""}`;
    button.textContent = category;
    button.onclick = () => { activeCategory = category; renderCategories(); renderRecipes(); };
    categoryTabs.appendChild(button);
  });
  const add = document.createElement("button");
  add.className = "category-tab add-tab";
  add.textContent = "+";
  add.onclick = openCategoryManager;
  categoryTabs.appendChild(add);
}

function renderRecipes() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = allRecipes.filter(recipe => {
    const categoryMatch = activeCategory === "全部" || recipe.category === activeCategory;
    const text = [recipe.name, recipe.category, ...(recipe.ingredients || [])].join(" ").toLowerCase();
    return categoryMatch && text.includes(query);
  });
  sectionTitle.textContent = activeCategory === "全部" ? "全部食谱" : activeCategory;
  recipeCount.textContent = `${filtered.length} 个食谱`;
  recipeGrid.innerHTML = "";
  filtered.forEach(recipe => {
    const card = document.createElement("button");
    card.className = "recipe-card";
    card.innerHTML = `<div class="recipe-card-main"><h3>${escapeHtml(recipe.name)}</h3><div class="meta-row"><span class="pill">${escapeHtml(recipe.category)}</span><span class="pill">${totalMinutes(recipe)} 分钟</span></div></div><span class="chevron">›</span>`;
    card.onclick = () => openRecipe(recipe.id);
    recipeGrid.appendChild(card);
  });
  if (!filtered.length) recipeGrid.innerHTML = `<p class="muted">没有找到符合条件的食谱。</p>`;
}

function openRecipe(id) {
  selectedRecipe = allRecipes.find(r => r.id === id);
  if (!selectedRecipe) return;
  byId("detailCategory").textContent = selectedRecipe.category;
  byId("detailName").textContent = selectedRecipe.name;
  byId("detailMeta").innerHTML = `<span class="pill">总用时 ${totalMinutes(selectedRecipe)} 分钟</span>`;
  byId("detailIngredients").innerHTML = (selectedRecipe.ingredients || []).map(x => `<li>${escapeHtml(x)}</li>`).join("") || "<li>暂无配料</li>";
  byId("detailSteps").innerHTML = (selectedRecipe.steps || []).map((step, index) => `<div class="detail-step"><span class="step-number">${index + 1}</span><div><p>${escapeHtml(step.text || "")}</p><small>${Number(step.minutes) || 0} 分钟</small></div></div>`).join("") || "<p class='muted'>暂无步骤</p>";
  byId("detailNotes").textContent = selectedRecipe.notes || "暂无备注";
  recipeDialog.showModal();
}

function openEditor(recipe = null) {
  editingId = recipe?.id || null;
  byId("editorTitle").textContent = recipe ? "编辑食谱" : "新增食谱";
  byId("importSection").classList.toggle("hidden", Boolean(recipe));
  populateCategorySelect(recipe?.category);
  byId("recipeName").value = recipe?.name || "";
  byId("recipeIngredients").value = (recipe?.ingredients || []).join("\n");
  byId("recipeNotes").value = recipe?.notes || "";
  byId("deleteRecipe").classList.toggle("hidden", !recipe);
  renderStepsEditor(recipe?.steps?.length ? recipe.steps : [{ text: "", minutes: 0 }]);
  resetOcrUi();
  editorDialog.showModal();
}

function renderStepsEditor(steps) {
  const container = byId("stepsEditor");
  container.innerHTML = "";
  steps.forEach((step, index) => addStepRow(step.text || "", Number(step.minutes) || 0, index));
  updateStepNumbersAndTotal();
}
function addStepRow(text = "", minutes = 0, index = null) {
  const row = document.createElement("div");
  row.className = "step-row";
  row.innerHTML = `<span class="step-index">${index !== null ? index + 1 : ""}</span><textarea class="step-text" rows="2" placeholder="写这一步要做什么…">${escapeHtml(text)}</textarea><div class="step-time"><input class="step-minutes" type="number" min="0" inputmode="numeric" value="${minutes}" /><span>分钟</span></div><button type="button" class="remove-step" aria-label="删除这一步">×</button>`;
  row.querySelector(".step-minutes").addEventListener("input", updateStepNumbersAndTotal);
  row.querySelector(".remove-step").onclick = () => { row.remove(); updateStepNumbersAndTotal(); };
  byId("stepsEditor").appendChild(row);
}
function updateStepNumbersAndTotal() {
  const rows = [...document.querySelectorAll(".step-row")];
  let total = 0;
  rows.forEach((row, index) => { row.querySelector(".step-index").textContent = index + 1; total += Number(row.querySelector(".step-minutes").value) || 0; });
  byId("totalTime").textContent = total;
}
function collectSteps() {
  return [...document.querySelectorAll(".step-row")].map(row => ({ text: row.querySelector(".step-text").value.trim(), minutes: Number(row.querySelector(".step-minutes").value) || 0 })).filter(step => step.text || step.minutes);
}

function populateCategorySelect(selected = null) {
  const select = byId("recipeCategory");
  if (!select) return;
  select.innerHTML = categories.filter(c => c !== "全部").map(c => `<option ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
}
function formToRecipe() {
  return { id: editingId || slugify(byId("recipeName").value) + "-" + Date.now().toString().slice(-5), name: byId("recipeName").value.trim(), category: byId("recipeCategory").value, ingredients: lines(byId("recipeIngredients").value), steps: collectSteps(), notes: byId("recipeNotes").value.trim() };
}

function renderCategoryManager() {
  const container = byId("categoryManager");
  container.innerHTML = categories.filter(c => c !== "全部").map((c, index) => `<div class="category-row" data-index="${index + 1}"><span>☰</span><input value="${escapeAttr(c)}" aria-label="分类名称"/><button class="mini-delete">删除</button></div>`).join("");
  container.querySelectorAll(".category-row").forEach(row => {
    const input = row.querySelector("input");
    input.onchange = () => { const idx = Number(row.dataset.index); const old = categories[idx]; const next = input.value.trim(); if (!next || next === old) return; categories[idx] = next; allRecipes.forEach(r => { if (r.category === old) r.category = next; }); renderAll(); showMessage("已在页面中更新", "接入云端写入后，这项修改会同步保存到 GitHub。" ); };
    row.querySelector(".mini-delete").onclick = () => { const idx = Number(row.dataset.index); const name = categories[idx]; if (allRecipes.some(r => r.category === name)) return showMessage("暂时不能删除", "这个分类下还有食谱，请先把食谱改到其他分类。" ); categories.splice(idx, 1); renderAll(); };
  });
}

function resetOcrUi() {
  byId("imageFileName").textContent = "";
  byId("recipeImageInput").value = "";
  byId("ocrRawText").value = "";
  byId("ocrStatus").textContent = "";
  byId("ocrStatus").classList.add("hidden");
  byId("ocrResultWrap").classList.add("hidden");
  byId("ocrProgress").classList.add("hidden");
  byId("ocrProgressBar").style.width = "0%";
  byId("recognizeImage").disabled = false;
  byId("recognizeImage").textContent = "开始本地 OCR";
}

async function runLocalOcr(file) {
  if (!window.Tesseract) throw new Error("OCR library not loaded");
  const button = byId("recognizeImage");
  const status = byId("ocrStatus");
  const progressWrap = byId("ocrProgress");
  const progressBar = byId("ocrProgressBar");
  button.disabled = true;
  button.textContent = "正在识别…";
  status.classList.remove("hidden");
  progressWrap.classList.remove("hidden");
  status.textContent = "正在准备中文 OCR…首次使用可能需要稍等。";
  progressBar.style.width = "3%";
  try {
    const result = await Tesseract.recognize(file, "chi_sim+eng", {
      logger: m => {
        const pct = Math.round((m.progress || 0) * 100);
        if (m.progress) progressBar.style.width = `${Math.max(3, pct)}%`;
        const labels = { "loading tesseract core": "加载识别引擎", "initializing tesseract": "初始化", "loading language traineddata": "加载中文识别资料", "initializing api": "准备识别", "recognizing text": "正在识别文字" };
        status.textContent = `${labels[m.status] || "处理中"}${pct ? ` · ${pct}%` : ""}`;
      }
    });
    const text = (result.data.text || "").trim();
    byId("ocrRawText").value = text;
    byId("ocrResultWrap").classList.remove("hidden");
    progressBar.style.width = "100%";
    status.textContent = text ? "识别完成。请先检查下面的文字，再整理到表单。" : "没有识别到文字，请换一张更清晰的截图。";
  } finally {
    button.disabled = false;
    button.textContent = "重新识别";
  }
}

function organizeOcrText(raw) {
  const rows = raw.split(/\r?\n/).map(s => s.replace(/^[•·▪◦\-–—]+\s*/, "").trim()).filter(Boolean);
  const ingredientUnit = /(\d|半|少许|适量).*(g|kg|克|千克|ml|毫升|l|升|个|颗|枚|勺|匙|杯|片|包|根|全部)|\b\d+(?:\.\d+)?\s*(g|kg|ml|l)\b/i;
  const stepLead = /^(第?\s*\d+\s*[步.、)）:]|\d+\s*[.、)）])/;
  const stepVerb = /(搅拌|混合|揉|发酵|松弛|烘烤|烤|蒸|煮|加入|倒入|整形|擀|折叠|冷藏|静置|预热)/;
  const minutePattern = /(\d+)\s*(?:分钟|min(?:ute)?s?)/i;
  const ingredients = [];
  const steps = [];
  const leftovers = [];

  rows.forEach(line => {
    if (/^(配料|材料|食材|ingredients?|制作步骤|步骤|做法|method)$/i.test(line.replace(/[:：]/g, ""))) return;
    const min = line.match(minutePattern);
    if (stepLead.test(line) || (stepVerb.test(line) && min)) {
      const minutes = min ? Number(min[1]) : 0;
      const text = line.replace(stepLead, "").replace(minutePattern, "").replace(/^[：:\s]+|[，,。；;\s]+$/g, "").trim();
      if (text) steps.push({ text, minutes });
    } else if (ingredientUnit.test(line) || /^(盐|糖|酵母|黄油|牛奶|鸡蛋|面粉|高粉|低粉|糯米粉|淡奶油|奶油奶酪|汤种)/.test(line)) {
      ingredients.push(line);
    } else {
      leftovers.push(line);
    }
  });

  let title = "";
  const titleCandidate = leftovers.find(x => x.length <= 22 && !/[0-9]/.test(x) && !stepVerb.test(x));
  if (titleCandidate) title = titleCandidate.replace(/[：:]$/, "").trim();
  return { title, ingredients, steps };
}

function inferCategory(title, raw) {
  const text = `${title} ${raw}`;
  const rules = [["芝士蛋糕", /芝士|乳酪|cheese/i], ["饼干", /饼干|曲奇|cookie/i], ["玛芬", /玛芬|麦芬|muffin/i], ["面包", /面包|吐司|餐包|贝果|欧包|bread|toast/i], ["蛋糕", /蛋糕|cake/i]];
  const found = rules.find(([name, re]) => re.test(text) && categories.includes(name));
  return found?.[0] || null;
}

function applyOcrToForm() {
  const raw = byId("ocrRawText").value.trim();
  if (!raw) return showMessage("没有可整理的文字", "请先完成 OCR，或在原始文字框里粘贴文字。" );
  const parsed = organizeOcrText(raw);
  if (parsed.title && !byId("recipeName").value.trim()) byId("recipeName").value = parsed.title;
  const category = inferCategory(parsed.title, raw);
  if (category) byId("recipeCategory").value = category;
  if (parsed.ingredients.length) byId("recipeIngredients").value = parsed.ingredients.join("\n");
  if (parsed.steps.length) renderStepsEditor(parsed.steps);
  const parts = [];
  if (parsed.ingredients.length) parts.push(`${parsed.ingredients.length} 条配料`);
  if (parsed.steps.length) parts.push(`${parsed.steps.length} 个步骤`);
  showMessage("已经整理到表单", parts.length ? `识别到 ${parts.join("、")}。请检查内容，有错字可以直接修改。` : "OCR 文字已经保留，但自动分类不够确定。你可以直接从原始文字复制到对应栏目。" );
}

function openCategoryManager() { renderCategoryManager(); categoryDialog.showModal(); }
function showMessage(title, text) { byId("dialogTitle").textContent = title; byId("dialogText").textContent = text; messageDialog.showModal(); }
function lines(value) { return value.split("\n").map(x => x.trim()).filter(Boolean); }
function slugify(value) { return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w\-\u4e00-\u9fff]/g, ""); }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(value = "") { return escapeHtml(value); }

searchInput?.addEventListener("input", renderRecipes);
byId("manageCategories")?.addEventListener("click", openCategoryManager);
byId("closeCategories")?.addEventListener("click", () => categoryDialog.close());
byId("closeRecipe")?.addEventListener("click", () => recipeDialog.close());
byId("editRecipe")?.addEventListener("click", () => { recipeDialog.close(); openEditor(selectedRecipe); });
byId("cancelEditor")?.addEventListener("click", () => editorDialog.close());
byId("closeDialog")?.addEventListener("click", () => messageDialog.close());
byId("addStepButton")?.addEventListener("click", () => { addStepRow(); updateStepNumbersAndTotal(); });

byId("recipeImageInput")?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  byId("imageFileName").textContent = file ? `已选择：${file.name}` : "";
  byId("ocrResultWrap").classList.add("hidden");
  byId("ocrStatus").classList.add("hidden");
});
byId("recognizeImage")?.addEventListener("click", async () => {
  const file = byId("recipeImageInput").files?.[0];
  if (!file) return showMessage("先选择一张图片", "请选择视频截图、手写配方或食谱截图。" );
  try { await runLocalOcr(file); } catch (error) { console.error(error); byId("ocrStatus").classList.remove("hidden"); byId("ocrStatus").textContent = "识别失败。请检查网络后重试；第一次使用需要下载中文 OCR 识别资料。"; byId("recognizeImage").disabled = false; byId("recognizeImage").textContent = "重新识别"; }
});
byId("organizeOcrText")?.addEventListener("click", applyOcrToForm);

byId("addCategoryButton")?.addEventListener("click", () => { const input = byId("newCategoryName"); const name = input.value.trim(); if (!name || categories.includes(name)) return; categories.push(name); input.value = ""; renderAll(); });
byId("recipeForm")?.addEventListener("submit", event => { event.preventDefault(); const recipe = formToRecipe(); if (editingId) { const idx = allRecipes.findIndex(r => r.id === editingId); if (idx >= 0) allRecipes[idx] = recipe; } else allRecipes.unshift(recipe); editorDialog.close(); renderAll(); showMessage("页面预览已更新", "这次保存目前只存在当前页面。下一步接安全写入接口后，会真正更新 GitHub 云端数据。" ); });
byId("deleteRecipe")?.addEventListener("click", () => { if (!editingId) return; allRecipes = allRecipes.filter(r => r.id !== editingId); editorDialog.close(); renderAll(); showMessage("页面中已删除", "云端写入接口接好后，删除也会同步到 GitHub。" ); });

document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => { const action = button.dataset.action; if (action === "home") return window.scrollTo({ top: 0, behavior: "smooth" }); if (action === "search") return searchInput.focus(); if (action === "add") return openEditor(); showMessage("设置", "之后这里会放云端连接状态、数据导出和其他设置。" ); }));

loadData().catch(error => { console.error(error); if (recipeGrid) recipeGrid.innerHTML = `<p class="muted">数据读取失败，请刷新页面重试。</p>`; });
