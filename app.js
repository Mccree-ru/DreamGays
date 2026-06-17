const tg = window.Telegram.WebApp;

const app = {
    userId: 1878167600, 
    userName: "Читатель",
    allManga: [],
    userLikedIds: [], 
    currentManga: null,
    isCurrentLiked: false,
    
    // Переменные фильтрации
    selectedGenreTab: null,
    selectedAuthor: "",
    sortPopularActive: false,

    // ПЕРЕМЕННЫЕ ДЛЯ ПАГИНАЦИИ
    currentPage: 0,
    mangaLimit: 9,
    hasMoreManga: true,
    isLoading: false,

    async init() {
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
            tg.ready();
            try { tg.expand(); } catch(e){}
            this.userId = Number(tg.initDataUnsafe.user.id);
            this.userName = tg.initDataUnsafe.user.first_name || "Читатель";
        }

        // ОТОБРАЖЕНИЕ КНОПКИ АДМИНИСТРАТОРА ПО ID
        if (this.userId === 1878167621 || this.userId === 1878167600) {
            const adminBtn = document.getElementById('adminBtn');
            if (adminBtn) {
                adminBtn.style.display = "block"; // Показываем кнопку, если это админ
            }
        }

        try {
            this.userLikedIds = await api.getUserLikesList(this.userId);
            await this.loadCatalog();
        } catch(e) {
            console.error("Ошибка инициализации данных:", e);
            const grid = document.getElementById('catalogGrid');
            if (grid) grid.innerText = "Ошибка загрузки профиля.";
            return;
        }

        if (tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
            const startId = String(tg.initDataUnsafe.start_param);
            if (this.allManga.some(m => m.id === startId)) {
                this.openMangaPreview(startId);
            }
        }

        // ФУНКЦИЯ ПРОВЕРКИ СКРОЛЛА
        const checkScroll = (target) => {
            if (!document.getElementById('mainScreen').classList.contains('active')) return;

            let scrollTop, clientHeight, scrollHeight;

            if (target === window) {
                scrollTop = window.scrollY;
                clientHeight = window.innerHeight;
                scrollHeight = document.documentElement.scrollHeight;
            } else {
                scrollTop = target.scrollTop;
                clientHeight = target.clientHeight;
                scrollHeight = target.scrollHeight;
            }

            // Если до дна осталось меньше 300px — подгружаем следующую страницу
            if (scrollHeight - scrollTop - clientHeight <= 300) {
                this.loadNextPage();
            }
        };

        // Слушаем скролл окна (для ПК)
        window.addEventListener('scroll', () => checkScroll(window));

        // Слушаем скролл внутри блока главного экрана (для мобильных и WebApp)
        const mainScreenEl = document.getElementById('mainScreen');
        if (mainScreenEl) {
            mainScreenEl.addEventListener('scroll', () => checkScroll(mainScreenEl));
        }

        // Инициализируем начальный экран
        this.showScreen('mainScreen');
    },
    
    async submitMangaJson() {
        const jsonField = document.getElementById('jsonAdminInput');
        const rawValue = jsonField.value.trim();

        if (!rawValue) {
            alert('Поле ввода пустое!');
            return;
        }

        const supabaseClient = window.supabaseClient || window.supabase;

        if (!supabaseClient || typeof supabaseClient.from !== 'function') {
            alert('Ошибка инициализации: Не найден рабочий клиент Supabase. Проверьте настройки подключения в api.js!');
            return;
        }

        try {
            // 1. Парсим входящую строку в объект
            const parsedData = JSON.parse(rawValue);

            // Валидация минимальных обязательных полей (not null в структуре таблицы)
            if (!parsedData.id || !parsedData.title) {
                alert('Ошибка: У объекта JSON обязательно должны быть заполнены поля "id" и "title"!');
                return;
            }

            // 2. ФИЛЬТРАЦИЯ: Формируем чистый объект строго по схеме вашей таблицы Supabase.
            const cleanMangaData = {
                id: String(parsedData.id).trim(),
                title: String(parsedData.title).trim(),
                author: parsedData.author ? String(parsedData.author).trim() : null,
                cover: parsedData.cover ? String(parsedData.cover).trim() : null,
                tags: Array.isArray(parsedData.tags) ? parsedData.tags : null,
                pages: Array.isArray(parsedData.pages) ? parsedData.pages : null
            };

            // 3. Отправляем очищенный объект в Supabase
            const { data, error } = await supabaseClient
                .from('manga') 
                .insert([cleanMangaData]);

            if (error) {
                console.error('Ошибка базы данных Supabase:', error);
                alert('Не удалось сохранить в БД: ' + error.message);
            } else {
                alert('🎉 Релиз «' + cleanMangaData.title + '» успешно добавлен в базу!');
                jsonField.value = ''; // Очищаем текстовое поле
                this.showScreen('mainScreen'); // Перенаправляем в каталог
                
                // Вызываем метод перезагрузки каталога
                if (typeof this.loadCatalog === 'function') {
                    await this.loadCatalog();
                }
            }
        } catch (parseError) {
            console.error('Ошибка синтаксиса JSON или выполнения:', parseError);
            alert('Ошибка при обработке релиза:\n' + parseError.message);
        }
    },
    
    async loadCatalog() {
        if (this.isLoading) return;
        this.isLoading = true;
        
        this.currentPage = 0;
        this.hasMoreManga = true;

        const grid = document.getElementById('catalogGrid');

        try {
            // Безопасная вставка скелетонов
            if (grid) {
                let placeholders = "";
                for (let i = 0; i < 6; i++) {
                    placeholders += `
                        <div class="skeleton-card">
                            <div class="skeleton-cover skeleton-blink"></div>
                            <div class="skeleton-title skeleton-blink"></div>
                            <div class="skeleton-author skeleton-blink"></div>
                        </div>
                    `;
                }
                grid.innerHTML = placeholders;
            }
            
            this.allManga = await api.fetchCatalog({
                genre: this.selectedGenreTab,
                author: this.selectedAuthor,
                sortByPopular: this.sortPopularActive,
                page: this.currentPage,
                limit: this.mangaLimit
            });
            
            if (this.allManga.length < this.mangaLimit) {
                this.hasMoreManga = false;
            }

            if (!this.selectedGenreTab && !this.selectedAuthor && !this.sortPopularActive) {
                this.buildAuthorSelect();
            }
            
            if (grid) grid.innerHTML = "";
            this.renderCatalogGrid(this.allManga);
            
        } catch (err) {
            console.error(err);
            if (grid) grid.innerText = "Ошибка соединения с базой.";
        } finally {
            this.isLoading = false;
        }
    },
    
    async loadNextPage() {
        if (this.isLoading || !this.hasMoreManga) return;
        this.isLoading = true;

        this.currentPage++;

        const grid = document.getElementById('catalogGrid');
        if (!grid) return;

        const scrollLoader = document.createElement('div');
        scrollLoader.id = 'scrollLoader';
        scrollLoader.style = 'grid-column: 1/-1; text-align:center; padding:15px; color:var(--hint-color); font-size:14px;';
        scrollLoader.innerText = "Загрузка еще...";
        grid.appendChild(scrollLoader);

        try {
            const nextManga = await api.fetchCatalog({
                genre: this.selectedGenreTab,
                author: this.selectedAuthor,
                sortByPopular: this.sortPopularActive,
                page: this.currentPage,
                limit: this.mangaLimit
            });

            const loader = document.getElementById('scrollLoader');
            if (loader) loader.remove();

            if (nextManga.length < this.mangaLimit) {
                this.hasMoreManga = false;
            }

            if (nextManga.length > 0) {
                this.allManga = [...this.allManga, ...nextManga];
                this.renderCatalogGrid(nextManga, true);
            }
        } catch (err) {
            console.error("Ошибка при дозагрузке страниц:", err);
            const loader = document.getElementById('scrollLoader');
            if (loader) loader.innerText = "Ошибка загрузки новых тайтлов.";
        } finally {
            this.isLoading = false;
        }
    },

    renderCatalogGrid(mangaArray, appendMode = false) {
        const grid = document.getElementById('catalogGrid');
        if (!grid) return;
        
        if (!appendMode) {
            grid.innerHTML = "";
            const showReset = this.selectedGenreTab || this.selectedAuthor || this.sortPopularActive;
            const resetBtn = document.getElementById('resetBtn');
            if (resetBtn) resetBtn.style.display = showReset ? "block" : "none";

            if (!mangaArray || mangaArray.length === 0) {
                grid.innerHTML = "<div style='grid-column: 1/-1; text-align:center; padding:20px; color:var(--hint-color);'>Ничего не найдено</div>";
                return;
            }
        }

        mangaArray.forEach(manga => {
            const card = document.createElement('div');
            let genreClass = '';
            const hasBara = manga.tags && manga.tags.some(t => t.toLowerCase() === 'bara');
            const hasFurry = manga.tags && manga.tags.some(t => t.toLowerCase() === 'furry');
            if (hasBara) genreClass = ' manga-bara';
            else if (hasFurry) genreClass = ' manga-furry';
            card.className = 'manga-card' + genreClass;
            
            const authorTagsHtml = manga.author !== "Не указан" ? manga.author.split(',').map(a => {
            const authorName = a.trim();
            const isActive = this.selectedAuthor === authorName;
            const activeClass = isActive ? 'active' : '';
            
            const clickAction = isActive 
                    ? `app.resetFilters()` 
                    : `app.filterByAuthor('${authorName}'); document.getElementById('authorSelect').value = '${authorName}';`;

                return `<span class="tag-author ${activeClass}" onclick="event.stopPropagation(); ${clickAction}">${authorName}</span>`;
            }).join('') : '';

            const isLiked = this.userLikedIds.includes(String(manga.id));
            const heartBadgeHtml = isLiked ? `<div class="card-like-badge"><span>READ</span></div>` : '';
            const pagesCount = (manga.pages && Array.isArray(manga.pages)) ? manga.pages.length : 0;
            const likesCount = manga.likes || manga.likes_count || 0;
            const commentsCount = manga.comments_count || 0;

            card.innerHTML = `
                <div class="card-cover-wrap">
                    <div class="skeleton-blink" style="position:absolute; inset:0;"></div>
                    ${heartBadgeHtml}
                    <div class="card-pages-badge">📖 ${pagesCount} стр.</div>
                    <div class="card-right-stats">
                        <div class="card-stat-badge">❤️ <span>${likesCount}</span></div>
                        <div class="card-stat-badge">💬 <span>${commentsCount}</span></div>
                    </div>
                </div>
                <div class="card-info">
                    <h3 class="card-title">${manga.title}</h3>
                    <div class="card-author-zone">${authorTagsHtml}</div>
                </div>
            `;

            const img = document.createElement('img');
            img.src = manga.cover;
            img.className = 'card-cover';
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.4s ease-in-out';
            
            img.onload = () => {
                img.style.opacity = '1';
                const skeleton = card.querySelector('.skeleton-blink');
                if (skeleton) skeleton.remove();
            };

            card.querySelector('.card-cover-wrap').prepend(img);
            
            card.onclick = () => this.openMangaPreview(manga.id);
            grid.appendChild(card);
        });
    },
    
    buildAuthorSelect() {
        const select = document.getElementById('authorSelect');
        if (!select) return;
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
            const opt = document.createElement('option'); 
            opt.value = a; 
            opt.textContent = a; 
            select.appendChild(opt);
        });
    },

    switchGenreTab(genre) {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        this.selectedGenreTab = genre;
        document.querySelectorAll('.genre-tab').forEach(t => t.classList.remove('active'));
        
        const allTab = document.getElementById('tab-all');
        const targetTab = document.getElementById(`tab-${genre}`);
        
        if (!genre && allTab) allTab.classList.add('active');
        else if (targetTab) targetTab.classList.add('active');
        
        this.loadCatalog();
    },

    filterByAuthor(author) {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        this.selectedAuthor = author;
        this.loadCatalog();
    },

    toggleSortPopular() {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        this.sortPopularActive = !this.sortPopularActive;
        const btn = document.getElementById('sortBtn');
        if (btn) {
            if (this.sortPopularActive) btn.classList.add('active');
            else btn.classList.remove('active');
        }
        this.loadCatalog();
    },

    resetFilters() {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        this.selectedGenreTab = null;
        this.selectedAuthor = "";
        this.sortPopularActive = false;
        
        const authorSelect = document.getElementById('authorSelect');
        if (authorSelect) authorSelect.value = "";
        
        const sortBtn = document.getElementById('sortBtn');
        if (sortBtn) sortBtn.classList.remove('active');
        
        this.switchGenreTab(null);
    },

    async openMangaPreview(mangaId) {
        const manga = this.allManga.find(m => String(m.id) === String(mangaId));
        if (!manga) return;

        this.currentManga = manga;

        const dynamicBg = document.getElementById('previewDynamicBg');
        if (dynamicBg && manga.cover) {
            dynamicBg.style.backgroundImage = `url('${manga.cover}')`;
        }
        
        const previewCover = document.getElementById('previewCover');
        if (previewCover) previewCover.src = manga.cover;
        
        document.getElementById('previewTitle').textContent = manga.title;
        document.getElementById('previewAuthor').textContent = "Автор: " + (manga.author || 'Не указан');

        this.isCurrentLiked = this.userLikedIds.includes(String(mangaId));
        this.updateLikeButtonUI();

        const likeBtn = document.getElementById('likeBtn');
        if (likeBtn) {
            likeBtn.onclick = () => this.toggleLike();
        }

        const readBtn = document.getElementById('readBtn');
        if (readBtn) {
            readBtn.onclick = () => this.startReadingManga();
        }

        const finalLikes = manga.likes || manga.likes_count || 0;
        document.getElementById('previewLikes').textContent = `❤️ ${finalLikes}`;
        document.getElementById('previewComments').textContent = `💬 ${manga.comments_count || 0}`;

        this.showScreen('previewScreen');
        await this.loadMainComments();
    },

    async toggleLike() {
        if (!this.currentManga) return;
        const mangaId = String(this.currentManga.id);

        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

        try {
            await api.toggleLike(this.userId, mangaId, this.isCurrentLiked);

            if (this.isCurrentLiked) {
                this.userLikedIds = this.userLikedIds.filter(id => id !== mangaId);
                this.isCurrentLiked = false;
                
                if (this.currentManga.likes > 0) this.currentManga.likes--;
                if (this.currentManga.likes_count > 0) this.currentManga.likes_count--;
            } else {
                this.userLikedIds.push(mangaId);
                this.isCurrentLiked = true;

                this.currentManga.likes = (this.currentManga.likes || 0) + 1;
                this.currentManga.likes_count = (this.currentManga.likes_count || 0) + 1;
            }

            this.updateLikeButtonUI();
            const finalLikes = this.currentManga.likes || this.currentManga.likes_count || 0;
            document.getElementById('previewLikes').textContent = `❤️ ${finalLikes}`;
            
            this.renderCatalogGrid(this.allManga);

        } catch (e) {
            console.error("Ошибка при переключении лайка:", e);
            alert("Не удалось изменить статус лайка: " + (e.message || JSON.stringify(e)));
        }
    },

    updateLikeButtonUI() {
        const btn = document.getElementById('likeBtn');
        if (!btn) return;
        
        if (this.isCurrentLiked) {
            btn.classList.add('active');
            btn.textContent = "❤️ В любимом";
        } else {
            btn.classList.remove('active');
            btn.textContent = "🤍 В любимое";
        }
    },

    startReadingManga() {
        if (!this.currentManga) return;
        
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

        if (typeof reader !== 'undefined' && typeof reader.renderPages === 'function') {
            this.showScreen('readerScreen');
            const pagesArray = this.currentManga.pages || [];
            reader.renderPages(this.currentManga.id, pagesArray);
        } else {
            console.error("Модуль 'reader' или метод 'renderPages' не найден.");
            alert("Ошибка: Не удалось запустить читалку.");
        }
    },
    
    formatCommentTime(isoString) {
        if (!isoString) return "";
        const utcString = isoString.endsWith('Z') ? isoString : isoString + 'Z';
        const d = new Date(utcString);
        if (isNaN(d.getTime())) return "";
    
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        
        if (d.toDateString() === now.toDateString()) {
            return `${hours}:${minutes}`;
        }
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${hours}:${minutes}`;
    },

    async loadMainComments() {
        const container = document.getElementById('mainCommentsScroll');
        if (!container) return;
        container.innerHTML = "<p style='color:#777; font-size:13px; text-align:center;'>Загрузка обсуждения...</p>";
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
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        try {
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
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
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
            try {
                await api.deleteComment(commentId, app.userId);
                if (this.currentManga.comments_count > 0) this.currentManga.comments_count--;
                this.loadMainComments();
            } catch (e) {
                alert("Не удалось удалить комментарий.");
            }
        }
    },

    closeMangaReader() {
        if (typeof reader !== 'undefined' && reader.toggleComments) {
            reader.toggleComments(false);
        }
        this.showScreen('previewScreen');
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) targetScreen.classList.add('active');
        
        // Исправление бага кнопки "Назад"
        if (tg.BackButton) {
            if (screenId === 'mainScreen') {
                tg.BackButton.hide();
            } else {
                tg.BackButton.show();
                
                // Очищаем старые привязанные клики, чтобы они не наслаивались друг на друга
                tg.BackButton.offClick(); 
                
                // Назначаем действие в зависимости от текущего активного экрана
                if (screenId === 'readerScreen') {
                    tg.BackButton.onClick(() => { this.closeMangaReader(); });
                } else if (screenId === 'previewScreen') {
                    tg.BackButton.onClick(() => { this.showScreen('mainScreen'); });
                }
            }
        }
    }
};

window.onload = () => app.init();
