const reader = {
    mangaId: null,
    pages: [],
    currentIndex: 0,
    isGesturesInitialized: false,
    isPCControlsInitialized: false,
    
    scale: 1,
    lastScale: 1,
    currentX: 0,
    currentY: 0,
    
    // Управление предзагрузкой
    preloadedUrls: new Set(),
    _preloadTimer: null,
    _preloadCount: 5,

    _touchStarted: false,
    _touchMoved: false,
    _lastTouchTime: 0,
    _isPinching: false,
    _initialPinchDist: 0,
    _initialScale: 1,
    _touchStartX: 0,
    _touchStartY: 0,
    _touchEndX: 0,
    _touchEndY: 0,

    renderPages(mangaId, pagesArray) {
        this.mangaId = mangaId;
        this.pages = pagesArray;
        this.currentIndex = 0;
        this.resetZoom();
        
        // Очистка состояния предзагрузки
        this.preloadedUrls = new Set();
        if (this._preloadTimer) {
            clearTimeout(this._preloadTimer);
            this._preloadTimer = null;
        }

        const track = document.getElementById('readerTrack');
        if (!track) return;
        track.innerHTML = "";

        // Создаём слайды без атрибута loading="lazy"
        const fragment = document.createDocumentFragment();
        this.pages.forEach((pageUrl, index) => {
            const slide = document.createElement('div');
            slide.className = 'reader-slide';
            slide.innerHTML = `
                <div class="zoom-container" id="zoomContainer-${index}">
                    <div class="reader-skeleton" id="skeleton-${index}">
                        <div class="reader-skeleton-inner skeleton-blink"></div>
                    </div>
                    <img class="reader-img" id="readerImg-${index}" 
                         draggable="false" 
                         style="opacity:0; transition:opacity 0.3s ease;">
                </div>
            `;
            fragment.appendChild(slide);
        });
        track.appendChild(fragment);

        // Обновляем трек (без вызова предзагрузки, чтобы не мешать)
        this._updateTrackOnly();

        // Инициализация жестов и кликов (один раз)
        if (!this.isGesturesInitialized) {
            this.initTouchGestures();
            this.isGesturesInitialized = true;
        }

        if (!this.isPCControlsInitialized) {
            this.initKeyboardControls();
            this.initClickZones();
            this.isPCControlsInitialized = true;
        }

        // Загружаем первую страницу сразу и начинаем предзагрузку
        this._loadPageImage(0);
        this._preloadPages(1);
    },

    // Только обновление трека без предзагрузки
    _updateTrackOnly() {
        const track = document.getElementById('readerTrack');
        if (!track) return;
        track.style.transform = `translate3d(-${this.currentIndex * 100}vw, 0px, 0px)`;
        
        const counter = document.getElementById('pageCounter');
        if (counter) counter.textContent = `${this.currentIndex + 1} / ${this.pages.length}`;
    },

    // Простая предзагрузка: загружаем страницы начиная с startIndex
    _preloadPages(startIndex) {
        if (!this.pages || this.pages.length === 0) return;
        if (startIndex >= this.pages.length) return;
        
        // Определяем, сколько страниц загрузить (не больше, чем есть)
        const count = Math.min(this._preloadCount, this.pages.length - startIndex);
        if (count <= 0) return;

        // Загружаем страницы с интервалом 150 мс
        let index = startIndex;
        const loadNext = () => {
            if (index >= startIndex + count) {
                // После загрузки первой партии, если есть ещё страницы – загружаем следующую порцию
                const nextStart = startIndex + this._preloadCount;
                if (nextStart < this.pages.length) {
                    this._preloadTimer = setTimeout(() => {
                        this._preloadPages(nextStart);
                    }, 400);
                }
                return;
            }

            // Загружаем конкретную страницу
            this._loadPageImage(index);
            index++;
            // Задержка между загрузками
            this._preloadTimer = setTimeout(loadNext, 150);
        };

        loadNext();
    },

    // Загрузка одной страницы по индексу
    _loadPageImage(index) {
        const img = document.getElementById(`readerImg-${index}`);
        if (!img) return;

        const url = this.pages[index];
        if (!url) return;

        // Если уже загружено – показываем
        if (this.preloadedUrls.has(url)) {
            if (img.style.opacity === '0' || img.style.opacity === 0) {
                img.style.opacity = '1';
                const sk = document.getElementById(`skeleton-${index}`);
                if (sk) sk.classList.add('skeleton-hidden');
            }
            return;
        }

        // Начинаем загрузку
        this.preloadedUrls.add(url);
        img.src = url;
        
        // Обработчик успешной загрузки
        img.onload = () => {
            img.style.opacity = '1';
            const sk = document.getElementById(`skeleton-${index}`);
            if (sk) sk.classList.add('skeleton-hidden');
        };
        
        // Обработчик ошибки
        img.onerror = () => {
            this.preloadedUrls.delete(url);
            // Показываем скелетон с ошибкой (можно оставить как есть)
        };
    },

    applyZoom(scale, x = 0, y = 0) {
        this.scale = Math.max(1, Math.min(scale, 3));
        this.currentX = x;
        this.currentY = y;
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (container) {
            container.style.willChange = 'transform';
            container.style.transition = this.scale === 1 ? 'transform 0.2s' : 'none';
            container.style.transform = `scale(${this.scale}) translate(${this.currentX}px, ${this.currentY}px)`;
            
            const uiElements = document.querySelectorAll('.reader-ui, .open-comments-trigger-btn, .reader-header');
            uiElements.forEach(el => {
                if (el) {
                    el.style.opacity = this.scale > 1 ? '0' : '1';
                    el.style.pointerEvents = this.scale > 1 ? 'none' : 'auto';
                }
            });
        }
    },

    resetZoom() {
        this.scale = 1;
        this.currentX = 0;
        this.currentY = 0;
        this.lastScale = 1;
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (container) {
            container.style.transition = 'transform 0.2s';
            container.style.transform = 'scale(1) translate(0px, 0px)';
        }
        const uiElements = document.querySelectorAll('.reader-ui, .open-comments-trigger-btn, .reader-header');
        uiElements.forEach(el => {
            if (el) {
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto';
            }
        });
    },

    initTouchGestures() {
        const track = document.getElementById('readerTrack');
        if (!track) return;

        track.removeEventListener('touchstart', this._handleTouchStart);
        track.removeEventListener('touchmove', this._handleTouchMove);
        track.removeEventListener('touchend', this._handleTouchEnd);
        track.removeEventListener('touchcancel', this._handleTouchEnd);

        this._handleTouchStart = this._onTouchStart.bind(this);
        this._handleTouchMove = this._onTouchMove.bind(this);
        this._handleTouchEnd = this._onTouchEnd.bind(this);

        track.addEventListener('touchstart', this._handleTouchStart, { passive: true });
        track.addEventListener('touchmove', this._handleTouchMove, { passive: false });
        track.addEventListener('touchend', this._handleTouchEnd, { passive: true });
        track.addEventListener('touchcancel', this._handleTouchEnd, { passive: true });
    },

    _onTouchStart(e) {
        this._touchStarted = true;
        this._touchMoved = false;
        
        const touches = e.touches;
        
        if (touches.length === 2) {
            this._isPinching = true;
            this._initialScale = this.scale;
            const touch1 = touches[0];
            const touch2 = touches[1];
            this._initialPinchDist = Math.hypot(
                touch1.clientX - touch2.clientX,
                touch1.clientY - touch2.clientY
            );
            e.preventDefault();
        } else if (touches.length === 1) {
            this._isPinching = false;
            this._touchStartX = touches[0].clientX;
            this._touchStartY = touches[0].clientY;
            this._touchEndX = this._touchStartX;
            this._touchEndY = this._touchStartY;
        }
    },

    _onTouchMove(e) {
        if (!this._touchStarted) return;
        
        const touches = e.touches;
        
        if (touches.length === 2 && this._isPinching) {
            e.preventDefault();
            this._touchMoved = true;
            
            const touch1 = touches[0];
            const touch2 = touches[1];
            const currentDist = Math.hypot(
                touch1.clientX - touch2.clientX,
                touch1.clientY - touch2.clientY
            );
            
            if (this._initialPinchDist > 0) {
                const newScale = Math.max(1, Math.min(3, this._initialScale * (currentDist / this._initialPinchDist)));
                this.applyZoom(newScale);
            }
        } else if (touches.length === 1 && !this._isPinching) {
            this._touchMoved = true;
            this._touchEndX = touches[0].clientX;
            this._touchEndY = touches[0].clientY;
        }
    },

    _onTouchEnd(e) {
        if (!this._touchStarted) return;
        this._touchStarted = false;
        
        if (this._isPinching) {
            this._isPinching = false;
            this.lastScale = this.scale;
            return;
        }

        if (this._touchMoved && !this._isPinching && this.scale === 1) {
            const diffX = this._touchStartX - this._touchEndX;
            const diffY = this._touchStartY - this._touchEndY;
            
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                if (diffX > 0 && this.currentIndex < this.pages.length - 1) {
                    this.currentIndex++;
                    this.updateTrack();
                } else if (diffX < 0 && this.currentIndex > 0) {
                    this.currentIndex--;
                    this.updateTrack();
                }
                this._touchMoved = false;
            }
        }
        
        if (!this._touchMoved && !this._isPinching) {
            const now = Date.now();
            if (now - this._lastTouchTime < 300) {
                e.preventDefault();
                if (this.scale > 1) {
                    this.resetZoom();
                } else {
                    this.applyZoom(2);
                }
                this._lastTouchTime = 0;
                return;
            }
            this._lastTouchTime = now;
        }
        
        this._touchMoved = false;
    },

    initClickZones() {
        const track = document.getElementById('readerTrack');
        if (!track) return;

        track.removeEventListener('click', this._handleClick);
        
        this._handleClick = this._onClick.bind(this);
        track.addEventListener('click', this._handleClick);
    },

    _onClick(e) {
        const panel = document.getElementById('commentsPanel');
        if (panel && panel.classList.contains('open')) {
            this.toggleComments(false);
            return;
        }

        if (this.scale > 1) return;
        if (e.target.closest('button')) return;
        if (this._touchStarted || this._touchMoved) return;

        const screenWidth = window.innerWidth;
        const clickX = e.clientX;

        if (clickX > screenWidth * 0.7 && this.currentIndex < this.pages.length - 1) {
            this.currentIndex++;
            this.updateTrack();
        } else if (clickX < screenWidth * 0.3 && this.currentIndex > 0) {
            this.currentIndex--;
            this.updateTrack();
        }
    },

    updateTrack() {
        this.resetZoom();
        const track = document.getElementById('readerTrack');
        if (!track) return;
        track.style.transform = `translate3d(-${this.currentIndex * 100}vw, 0px, 0px)`;
        
        const counter = document.getElementById('pageCounter');
        if (counter) counter.textContent = `${this.currentIndex + 1} / ${this.pages.length}`;
        
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }

        const commentsPanel = document.getElementById('commentsPanel');
        if (commentsPanel?.classList.contains('open')) {
            document.getElementById('commentsTitle').textContent = `Комментарии (стр. ${this.currentIndex + 1})`;
            this.loadCommentsForCurrentPage?.();
        }

        // Загружаем текущую страницу (если ещё не загружена)
        this._loadPageImage(this.currentIndex);
        
        // Предзагружаем следующие страницы
        this._preloadPages(this.currentIndex + 1);
        
        // Также загружаем предыдущую страницу, если пользователь вернётся назад
        if (this.currentIndex > 0) {
            this._loadPageImage(this.currentIndex - 1);
        }
    },

    initKeyboardControls() {
        if (this._keydownHandler) {
            window.removeEventListener('keydown', this._keydownHandler);
        }

        this._keydownHandler = (event) => {
            const readerScreen = document.getElementById('readerScreen');
            if (!readerScreen || !readerScreen.classList.contains('active')) return;

            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
                return;
            }

            if (event.key === 'ArrowRight') {
                if (this.currentIndex < this.pages.length - 1) {
                    this.currentIndex++;
                    this.resetZoom();
                    this.updateTrack();
                }
            } else if (event.key === 'ArrowLeft') {
                if (this.currentIndex > 0) {
                    this.currentIndex--;
                    this.resetZoom();
                    this.updateTrack();
                }
            }
        };

        window.addEventListener('keydown', this._keydownHandler);
    },

    toggleComments(show) {
        const panel = document.getElementById('commentsPanel');
        if (!panel) return;
        if (show) {
            panel.classList.add('open');
            document.getElementById('commentsTitle').textContent = `Комментарии к странице ${this.currentIndex + 1}`;
            this.loadCommentsForCurrentPage?.();
        } else {
            panel.classList.remove('open');
        }
    },

    async loadCommentsForCurrentPage() {
        if (!this.mangaId || this.pages.length === 0) return;
        
        const container = document.getElementById('pageCommentsScroll');
        if (!container) return;
        
        container.innerHTML = "<p style='color:#777; font-size:13px; text-align:center;'>Загрузка комментариев...</p>";
        
        try {
            const comments = await api.fetchPageComments(this.mangaId, this.currentIndex);
            
            if (!comments || comments.length === 0) {
                container.innerHTML = "<p style='color:#777; font-size:13px; text-align:center;'>Нет комментариев к этой странице.</p>";
                return;
            }
            
            container.innerHTML = "";
            comments.forEach(c => {
                const item = document.createElement('div');
                item.className = 'comment-item';
                const isMyComment = Number(c.user_id) === Number(window.app?.userId || 0);
                const delBtnHtml = isMyComment ? `<button class="comment-del-btn" onclick="reader.deletePageComment('${c.id}')">🗑 Удалить</button>` : '';
                
                const timeString = window.app?.formatCommentTime(c.created_at) || '';
                
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
            container.innerHTML = "<span style='color:#ff3b30;'>Не удалось загрузить комментарии.</span>";
        }
    },

    async sendPageComment() {
        const input = document.getElementById('pageCommentInputField');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const userId = window.app?.userId || 0;
        const userName = window.app?.userName || "Читатель";

        try {
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
            await api.addComment(this.mangaId, this.currentIndex, userId, userName, text);
            input.value = "";
            await this.loadCommentsForCurrentPage();
        } catch(e) {
            alert("Не удалось отправить комментарий.");
        }
    },

    async deletePageComment(commentId) {
        if (confirm("Удалить ваш комментарий?")) {
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
            }
            const userId = window.app?.userId || 0;
            await api.deleteComment(commentId, userId);
            this.loadCommentsForCurrentPage();
        }
    },

    destroy() {
        if (this._preloadTimer) {
            clearTimeout(this._preloadTimer);
            this._preloadTimer = null;
        }
        this.preloadedUrls.clear();
        
        const track = document.getElementById('readerTrack');
        if (track) track.innerHTML = "";
        
        const panel = document.getElementById('commentsPanel');
        if (panel) panel.classList.remove('open');
        
        this.currentIndex = 0;
        this.pages = [];
        this.mangaId = null;
    }
};