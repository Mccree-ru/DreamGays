// --- Глобальные переменные ---
let allMangaData = []; // Сюда сохраним весь каталог
let currentAuthorFilter = null; // Для фильтрации по автору

// --- Инициализация ---
async function initApp() {
    allMangaData = await api.fetchCatalog();
    applyFiltersAndRender();
}

// --- Основной метод рендеринга ---
function applyFiltersAndRender() {
    const container = document.getElementById('catalog-container'); // ID твоего контейнера
    container.innerHTML = '';

    // Фильтрация
    let filteredData = allMangaData;
    if (currentAuthorFilter) {
        filteredData = filteredData.filter(m => m.author === currentAuthorFilter);
    }

    // Если есть фильтр, показываем кнопку сброса
    if (currentAuthorFilter) {
        container.innerHTML += `<div class="filter-badge">Работы автора: ${currentAuthorFilter} <button onclick="resetFilter()">✕</button></div>`;
    }

    // Рендер карточек
    filteredData.forEach(manga => {
        const card = document.createElement('div');
        card.className = 'manga-card';
        
        // Теги удалены из верстки. Автор теперь с onclick.
        card.innerHTML = `
            <div class="card-cover-wrap">
                <img src="${manga.cover}" class="card-cover" loading="lazy">
            </div>
            <div class="card-info">
                <h3 class="card-title">${manga.title}</h3>
                <p class="card-author">
                    Автор: <span class="author-link" onclick="filterByAuthor('${manga.author}')">${manga.author}</span>
                </p>
                <div class="card-stats">
                    <span class="stat-item">❤️ ${manga.likes}</span>
                    <span class="stat-item">💬 ${manga.comments_count}</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- Функции фильтрации ---
function filterByAuthor(authorName) {
    currentAuthorFilter = authorName;
    applyFiltersAndRender();
}

function resetFilter() {
    currentAuthorFilter = null;
    applyFiltersAndRender();
}

// Запуск
initApp();
