const reader = {
    mangaId: null,
    pages: [],
    currentIndex: 0,
    isGesturesInitialized: false,
    isPCControlsInitialized: false,
    
    // Переменные зума
    scale: 1,
    lastScale: 1,
    currentX: 0,
    currentY: 0,
    
    preloadQueue: [], 
    preloadedUrls: new Set(),
    isBackgroundLoading: false,

    renderPages(mangaId, pagesArray) {
        this.mangaId = mangaId;
        this.pages = pagesArray;
        this.currentIndex = 0;
        this.resetZoom();

        const track = document.getElementById('readerTrack');
        if (!track) return;
        track.innerHTML = "";

        this.pages.forEach((pageUrl, index) => {
            const slide = document.createElement('div');
            slide.className = 'reader-slide';
            slide.innerHTML = `
                <div class="zoom-container" id="zoomContainer-${index}">
                    <div class="reader-skeleton" id="skeleton-${index}">
                        <div class="reader-skeleton-inner skeleton-blink"></div>
                    </div>
                    <img class="reader-img" src="${pageUrl}" draggable="false" 
                         onload="const sk = document.getElementById('skeleton-${index}'); if(sk) sk.classList.add('skeleton-hidden');">
                </div>
            `;
            track.appendChild(slide);
        });

        this.updateTrack();
        this.preloadQueue = [];
        this.preloadedUrls = new Set();
        this.isBackgroundLoading = false;

        if (this.pages[0]) this.preloadedUrls.add(this.pages[0]);
        this.managePreload();

        if (!this.isGesturesInitialized) {
            this.initTouchGestures();
            this.isGesturesInitialized = true;
        }

        if (!this.isPCControlsInitialized) {
            this.initKeyboardControls();
            this.initClickZones();
            this.isPCControlsInitialized = true;
        }
    },
    
    applyZoom(scale, x = 0, y = 0) {
        this.scale = Math.max(1, Math.min(scale, 3));
        this.currentX = x;
        this.currentY = y;
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (container) {
            container.style.transition = this.scale === 1 ? 'transform 0.2s' : 'none';
            container.style.transform = `scale(${this.scale}) translate(${this.currentX}px, ${this.currentY}px)`;
            
            // Скрытие элементов интерфейса при приближении
            const uiElements = document.querySelectorAll('.reader-ui, .open-comments-trigger-btn');
            uiElements.forEach(el => el.style.opacity = this.scale > 1 ? '0' : '1');
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
        // Показываем UI элементы
        const uiElements = document.querySelectorAll('.reader-ui, .open-comments-trigger-btn');
        uiElements.forEach(el => el.style.opacity = '1');
    },

    initTouchGestures() {
        const track = document.getElementById('readerTrack');
        if (!track) return;
        
        let initialPinchDist = 0;
        let initialScale = 1;
        let touchStartX = 0;
        let touchStartY = 0;
        let isPinching = false;
        let lastTap = 0;

        // Удаляем старые обработчики, чтобы избежать дублирования
        track.removeEventListener('touchstart', this._touchStartHandler);
        track.removeEventListener('touchmove', this._touchMoveHandler);
        track.removeEventListener('touchend', this._touchEndHandler);
        track.removeEventListener('click', this._clickHandler);

        // Сохраняем ссылки на обработчики для возможности удаления
        this._touchStartHandler = (e) => {
            if (e.touches.length === 2) {
                // Начало жеста зума
                isPinching = true;
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                initialPinchDist = Math.hypot(
                    touch1.clientX - touch2.clientX,
                    touch1.clientY - touch2.clientY
                );
                initialScale = this.scale;
                e.preventDefault();
            } else if (e.touches.length === 1 && this.scale === 1) {
                // Запоминаем начальную позицию для свайпа
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        };

        this._touchMoveHandler = (e) => {
            if (e.touches.length === 2 && isPinching) {
                // Обработка зума (пинч)
                e.preventDefault();
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDist = Math.hypot(
                    touch1.clientX - touch2.clientX,
                    touch1.clientY - touch2.clientY
                );
                
                if (initialPinchDist > 0) {
                    const newScale = Math.max(1, Math.min(3, initialScale * (currentDist / initialPinchDist)));
                    this.applyZoom(newScale);
                }
            }
        };

        this._touchEndHandler = (e) => {
            // Сброс состояния пинча
            if (isPinching) {
                isPinching = false;
                this.lastScale = this.scale;
                return;
            }

            // Обработка свайпа только если масштаб 1:1
            if (this.scale === 1 && e.changedTouches.length === 1) {
                const diffX = touchStartX - e.changedTouches[0].clientX;
                const diffY = touchStartY - e.changedTouches[0].clientY;
                
                // Проверяем, что свайп горизонтальный (по X больше, чем по Y)
                if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                    if (diffX > 0 && this.currentIndex < this.pages.length - 1) {
                        this.currentIndex++;
                        this.updateTrack();
                    } else if (diffX < 0 && this.currentIndex > 0) {
                        this.currentIndex--;
                        this.updateTrack();
                    }
                }
            }
        };

        this._clickHandler = (e) => {
            // Если открыты комментарии — только закрываем их и не перелистываем страницу
            const panel = document.getElementById('commentsPanel');
            if (panel && panel.classList.contains('open')) {
                this.toggleComments(false);
                return;
            }

            // Если картинка приближена — игнорируем клики для листания
            if (this.scale > 1) return;
            if (e.target.closest('button')) return;

            // Двойной тап для зума
            const now = new Date().getTime();
            if (now - lastTap < 300) {
                e.preventDefault();
                if (this.scale > 1) {
                    this.resetZoom();
                } else {
                    this.applyZoom(2);
                }
                lastTap = 0;
                return;
            }
            lastTap = now;

            // Обычный клик для перелистывания
            const screenWidth = window.innerWidth;
            const clickX = e.clientX;

            if (clickX > screenWidth * 0.7 && this.currentIndex < this.pages.length - 1) {
                this.currentIndex++;
                this.updateTrack();
            } else if (clickX < screenWidth * 0.3 && this.currentIndex > 0) {
                this.currentIndex--;
                this.updateTrack();
            }
        };

        // Добавляем новые обработчики
        track.addEventListener('touchstart', this._touchStartHandler, { passive: false });
        track.addEventListener('touchmove', this._touchMoveHandler, { passive: false });
        track.addEventListener('touchend', this._touchEndHandler, { passive: true });
        track.addEventListener('click', this._clickHandler);
    },

    initClickZones() {
        // Этот метод теперь объединен с initTouchGestures
        // Оставляем только для совместимости
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
        this.managePreload();
    },
    
    managePreload() {
        if (!this.pages || this.pages.length === 0) return;

        // ПРИОРИТЕТ 1: Горячая зона — 3 страницы строго перед глазами пользователя
        const nextPagesCount = 3; 
        const priorityIndices = [];

        for (let i = 1; i <= nextPagesCount; i++) {
            const nextIndex = this.currentIndex + i;
            if (nextIndex < this.pages.length) {
                priorityIndices.push(nextIndex);
            }
        }

        // Параллельно запускаем скачивание приоритетных страниц
        priorityIndices.forEach(index => {
            this.preloadSingleUrl(this.pages[index], true);
        });

        // ПРИОРИТЕТ 2: Фоновый догруз всего остального тайтла (строго по очереди)
        this.preloadRemainingSequentially();
    },

    preloadSingleUrl(url, isPriority = false) {
        if (this.preloadedUrls.has(url)) return Promise.resolve();

        return new Promise((resolve) => {
            this.preloadedUrls.add(url);
            const img = new Image();
            
            img.onload = () => {
                if (isPriority) {
                    console.log(`[Preloader] Приоритетная страница загружена: ${url.substring(url.lastIndexOf('/'))}`);
                }
                resolve();
            };
            img.onerror = () => {
                this.preloadedUrls.delete(url); 
                resolve();
            };
            
            img.src = url;
            this.preloadQueue.push(img);
        });
    },

    async preloadRemainingSequentially() {
        if (this.isBackgroundLoading) return;
        this.isBackgroundLoading = true;

        for (let i = 0; i < this.pages.length; i++) {
            const url = this.pages[i];
            
            if (!this.preloadedUrls.has(url)) {
                await this.preloadSingleUrl(url, false);
            }
        }

        this.isBackgroundLoading = false;
    },

    initKeyboardControls() {
        // Удаляем старый обработчик, чтобы избежать дублирования
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

    // Загрузка комментариев для текущей страницы
    loadCommentsForCurrentPage() {
        // Эта функция будет вызываться из app.js
        // Реализация в app.js
    }
};
