let allRecipes = [];
let categories = [];
let activeCategory = "全部";
let selectedRecipe = null;
let editingId = null;
let persistentToken = "";
let currentScaleFactor = 1;

const REPO = "shuchenwei0114-cloud/bakebook";
const API_BASE = `https://api.github.com/repos/${REPO}/contents`;
const TOKEN_KEY = "bakebook_github_token";
const TOKEN_MODE_KEY = "bakebook_github_token_mode";
const DB_NAME = "bakebook-local";
const DB_STORE = "settings";

const byId = id => document.getElementById(id);
const categoryTabs = byId("categoryTabs");
const recipeGrid = byId("recipeGrid");
const searchInput = byId("searchInput");
const sectionTitle = byId("sectionTitle");
const recipeCount = byId("recipeCount");
const recipeDialog = byId("recipeDialog");
const editorDialog = byId("editorDialog");
const categoryDialog = byId("categoryDialog");
const settingsDialog = byId("settingsDialog");
const messageDialog = byId("messageDialog");

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("NO_IDB"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IDB_OPEN"));
  });
}

async function idbGet(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || "");
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch { return ""; }
}

async function idbSet(key, value) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}

async function idbDelete(key) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}

async function hydrateStoredToken() {
  const immediate = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
  if (immediate) {
    persistentToken = immediate;
    if (localStorage.getItem(TOKEN_KEY)) await idbSet(TOKEN_KEY, immediate);
    return immediate;
  }
  const backup = await idbGet(TOKEN_KEY);
  if (backup) {
    persistentToken = backup;
    try {
      localStorage.setItem(TOKEN_KEY, backup);
      localStorage.setItem(TOKEN_MODE_KEY, "local");
    } catch {}
  }
  return backup;
}

function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || persistentToken || "";
}

async function storeToken(token, remember) {
  persistentToken = token;
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_MODE_KEY);
  if (remember) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_MODE_KEY, "local");
    } catch {}
    await idbSet(TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    await idbDelete(TOKEN_KEY);
  }
}

async function clearStoredToken() {
  persistentToken = "";
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_MODE_KEY);
  await idbDelete(TOKEN_KEY);
}

function fractionToNumber(raw) {
  if (typeof raw !== "string") return Number(raw);
  const text = raw.trim();
  if (/^\d+\s+\d+\/\d+$/.test(text)) {
    const [whole, frac] = text.split(/\s+/);
    const [a, b] = frac.split("/").map(Number);
    return Number(whole) + a / b;
  }
  if (/^\d+\/\d+$/.test(text)) {
    const [a, b] = text.split("/").map(Number);
    return a / b;
  }
  return Number(text);
}

function normalizeIngredient(ingredient) {
  if (ingredient && typeof ingredient === "object" && !Array.isArray(ingredient)) {
    const rawAmount = ingredient.amount;
    const amount = rawAmount === "" || rawAmount === null || rawAmount === undefined
      ? null
      : Number(rawAmount);
    return {
      name: String(ingredient.name || "").trim(),
      amount: Number.isFinite(amount) ? amount : null,
      unit: String(ingredient.unit || "").trim()
    };
  }

  const text = String(ingredient || "").trim();
  if (!text) return { name: "", amount: null, unit: "" };

  const quantityWord = text.match(/^(.*?)(适量|少许|若干|几滴|数滴)([（(].*[）)])?$/);
  if (quantityWord) {
    const note = quantityWord[3] ? quantityWord[3] : "";
    return {
      name: (quantityWord[1].trim() + (note ? " " + note : "")).trim(),
      amount: null,
      unit: quantityWord[2]
    };
  }

  const numberPattern = "(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)";
  const unitPattern = "(kg|mg|ml|lb|lbs|oz|g|l|cups?|tbsp|tsp|克|千克|公斤|毫克|毫升|升|个|颗|枚|只|根|片|块|勺|茶匙|汤匙|杯)";
  const match = text.match(new RegExp("^(.*?)" + numberPattern + "\\s*" + unitPattern + "(.*)$", "i"));
  if (match) {
    const amount = fractionToNumber(match[2]);
    const suffix = match[4].trim();
    return {
      name: (match[1].trim() + (suffix ? " " + suffix : "")).trim(),
      amount: Number.isFinite(amount) ? amount : null,
      unit: match[3]
    };
  }

  return { name: text, amount: null, unit: "" };
}

function ingredientText(ingredient) {
  const item = normalizeIngredient(ingredient);
  const amount = item.amount === null ? "" : String(item.amount);
  return [item.name, amount, item.unit].filter(Boolean).join(" ");
}

function normalizeRecipe(recipe) {
  let steps = recipe.steps || [];
  if (steps.length && typeof steps[0] === "string") steps = steps.map(text => ({ text, minutes: 0 }));
  return {
    id: recipe.id,
    name: recipe.name || "未命名食谱",
    category: recipe.category || "其他",
    overnightPrep: Boolean(recipe.overnightPrep),
    ingredients: (recipe.ingredients || []).map(normalizeIngredient),
    steps,
    notes: recipe.notes || ""
  };
}

function githubHeaders(token = "") {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function githubReadJson(path, token = getStoredToken(), requireToken = false) {
  if (requireToken && !token) throw new Error("NO_TOKEN");
  const res = await fetch(`${API_BASE}/${path}?ref=main&t=${Date.now()}`, { headers: githubHeaders(token), cache: "no-store" });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("BAD_TOKEN");
    throw new Error(`READ_${res.status}`);
  }
  const data = await res.json();
  return { json: JSON.parse(decodeBase64Utf8(data.content)), sha: data.sha };
}

async function githubWriteJson(path, value, sha, message, token = getStoredToken()) {
  if (!token) throw new Error("NO_TOKEN");
  const content = JSON.stringify(value, null, 2) + "\n";
  const res = await fetch(`${API_BASE}/${path}`, {
    method: "PUT",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: encodeBase64Utf8(content), sha, branch: "main" })
  });
  if (!res.ok) {
    if (res.status === 409 || res.status === 422) throw new Error("CONFLICT");
    if (res.status === 401 || res.status === 403) throw new Error("BAD_TOKEN");
    throw new Error(`WRITE_${res.status}`);
  }
  return res.json();
}

async function loadData() {
  try {
    const token = getStoredToken();
    const [categoryData, recipeData] = await Promise.all([
      githubReadJson("data/categories.json", token),
      githubReadJson("data/recipes.json", token)
    ]);
    categories = categoryData.json;
    allRecipes = recipeData.json.map(normalizeRecipe);
  } catch {
    const stamp = Date.now();
    const [categoriesRes, recipesRes] = await Promise.all([
      fetch(`data/categories.json?fresh=${stamp}`, { cache: "no-store" }),
      fetch(`data/recipes.json?fresh=${stamp}`, { cache: "no-store" })
    ]);
    categories = await categoriesRes.json();
    allRecipes = (await recipesRes.json()).map(normalizeRecipe);
  }
  renderAll();
  refreshConnectionStatus();
}

function totalMinutes(recipe) {
  return (recipe.steps || []).reduce((sum, step) => sum + (Number(step.minutes) || 0), 0);
}

function renderAll() {
  renderCategories();
  renderRecipes();
  renderCategoryManager();
  populateCategorySelect();
}

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
    const text = [recipe.name, recipe.category, ...(recipe.ingredients || []).map(ingredientText)].join(" ").toLowerCase();
    return categoryMatch && text.includes(query);
  });
  sectionTitle.textContent = activeCategory === "全部" ? "全部食谱" : activeCategory;
  recipeCount.textContent = `${filtered.length} 个食谱`;
  recipeGrid.innerHTML = "";
  filtered.forEach(recipe => {
    const overnightPill = recipe.overnightPrep ? `<span class="pill">需过夜准备</span>` : "";
    const card = document.createElement("button");
    card.className = "recipe-card";
    card.innerHTML = `<div class="recipe-card-main"><h3>${escapeHtml(recipe.name)}</h3><div class="meta-row"><span class="pill">${escapeHtml(recipe.category)}</span><span class="pill">${totalMinutes(recipe)} 分钟</span>${overnightPill}</div></div><span class="chevron">›</span>`;
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
  byId("detailMeta").innerHTML = `<span class="pill">总用时 ${totalMinutes(selectedRecipe)} 分钟</span>${selectedRecipe.overnightPrep ? '<span class="pill">需过夜准备</span>' : ""}`;
  currentScaleFactor = 1;
  renderDetailIngredients();
  setupScaleControls();
  byId("detailSteps").innerHTML = (selectedRecipe.steps || []).map((step, index) => `<div class="detail-step"><span class="step-number">${index + 1}</span><div><p>${escapeHtml(step.text || "")}</p><small>${Number(step.minutes) || 0} 分钟</small></div></div>`).join("") || "<p class='muted'>暂无步骤</p>";
  byId("detailNotes").textContent = selectedRecipe.notes || "暂无备注";
  recipeDialog.showModal();
}

function formatAmount(value) {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value - Math.round(value)) < 0.0001) return String(Math.round(value));
  return String(Number(value.toFixed(2)));
}

function scaledIngredientText(ingredient) {
  const item = normalizeIngredient(ingredient);
  const amount = item.amount === null ? null : item.amount * currentScaleFactor;
  return [
    item.name,
    amount === null ? "" : formatAmount(amount),
    item.unit
  ].filter(Boolean).join(" ");
}

function renderDetailIngredients() {
  if (!selectedRecipe) return;
  byId("detailIngredients").innerHTML = (selectedRecipe.ingredients || [])
    .map(item => `<li>${escapeHtml(scaledIngredientText(item))}</li>`)
    .join("") || "<li>暂无配料</li>";
}

function scaleableIngredients() {
  if (!selectedRecipe) return [];
  return (selectedRecipe.ingredients || [])
    .map((ingredient, index) => ({ index, ingredient: normalizeIngredient(ingredient) }))
    .filter(item => item.ingredient.amount !== null && item.ingredient.amount > 0);
}

function syncScaleReference() {
  const options = scaleableIngredients();
  const selectedIndex = Number(byId("scaleIngredient").value);
  const ref = options.find(item => item.index === selectedIndex) || options[0];
  if (!ref) return;
  byId("scaleAmount").value = formatAmount(ref.ingredient.amount);
  byId("scaleUnit").textContent = ref.ingredient.unit || "";
  currentScaleFactor = 1;
  renderDetailIngredients();
  byId("scaleSummary").textContent = "";
  byId("resetScale").classList.add("hidden");
}

function setupScaleControls() {
  const toggle = byId("toggleScale");
  const panel = byId("scalePanel");
  const select = byId("scaleIngredient");
  const options = scaleableIngredients();

  panel.classList.add("hidden");
  byId("scaleSummary").textContent = "";
  byId("resetScale").classList.add("hidden");

  if (!options.length) {
    toggle.classList.add("hidden");
    return;
  }

  toggle.classList.remove("hidden");
  select.innerHTML = options.map(item => {
    const x = item.ingredient;
    const label = [x.name, "—", formatAmount(x.amount), x.unit].filter(Boolean).join(" ");
    return `<option value="${item.index}">${escapeHtml(label)}</option>`;
  }).join("");
  syncScaleReference();
}

function toggleScalePanel() {
  const panel = byId("scalePanel");
  panel.classList.toggle("hidden");
}

function applyIngredientScale() {
  const options = scaleableIngredients();
  const selectedIndex = Number(byId("scaleIngredient").value);
  const ref = options.find(item => item.index === selectedIndex);
  const desired = Number(byId("scaleAmount").value);
  if (!ref || !Number.isFinite(desired) || desired <= 0) {
    byId("scaleSummary").textContent = "请输入大于 0 的数量。";
    return;
  }

  currentScaleFactor = desired / ref.ingredient.amount;
  renderDetailIngredients();
  byId("scaleSummary").textContent = `已按 ${formatAmount(currentScaleFactor)}× 显示；原食谱不会改变。`;
  byId("resetScale").classList.remove("hidden");
}

function resetIngredientScale() {
  currentScaleFactor = 1;
  renderDetailIngredients();
  syncScaleReference();
}

function openEditor(recipe = null) {
  editingId = recipe?.id || null;
  byId("editorTitle").textContent = recipe ? "编辑食谱" : "新增食谱";
  populateCategorySelect(recipe?.category);
  byId("recipeName").value = recipe?.name || "";
  byId("recipeOvernight").value = recipe?.overnightPrep ? "true" : "false";
  renderIngredientsEditor(recipe?.ingredients?.length ? recipe.ingredients : [{ name: "", amount: null, unit: "" }]);
  byId("recipeNotes").value = recipe?.notes || "";
  byId("deleteRecipe").classList.toggle("hidden", !recipe);
  byId("saveStatus").textContent = "";
  renderStepsEditor(recipe?.steps?.length ? recipe.steps : [{ text: "", minutes: 0 }]);
  editorDialog.showModal();
}

function renderIngredientsEditor(ingredients) {
  const container = byId("ingredientsEditor");
  if (!container) return;
  container.innerHTML = "";
  ingredients.map(normalizeIngredient).forEach(item => addIngredientRow(item));
}

function addIngredientRow(item = { name: "", amount: null, unit: "" }) {
  const ingredient = normalizeIngredient(item);
  const row = document.createElement("div");
  row.className = "ingredient-row";
  row.innerHTML = `
    <input class="ingredient-name" type="text" placeholder="例如：高筋面粉" value="${escapeAttr(ingredient.name)}" />
    <input class="ingredient-amount" type="number" step="any" inputmode="decimal" placeholder="500" value="${ingredient.amount === null ? "" : escapeAttr(ingredient.amount)}" />
    <input class="ingredient-unit" type="text" placeholder="g" value="${escapeAttr(ingredient.unit)}" />
    <button type="button" class="remove-ingredient" aria-label="删除这个食材">×</button>`;
  row.querySelector(".remove-ingredient").onclick = () => {
    row.remove();
    if (!byId("ingredientsEditor").children.length) addIngredientRow();
  };
  byId("ingredientsEditor").appendChild(row);
}

function collectIngredients() {
  return [...document.querySelectorAll(".ingredient-row")]
    .map(row => {
      const name = row.querySelector(".ingredient-name").value.trim();
      const amountRaw = row.querySelector(".ingredient-amount").value.trim();
      const unit = row.querySelector(".ingredient-unit").value.trim();
      const amount = amountRaw === "" ? null : Number(amountRaw);
      return { name, amount: Number.isFinite(amount) ? amount : null, unit };
    })
    .filter(item => item.name || item.amount !== null || item.unit);
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
  rows.forEach((row, index) => {
    row.querySelector(".step-index").textContent = index + 1;
    total += Number(row.querySelector(".step-minutes").value) || 0;
  });
  byId("totalTime").textContent = total;
}

function collectSteps() {
  return [...document.querySelectorAll(".step-row")].map(row => ({
    text: row.querySelector(".step-text").value.trim(),
    minutes: Number(row.querySelector(".step-minutes").value) || 0
  })).filter(step => step.text || step.minutes);
}

function populateCategorySelect(selected = null) {
  const select = byId("recipeCategory");
  if (!select) return;
  select.innerHTML = categories.filter(c => c !== "全部").map(c => `<option ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
}

function formToRecipe() {
  return {
    id: editingId || slugify(byId("recipeName").value) + "-" + Date.now().toString().slice(-5),
    name: byId("recipeName").value.trim(),
    category: byId("recipeCategory").value,
    overnightPrep: byId("recipeOvernight").value === "true",
    ingredients: collectIngredients(),
    steps: collectSteps(),
    notes: byId("recipeNotes").value.trim()
  };
}

function requireConnection() {
  if (getStoredToken()) return true;
  showMessage("需要先完成设置", "请先到“设置”里完成数据连接。" );
  return false;
}

function friendlyError(error) {
  if (error.message === "NO_TOKEN") return "还没有完成数据连接。请先到设置中完成连接。";
  if (error.message === "BAD_TOKEN") return "连接信息无效，请到设置里重新检查 token 和权限。";
  if (error.message === "CONFLICT") return "数据刚刚发生了变化，请重新打开后再保存一次。";
  return "保存失败，请稍后重试。";
}

async function saveRecipe(recipe) {
  const token = getStoredToken();
  const latest = await githubReadJson("data/recipes.json", token, true);
  const list = Array.isArray(latest.json) ? [...latest.json] : [];
  const idx = list.findIndex(r => r.id === recipe.id);
  if (idx >= 0) list[idx] = recipe; else list.unshift(recipe);
  await githubWriteJson("data/recipes.json", list, latest.sha, `${idx >= 0 ? "Update" : "Add"} recipe: ${recipe.name}`, token);
  return list;
}

async function deleteRecipe(id, name) {
  const token = getStoredToken();
  const latest = await githubReadJson("data/recipes.json", token, true);
  const list = (Array.isArray(latest.json) ? latest.json : []).filter(r => r.id !== id);
  await githubWriteJson("data/recipes.json", list, latest.sha, `Delete recipe: ${name}`, token);
  return list;
}

async function saveCategories(nextCategories, message) {
  const token = getStoredToken();
  const latest = await githubReadJson("data/categories.json", token, true);
  await githubWriteJson("data/categories.json", nextCategories, latest.sha, message, token);
}

function renderCategoryManager() {
  const container = byId("categoryManager");
  if (!container) return;
  container.innerHTML = categories.filter(c => c !== "全部").map((c, index) => `<div class="category-row" data-index="${index + 1}"><span>☰</span><input value="${escapeAttr(c)}" aria-label="分类名称"/><button class="mini-delete">删除</button></div>`).join("");
  container.querySelectorAll(".category-row").forEach(row => {
    const input = row.querySelector("input");
    input.onchange = async () => {
      const idx = Number(row.dataset.index);
      const old = categories[idx];
      const next = input.value.trim();
      if (!next || next === old) return;
      if (!requireConnection()) { input.value = old; return; }
      if (categories.includes(next)) { input.value = old; return showMessage("分类已存在", "请换一个分类名称。" ); }
      const oldRecipes = allRecipes.map(r => ({ ...r }));
      const nextCategories = [...categories];
      nextCategories[idx] = next;
      const nextRecipes = allRecipes.map(r => r.category === old ? { ...r, category: next } : r);
      try {
        const recipeFile = await githubReadJson("data/recipes.json", getStoredToken(), true);
        const latestRecipes = (Array.isArray(recipeFile.json) ? recipeFile.json : []).map(r => r.category === old ? { ...r, category: next } : r);
        await githubWriteJson("data/recipes.json", latestRecipes, recipeFile.sha, `Rename category in recipes: ${old} to ${next}`);
        await saveCategories(nextCategories, `Rename category: ${old} to ${next}`);
        categories = nextCategories;
        allRecipes = nextRecipes;
        renderAll();
        showMessage("已保存", "分类名称已更新。" );
      } catch (error) {
        allRecipes = oldRecipes;
        input.value = old;
        showMessage("保存失败", friendlyError(error));
      }
    };
    row.querySelector(".mini-delete").onclick = async () => {
      const idx = Number(row.dataset.index);
      const name = categories[idx];
      if (allRecipes.some(r => r.category === name)) return showMessage("暂时不能删除", "这个分类下还有食谱，请先把食谱改到其他分类。" );
      if (!requireConnection()) return;
      const next = categories.filter((_, i) => i !== idx);
      try {
        await saveCategories(next, `Delete category: ${name}`);
        categories = next;
        renderAll();
        showMessage("已删除", "分类已删除。" );
      } catch (error) { showMessage("删除失败", friendlyError(error)); }
    };
  });
}

function openCategoryManager() { renderCategoryManager(); categoryDialog.showModal(); }
function showMessage(title, text) { byId("dialogTitle").textContent = title; byId("dialogText").textContent = text; messageDialog.showModal(); }
function lines(value) { return value.split("\n").map(x => x.trim()).filter(Boolean); }
function slugify(value) { return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w\-\u4e00-\u9fff]/g, ""); }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(value = "") { return escapeHtml(value); }

function openSettings() {
  const token = getStoredToken();
  byId("githubToken").value = token;
  byId("rememberToken").checked = Boolean(localStorage.getItem(TOKEN_KEY) || persistentToken);
  refreshConnectionStatus();
  settingsDialog.showModal();
}

function refreshConnectionStatus(ok = null) {
  const status = byId("connectionStatus");
  if (!status) return;
  const token = getStoredToken();
  if (ok === false) status.textContent = "连接失败";
  else if (token) status.textContent = "已连接";
  else status.textContent = "尚未连接";
}

searchInput?.addEventListener("input", renderRecipes);
byId("manageCategories")?.addEventListener("click", openCategoryManager);
byId("closeCategories")?.addEventListener("click", () => categoryDialog.close());
byId("closeRecipe")?.addEventListener("click", () => recipeDialog.close());
byId("toggleScale")?.addEventListener("click", toggleScalePanel);
byId("scaleIngredient")?.addEventListener("change", syncScaleReference);
byId("applyScale")?.addEventListener("click", applyIngredientScale);
byId("resetScale")?.addEventListener("click", resetIngredientScale);
byId("editRecipe")?.addEventListener("click", () => { recipeDialog.close(); openEditor(selectedRecipe); });
byId("cancelEditor")?.addEventListener("click", () => editorDialog.close());
byId("closeDialog")?.addEventListener("click", () => messageDialog.close());
byId("closeSettings")?.addEventListener("click", () => settingsDialog.close());
byId("addIngredientButton")?.addEventListener("click", () => addIngredientRow());
byId("addStepButton")?.addEventListener("click", () => { addStepRow(); updateStepNumbersAndTotal(); });

byId("addCategoryButton")?.addEventListener("click", async () => {
  const input = byId("newCategoryName");
  const name = input.value.trim();
  if (!name || categories.includes(name) || !requireConnection()) return;
  const next = [...categories, name];
  try {
    await saveCategories(next, `Add category: ${name}`);
    categories = next;
    input.value = "";
    renderAll();
    showMessage("已保存", "分类已添加。" );
  } catch (error) { showMessage("保存失败", friendlyError(error)); }
});

byId("recipeForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireConnection()) return;
  const recipe = formToRecipe();
  if (!recipe.name) return;
  const button = byId("saveRecipeButton");
  button.disabled = true;
  button.textContent = "保存中…";
  try {
    allRecipes = await saveRecipe(recipe);
    editorDialog.close();
    renderAll();
    showMessage("保存成功", "食谱已保存。" );
  } catch (error) {
    byId("saveStatus").textContent = friendlyError(error);
  } finally {
    button.disabled = false;
    button.textContent = "保存";
  }
});

byId("deleteRecipe")?.addEventListener("click", async () => {
  if (!editingId || !requireConnection()) return;
  const recipe = allRecipes.find(r => r.id === editingId);
  if (!recipe) return;
  const button = byId("deleteRecipe");
  button.disabled = true;
  button.textContent = "删除中…";
  try {
    allRecipes = await deleteRecipe(recipe.id, recipe.name);
    editorDialog.close();
    renderAll();
    showMessage("删除成功", "食谱已删除。" );
  } catch (error) { showMessage("删除失败", friendlyError(error)); }
  finally { button.disabled = false; button.textContent = "删除这个食谱"; }
});

byId("testGithubConnection")?.addEventListener("click", async () => {
  const token = byId("githubToken").value.trim();
  if (!token) return showMessage("缺少连接信息", "请先粘贴 token。" );
  const button = byId("testGithubConnection");
  button.disabled = true;
  button.textContent = "测试中…";
  try {
    await githubReadJson("data/recipes.json", token, true);
    await storeToken(token, byId("rememberToken").checked);
    refreshConnectionStatus(true);
    await loadData();
    showMessage("连接成功", "现在可以保存和编辑食谱了。" );
  } catch (error) {
    refreshConnectionStatus(false);
    showMessage("连接失败", friendlyError(error));
  } finally {
    button.disabled = false;
    button.textContent = "测试并保存连接";
  }
});

byId("forgetGithubConnection")?.addEventListener("click", async () => {
  await clearStoredToken();
  byId("githubToken").value = "";
  byId("rememberToken").checked = false;
  refreshConnectionStatus();
  showMessage("已清除", "这台设备上的连接信息已清除。" );
});

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "home") return window.scrollTo({ top: 0, behavior: "smooth" });
    if (action === "search") return searchInput.focus();
    if (action === "add") return openEditor();
    if (action === "settings") return openSettings();
  });
});

(async function init() {
  await hydrateStoredToken();
  await loadData();
})().catch(error => {
  console.error(error);
  if (recipeGrid) recipeGrid.innerHTML = `<p class="muted">数据读取失败，请刷新页面重试。</p>`;
});
