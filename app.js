const tg = window.Telegram.WebApp;

const app = {
    userId: 12345, 
    userName: "Читатель",
    allManga: [],
    filteredManga: [],
    currentManga: null,
    isCurrentLiked: false,
    
    selectedGenreTab: null,
    selectedAuthor: "",
    sortPopularActive: false, // По умолчанию сортировка отключена (пункт 1)

    async init() {
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
            tg.ready();
            try { tg.expand(); } catch(e){}
            this.userId = tg.initDataUnsafe.user.id;
            this.userName = tg.initDataUnsafe.user.first_name || "Читатель";
        }

        await this.loadCatalog();

        // СИСТЕМА ДИРЕКТ-ССЫЛОК (Пункт 7)
        // Проверяем параметр старта, если совпал — сразу открываем плашку релиза для лайков/комментов
        if (tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
            const startId = tg.initDataUnsafe.start_param;
            const hasManga = this.allManga.some(m => m.id === startId);
            if (hasManga) {
                this.openMangaPreview(startId);
            }
        }
    },

    async loadCatalog() {
        try {
            this.allManga = await api.fetchCatalog();
            this.buildAuthorSelect();
            this.applyFiltersAndRender();
        } catch (err) {
            document.getElementById('catalogGrid').innerText = "Ошибка соединения с базой.";
        }
    },

    buildAuthorSelect() {
        const select = document.getElementById('authorSelect');
        select.innerHTML = '<option value="">Все авторы</option>';
        const authorsSet = new Set();
        
        this.allManga.forEach(m => {
            if (m.author && m.author !== "Не указан") {
                m.author.split(/[,/]| и /).forEach(a => authorsSet.add(a.trim()));
            }
        });
        authorsSet.forEach(a => {
            const opt = document.createElement('option'); opt.value = a; opt.textContent = a; select.appendChild(opt);
        });
    },

    switchGenreTab(genre) {
        this.selectedGenreTab = genre;
        document.querySelectorAll('.genre-tab').forEach(t => t.classList.remove('active'));
        if (!genre) document.getElementById('tab-all').classList.add('active');
        else document.getElementById(`tab-${genre}`).classList.add('active');
        this.applyFiltersAndRender();
    },

    filterByAuthor(author) {
        this.selectedAuthor = author;
        this.applyFiltersAndRender();
    },

    toggleSortPopular() {
        this.sortPopularActive = !this.sortPopularActive;
        const btn = document.getElementById('sortBtn');
        if (this.sortPopularActive) btn.classList.add('active');
        else btn.classList.remove('active');
        this.applyFiltersAndRender();
    },

    applyFiltersAndRender() {
        // Фильтрация
        this.filteredManga = this.allManga.filter(m => {
            const matchGenre = !this.selectedGenreTab || m.tags.some(t => t.toLowerCase() === this.selectedGenreTab);
            const matchAuthor = !this.selectedAuthor || m.author.includes(this.selectedAuthor);
            return matchGenre && matchAuthor;
        });

        // Сортировка по кнопке (Пункт 1)
        if (this.sortPopularActive) {
            this.filteredManga.sort((a, b) => b.likes - a.likes);
        }

        // Рендер карточек с тегами и авторами (Пункт 2)
        const grid = document.getElementById('catalogGrid');
        grid.innerHTML = "";
        
        document.getElementById('resetBtn').style.display = (this.selectedGenreTab || this.selectedAuthor || this.sortPopularActive) ? "block" : "none";

        this.filteredManga.forEach(manga => {
            const card = document.createElement('div');
            card.className = 'manga-card';

            const cleanTags = manga.tags.filter(t => t.toLowerCase() !== 'bara' && t.toLowerCase() !== 'furry');
            const tagsHtml = cleanTags.map(t => `<span class="tag">${t}</span>`).join('');
            const authorsHtml = manga.author !== "Не указан" ? `<span class="tag-author">${manga.author}</span>` : '';

            card.innerHTML = `
                <div class="card-cover-wrap"><img src="${manga.cover}" class="card-cover" loading="lazy"></div>
                <div class="card-info">
                    <h3 class="card-title">${manga.title}</h3>
                    <div class="card-tags">${authorsHtml}</div>
                    <div class="card-tags">${tagsHtml}</div>
                </div>
            `;
            card.onclick = () => this.openMangaPreview(manga.id);
            grid.appendChild(card);
        });
    },

    resetFilters() {
        this.selectedGenreTab = null;
        this.selectedAuthor = "";
        this.sortPopularActive = false;
        document.getElementById('authorSelect').value = "";
        document.getElementById('sortBtn').classList.remove('active');
        this.switchGenreTab(null);
    },

    async openMangaPreview(mangaId) {
        this.currentManga = this.allManga.find(m => m.id === mangaId);
        if (!this.currentManga) return;

        this.showScreen('previewScreen');
        document.getElementById('previewCover').src = this.currentManga.cover;
        document.getElementById('previewTitle').innerText = this.currentManga.title;
        document.getElementById('previewAuthor').innerText = `Автор: ${this.currentManga.author}`;
        document.getElementById('previewLikesCount').innerText = `🔥 В списке понравившегося у: ${this.currentManga.likes} читателей`;

        document.getElementById('startReadBtn').onclick = () => {
            this.showScreen('readerScreen');
            reader.renderPages(this.currentManga.id, this.currentManga.pages);
        };

        this.isCurrentLiked = await api.checkUserLike(this.userId, mangaId);
        this.updateLikeButtonUI();

        document.getElementById('likeBtn').onclick = async () => {
            await api.toggleLike(this.userId, this.currentManga.id, this.isCurrentLiked);
            this.isCurrentLiked = !this.isCurrentLiked;
            this.currentManga.likes += this.isCurrentLiked ? 1 : -1;
            document.getElementById('previewLikesCount').innerText = `🔥 В списке понравившегося у: ${this.currentManga.likes} читателей`;
            this.updateLikeButtonUI();
        };
    },

    updateLikeButtonUI() {
        const btn = document.getElementById('likeBtn');
        if (this.isCurrentLiked) {
            btn.innerText = "❤️ Добавлено в понравившееся";
            btn.classList.add('liked');
        } else {
            btn.innerText = "🤍 В список понравившегося";
            btn.classList.remove('liked');
        }
    },

    closeMangaReader() {
        reader.toggleComments(false);
        this.showScreen('previewScreen');
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }
};

window.onload = () => app.init();
