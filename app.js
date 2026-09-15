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

async function loadData() {
  const [categoriesRes, recipesRes] = await Promise.all([
    fetch("data/categories.json?v=9", { cache: "no-store" }),
    fetch("data/recipes.json?v=9", { cache: "no-store" })
  ]);
  categories = await categoriesRes.json();
  allRecipes = (await recipesRes.json()).map(normalizeRecipe);
  renderAll();
  refreshConnectionStatus();
}

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
    card.innerHTML = `
      <div class="recipe-card-main">
        <h3>${escapeHtml(recipe.name)}</h3>
        <div class="meta-row">
          <span class="pill">${escapeHtml(recipe.category)}</span>
          <span class="pill">${totalMinutes(recipe)} 分钟</span>
        </div>
      </div>
      <span class="chevron">›</span>`;
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
  byId("detailSteps").innerHTML = (selectedRecipe.steps || []).map((step, index) => `
    <div class="detail-step">
      <span class="step-number">${index + 1}</span>
      <div><p>${escapeHtml(step.text || "")}</p><small>${Number(step.minutes) || 0} 分钟</small></div>
    </div>`).join("") || "<p class='muted'>暂无步骤</p>";
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
  row.innerHTML = `
    <span class="step-index">${index !== null ? index + 1 : ""}</span>
    <textarea class="step-text" rows="2" placeholder="写这一步要做什么…">${escapeHtml(text)}</textarea>
    <div class="step-time"><input class="step-minutes" type="number" min="0" inputmode="numeric" value="${minutes}" /><span>分钟</span></div>
    <button type="button" class="remove-step" aria-label="删除这一步">×</button>`;
  row.querySelector(".step-minutes").addEventListener("input", updateStepNumbersAndTotal);
  row.querySelector(".remove-step").onclick = () => {
    row.remove();
    updateStepNumbersAndTotal();
  };
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
  return [...document.querySelectorAll(".step-row")]
    .map(row => ({
      text: row.querySelector(".step-text").value.trim(),
      minutes: Number(row.querySelector(".step-minutes").value) || 0
    }))
    .filter(step => step.text || step.minutes);
}

function populateCategorySelect(selected = null) {
  const select = byId("recipeCategory");
  if (!select) return;
  select.innerHTML = categories
    .filter(c => c !== "全部")
    .map(c => `<option ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`)
    .join("");
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

function githubHeaders(token) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };
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
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function githubReadJson(path, token = getStoredToken()) {
  if (!token) throw new Error("NO_TOKEN");
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

function requireGithubConnection() {
  if (getStoredToken()) return true;
  showMessage("先连接 GitHub", "请到“设置”里粘贴 GitHub fine-grained token。连接一次后，新增、编辑和删除就会永久保存。" );
  return false;
}

async function saveRecipeToGithub(recipe) {
  const token = getStoredToken();
  const latest = await githubReadJson("data/recipes.json", token);
  const list = latest.json.map(normalizeRecipe);
  const idx = list.findIndex(r => r.id === recipe.id);
  if (idx >= 0) list[idx] = recipe;
  else list.unshift(recipe);
  const action = idx >= 0 ? "Update" : "Add";
  await githubWriteJson("data/recipes.json", list, latest.sha, `${action} recipe: ${recipe.name}`, token);
  return list;
}

async function deleteRecipeFromGithub(id, name) {
  const token = getStoredToken();
  const latest = await githubReadJson("data/recipes.json", token);
  const list = latest.json.map(normalizeRecipe).filter(r => r.id !== id);
  await githubWriteJson("data/recipes.json", list, latest.sha, `Delete recipe: ${name}`, token);
  return list;
}

async function saveCategoriesToGithub(nextCategories, message) {
  const token = getStoredToken();
  const latest = await githubReadJson("data/categories.json", token);
  await githubWriteJson("data/categories.json", nextCategories, latest.sha, message, token);
}

async function renameCategoryInGithub(oldName, newName) {
  const token = getStoredToken();
  const [latestRecipes, latestCategories] = await Promise.all([
    githubReadJson("data/recipes.json", token),
    githubReadJson("data/categories.json", token)
  ]);
  const nextRecipes = latestRecipes.json.map(normalizeRecipe).map(r => r.category === oldName ? { ...r, category: newName } : r);
  const nextCategories = latestCategories.json.map(c => c === oldName ? newName : c);
  await githubWriteJson("data/recipes.json", nextRecipes, latestRecipes.sha, `Rename category in recipes: ${oldName} to ${newName}`, token);
  try {
    await githubWriteJson("data/categories.json", nextCategories, latestCategories.sha, `Rename category: ${oldName} to ${newName}`, token);
  } catch (error) {
    throw new Error("CATEGORY_PARTIAL");
  }
  return { nextRecipes, nextCategories };
}

function friendlyGithubError(error) {
  if (error.message === "NO_TOKEN") return "还没有连接 GitHub。请先到设置中保存 token。";
  if (error.message === "BAD_TOKEN") return "GitHub 拒绝了这个 token。请检查 token 是否有效，并确认它对 bakebook 仓库有 Contents 读写权限。";
  if (error.message === "CONFLICT") return "GitHub 上的数据刚刚发生了变化。请重新打开食谱后再保存一次。";
  if (error.message === "CATEGORY_PARTIAL") return "食谱分类已更新，但分类列表同步失败。请不要继续修改，刷新后再试一次。";
  return `GitHub 保存失败（${error.message}）。请稍后重试。`;
}

function renderCategoryManager() {
  const container = byId("categoryManager");
  container.innerHTML = categories.filter(c => c !== "全部").map((c, index) => `
    <div class="category-row" data-index="${index + 1}">
      <span>☰</span><input value="${escapeAttr(c)}" aria-label="分类名称"/><button class="mini-delete">删除</button>
    </div>`).join("");

  container.querySelectorAll(".category-row").forEach(row => {
    const input = row.querySelector("input");
    input.onchange = async () => {
      const idx = Number(row.dataset.index);
      const old = categories[idx];
      const next = input.value.trim();
      if (!next || next === old) return;
      if (!requireGithubConnection()) { input.value = old; return; }
      if (categories.includes(next)) { input.value = old; return showMessage("分类已存在", "请换一个分类名称。" ); }
      input.disabled = true;
      try {
        const result = await renameCategoryInGithub(old, next);
        categories = result.nextCategories;
        allRecipes = result.nextRecipes;
        renderAll();
        showMessage("已保存", `分类“${old}”已改为“${next}”，并同步到 GitHub。`);
      } catch (error) {
        input.value = old;
        showMessage("保存失败", friendlyGithubError(error));
      } finally {
        input.disabled = false;
      }
    };

    row.querySelector(".mini-delete").onclick = async () => {
      const idx = Number(row.dataset.index);
      const name = categories[idx];
      if (allRecipes.some(r => r.category === name)) return showMessage("暂时不能删除", "这个分类下还有食谱，请先把食谱改到其他分类。" );
      if (!requireGithubConnection()) return;
      const next = categories.filter(c => c !== name);
      try {
        await saveCategoriesToGithub(next, `Delete category: ${name}`);
        categories = next;
        renderAll();
        showMessage("已删除", `分类“${name}”已从 GitHub 删除。`);
      } catch (error) {
        showMessage("删除失败", friendlyGithubError(error));
      }
    };
  });
}

function openCategoryManager() {
  renderCategoryManager();
  categoryDialog.showModal();
}

function openSettings() {
  const hasToken = Boolean(getStoredToken());
  byId("githubToken").value = "";
  byId("githubToken").placeholder = hasToken ? "已保存 token；如需更换请粘贴新的" : "粘贴 GitHub token";
  byId("rememberToken").checked = localStorage.getItem(TOKEN_MODE_KEY) === "local";
  refreshConnectionStatus();
  settingsDialog.showModal();
}

function refreshConnectionStatus(text = null, state = null) {
  const el = byId("connectionStatus");
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.dataset.state = state || "";
    return;
  }
  if (getStoredToken()) {
    el.textContent = "已保存 token · 尚未测试";
    el.dataset.state = "saved";
  } else {
    el.textContent = "尚未连接";
    el.dataset.state = "";
  }
}

function showMessage(title, text) {
  byId("dialogTitle").textContent = title;
  byId("dialogText").textContent = text;
  messageDialog.showModal();
}

function lines(value) {
  return value.split("\n").map(x => x.trim()).filter(Boolean);
}

function slugify(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w\-\u4e00-\u9fff]/g, "");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

searchInput?.addEventListener("input", renderRecipes);
byId("manageCategories")?.addEventListener("click", openCategoryManager);
byId("closeCategories")?.addEventListener("click", () => categoryDialog.close());
byId("closeSettings")?.addEventListener("click", () => settingsDialog.close());
byId("closeRecipe")?.addEventListener("click", () => recipeDialog.close());
byId("editRecipe")?.addEventListener("click", () => {
  recipeDialog.close();
  openEditor(selectedRecipe);
});
byId("cancelEditor")?.addEventListener("click", () => editorDialog.close());
byId("closeDialog")?.addEventListener("click", () => messageDialog.close());
byId("addStepButton")?.addEventListener("click", () => {
  addStepRow();
  updateStepNumbersAndTotal();
});

byId("testGithubConnection")?.addEventListener("click", async () => {
  const button = byId("testGithubConnection");
  const entered = byId("githubToken").value.trim();
  const token = entered || getStoredToken();
  if (!token) return showMessage("需要 token", "请先粘贴 GitHub fine-grained token。" );
  button.disabled = true;
  button.textContent = "正在测试…";
  refreshConnectionStatus("正在连接 GitHub…", "testing");
  try {
    await githubReadJson("data/recipes.json", token);
    storeToken(token, byId("rememberToken").checked);
    byId("githubToken").value = "";
    byId("githubToken").placeholder = "已保存 token；如需更换请粘贴新的";
    refreshConnectionStatus("连接成功 · 可以保存食谱", "ok");
  } catch (error) {
    refreshConnectionStatus("连接失败", "error");
    showMessage("连接失败", friendlyGithubError(error));
  } finally {
    button.disabled = false;
    button.textContent = "测试并保存连接";
  }
});

byId("forgetGithubConnection")?.addEventListener("click", () => {
  clearStoredToken();
  byId("githubToken").value = "";
  byId("githubToken").placeholder = "粘贴 GitHub token";
  byId("rememberToken").checked = false;
  refreshConnectionStatus();
  showMessage("已清除", "这台设备上保存的 GitHub token 已清除。食谱数据仍然安全地保存在 GitHub。" );
});

byId("addCategoryButton")?.addEventListener("click", async () => {
  const input = byId("newCategoryName");
  const name = input.value.trim();
  if (!name || categories.includes(name)) return;
  if (!requireGithubConnection()) return;
  const next = [...categories, name];
  const button = byId("addCategoryButton");
  button.disabled = true;
  try {
    await saveCategoriesToGithub(next, `Add category: ${name}`);
    categories = next;
    input.value = "";
    renderAll();
    showMessage("已保存", `分类“${name}”已同步到 GitHub。`);
  } catch (error) {
    showMessage("保存失败", friendlyGithubError(error));
  } finally {
    button.disabled = false;
  }
});

byId("recipeForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireGithubConnection()) return;
  const recipe = formToRecipe();
  if (!recipe.name) return;
  const button = byId("saveRecipeButton");
  const status = byId("saveStatus");
  button.disabled = true;
  button.textContent = "正在保存…";
  status.textContent = "正在读取 GitHub 最新数据并保存…";
  try {
    allRecipes = await saveRecipeToGithub(recipe);
    editorDialog.close();
    renderAll();
    showMessage("已保存到 GitHub", `“${recipe.name}”已永久保存。GitHub Pages 更新后，其他设备也会看到这次修改。`);
  } catch (error) {
    status.textContent = friendlyGithubError(error);
    showMessage("保存失败", friendlyGithubError(error));
  } finally {
    button.disabled = false;
    button.textContent = "保存到 GitHub";
  }
});

byId("deleteRecipe")?.addEventListener("click", async () => {
  if (!editingId || !requireGithubConnection()) return;
  const current = allRecipes.find(r => r.id === editingId);
  if (!current) return;
  const button = byId("deleteRecipe");
  button.disabled = true;
  button.textContent = "正在删除…";
  try {
    allRecipes = await deleteRecipeFromGithub(editingId, current.name);
    editorDialog.close();
    renderAll();
    showMessage("已从 GitHub 删除", `“${current.name}”已删除。`);
  } catch (error) {
    showMessage("删除失败", friendlyGithubError(error));
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
    if (action === "settings") return openSettings();
  });
});

loadData().catch(error => {
  console.error(error);
  if (recipeGrid) recipeGrid.innerHTML = `<p class="muted">数据读取失败，请刷新页面重试。</p>`;
});
