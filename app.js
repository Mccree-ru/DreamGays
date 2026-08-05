const tg = window.Telegram.WebApp;

const app = {
    userId: 0, 
    userName: "Читатель",
    allManga: [],
    userLikedIds: [], 
    currentManga: null,
    isCurrentLiked: false,
    currentCommentsTab: 'main', 
    
    selectedGenreTab: null,
    selectedAuthor: "",
    userPurchasedIds: [],
    sortPopularActive: false,

    currentPage: 0,
    mangaLimit: 12,
    hasMoreManga: true,
    isLoading: false,

    _scrollTimeout: null,
    _isScrolling: false,
    lazyObserver: null, 

    async init() {
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
            tg.ready();
            try { 
                tg.expand(); 
                if (tg.setBackgroundColor) tg.setBackgroundColor('#0A0A0C');
                if (tg.setHeaderColor) tg.setHeaderColor('#0A0A0C');
            } catch(e){}
            
            const tUser = tg.initDataUnsafe.user;
            this.userId = Number(tUser.id);
            this.userName = tUser.first_name + (tUser.last_name ? ' ' + tUser.last_name : '');
        } else {
            this.userName = "Читатель";
        }
        
        if (!this.lazyObserver) {
            this.lazyObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.onload = () => img.classList.add('loaded');
                            observer.unobserve(img); 
                        }
                    }
                });
            }, { rootMargin: '250px' }); 
        }

        try {
            this.userLikedIds = await api.getUserLikesList(this.userId);
            this.userPurchasedIds = await api.fetchUserPurchases(this.userId);
            this.subscribeToPurchases(); 
            await this.loadCatalog();
        } catch(e) {
            console.error("Ошибка инициализации данных:", e);
            const grid = document.getElementById('catalogGrid');
            if (grid) grid.innerHTML = "<p style='grid-column: 1/-1; text-align:center; color:var(--danger-color);'>Ошибка загрузки профиля.</p>";
            return;
        }

        let hasDeepLink = false;

        if (tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
            const startId = String(tg.initDataUnsafe.start_param);
            const localManga = this.allManga.find(m => String(m.id) === startId);
            
            if (localManga) {
                hasDeepLink = true;
                this.openMangaPreview(startId);
            } else {
                try {
                    if (typeof api.fetchSingleManga === 'function') {
                        const targetManga = await api.fetchSingleManga(startId);
                        if (targetManga) {
                            this.allManga.push(targetManga);
                            hasDeepLink = true;
                            this.openMangaPreview(startId);
                        }
                    }
                } catch (err) {
                    console.error("Не удалось загрузить тайтл по start_param:", err);
                }
            }
        }

        const mainScreenEl = document.getElementById('mainScreen');
        const checkScroll = this._throttleScroll.bind(this);

        window.addEventListener('scroll', checkScroll, { passive: true });
        if (mainScreenEl) {
            mainScreenEl.addEventListener('scroll', checkScroll, { passive: true });
        }

        if (!hasDeepLink) {
            this.showScreen('mainScreen');
        }
    },

    parseTitle(title) {
        if (!title) return { main: "", sub: "" };
        let cleaned = title.replace(/\[.*?\]/g, '').trim();
        if (!cleaned) cleaned = title; 

        if (cleaned.includes('|')) {
            const parts = cleaned.split('|');
            const main = parts.pop().trim(); 
            const sub = parts.join('|').trim(); 
            return { main, sub };
        }
        return { main: cleaned, sub: "" };
    },
    
    _throttleScroll() {
        if (this._isScrolling) return;
        this._isScrolling = true;
        
        requestAnimationFrame(() => {
            this._checkScrollPosition();
            this._isScrolling = false;
        });
    },

    _checkScrollPosition() {
        const mainScreen = document.getElementById('mainScreen');
        if (!mainScreen || !mainScreen.classList.contains('active')) return;

        const scrollTop = mainScreen.scrollTop || window.scrollY;
        const clientHeight = mainScreen.clientHeight || window.innerHeight;
        const scrollHeight = mainScreen.scrollHeight || document.documentElement.scrollHeight;

        if (scrollHeight - scrollTop - clientHeight <= 400) {
            this.loadNextPage();
        }
    },
    
    subscribeToPurchases() {
        if (!window.supabase) return;
        window.supabase
            .channel('public:purchases')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'purchases',
                filter: `user_id=eq.${this.userId}`
            }, payload => {
                const newMangaId = String(payload.new.manga_id);
                if (!this.userPurchasedIds.includes(newMangaId)) {
                    this.userPurchasedIds.push(newMangaId);
                    if (this.currentManga && String(this.currentManga.id) === newMangaId) {
                        this.updateReadButtonUI();
                    }
                    this.updateMangaCardPremiumState(newMangaId);
                }
            })
            .subscribe();
    },
    
    async loadCatalog() {
        if (this.isLoading) return;
        this.isLoading = true;
        
        this.currentPage = 0;
        this.hasMoreManga = true;

        const grid = document.getElementById('catalogGrid');

        try {
            if (grid) {
                let placeholders = "";
                for (let i = 0; i < 6; i++) {
                    placeholders += `
                        <div class="manga-card skeleton" style="opacity:0.6;">
                            <div class="card-cover-wrap"></div>
                            <div class="card-info">
                                <div style="height:14px; background:rgba(255,255,255,0.1); border-radius:4px; margin-bottom:8px;"></div>
                                <div style="height:14px; width:60%; background:rgba(255,255,255,0.1); border-radius:4px;"></div>
                            </div>
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

            requestAnimationFrame(() => {
                if (grid) grid.innerHTML = "";
                this.renderCatalogGrid(this.allManga);
            });
            
        } catch (err) {
            console.error(err);
            if (grid) grid.innerHTML = "<p style='grid-column: 1/-1; text-align:center; color:var(--text-secondary);'>Ошибка соединения с базой.</p>";
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
        scrollLoader.style.cssText = 'grid-column:1/-1; text-align:center; padding:10px; color:var(--text-secondary); font-size:13px; opacity:0.6;';
        scrollLoader.innerText = "Загрузка...";
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
                requestAnimationFrame(() => {
                    this.renderCatalogGrid(nextManga, true);
                });
            }
        } catch (err) {
            console.error("Ошибка при дозагрузке страниц:", err);
            const loader = document.getElementById('scrollLoader');
            if (loader) loader.innerText = "Ошибка загрузки.";
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
                grid.innerHTML = "<p style='grid-column: 1/-1; text-align:center; padding:20px; color:var(--text-secondary);'>Ничего не найдено</p>";
                return;
            }
        }

        const fragment = document.createDocumentFragment();

        mangaArray.forEach(manga => {
            const card = document.createElement('div');
            card.setAttribute('data-manga-id', manga.id);
            
            const isLiked = this.userLikedIds.includes(String(manga.id));
            const isPurchased = this.userPurchasedIds.includes(String(manga.id));
            
            const parsedTitle = this.parseTitle(manga.title);
            
            let cardClass = 'manga-card';
            
            const hasBara = manga.tags && manga.tags.some(t => t.toLowerCase() === 'bara');
            const hasFurry = manga.tags && manga.tags.some(t => t.toLowerCase() === 'furry');
            
            if (hasBara) cardClass += ' manga-bara';
            else if (hasFurry) cardClass += ' manga-furry';

            if (manga.is_paid && !isPurchased) {
                cardClass += ' is-premium';
            }
            card.className = cardClass;
            
            let genresHtml = '';
            const addGenreTag = (genreId, label, cssClass) => {
                const isActive = this.selectedGenreTab === genreId;
                const activeClass = isActive ? 'active' : '';
                const clickAction = isActive 
                    ? `app.resetFilters()` 
                    : `app.filterByGenre('${genreId}')`;
                return `<span class="pill-tag ${cssClass} ${activeClass}" onclick="event.stopPropagation(); ${clickAction}">${label}</span>`;
            };

            if (hasBara) genresHtml += addGenreTag('bara', 'BARA', 'tag-bara');
            if (hasFurry) genresHtml += addGenreTag('furry', 'FURRY', 'tag-furry');
            
            const genresRow = genresHtml ? `<div class="tags-row">${genresHtml}</div>` : '';

            // ИСПРАВЛЕНИЕ: Убрали обращение к выпадающему списку
            let authorsHtml = manga.author !== "Не указан" ? manga.author.split(',').map(a => {
                const authorName = a.trim();
                const isActive = this.selectedAuthor === authorName;
                const activeClass = isActive ? 'active' : '';
                const clickAction = isActive 
                    ? `app.resetFilters()` 
                    : `app.filterByAuthor('${authorName}')`;
                return `<span class="pill-tag tag-author ${activeClass}" onclick="event.stopPropagation(); ${clickAction}">👤 ${authorName}</span>`;
            }).join('') : '';
            
            const authorsRow = authorsHtml ? `<div class="tags-row">${authorsHtml}</div>` : '';

            const lockBadgeHtml = (manga.is_paid && !isPurchased) 
                ? `<div class="glass-badge badge-premium">🎫 ${manga.price}</div>` 
                : '';
            const heartBadgeHtml = isLiked ? `<div class="glass-badge badge-likes">❤️</div>` : '';
            
            const pagesCount = (manga.pages && Array.isArray(manga.pages)) ? manga.pages.length : 0;
            const likesCount = manga.likes || manga.likes_count || 0;
            const commentsCount = manga.comments_count || 0;

            card.innerHTML = `
                <div class="card-cover-wrap">
                    ${lockBadgeHtml}
                    ${heartBadgeHtml}
                    <div class="glass-badge badge-pages">📖 ${pagesCount}</div>
                    
                    <div class="card-right-stats">
                        <div class="glass-badge badge-stat">❤️ ${likesCount}</div>
                        <div class="glass-badge badge-stat">💬 ${commentsCount}</div>
                    </div>
                    
                    <img class="card-cover" src="" data-src="${manga.cover}" loading="lazy">
                </div>
                <div class="card-info">
                    <h3 class="card-title">${parsedTitle.main}</h3>
                    <div class="card-tags">
                        ${genresRow}
                        ${authorsRow}
                    </div>
                </div>
            `;

            const img = card.querySelector('img.card-cover');
            if (this.lazyObserver) this.lazyObserver.observe(img);
            
            card.onclick = () => this.openMangaPreview(manga.id);
            fragment.appendChild(card);
        });

        grid.appendChild(fragment);

        if (typeof contextMenuManager !== 'undefined' && typeof contextMenuManager.init === 'function') {
            if (!window._contextMenuInitialized) {
                contextMenuManager.init();
                window._contextMenuInitialized = true;
            }
        }
    },
    
    updateMangaCardStats(mangaId) {
        const card = document.querySelector(`.manga-card[data-manga-id="${mangaId}"]`);
        if (!card) return;
        
        const manga = this.allManga.find(m => String(m.id) === String(mangaId));
        if (!manga) return;

        const likesCount = manga.likes || manga.likes_count || 0;
        const commentsCount = manga.comments_count || 0;

        const statsWrap = card.querySelector('.card-right-stats');
        if (statsWrap) {
            statsWrap.innerHTML = `
                <div class="glass-badge badge-stat">❤️ ${likesCount}</div>
                <div class="glass-badge badge-stat">💬 ${commentsCount}</div>
            `;
        }

        const isLiked = this.userLikedIds.includes(String(mangaId));
        const coverWrap = card.querySelector('.card-cover-wrap');
        if (coverWrap) {
            let likeBadge = coverWrap.querySelector('.badge-likes');
            if (isLiked && !likeBadge) {
                const newBadge = document.createElement('div');
                newBadge.className = 'glass-badge badge-likes';
                newBadge.textContent = '❤️';
                coverWrap.appendChild(newBadge);
            } else if (!isLiked && likeBadge) {
                likeBadge.remove();
            }
        }
    },

    updateMangaCardPremiumState(mangaId) {
        const card = document.querySelector(`.manga-card[data-manga-id="${mangaId}"]`);
        if (!card) return;
        
        const manga = this.allManga.find(m => String(m.id) === String(mangaId));
        if (!manga) return;

        const isPurchased = this.userPurchasedIds.includes(String(mangaId));
        
        if (manga.is_paid && isPurchased) {
            card.classList.remove('is-premium');
            const premiumBadge = card.querySelector('.badge-premium');
            if (premiumBadge) premiumBadge.remove();
        }
    },

    filterByGenre(genre) {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        this.selectedGenreTab = genre;
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

    // ИСПРАВЛЕНИЕ: Очистка фильтров без обращения к удаленному элементу
    resetFilters() {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        this.selectedGenreTab = null;
        this.selectedAuthor = "";
        this.sortPopularActive = false;
        
        const sortBtn = document.getElementById('sortBtn');
        if (sortBtn) sortBtn.classList.remove('active');
        
        this.loadCatalog();
    },

    async openMangaPreview(mangaId) {
        const manga = this.allManga.find(m => String(m.id) === String(mangaId));
        if (!manga) return;

        this.currentManga = manga;

        const dynamicBg = document.getElementById('previewBg');
        if (dynamicBg && manga.cover) {
            dynamicBg.style.backgroundImage = `url('${manga.cover}')`;
        }
        
        const previewCover = document.getElementById('previewCover');
        if (previewCover) previewCover.src = manga.cover;
        
        const parsedTitle = this.parseTitle(manga.title);
        document.getElementById('previewTitle').textContent = parsedTitle.main;
        
        const subTitleEl = document.getElementById('previewSubTitle');
        if (subTitleEl) {
            if (parsedTitle.sub) {
                subTitleEl.textContent = parsedTitle.sub;
                subTitleEl.style.display = 'block';
            } else {
                subTitleEl.style.display = 'none';
            }
        }

        const previewTags = document.getElementById('previewTags');
        let authorsList = [];

        if (previewTags) {
            let pTagsHtml = '';
            
            const hasBara = manga.tags && manga.tags.some(t => t.toLowerCase() === 'bara');
            const hasFurry = manga.tags && manga.tags.some(t => t.toLowerCase() === 'furry');

            if (hasBara) pTagsHtml += `<span class="pill-tag tag-bara" style="cursor:default;">BARA</span>`;
            if (hasFurry) pTagsHtml += `<span class="pill-tag tag-furry" style="cursor:default;">FURRY</span>`;
            
            if (manga.author && manga.author !== "Не указан") {
                authorsList = manga.author.split(',').map(a => a.trim());
                authorsList.forEach(a => { 
                    pTagsHtml += `<span class="pill-tag tag-author" style="cursor:default;">👤 ${a}</span>`; 
                });
            }
            previewTags.innerHTML = pTagsHtml;
        }

        this.isCurrentLiked = this.userLikedIds.includes(String(mangaId));
        this.updateLikeButtonUI();

        const likeBtn = document.getElementById('likeBtn');
        if (likeBtn) likeBtn.onclick = () => this.toggleLike();

        const finalLikes = manga.likes || manga.likes_count || 0;
        document.getElementById('previewLikes').textContent = `❤️ ${finalLikes}`;
        document.getElementById('previewComments').textContent = `💬 ${manga.comments_count || 0}`;
        document.getElementById('previewPages').textContent = `📖 ${(manga.pages && Array.isArray(manga.pages)) ? manga.pages.length : 0}`;

        this.updateReadButtonUI();
        this.showScreen('previewScreen');
        this.switchCommentTab('main');
        
        this.loadMoreByAuthors(authorsList, mangaId);

        this.currentManga.cachedComments = [];
        this.currentManga.cachedPagesComments = {};

        const scrollContainer = document.getElementById('commentsScroll');
        if (scrollContainer) {
            scrollContainer.innerHTML = "<p style='color:var(--text-secondary); font-size:14px; text-align:center; padding: 20px;'>Загрузка обсуждения...</p>";
        }

        try {
            const allComments = await api.fetchAllMangaComments(this.currentManga.id);
            
            (allComments || []).forEach(comment => {
                if (comment.page_index === null || comment.page_index === undefined) {
                    this.currentManga.cachedComments.push(comment);
                } else {
                    const pageKey = Number(comment.page_index);
                    if (!this.currentManga.cachedPagesComments[pageKey]) {
                        this.currentManga.cachedPagesComments[pageKey] = [];
                    }
                    this.currentManga.cachedPagesComments[pageKey].push(comment);
                }
            });
        } catch (e) {
            console.error("Ошибка предварительной загрузки кэша комментариев:", e);
        }

        if (this.currentCommentsTab === 'main') {
            this.loadMainComments();
        } else {
            this.loadPagesCommentsPreview();
        }
    },

    async loadMoreByAuthors(authors, excludeId) {
        const section = document.getElementById('moreByAuthorSection');
        const scrollBox = document.getElementById('moreByAuthorScroll');
        if (!section || !scrollBox) return;

        if (!scrollBox.dataset.scrollInitialized) {
            let isDown = false;
            let startX;
            let scrollLeft;
            let isDragging = false; 

            scrollBox.addEventListener('mousedown', (e) => {
                isDown = true;
                isDragging = false;
                scrollBox.style.scrollSnapType = 'none'; 
                startX = e.pageX - scrollBox.offsetLeft;
                scrollLeft = scrollBox.scrollLeft;
            });
            
            scrollBox.addEventListener('mouseleave', () => {
                isDown = false;
                scrollBox.style.scrollSnapType = 'x mandatory'; 
            });
            
            scrollBox.addEventListener('mouseup', () => {
                isDown = false;
                scrollBox.style.scrollSnapType = 'x mandatory';
            });
            
            scrollBox.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - scrollBox.offsetLeft;
                const walk = (x - startX) * 1; 
                if (Math.abs(walk) > 5) isDragging = true; 
                scrollBox.scrollLeft = scrollLeft - walk;
            });

            scrollBox.addEventListener('click', (e) => {
                if (isDragging) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, true);

            scrollBox.addEventListener('wheel', (evt) => {
                if (evt.deltaY !== 0) {
                    evt.preventDefault();
                    scrollBox.style.scrollSnapType = 'none';
                    scrollBox.scrollBy({
                        left: evt.deltaY > 0 ? 180 : -180,
                        behavior: 'smooth'
                    });
                    clearTimeout(scrollBox.snapTimeout);
                    scrollBox.snapTimeout = setTimeout(() => {
                        scrollBox.style.scrollSnapType = 'x mandatory';
                    }, 300);
                }
            });

            scrollBox.dataset.scrollInitialized = 'true';
        }

        if (!authors || authors.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        scrollBox.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Ищем работы...</div>';

        try {
            let results = [];
            for (const author of authors) {
                const res = await api.fetchCatalog({ author: author, limit: 10 });
                results.push(...res);
            }

            const uniqueMap = new Map();
            results.forEach(m => {
                if (String(m.id) !== String(excludeId)) {
                    uniqueMap.set(String(m.id), m);
                }
            });

            const finalManga = Array.from(uniqueMap.values());

            if (finalManga.length === 0) {
                section.style.display = 'none';
                return;
            }

            finalManga.forEach(m => {
                if (!this.allManga.find(x => String(x.id) === String(m.id))) {
                    this.allManga.push(m);
                }
            });

            scrollBox.innerHTML = '';
            finalManga.forEach(m => {
                const isPurchased = this.userPurchasedIds.includes(String(m.id));
                const parsedTitle = this.parseTitle(m.title); 
                
                let cardClass = 'manga-card';
                const mHasBara = m.tags && m.tags.some(t => t.toLowerCase() === 'bara');
                const mHasFurry = m.tags && m.tags.some(t => t.toLowerCase() === 'furry');
                
                if (mHasBara) cardClass += ' manga-bara';
                else if (mHasFurry) cardClass += ' manga-furry';
                if (m.is_paid && !isPurchased) cardClass += ' is-premium';

                const card = document.createElement('div');
                card.className = 'mini-card-wrapper';
                card.innerHTML = `
                    <div class="${cardClass}" style="height: 100%; min-height: 170px;">
                        <div class="card-cover-wrap" style="aspect-ratio: 3/4.2;">
                            ${(m.is_paid && !isPurchased) ? '<div class="glass-badge badge-premium" style="font-size:9px; padding:2px 4px; border-radius:6px; top:4px; left:4px;">🎫</div>' : ''}
                            <img class="card-cover loaded" src="${m.cover}" style="opacity:1;">
                        </div>
                        <div class="card-info" style="padding: 8px; gap: 4px;">
                            <h3 class="card-title" style="font-size: 11px; min-height: 28px; -webkit-line-clamp: 2;">${parsedTitle.main}</h3>
                        </div>
                    </div>
                `;
                card.onclick = () => {
                    document.getElementById('previewScreen').scrollTop = 0; 
                    this.openMangaPreview(m.id);
                };
                scrollBox.appendChild(card);
            });

        } catch (err) {
            console.error("Ошибка загрузки других работ автора:", err);
            section.style.display = 'none';
        }
    },
    
    updateReadButtonUI() {
        const readBtn = document.getElementById('readBtn');
        if (!readBtn || !this.currentManga) return;
        
        const isPurchased = this.userPurchasedIds.includes(String(this.currentManga.id));
        
        if (this.currentManga.is_paid && !isPurchased) {
            const botUsername = "DreamContent_Bot";
            const buyLink = `https://t.me/${botUsername}?start=buy_${this.currentManga.id}_${this.currentManga.price}`;
            
            readBtn.innerHTML = `🔒 Купить за ${this.currentManga.price} 🎫`;
            readBtn.style.background = "linear-gradient(135deg, #FF9F0A, #FF453A)";
            readBtn.style.boxShadow = "0 8px 20px rgba(255, 69, 58, 0.3)";
            readBtn.onclick = () => this.initiatePurchase(buyLink);
        } else {
            readBtn.innerHTML = `Читать`;
            readBtn.style.background = "var(--accent-color)";
            readBtn.style.boxShadow = "0 8px 20px var(--accent-glow)";
            readBtn.onclick = () => this.startReadingManga();
        }
    },
    
    initiatePurchase(url) {
        tg.openTelegramLink(url);
        
        const readBtn = document.getElementById('readBtn');
        if (readBtn) {
            readBtn.innerHTML = `🔄 Проверка...`;
            readBtn.onclick = () => this.checkRecentPurchases(true);
        }
        
        let attempts = 0;
        const poll = setInterval(async () => {
            attempts++;
            if (attempts > 3 || (this.currentManga && this.userPurchasedIds.includes(String(this.currentManga.id)))) {
                clearInterval(poll);
                return;
            }
            await this.checkRecentPurchases(false);
        }, 3000);
    },

    async checkRecentPurchases(showNotification = false) {
        try {
            const updatedPurchases = await api.fetchUserPurchases(this.userId);
            
            let hasNew = false;
            updatedPurchases.forEach(id => {
                if (!this.userPurchasedIds.includes(id)) {
                    this.userPurchasedIds.push(id);
                    hasNew = true;
                }
            });

            if (hasNew) {
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
                this.updateReadButtonUI(); 
                this.updateMangaCardPremiumState(this.currentManga.id);
                
                if (showNotification && this.currentManga && this.userPurchasedIds.includes(String(this.currentManga.id))) {
                    this.startReadingManga();
                }
            } else {
                if (showNotification) {
                    alert("⚠️ Оплата еще не прошла. Завершите транзакцию в боте и подождите пару секунд.");
                }
            }
        } catch (e) {
            console.error("Ошибка проверки покупок", e);
        }
    },
    
    async toggleLike() {
        if (!this.currentManga) return;
        const mangaId = String(this.currentManga.id);

        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
        
        if (document.activeElement) document.activeElement.blur();

        const wasLiked = this.isCurrentLiked;

        if (wasLiked) {
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
        
        this.updateMangaCardStats(mangaId);

        try {
            await api.toggleLike(this.userId, mangaId, wasLiked);
        } catch (e) {
            console.error("Ошибка при переключении лайка:", e);
        }
    },

    updateLikeButtonUI() {
        const btn = document.getElementById('likeBtn');
        if (!btn) return;
        
        if (this.isCurrentLiked) {
            btn.classList.add('active');
            btn.textContent = "❤️";
        } else {
            btn.classList.remove('active');
            btn.textContent = "🤍";
        }
    },

    startReadingManga() {
        if (!this.currentManga) return;
        
        const isPurchased = this.userPurchasedIds.includes(String(this.currentManga.id));
        if (this.currentManga.is_paid && !isPurchased) {
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
            this.checkRecentPurchases(true);
            return;
        }

        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        if (document.activeElement) document.activeElement.blur();

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

    loadMainComments() {
        const container = document.getElementById('commentsScroll');
        if (!container) return;

        const commentsList = this.currentManga.cachedComments || [];

        if (commentsList.length === 0) {
            container.innerHTML = "<p style='color:var(--text-secondary); font-size:14px; text-align:center; padding: 20px;'>У этого тайтла пока нет комментариев.</p>";
            return;
        }

        container.innerHTML = "";
        commentsList.forEach(c => {
            const item = document.createElement('div');
            item.className = 'comment-item';
            const isMyComment = Number(c.user_id) === Number(this.userId);
            const delBtnHtml = isMyComment ? `<span style="color:var(--danger-color); cursor:pointer;" onclick="app.deleteMainComment('${c.id}')">🗑</span>` : '';
            const timeString = this.formatCommentTime(c.created_at);

            item.innerHTML = `
                <div class="comment-header">
                    <span class="c-name">${c.user_name}</span>
                    <div><span class="c-time">${timeString}</span> ${delBtnHtml}</div>
                </div>
                <div class="c-text">${c.text}</div>
            `;
            container.appendChild(item);
        });
    },

    switchCommentTab(tabName) {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        this.currentCommentsTab = tabName;
        
        const btnMain = document.getElementById('tabMain');
        const btnPages = document.getElementById('tabPages');
        const inputBlock = document.getElementById('mainCommentInputBlock');
        
        if (tabName === 'main') {
            if(btnMain) btnMain.classList.add('active');
            if(btnPages) btnPages.classList.remove('active');
            if(inputBlock) inputBlock.style.display = 'flex'; 
            this.loadMainComments();
        } else {
            if(btnPages) btnPages.classList.add('active');
            if(btnMain) btnMain.classList.remove('active');
            if(inputBlock) inputBlock.style.display = 'none'; 
            this.loadPagesCommentsPreview();
        }
    },

    loadPagesCommentsPreview() {
        const container = document.getElementById('commentsScroll');
        if (!container) return;

        const pagesComments = this.currentManga.cachedPagesComments || {};
        let allPageComments = [];
        
        Object.keys(pagesComments).forEach(pageIndex => {
            pagesComments[pageIndex].forEach(c => {
                allPageComments.push(c);
            });
        });

        allPageComments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (allPageComments.length === 0) {
            container.innerHTML = "<p style='color:var(--text-secondary); font-size:14px; text-align:center; padding: 20px;'>Читатели еще не оставляли комментариев на страницах этого тайтла.</p>";
            return;
        }

        container.innerHTML = "";
        allPageComments.forEach(c => {
            const item = document.createElement('div');
            item.className = 'comment-item';
            const timeString = this.formatCommentTime(c.created_at);
            const pageNumber = parseInt(c.page_index) + 1; 

            item.innerHTML = `
                <div class="comment-header">
                    <div>
                        <span class="c-name">${c.user_name}</span>
                        <span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:6px; margin-left:6px; font-size:10px;">Стр. ${pageNumber}</span>
                    </div>
                    <div><span class="c-time">${timeString}</span></div>
                </div>
                <div class="c-text">${c.text}</div>
            `;
            container.appendChild(item);
        });
    },

    async sendMainComment() {
        const input = document.getElementById('mainCommentInputField');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        try {
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            
            const serverComment = await api.addComment(this.currentManga.id, null, this.userId, this.userName, text);
            input.value = "";
            
            if (this.currentManga.comments_count !== undefined) {
                this.currentManga.comments_count++;
            } else {
                this.currentManga.comments_count = 1;
            }

            if (serverComment) {
                this.currentManga.cachedComments.unshift(serverComment);
            }

            document.getElementById('previewComments').textContent = `💬 ${this.currentManga.comments_count}`;
            this.updateMangaCardStats(this.currentManga.id);
            this.loadMainComments();
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
                
                this.currentManga.cachedComments = this.currentManga.cachedComments.filter(c => String(c.id) !== String(commentId));
                document.getElementById('previewComments').textContent = `💬 ${this.currentManga.comments_count}`;
                this.updateMangaCardStats(this.currentManga.id);
                this.loadMainComments();
            } catch (e) {
                alert("Не удалось удалить комментарий.");
            }
        }
    },

    async refreshCommentsSilently() {
        if (!this.currentManga) return;
        try {
            const allComments = await api.fetchAllMangaComments(this.currentManga.id);
            this.currentManga.cachedComments = [];
            this.currentManga.cachedPagesComments = {};
            
            let totalComments = 0;
            (allComments || []).forEach(comment => {
                totalComments++;
                if (comment.page_index === null || comment.page_index === undefined) {
                    this.currentManga.cachedComments.push(comment);
                } else {
                    const pageKey = Number(comment.page_index);
                    if (!this.currentManga.cachedPagesComments[pageKey]) {
                        this.currentManga.cachedPagesComments[pageKey] = [];
                    }
                    this.currentManga.cachedPagesComments[pageKey].push(comment);
                }
            });
            
            this.currentManga.comments_count = totalComments;
            const previewCommentsEl = document.getElementById('previewComments');
            if (previewCommentsEl) {
                previewCommentsEl.textContent = `💬 ${totalComments}`;
            }

            this.updateMangaCardStats(this.currentManga.id);

            if (this.currentCommentsTab === 'main') {
                this.loadMainComments();
            } else {
                if(typeof this.loadPagesCommentsPreview === 'function') this.loadPagesCommentsPreview();
            }
        } catch (e) {
            console.error("Ошибка фонового обновления комментов:", e);
        }
    },

    closeMangaReader() {
        if (typeof reader !== 'undefined' && reader.toggleComments) {
            reader.toggleComments(false);
        }
        
        if (typeof reader !== 'undefined' && reader.destroy) {
            reader.destroy();
        }
        
        this.showScreen('previewScreen');
        
        this.refreshCommentsSilently();
        
        if (tg.BackButton) {
            tg.BackButton.show();
            setTimeout(() => {
                if (document.getElementById('previewScreen').classList.contains('active')) {
                    tg.BackButton.show();
                }
            }, 50);
        }
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        
        const readerScreen = document.getElementById('readerScreen');
        const readerHeader = document.getElementById('readerHeader');
        
        if (screenId !== 'readerScreen') {
            if (readerScreen) {
                readerScreen.classList.remove('active');
            }
            if (readerHeader) {
                readerHeader.style.pointerEvents = 'none';
                readerHeader.style.opacity = '0';
            }
        } else {
            if (readerHeader) {
                readerHeader.style.pointerEvents = 'auto';
                readerHeader.style.opacity = '1';
            }
        }

        const targetScreen = document.getElementById(screenId);
        if (targetScreen) targetScreen.classList.add('active');
        
        if (tg.BackButton) {
            if (screenId === 'mainScreen') {
                tg.BackButton.hide();
            } else {
                tg.BackButton.show();
                tg.BackButton.offClick(); 
                
                if (screenId === 'readerScreen') {
                    tg.BackButton.onClick(() => { this.closeMangaReader(); });
                } else if (screenId === 'previewScreen') {
                    tg.BackButton.onClick(() => { this.showScreen('mainScreen'); });
                }
            }
        }
    }
};

window.app = app; 
window.onload = () => app.init();