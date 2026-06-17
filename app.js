const tg = window.Telegram.WebApp;

const app = {
    userId: 12345, 
    userName: "Читатель",
    allManga: [],
    userLikedIds: [], 
    currentManga: null,
    isCurrentLiked: false,
    
    selectedGenreTab: null,
    selectedAuthor: "",
    sortPopularActive: false,

    async init() {
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
            tg.ready();
            try { tg.expand(); } catch(e){}
            this.userId = Number(tg.initDataUnsafe.user.id);
            this.userName = tg.initDataUnsafe.user.first_name || "Читатель";
        }

        this.userLikedIds = await api.getUserLikesList(this.userId);
        await this.loadCatalog();

        if (tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
            const startId = String(tg.initDataUnsafe.start_param);
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
            document.getElementById('catalogGrid').innerText = "Ошибка соединения.";
        }
    },

    buildAuthorSelect() {
        const select = document.getElementById('authorSelect');
        select.innerHTML = '<option value="">Все авторы</option>';
        const authorsSet = new Set();
        
        this.allManga.forEach(m => {
            if (m.author && m.author !== "Не указан") {
                m.author.split(',').forEach(a => {
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
            this.filteredManga.sort((a, b) => Number(b.likes) - Number(a.likes));
        }

        const grid = document.getElementById('catalogGrid');
        grid.innerHTML = "";
        
        document.getElementById('resetBtn').style.display = (this.selectedGenreTab || this.selectedAuthor || this.sortPopularActive) ? "block" : "none";

        this.filteredManga.forEach(manga => {
            const card = document.createElement('div');
            
            let genreClass = '';
            const hasBara = manga.tags.some(t => t.toLowerCase() === 'bara');
            const hasFurry = manga.tags.some(t => t.toLowerCase() === 'furry');
            
            if (hasBara) genreClass = ' manga-bara';
            else if (hasFurry) genreClass = ' manga-furry';

            card.className = 'manga-card' + genreClass;

            // Генерируем автора с кликом
            const authorTagsHtml = manga.author !== "Не указан" ? manga.author.split(',').map(a => {
                const authorName = a.trim();
                const isActive = this.selectedAuthor === authorName;
                const activeClass = isActive ? 'active' : '';
                
                // Если активно - сбрасываем, если нет - устанавливаем фильтр
                const clickAction = isActive 
                    ? `app.resetFilters()` 
                    : `app.filterByAuthor('${authorName}'); document.getElementById('authorSelect').value = '${authorName}';`;

                return `<span class="tag-author ${activeClass}" onclick="event.stopPropagation(); ${clickAction}">${authorName}</span>`;
            }).join('') : '';

            const isLiked = this.userLikedIds.includes(String(manga.id));
            const heartBadgeHtml = isLiked ? `<div class="card-like-badge">🤍</div>` : '';
            const commentsCount = manga.comments_count || 0;

            card.innerHTML = `
                <div class="card-cover-wrap">
                    ${heartBadgeHtml}
                    <img src="${manga.cover}" class="card-cover" loading="lazy">
                </div>
                <div class="card-info">
                    <h3 class="card-title">${manga.title}</h3>
                    <div class="card-author-zone">${authorTagsHtml}</div>
                    <div class="card-stats">
                        <span class="stat-item">❤️ ${manga.likes}</span>
                        <span class="stat-item">💬 ${commentsCount}</span>
                    </div>
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
        this.currentManga = this.allManga.find(m => m.id === String(mangaId));
        if (!this.currentManga) return;

        this.showScreen('previewScreen');
        document.getElementById('previewCover').src = this.currentManga.cover;
        document.getElementById('previewTitle').innerText = this.currentManga.title;
        document.getElementById('previewAuthor').innerText = `Автор(ы): ${this.currentManga.author}`;
        document.getElementById('previewLikesCount').innerText = `Понравилось: ${this.currentManga.likes}`;

        document.getElementById('startReadBtn').onclick = () => {
            this.showScreen('readerScreen');
            reader.renderPages(this.currentManga.id, this.currentManga.pages);
        };

        this.isCurrentLiked = this.userLikedIds.includes(String(this.currentManga.id));
        this.updateLikeButtonUI();
        this.loadMainComments();

        document.getElementById('likeBtn').onclick = async () => {
            this.isCurrentLiked = !this.isCurrentLiked;
            this.currentManga.likes += this.isCurrentLiked ? 1 : -1;
            
            if (this.isCurrentLiked) {
                if(!this.userLikedIds.includes(String(this.currentManga.id))) this.userLikedIds.push(String(this.currentManga.id));
            } else {
                this.userLikedIds = this.userLikedIds.filter(id => id !== String(this.currentManga.id));
            }

            document.getElementById('previewLikesCount').innerText = `Понравилось: ${this.currentManga.likes}`;
            this.updateLikeButtonUI();

            await api.toggleLike(this.userId, this.currentManga.id, !this.isCurrentLiked);
        };
    },

    updateLikeButtonUI() {
        const btn = document.getElementById('likeBtn');
        if (this.isCurrentLiked) {
            btn.innerText = "Убрать";
            btn.className = "btn-like-compact not-liked";
        } else {
            btn.innerText = "Добавить в понравившееся";
            btn.className = "btn-like-compact";
        }
    },

    formatCommentTime(isoString) {
        if(!isoString) return "";
        const d = new Date(isoString);
        if(isNaN(d.getTime())) return "";
        
        const pad = (n) => String(n).padStart(2, '0');
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        
        const now = new Date();
        if(d.toDateString() === now.toDateString()) {
            return `${hours}:${minutes}`;
        }
        return `${pad(d.getDate())}.${pad(d.getMonth()+1)} ${hours}:${minutes}`;
    },

    async loadMainComments() {
        const container = document.getElementById('mainCommentsScroll');
        container.innerHTML = "Загрузка обсуждения...";
        try {
            const mainComments = await api.fetchMainComments(this.currentManga.id);

            if(!mainComments || mainComments.length === 0) {
                container.innerHTML = "<p style='color:#777; font-size:13px; text-align:center;'>У этого тайтла пока нет комментариев.</p>";
                return;
            }
            container.innerHTML = "";
            mainComments.forEach(c => {
                const item = document.createElement('div');
                item.className = 'comment-item';
                const isMyComment = Number(c.user_id) === Number(this.userId);
                const delBtnHtml = isMyComment ? `<button class="comment-del-btn" onclick="app.deleteMainComment('${c.id}')">🗑 Удалить</button>` : '';

                const timeString = this.formatCommentTime(c.created_at);

                item.innerHTML = `
                    <div class="comment-top-line">
                        <span class="comment-user">${c.user_name}</span>
                        <span class="comment-time">${timeString}</span>
                    </div>
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
            await api.addComment(this.currentManga.id, null, this.userId, this.userName, text);
            input.value = "";
            
            if (this.currentManga.comments_count !== undefined) {
                this.currentManga.comments_count++;
            } else {
                this.currentManga.comments_count = 1;
            }
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
        if(screenId === 'mainScreen') this.applyFiltersAndRender();
    }
};

window.onload = () => app.init();
