const tg = window.Telegram.WebApp;

const app = {
    userId: null,
    userName: null, // Здесь будет храниться безопасное имя для комментариев
    allManga: [],
    currentManga: null,
    isCurrentLiked: false,

    async init() {
        // Проверяем, запущено ли приложение внутри Telegram и есть ли данные пользователя
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
            tg.ready();
            try { tg.expand(); } catch(e){}
            
            this.userId = tg.initDataUnsafe.user.id;
            
            // БЕЗОПАСНОСТЬ: Используем ТОЛЬКО имя профиля (first_name).
            // Никаких логинов (@username), чтобы защитить аккаунты от спама.
            const user = tg.initDataUnsafe.user;
            if (user.first_name) {
                this.userName = user.first_name.trim();
            } else {
                this.userName = "Читатель"; // Заглушка, если имя не заполнено
            }
            
            // Если всё отлично, запускаем загрузку каталога
            await this.loadCatalog();
        } else {
            // Если зашли с ПК или обычного браузера — блокируем интерфейс
            this.handleAuthError();
        }
    },

    // Обработка ошибки авторизации (если зашли не через Telegram бот)
    handleAuthError() {
        console.error("Ошибка: Приложение запущено вне Telegram или не удалось получить User ID.");
        
        const grid = document.getElementById('catalogGrid');
        if (grid) {
            grid.style.display = "block";
            grid.innerHTML = `
                <div style="background: #251414; border: 1px solid #ff3b30; padding: 20px; border-radius: 8px; text-align: center; margin-top: 20px;">
                    <span style="font-size: 40px;">🔒</span>
                    <h3 style="color: #ff3b30; margin: 10px 0;">Доступ ограничен</h3>
                    <p style="color: #ccc; font-size: 14px; line-height: 1.4;">
                        Пожалуйста, откройте это приложение через официального Telegram-бота, чтобы получить доступ к читалке manhua.
                    </p>
                </div>
            `;
        }
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
            console.error("Детальная ошибка загрузки:", err);
            // Выводим детальный текст ошибки прямо на экран мобильного, чтобы сразу видеть косяки базы
            document.getElementById('catalogGrid').innerHTML = `
                <div style="padding: 15px; color: #ff3b30; font-size: 13px; text-align: left; background: #222; border-radius: 6px;">
                    <b>Ошибка загрузки данных:</b><br>
                    ${err.message || err.details || JSON.stringify(err)}
                </div>
            `;
        }
    },

    async openMangaPreview(mangaId) {
        this.currentManga = this.allManga.find(m => m.id === mangaId);
        if (!this.currentManga) return;

        this.showScreen('previewScreen');
        
        // Заполнение полей
        document.getElementById('previewCover').src = this.currentManga.cover;
        document.getElementById('previewTitle').innerText = this.currentManga.title;
        document.getElementById('previewAuthor').innerText = `Автор: ${this.currentManga.author}`;
        document.getElementById('previewLikesCount').innerText = `❤️ Всего лайков: ${this.currentManga.likes}`;

        // Настройка кнопки Читать
        document.getElementById('startReadBtn').onclick = () => {
            this.showScreen('readerScreen');
            reader.renderPages('readerContainer', this.currentManga.pages);
        };

        // Обработка лайков
        this.isCurrentLiked = await api.checkUserLike(this.userId, mangaId);
        this.updateLikeButtonUI();

        document.getElementById('likeBtn').onclick = async () => {
            await api.toggleLike(this.userId, this.currentManga.id, this.isCurrentLiked);
            this.isCurrentLiked = !this.isCurrentLiked;
            this.currentManga.likes += this.isCurrentLiked ? 1 : -1;
            document.getElementById('previewLikesCount').innerText = `❤️ Всего лайков: ${this.currentManga.likes}`;
            this.updateLikeButtonUI();
            this.loadCatalog(); // Тихий апдейт счетчиков в каталоге
        };

        // Загрузка комментов
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
        input.value = ""; // Очищаем поле
        this.loadComments(this.currentManga.id); // Перерисовываем список комментов
    },

    closeMangaReader() {
        this.showScreen('previewScreen');
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }
};

// Запуск при старте приложения
window.onload = () => app.init();
