let allRecipes = [];
let categories = [];
let activeCategory = "全部";
let selectedRecipe = null;
let editingId = null;

const categoryTabs = document.getElementById("categoryTabs");
const recipeGrid = document.getElementById("recipeGrid");
const searchInput = document.getElementById("searchInput");
const sectionTitle = document.getElementById("sectionTitle");
const recipeCount = document.getElementById("recipeCount");

const recipeDialog = document.getElementById("recipeDialog");
const editorDialog = document.getElementById("editorDialog");
const categoryDialog = document.getElementById("categoryDialog");
const messageDialog = document.getElementById("messageDialog");

const emojiByCategory = {
  "蛋糕": "🍰",
  "饼干": "🍪",
  "面包": "🍞",
  "玛芬": "🧁",
  "芝士蛋糕": "🍰",
  "其他": "🥐"
};

async function loadData() {
  const [categoriesRes, recipesRes] = await Promise.all([
    fetch("data/categories.json", { cache: "no-store" }),
    fetch("data/recipes.json", { cache: "no-store" })
  ]);
  categories = await categoriesRes.json();
  allRecipes = await recipesRes.json();
  renderAll();
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
    button.addEventListener("click", () => {
      activeCategory = category;
      renderCategories();
      renderRecipes();
    });
    categoryTabs.appendChild(button);
  });
  const add = document.createElement("button");
  add.className = "category-tab add-tab";
  add.textContent = "+";
  add.addEventListener("click", openCategoryManager);
  categoryTabs.appendChild(add);
}

function renderRecipes() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = allRecipes.filter(recipe => {
    const matchesCategory = activeCategory === "全部" || recipe.category === activeCategory;
    const haystack = [recipe.name, recipe.category, ...(recipe.ingredients || [])].join(" ").toLowerCase();
    return matchesCategory && haystack.includes(query);
  });

  sectionTitle.textContent = activeCategory === "全部" ? "全部食谱" : activeCategory;
  recipeCount.textContent = `${filtered.length} 个食谱`;
  recipeGrid.innerHTML = "";

  filtered.forEach(recipe => {
    const card = document.createElement("article");
    card.className = "recipe-card";
    card.innerHTML = `
      <div class="recipe-photo">${emojiByCategory[recipe.category] || "🥐"}</div>
      <div class="recipe-body">
        <h3 class="recipe-title">${escapeHtml(recipe.name)}</h3>
        <div class="meta-row">
          <span class="pill">${escapeHtml(recipe.category)}</span>
          <span class="pill">${escapeHtml(recipe.time || "")}</span>
        </div>
      </div>`;
    card.addEventListener("click", () => openRecipe(recipe.id));
    recipeGrid.appendChild(card);
  });

  if (!filtered.length) recipeGrid.innerHTML = `<p class="muted">没有找到符合条件的食谱。</p>`;
}

function openRecipe(id) {
  selectedRecipe = allRecipes.find(r => r.id === id);
  if (!selectedRecipe) return;
  document.getElementById("detailEmoji").textContent = emojiByCategory[selectedRecipe.category] || "🥐";
  document.getElementById("detailCategory").textContent = selectedRecipe.category;
  document.getElementById("detailName").textContent = selectedRecipe.name;
  document.getElementById("detailMeta").innerHTML = `
    <span class="pill">${escapeHtml(selectedRecipe.time || "未填写时间")}</span>
    <span class="pill">${escapeHtml(selectedRecipe.difficulty || "未填写难度")}</span>`;
  document.getElementById("detailIngredients").innerHTML = (selectedRecipe.ingredients || []).map(x => `<li>${escapeHtml(x)}</li>`).join("");
  document.getElementById("detailSteps").innerHTML = (selectedRecipe.steps || []).map(x => `<li>${escapeHtml(x)}</li>`).join("");
  document.getElementById("detailNotes").textContent = selectedRecipe.notes || "暂无备注";
  recipeDialog.showModal();
}

function openEditor(recipe = null) {
  editingId = recipe?.id || null;
  document.getElementById("editorTitle").textContent = recipe ? "编辑食谱" : "新增食谱";
  populateCategorySelect(recipe?.category);
  document.getElementById("recipeName").value = recipe?.name || "";
  document.getElementById("recipeTime").value = recipe?.time || "";
  document.getElementById("recipeDifficulty").value = recipe?.difficulty || "简单";
  document.getElementById("recipeIngredients").value = (recipe?.ingredients || []).join("\n");
  document.getElementById("recipeSteps").value = (recipe?.steps || []).join("\n");
  document.getElementById("recipeNotes").value = recipe?.notes || "";
  document.getElementById("deleteRecipe").classList.toggle("hidden", !recipe);
  editorDialog.showModal();
}

function populateCategorySelect(selected = null) {
  const select = document.getElementById("recipeCategory");
  select.innerHTML = categories.filter(c => c !== "全部").map(c => `<option ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
}

function formToRecipe() {
  return {
    id: editingId || slugify(document.getElementById("recipeName").value) + "-" + Date.now().toString().slice(-5),
    name: document.getElementById("recipeName").value.trim(),
    category: document.getElementById("recipeCategory").value,
    time: document.getElementById("recipeTime").value.trim(),
    difficulty: document.getElementById("recipeDifficulty").value,
    image: "",
    ingredients: lines(document.getElementById("recipeIngredients").value),
    steps: lines(document.getElementById("recipeSteps").value),
    notes: document.getElementById("recipeNotes").value.trim()
  };
}

function renderCategoryManager() {
  const container = document.getElementById("categoryManager");
  container.innerHTML = categories.filter(c => c !== "全部").map((c, index) => `
    <div class="category-row" data-index="${index + 1}">
      <span>☰</span><input value="${escapeAttr(c)}" aria-label="分类名称"/><button class="mini-delete">删除</button>
    </div>`).join("");

  container.querySelectorAll(".category-row").forEach(row => {
    const input = row.querySelector("input");
    input.addEventListener("change", () => {
      const idx = Number(row.dataset.index);
      const old = categories[idx];
      const next = input.value.trim();
      if (!next || next === old) return;
      categories[idx] = next;
      allRecipes.forEach(r => { if (r.category === old) r.category = next; });
      renderAll();
      showMessage("已在页面中更新", "下一步接入云端写入后，这项修改会同步保存到 GitHub。" );
    });
    row.querySelector(".mini-delete").addEventListener("click", () => {
      const idx = Number(row.dataset.index);
      const name = categories[idx];
      if (allRecipes.some(r => r.category === name)) {
        return showMessage("暂时不能删除", "这个分类下还有食谱，请先把这些食谱改到其他分类。" );
      }
      categories.splice(idx, 1);
      renderAll();
    });
  });
}

function openCategoryManager() {
  renderCategoryManager();
  categoryDialog.showModal();
}

function showMessage(title, text) {
  document.getElementById("dialogTitle").textContent = title;
  document.getElementById("dialogText").textContent = text;
  messageDialog.showModal();
}

function lines(value) { return value.split("\n").map(x => x.trim()).filter(Boolean); }
function slugify(value) { return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w\-\u4e00-\u9fff]/g, ""); }
function escapeHtml(value = "") { return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(value = "") { return escapeHtml(value); }

searchInput.addEventListener("input", renderRecipes);
document.getElementById("manageCategories").addEventListener("click", openCategoryManager);
document.getElementById("closeCategories").addEventListener("click", () => categoryDialog.close());
document.getElementById("closeRecipe").addEventListener("click", () => recipeDialog.close());
document.getElementById("editRecipe").addEventListener("click", () => { recipeDialog.close(); openEditor(selectedRecipe); });
document.getElementById("cancelEditor").addEventListener("click", () => editorDialog.close());
document.getElementById("closeDialog").addEventListener("click", () => messageDialog.close());

document.getElementById("addCategoryButton").addEventListener("click", () => {
  const input = document.getElementById("newCategoryName");
  const name = input.value.trim();
  if (!name || categories.includes(name)) return;
  categories.push(name);
  input.value = "";
  renderAll();
});

document.getElementById("recipeForm").addEventListener("submit", event => {
  event.preventDefault();
  const recipe = formToRecipe();
  if (editingId) {
    const idx = allRecipes.findIndex(r => r.id === editingId);
    allRecipes[idx] = recipe;
  } else {
    allRecipes.unshift(recipe);
  }
  editorDialog.close();
  renderAll();
  showMessage("页面预览已更新", "你刚才的修改现在只存在当前打开的页面里。下一步我们会接入安全写入接口，让 Save 真正更新 GitHub 云端。" );
});

document.getElementById("deleteRecipe").addEventListener("click", () => {
  if (!editingId) return;
  allRecipes = allRecipes.filter(r => r.id !== editingId);
  editorDialog.close();
  renderAll();
  showMessage("页面中已删除", "云端写入接口接好后，删除操作也会同步到 GitHub。" );
});

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "home") return window.scrollTo({ top: 0, behavior: "smooth" });
    if (action === "search") return searchInput.focus();
    if (action === "add") return openEditor();
    showMessage("设置", "之后这里会放数据导出、云端连接状态和其他设置。" );
  });
});

loadData().catch(error => {
  console.error(error);
  recipeGrid.innerHTML = `<p class="muted">数据读取失败，请刷新页面重试。</p>`;
});
