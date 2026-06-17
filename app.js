const tg = window.Telegram.WebApp;

const app = {
    userId: 12345, 
    userName: "Читатель",
    allManga: [],
    userLikedIds: [], // Массив ID релизов, которые юзер уже лайкнул
    currentManga: null,
    isCurrentLiked: false,
    
    selectedGenreTab: null,
    selectedAuthor: "",
    sortPopularActive: false,

    async init() {
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
            tg.ready();
            try { tg.expand(); } catch(e){}
            this.userId = tg.initDataUnsafe.user.id;
            this.userName = tg.initDataUnsafe.user.first_name || "Читатель";
        }

        // Получаем лайки пользователя для вывода статусов на главной
        this.userLikedIds = await api.getUserLikesList(this.userId);
        await this.loadCatalog();

        if (tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
            const startId = tg.initDataUnsafe.start_param;
            if (this.allManga.some(m => m.id === startId)) {
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
            document.getElementById('catalogGrid').innerText = "Ошибка коннекта к Supabase.";
        }
    },

    buildAuthorSelect() {
        const select = document.getElementById('authorSelect');
        select.innerHTML = '<option value="">Все авторы</option>';
        const authorsSet = new Set();
        
        this.allManga.forEach(m => {
            if (m.author && m.author !== "Не указан") {
                // Разделяем авторов по запятым, слэшам или союзам
                m.author.split(/[,/]| и /).forEach(a => {
                    if(a.trim()) authorsSet.add(a.trim());
                });
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
        this.filteredManga = this.allManga.filter(m => {
            const matchGenre = !this.selectedGenreTab || m.tags.some(t => t.toLowerCase() === this.selectedGenreTab);
            const matchAuthor = !this.selectedAuthor || m.author.includes(this.selectedAuthor);
            return matchGenre && matchAuthor;
        });

        if (this.sortPopularActive) {
            this.filteredManga.sort((a, b) => b.likes - a.likes);
        }

        const grid = document.getElementById('catalogGrid');
        grid.innerHTML = "";
        
        document.getElementById('resetBtn').style.display = (this.selectedGenreTab || this.selectedAuthor || this.sortPopularActive) ? "block" : "none";

        this.filteredManga.forEach(manga => {
            const card = document.createElement('div');
            card.className = 'manga-card';

            const cleanTags = manga.tags.filter(t => t.toLowerCase() !== 'bara' && t.toLowerCase() !== 'furry');
            const tagsHtml = cleanTags.map(t => `<span class="tag">${t}</span>`).join('');
            
            // Нарезаем авторов для создания отдельных тегов под карточкой
            const authorTagsHtml = manga.author !== "Не указан" 
                ? manga.author.split(/[,/]| и /).map(a => `<span class="tag-author">${a.trim()}</span>`).join('') 
                : '';

            // Проверяем лайк на главной
            const isLiked = this.userLikedIds.includes(manga.id);
            const likedBadge = isLiked ? `<span class="tag-liked">✅ В Понравившемся</span>` : '';

            card.innerHTML = `
                <div class="card-cover-wrap"><img src="${manga.cover}" class="card-cover" loading="lazy"></div>
                <div class="card-info">
                    <h3 class="card-title">${manga.title}</h3>
                    <div class="card-tags">${authorTagsHtml} ${likedBadge}</div>
                    <div class="card-tags">${tagsHtml}</div>
                    <div class="card-stats">❤️ Лайков: ${manga.likes}</div>
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
        document.getElementById('previewAuthor').innerText = `Автор(ы): ${this.currentManga.author}`;
        document.getElementById('previewLikesCount').innerText = `🔥 В списке понравившегося у: ${this.currentManga.likes} читателей`;

        document.getElementById('startReadBtn').onclick = () => {
            this.showScreen('readerScreen');
            reader.renderPages(this.currentManga.id, this.currentManga.pages);
        };

        this.isCurrentLiked = await api.checkUserLike(this.userId, mangaId);
        this.updateLikeButtonUI();

        // Загружаем комментарии главной страницы тайтла
        this.loadMainComments();

        document.getElementById('likeBtn').onclick = async () => {
            await api.toggleLike(this.userId, this.currentManga.id, this.isCurrentLiked);
            this.isCurrentLiked = !this.isCurrentLiked;
            this.currentManga.likes += this.isCurrentLiked ? 1 : -1;
            
            // Обновляем локальный список лайков для главной страницы
            if (this.isCurrentLiked) {
                if(!this.userLikedIds.includes(mangaId)) this.userLikedIds.push(mangaId);
            } else {
                this.userLikedIds = this.userLikedIds.filter(id => id !== mangaId);
            }

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

    // ЛОГИКА КОММЕНТАРИЕВ ДЛЯ ГЛАВНОЙ СТРАНИЦЫ ТАЙТЛА (page_index = -1)
    async loadMainComments() {
        const container = document.getElementById('mainCommentsScroll');
        container.innerHTML = "Загрузка...";
        try {
            const comments = await api.fetchPageComments(this.currentManga.id, -1);
            if(comments.length === 0) {
                container.innerHTML = "<p style='color:#777; font-size:13px;'>У этого тайтла пока нет комментариев. Напишите что-нибудь первым!</p>";
                return;
            }
            container.innerHTML = "";
            comments.forEach(c => {
                const item = document.createElement('div');
                item.className = 'comment-item';
                const isMyComment = Number(c.user_id) === Number(this.userId);
                const delBtnHtml = isMyComment ? `<button class="comment-del-btn" onclick="app.deleteMainComment('${c.id}')">🗑 Удалить</button>` : '';

                item.innerHTML = `
                    <div class="comment-user">${c.user_name}</div>
                    <p class="comment-text">${c.text}</p>
                    ${delBtnHtml}
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
            await api.addPageComment(this.currentManga.id, -1, this.userId, this.userName, text);
            input.value = "";
            this.loadMainComments();
        } catch(e) {
            alert("Ошибка отправки комментария.");
        }
    },

    async deleteMainComment(commentId) {
        if(confirm("Удалить ваш комментарий к тайтлу?")) {
            await api.deleteComment(commentId, this.userId);
            this.loadMainComments();
        }
    },

    closeMangaReader() {
        reader.toggleComments(false);
        this.showScreen('previewScreen');
        this.loadMainComments(); // Обновляем данные при возврате
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        if(screenId === 'mainScreen') this.applyFiltersAndRender();
    }
};

window.onload = () => app.init();
