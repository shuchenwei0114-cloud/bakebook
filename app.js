let allRecipes = [];
let activeCategory = "全部";

const categoryTabs = document.getElementById("categoryTabs");
const recipeGrid = document.getElementById("recipeGrid");
const searchInput = document.getElementById("searchInput");
const sectionTitle = document.getElementById("sectionTitle");
const recipeCount = document.getElementById("recipeCount");
const dialog = document.getElementById("comingSoonDialog");
const dialogTitle = document.getElementById("dialogTitle");
const dialogText = document.getElementById("dialogText");

const emojiByCategory = {
  "蛋糕": "🍰",
  "饼干": "🍪",
  "面包": "🍞",
  "玛芬": "🧁",
  "芝士蛋糕": "🍰"
};

async function loadData() {
  const [categoriesRes, recipesRes] = await Promise.all([
    fetch("data/categories.json", { cache: "no-store" }),
    fetch("data/recipes.json", { cache: "no-store" })
  ]);

  const categories = await categoriesRes.json();
  allRecipes = await recipesRes.json();
  renderCategories(categories);
  renderRecipes();
}

function renderCategories(categories) {
  categoryTabs.innerHTML = "";

  categories.forEach(category => {
    const button = document.createElement("button");
    button.className = `category-tab${category === activeCategory ? " active" : ""}`;
    button.textContent = category;
    button.addEventListener("click", () => {
      activeCategory = category;
      renderCategories(categories);
      renderRecipes();
    });
    categoryTabs.appendChild(button);
  });

  const add = document.createElement("button");
  add.className = "category-tab add-tab";
  add.textContent = "+";
  add.addEventListener("click", () => showComingSoon("管理分类", "下一步会加入新增、重命名、删除和拖动排序分类。"));
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
        <h3 class="recipe-title">${recipe.name}</h3>
        <div class="meta-row">
          <span class="pill">${recipe.category}</span>
          <span class="pill">${recipe.time}</span>
          <span class="pill">${recipe.difficulty}</span>
        </div>
      </div>
    `;
    card.addEventListener("click", () => showComingSoon(recipe.name, "下一步会把这里做成完整的食谱详情页，并加入编辑按钮。"));
    recipeGrid.appendChild(card);
  });

  if (!filtered.length) {
    recipeGrid.innerHTML = `<p class="muted">没有找到符合条件的食谱。</p>`;
  }
}

function showComingSoon(title, text) {
  dialogTitle.textContent = title;
  dialogText.textContent = text;
  dialog.showModal();
}

searchInput.addEventListener("input", renderRecipes);
document.getElementById("manageCategories").addEventListener("click", () => showComingSoon("管理分类", "下一步会建立完整的分类管理页面。"));
document.getElementById("closeDialog").addEventListener("click", () => dialog.close());
document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "home") return window.scrollTo({ top: 0, behavior: "smooth" });
    if (action === "search") return searchInput.focus();
    if (action === "add") return showComingSoon("新增食谱", "下一步会加入手动输入和照片识别入口。" );
    showComingSoon("设置", "这里之后会放数据导出、备份和其他设置。" );
  });
});

loadData().catch(error => {
  console.error(error);
  recipeGrid.innerHTML = `<p class="muted">数据读取失败，请刷新页面重试。</p>`;
});
