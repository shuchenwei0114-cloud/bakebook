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
    fetch("data/categories.json?v=8", { cache: "no-store" }),
    fetch("data/recipes.json?v=8", { cache: "no-store" })
  ]);
  categories = await categoriesRes.json();
  allRecipes = (await recipesRes.json()).map(normalizeRecipe);
  renderAll();
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

function renderCategoryManager() {
  const container = byId("categoryManager");
  container.innerHTML = categories.filter(c => c !== "全部").map((c, index) => `
    <div class="category-row" data-index="${index + 1}">
      <span>☰</span><input value="${escapeAttr(c)}" aria-label="分类名称"/><button class="mini-delete">删除</button>
    </div>`).join("");

  container.querySelectorAll(".category-row").forEach(row => {
    const input = row.querySelector("input");
    input.onchange = () => {
      const idx = Number(row.dataset.index);
      const old = categories[idx];
      const next = input.value.trim();
      if (!next || next === old) return;
      categories[idx] = next;
      allRecipes.forEach(r => { if (r.category === old) r.category = next; });
      renderAll();
      showMessage("已在页面中更新", "接入云端写入后，这项修改会同步保存到 GitHub。" );
    };

    row.querySelector(".mini-delete").onclick = () => {
      const idx = Number(row.dataset.index);
      const name = categories[idx];
      if (allRecipes.some(r => r.category === name)) {
        return showMessage("暂时不能删除", "这个分类下还有食谱，请先把食谱改到其他分类。" );
      }
      categories.splice(idx, 1);
      renderAll();
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

byId("addCategoryButton")?.addEventListener("click", () => {
  const input = byId("newCategoryName");
  const name = input.value.trim();
  if (!name || categories.includes(name)) return;
  categories.push(name);
  input.value = "";
  renderAll();
});

byId("recipeForm")?.addEventListener("submit", event => {
  event.preventDefault();
  const recipe = formToRecipe();
  if (editingId) {
    const idx = allRecipes.findIndex(r => r.id === editingId);
    if (idx >= 0) allRecipes[idx] = recipe;
  } else {
    allRecipes.unshift(recipe);
  }
  editorDialog.close();
  renderAll();
  showMessage("页面预览已更新", "这次保存目前只存在当前页面。下一步接安全写入接口后，会真正更新 GitHub 云端数据。" );
});

byId("deleteRecipe")?.addEventListener("click", () => {
  if (!editingId) return;
  allRecipes = allRecipes.filter(r => r.id !== editingId);
  editorDialog.close();
  renderAll();
  showMessage("页面中已删除", "云端写入接口接好后，删除也会同步到 GitHub。" );
});

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "home") return window.scrollTo({ top: 0, behavior: "smooth" });
    if (action === "search") return searchInput.focus();
    if (action === "add") return openEditor();
    showMessage("设置", "之后这里会放云端连接状态、数据导出和其他设置。" );
  });
});

loadData().catch(error => {
  console.error(error);
  if (recipeGrid) recipeGrid.innerHTML = `<p class="muted">数据读取失败，请刷新页面重试。</p>`;
});
