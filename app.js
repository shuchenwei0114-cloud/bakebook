let allRecipes = [];
let categories = [];
let activeCategory = "全部";
let selectedRecipe = null;
let editingId = null;

const REPO = "shuchenwei0114-cloud/bakebook";
const API_BASE = `https://api.github.com/repos/${REPO}/contents`;
const TOKEN_KEY = "bakebook_github_token";
const TOKEN_MODE_KEY = "bakebook_github_token_mode";

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

function normalizeRecipe(recipe) {
  let steps = recipe.steps || [];
  if (steps.length && typeof steps[0] === "string") steps = steps.map(text => ({ text, minutes: 0 }));
  return {
    id: recipe.id,
    name: recipe.name || "未命名食谱",
    category: recipe.category || "其他",
    ingredients: recipe.ingredients || [],
    steps,
    notes: recipe.notes || ""
  };
}

function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
}

function storeToken(token, remember) {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_MODE_KEY);
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_MODE_KEY, "local");
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

function clearStoredToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_MODE_KEY);
}

function githubHeaders(token = "") {
  const headers = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
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
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function githubReadJson(path, token = getStoredToken(), requireToken = false) {
  if (requireToken && !token) throw new Error("NO_TOKEN");
  const res = await fetch(`${API_BASE}/${path}?ref=main&t=${Date.now()}`, {
    headers: githubHeaders(token),
    cache: "no-store"
  });
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
  } catch (error) {
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
    button.onclick = () => {
      activeCategory = category;
      renderCategories();
      renderRecipes();
    };
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
  populateCategorySelect(recipe?.category);
  byId("recipeName").value = recipe?.name || "";
  byId("recipeIngredients").value = (recipe?.ingredients || []).join("\n");
  byId("recipeNotes").value = recipe?.notes || "";
  byId("deleteRecipe").classList.toggle("hidden", !recipe);
  byId("saveStatus").textContent = "";
  renderStepsEditor(recipe?.steps?.length ? recipe.steps : [{ text: "", minutes: 0 }]);
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
    ingredients: lines(byId("recipeIngredients").value),
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
  if (error.message === "CATEGORY_PARTIAL") return "部分修改没有完成，请刷新后再试一次。";
  return "保存失败，请稍后重试。";
}

async function saveRecipe(recipe) {
  const token = getStoredToken();
  const latest = await githubReadJson("data/recipes.json", token, true);
  const list = latest.json.map(normalizeRecipe);
  const idx = list.findIndex(r => r.id === recipe.id);
  if (idx >= 0) list[idx] = recipe;
  else list.unshift(recipe);
  const action = idx >= 0 ? "Update" : "Add";
  await githubWriteJson("data/recipes.json", list, latest.sha, `${action} recipe: ${recipe.name}`, token);
  return list;
}

async function deleteRecipe(id, name) {
  const token = getStoredToken();
  const latest = await githubReadJson("data/recipes.json", token, true);
  const list = latest.json.map(normalizeRecipe).filter(r => r.id !== id);
  await githubWriteJson("data/recipes.json", list, latest.sha, `Delete recipe: ${name}`, token);
  return list;
}

async function saveCategories(nextCategories, message) {
  const token = getStoredToken();
  const latest = await githubReadJson("data/categories.json", token, true);
  await githubWriteJson("data/categories.json", nextCategories, latest.sha, message, token);
}

async function renameCategory(oldName, newName) {
  const token = getStoredToken();
  const [latestRecipes, latestCategories] = await Promise.all([
    githubReadJson("data/recipes.json", token, true),
    githubReadJson("data/categories.json", token, true)
  ]);
  const nextRecipes = latestRecipes.json.map(normalizeRecipe).map(r => r.category === oldName ? { ...r, category: newName } : r);
  const nextCategories = latestCategories.json.map(c => c === oldName ? newName : c);
  await githubWriteJson("data/recipes.json", nextRecipes, latestRecipes.sha, `Rename category in recipes: ${oldName} to ${newName}`, token);
  try {
    await githubWriteJson("data/categories.json", nextCategories, latestCategories.sha, `Rename category: ${oldName} to ${newName}`, token);
  } catch {
    throw new Error("CATEGORY_PARTIAL");
  }
  return { nextRecipes, nextCategories };
}

function renderCategoryManager() {
  const container = byId("categoryManager");
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
      input.disabled = true;
      try {
        const result = await renameCategory(old, next);
        allRecipes = result.nextRecipes;
        categories = result.nextCategories;
        renderAll();
        showMessage("已保存", "分类名称已更新。" );
      } catch (error) {
        input.value = old;
        showMessage("保存失败", friendlyError(error));
      } finally {
        input.disabled = false;
      }
    };
    row.querySelector(".mini-delete").onclick = async () => {
      const idx = Number(row.dataset.index);
      const name = categories[idx];
      if (allRecipes.some(r => r.category === name)) return showMessage("暂时不能删除", "这个分类下还有食谱，请先把食谱改到其他分类。" );
      if (!requireConnection()) return;
      try {
        const next = categories.filter(c => c !== name);
        await saveCategories(next, `Delete category: ${name}`);
        categories = next;
        renderAll();
        showMessage("删除成功", "分类已删除。" );
      } catch (error) {
        showMessage("删除失败", friendlyError(error));
      }
    };
  });
}

function openCategoryManager() {
  renderCategoryManager();
  categoryDialog.showModal();
}

function showMessage(title, text) {
  byId("dialogTitle").textContent = title;
  byId("dialogText").textContent = text;
  messageDialog.showModal();
}

function lines(value) { return value.split("\n").map(x => x.trim()).filter(Boolean); }
function slugify(value) { return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w\-\u4e00-\u9fff]/g, ""); }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(value = "") { return escapeHtml(value); }

function refreshConnectionStatus() {
  const connected = Boolean(getStoredToken());
  byId("connectionStatus").textContent = connected ? "已连接" : "尚未连接";
  byId("githubToken").value = "";
  byId("rememberToken").checked = localStorage.getItem(TOKEN_MODE_KEY) === "local";
}

searchInput?.addEventListener("input", renderRecipes);
byId("manageCategories")?.addEventListener("click", openCategoryManager);
byId("closeCategories")?.addEventListener("click", () => categoryDialog.close());
byId("closeRecipe")?.addEventListener("click", () => recipeDialog.close());
byId("editRecipe")?.addEventListener("click", () => { recipeDialog.close(); openEditor(selectedRecipe); });
byId("cancelEditor")?.addEventListener("click", () => editorDialog.close());
byId("closeDialog")?.addEventListener("click", () => messageDialog.close());
byId("closeSettings")?.addEventListener("click", () => settingsDialog.close());
byId("addStepButton")?.addEventListener("click", () => { addStepRow(); updateStepNumbersAndTotal(); });

byId("testGithubConnection")?.addEventListener("click", async () => {
  const token = byId("githubToken").value.trim() || getStoredToken();
  if (!token) return showMessage("请输入 token", "请先粘贴 token。" );
  const button = byId("testGithubConnection");
  button.disabled = true;
  button.textContent = "正在测试…";
  try {
    await githubReadJson("data/recipes.json", token, true);
    storeToken(token, byId("rememberToken").checked);
    refreshConnectionStatus();
    showMessage("连接成功", "设置已保存，现在可以正常新增、编辑和删除食谱。" );
  } catch (error) {
    showMessage("连接失败", friendlyError(error));
  } finally {
    button.disabled = false;
    button.textContent = "测试并保存连接";
  }
});

byId("forgetGithubConnection")?.addEventListener("click", () => {
  clearStoredToken();
  refreshConnectionStatus();
  showMessage("已清除", "这台设备上的连接信息已清除。" );
});

byId("addCategoryButton")?.addEventListener("click", async () => {
  const input = byId("newCategoryName");
  const name = input.value.trim();
  if (!name || categories.includes(name)) return;
  if (!requireConnection()) return;
  const button = byId("addCategoryButton");
  button.disabled = true;
  try {
    const latest = await githubReadJson("data/categories.json", getStoredToken(), true);
    const next = latest.json.includes(name) ? latest.json : [...latest.json, name];
    await githubWriteJson("data/categories.json", next, latest.sha, `Add category: ${name}`);
    categories = next;
    input.value = "";
    renderAll();
    showMessage("已保存", "新分类已添加。" );
  } catch (error) {
    showMessage("保存失败", friendlyError(error));
  } finally {
    button.disabled = false;
  }
});

byId("recipeForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireConnection()) return;
  const recipe = formToRecipe();
  if (!recipe.name) return;
  const button = byId("saveRecipeButton");
  button.disabled = true;
  button.textContent = "保存中…";
  byId("saveStatus").textContent = "";
  try {
    allRecipes = await saveRecipe(recipe);
    editorDialog.close();
    renderAll();
    showMessage("保存成功", "食谱已保存。" );
  } catch (error) {
    byId("saveStatus").textContent = friendlyError(error);
    showMessage("保存失败", friendlyError(error));
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
    allRecipes = await deleteRecipe(editingId, recipe.name);
    editorDialog.close();
    renderAll();
    showMessage("删除成功", "食谱已删除。" );
  } catch (error) {
    showMessage("删除失败", friendlyError(error));
  } finally {
    button.disabled = false;
    button.textContent = "删除这个食谱";
  }
});

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "home") return window.scrollTo({ top: 0, behavior: "smooth" });
    if (action === "search") return searchInput.focus();
    if (action === "add") return openEditor();
    if (action === "settings") {
      refreshConnectionStatus();
      settingsDialog.showModal();
    }
  });
});

loadData().catch(error => {
  console.error(error);
  if (recipeGrid) recipeGrid.innerHTML = `<p class="muted">数据读取失败，请刷新页面重试。</p>`;
});
