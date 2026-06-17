const tg = window.Telegram.WebApp;

const app = {
    userId: 123456789, // Временный ID для тестов на ПК, пока отлаживаем базу
    userName: "Тестовый Пользователь",
    allManga: [],
    currentManga: null,
    isCurrentLiked: false,

    async init() {
        // Временно пропускаем всех (и с ПК, и с телефона) для удобства тестов
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
            tg.ready();
            try { tg.expand(); } catch(e){}
            this.userId = tg.initDataUnsafe.user.id;
            
            const user = tg.initDataUnsafe.user;
            if (user.first_name) {
                this.userName = user.first_name.trim();
            }
        } else {
            console.log("Запущено на ПК. Используются тестовые данные пользователя.");
        }
        
        // Сразу загружаем каталог
        await this.loadCatalog();
    },

    async loadCatalog() {
        try {
            const grid = document.getElementById('catalogGrid');
            this.allManga = await api.fetchCatalog();
            
            grid.innerHTML = "";
            this.allManga.forEach(manga => {
                const card = document.createElement('div');
                card.className = 'manga-card';
                card.innerHTML = `
                    <img src="${manga.cover}">
                    <h4 style="margin:8px 0 4px 0; font-size:14px;">${manga.title}</h4>
                    <span style="font-size:12px; color:#00eb87;">🔥 Лайков: ${manga.likes}</span>
                `;
                card.onclick = () => this.openMangaPreview(manga.id);
                grid.appendChild(card);
            });
        } catch (err) {
            console.error("Критическая ошибка Supabase:", err);
            // Выводим ошибку ОГРОМНЫМ блоком прямо на экран
            document.getElementById('catalogGrid').innerHTML = `
                <div style="padding: 20px; color: #ff3b30; font-size: 14px; text-align: left; background: #222; border: 2px solid #ff3b30; border-radius: 8px;">
                    <b>Критическая ошибка загрузки базы данных:</b><br><br>
                    <code>${err.message || err.details || JSON.stringify(err)}</code>
                </div>
            `;
        }
    },

    async openMangaPreview(mangaId) {
        this.currentManga = this.allManga.find(m => m.id === mangaId);
        if (!this.currentManga) return;

        this.showScreen('previewScreen');
        
        document.getElementById('previewCover').src = this.currentManga.cover;
        document.getElementById('previewTitle').innerText = this.currentManga.title;
        document.getElementById('previewAuthor').innerText = `Автор: ${this.currentManga.author}`;
        document.getElementById('previewLikesCount').innerText = `❤️ Всего лайков: ${this.currentManga.likes}`;

        document.getElementById('startReadBtn').onclick = () => {
            this.showScreen('readerScreen');
            reader.renderPages('readerContainer', this.currentManga.pages);
        };

        this.isCurrentLiked = await api.checkUserLike(this.userId, mangaId);
        this.updateLikeButtonUI();

        document.getElementById('likeBtn').onclick = async () => {
            await api.toggleLike(this.userId, this.currentManga.id, this.isCurrentLiked);
            this.isCurrentLiked = !this.isCurrentLiked;
            this.currentManga.likes += this.isCurrentLiked ? 1 : -1;
            document.getElementById('previewLikesCount').innerText = `❤️ Всего лайков: ${this.currentManga.likes}`;
            this.updateLikeButtonUI();
            this.loadCatalog();
        };

        this.loadComments(mangaId);
    },

    updateLikeButtonUI() {
        const btn = document.getElementById('likeBtn');
        if (this.isCurrentLiked) {
            btn.innerText = "❤️ Лайкнуто тобой";
            btn.classList.add('liked');
        } else {
            btn.innerText = "🤍 Лайкнуть";
            btn.classList.remove('liked');
        }
    },

    async loadComments(mangaId) {
        const listContainer = document.getElementById('commentsList');
        listContainer.innerHTML = "Загрузка...";
        try {
            const comments = await api.fetchComments(mangaId);
            if(comments.length === 0) {
                listContainer.innerHTML = "<p style='color:#777;'>Комментариев пока нет. Будьте первым!</p>";
                return;
            }
            listContainer.innerHTML = "";
            comments.forEach(c => {
                const item = document.createElement('div');
                item.className = 'comment-item';
                item.innerHTML = `
                    <div class="comment-user">${c.user_name}</div>
                    <p class="comment-text">${c.text}</p>
                `;
                listContainer.appendChild(item);
            });
        } catch(e) {
            listContainer.innerHTML = "Не удалось загрузить комментарии.";
        }
    },

    async sendComment() {
        const input = document.getElementById('commentInputField');
        const text = input.value.trim();
        if(!text) return;

        await api.addComment(this.currentManga.id, this.userId, this.userName, text);
        input.value = "";
        this.loadComments(this.currentManga.id);
    },

    closeMangaReader() {
        this.showScreen('previewScreen');
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }
};

window.onload = () => app.init();
