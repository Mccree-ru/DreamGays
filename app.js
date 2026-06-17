const tg = window.Telegram.WebApp;

const app = {
    userId: 12345, 
    userName: "Читатель",
    allManga: [], // Накапливаемые подгруженные тайтлы
    userLikedIds: [], 
    currentManga: null,
    isCurrentLiked: false,
    
    // Параметры фильтрации на бэкенде
    selectedGenreTab: null,
    selectedAuthor: "",
    sortPopularActive: false,
    
    // Параметры пагинации
    currentPage: 0,
    isLoading: false,
    hasMore: true,

    async init() {
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
            tg.ready();
            try { tg.expand(); } catch(e){}
            this.userId = Number(tg.initDataUnsafe.user.id);
            this.userName = tg.initDataUnsafe.user.first_name || "Читатель";
        }

        this.userLikedIds = await api.getUserLikesList(this.userId);
        
        // Загружаем авторов один раз для выпадающего списка
        await this.loadAuthors();
        
        // Стартовая загрузка первой страницы каталога
        await this.resetAndLoadCatalog();

        // Активация бесконечной прокрутки вниз
        this.initInfiniteScroll();

        // Поддержка Deep Links (переход по прямой ссылке на превью)
        if (tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
            const startId = String(tg.initDataUnsafe.start_param);
            this.openMangaPreview(startId);
        }
    },

    async loadAuthors() {
        try {
            const authors = await api.fetchAllAuthors();
            const select = document.getElementById('authorSelect');
            select.innerHTML = '<option value="">Все авторы</option>';
            authors.forEach(author => {
                const opt = document.createElement('option');
                opt.value = author;
                opt.innerText = author;
                select.appendChild(opt);
            });
        } catch(e) {
            console.error("Не удалось загрузить авторов", e);
        }
    },

    async resetAndLoadCatalog() {
        this.currentPage = 0;
        this.allManga = [];
        this.hasMore = true;
        document.getElementById('catalogGrid').innerHTML = "<div class='loading-placeholder'>Загрузка релизов...</div>";
        await this.loadNextPage();
    },

    async loadNextPage() {
        if (this.isLoading || !this.hasMore) return;
        this.isLoading = true;

        try {
            const newItems = await api.fetchCatalog({
                page: this.currentPage,
                genre: this.selectedGenreTab,
                author: this.selectedAuthor,
                sortByPopular: this.sortPopularActive
            });

            if (this.currentPage === 0) {
                document.getElementById('catalogGrid').innerHTML = "";
            }

            if (newItems.length < 6) {
                this.hasMore = false; 
            }

            this.allManga = [...this.allManga, ...newItems];
            this.renderCatalogGrid(newItems);
            this.currentPage++;
        } catch (err) {
            console.error("Ошибка загрузки страницы каталога:", err);
            if (this.currentPage === 0) {
                document.getElementById('catalogGrid').innerHTML = "<div class='loading-placeholder' style='color:#ff3b30;'>Не удалось загрузить данные.</div>";
            }
        } finally {
            this.isLoading = false;
        }
    },

    renderCatalogGrid(itemsToAppend) {
        const grid = document.getElementById('catalogGrid');
        
        if (this.allManga.length === 0) {
            grid.innerHTML = "<div class='loading-placeholder'>Ничего не найдено</div>";
            return;
        }

        itemsToAppend.forEach(m => {
            const card = document.createElement('div');
            card.className = 'manga-card';
            card.onclick = () => this.openMangaPreview(m.id);

            card.innerHTML = `
                <img class="manga-cover" src="${m.cover}" loading="lazy">
                <div class="manga-info">
                    <div class="manga-title">${m.title}</div>
                    <div class="manga-author" onclick="event.stopPropagation(); app.selectAuthorFromCard('${m.author}');">${m.author}</div>
                    <div class="manga-stats">
                        <span>🔥 ${m.likes}</span>
                        <span>💬 ${m.comments_count}</span>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    },

    initInfiniteScroll() {
        const container = document.getElementById('mainScreen');
        container.addEventListener('scroll', () => {
            if (container.scrollTop + container.clientHeight >= container.scrollHeight - 150) {
                this.loadNextPage();
            }
        });
    },

    selectGenre(tabElement, genreName) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        tabElement.classList.add('active');
        this.selectedGenreTab = genreName;
        this.resetAndLoadCatalog();
    },

    onAuthorSelectChange(value) {
        this.selectedAuthor = value;
        this.resetAndLoadCatalog();
    },

    selectAuthorFromCard(authorName) {
        const select = document.getElementById('authorSelect');
        if (select) select.value = authorName;
        this.selectedAuthor = authorName;
        this.resetAndLoadCatalog();
    },

    toggleSortPopular() {
        this.sortPopularActive = !this.sortPopularActive;
        const btn = document.getElementById('sortPopularBtn');
        if (this.sortPopularActive) {
            btn.classList.add('active');
            btn.innerText = "🔥 Популярные";
        } else {
            btn.classList.remove('active');
            btn.innerText = "⏳ Последние";
        }
        this.resetAndLoadCatalog();
    },

    async openMangaPreview(mangaId) {
        let manga = this.allManga.find(m => m.id === mangaId);
        
        // Если зашли по прямой ссылке и тайтла нет в списке, подгрузим точечно
        if (!manga) {
            try {
                const single = await api.fetchCatalog({ page: 0, limit: 1, author: '', genre: null });
                manga = single.find(m => m.id === mangaId) || single[0]; 
            } catch(e){}
        }
        if(!manga) return;

        this.currentManga = manga;
        this.isCurrentLiked = this.userLikedIds.includes(String(manga.id));

        document.getElementById('previewCover').src = manga.cover;
        document.getElementById('previewTitle').innerText = manga.title;
        document.getElementById('previewAuthor').innerText = `Автор: ${manga.author}`;
        document.getElementById('previewLikesCount').innerText = `Понравилось: ${manga.likes}`;

        this.updateLikeButtonUI();
        this.showScreen('previewScreen');
        await this.loadMainComments();

        // Исправлен баг инверсии лайков: сохраняем состояние ДО клика
        document.getElementById('likeBtn').onclick = async () => {
            const wasLiked = this.isCurrentLiked; 
            this.isCurrentLiked = !this.isCurrentLiked;
            this.currentManga.likes += this.isCurrentLiked ? 1 : -1;
            
            if (this.isCurrentLiked) {
                if(!this.userLikedIds.includes(String(this.currentManga.id))) this.userLikedIds.push(String(this.currentManga.id));
            } else {
                this.userLikedIds = this.userLikedIds.filter(id => id !== String(this.currentManga.id));
            }

            document.getElementById('previewLikesCount').innerText = `Понравилось: ${this.currentManga.likes}`;
            this.updateLikeButtonUI();

            await api.toggleLike(this.userId, this.currentManga.id, wasLiked);
        };

        document.getElementById('readBtn').onclick = () => {
            this.showScreen('readerScreen');
            reader.renderPages(this.currentManga.id, this.currentManga.pages);
        };
    },

    updateLikeButtonUI() {
        const btn = document.getElementById('likeBtn');
        if (this.isCurrentLiked) {
            btn.innerText = "❤️ В любимом";
            btn.style.background = "#ff3b30";
            btn.style.color = "#fff";
        } else {
            btn.innerText = "🤍 В любимое";
            btn.style.background = "var(--card-bg)";
            btn.style.color = "var(--text-color)";
        }
    },

    formatCommentTime(dateStr) {
        try {
            const normalized = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
            const d = new Date(normalized);
            return d.toLocaleDateString('ru-RU', {hour:'2-digit', minute:'2-digit'});
        } catch(e) { return ""; }
    },

    async loadMainComments() {
        const container = document.getElementById('mainCommentsScroll');
        container.innerHTML = "Загрузка отзывов...";
        try {
            const list = await api.fetchMainComments(this.currentManga.id);
            container.innerHTML = "";
            if(list.length === 0) {
                container.innerHTML = "<div style='color:var(--hint-color); text-align:center; padding:20px;'>Здесь пока нет комментариев.</div>";
                return;
            }
            list.forEach(c => {
                const item = document.createElement('div');
                item.className = 'comment-item';
                let deleteBtn = '';
                if (Number(c.user_id) === Number(this.userId)) {
                    deleteBtn = `<span class="delete-comment-btn" onclick=\"app.deleteMainComment('${c.id}')\">Удалить</span>`;
                }
                item.innerHTML = `
                    <div class="comment-meta">
                        <span class="comment-author">${c.user_name}</span>
                        <span class="comment-time">${this.formatCommentTime(c.created_at)}</span>
                    </div>
                    <div class="comment-text">${c.text}</div>
                    ${deleteBtn}
                `;
                container.appendChild(item);
            });
        } catch(e) {
            container.innerHTML = "<span style='color:#ff3b30;'>Не удалось загрузить обсуждение.</span>";
        }
    },

    async sendMainComment() {
        const input = document.getElementById('mainCommentInputField');
        const text = input.value.trim();
        if (!text) return;

        try {
            await api.addComment(this.currentManga.id, null, this.userId, this.userName, text);
            input.value = "";
            
            this.currentManga.comments_count = (this.currentManga.comments_count || 0) + 1;
            await this.loadMainComments();
        } catch(e) {
            alert("Не удалось отправить комментарий.");
        }
    },

    async deleteMainComment(commentId) {
        if(confirm("Удалить ваш комментарий к тайтлу?")) {
            await api.deleteComment(commentId, app.userId);
            if (this.currentManga.comments_count > 0) this.currentManga.comments_count--;
            this.loadMainComments();
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
