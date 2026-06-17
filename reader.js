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

    // Флаги для отслеживания состояния касаний
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
        // Показываем UI элементы
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

        // Удаляем старые обработчики
        track.removeEventListener('touchstart', this._handleTouchStart);
        track.removeEventListener('touchmove', this._handleTouchMove);
        track.removeEventListener('touchend', this._handleTouchEnd);
        track.removeEventListener('touchcancel', this._handleTouchEnd);

        // Создаем привязанные обработчики
        this._handleTouchStart = this._onTouchStart.bind(this);
        this._handleTouchMove = this._onTouchMove.bind(this);
        this._handleTouchEnd = this._onTouchEnd.bind(this);

        // Добавляем обработчики
        track.addEventListener('touchstart', this._handleTouchStart, { passive: false });
        track.addEventListener('touchmove', this._handleTouchMove, { passive: false });
        track.addEventListener('touchend', this._handleTouchEnd, { passive: true });
        track.addEventListener('touchcancel', this._handleTouchEnd, { passive: true });
    },

    _onTouchStart(e) {
        this._touchStarted = true;
        this._touchMoved = false;
        
        const touches = e.touches;
        
        if (touches.length === 2) {
            // Начало пинча (зум)
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
            // Начало свайпа
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
            // Обработка пинча
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
            // Обновляем позицию для свайпа
            this._touchMoved = true;
            this._touchEndX = touches[0].clientX;
            this._touchEndY = touches[0].clientY;
        }
    },

    _onTouchEnd(e) {
        if (!this._touchStarted) return;
        this._touchStarted = false;
        
        // Сброс состояния пинча
        if (this._isPinching) {
            this._isPinching = false;
            this.lastScale = this.scale;
            return;
        }

        // Если было движение и это не пинч - проверяем на свайп
        if (this._touchMoved && !this._isPinching && this.scale === 1) {
            const diffX = this._touchStartX - this._touchEndX;
            const diffY = this._touchStartY - this._touchEndY;
            
            // Свайп только если движение по горизонтали больше, чем по вертикали
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
        
        // Проверка на двойной тап (только если не было движения)
        if (!this._touchMoved && !this._isPinching) {
            const now = Date.now();
            if (now - this._lastTouchTime < 300) {
                // Двойной тап
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

        // Удаляем старый обработчик
        track.removeEventListener('click', this._handleClick);
        
        this._handleClick = this._onClick.bind(this);
        track.addEventListener('click', this._handleClick);
    },

    _onClick(e) {
        // Если открыты комментарии — только закрываем их и не перелистываем страницу
        const panel = document.getElementById('commentsPanel');
        if (panel && panel.classList.contains('open')) {
            this.toggleComments(false);
            return;
        }

        // Если картинка приближена — игнорируем клики для листания
        if (this.scale > 1) return;
        if (e.target.closest('button')) return;

        // Игнорируем клики, если было касание (для мобильных)
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
        this.managePreload();
    },
    
    managePreload() {
        if (!this.pages || this.pages.length === 0) return;

        const nextPagesCount = 3; 
        const priorityIndices = [];

        for (let i = 1; i <= nextPagesCount; i++) {
            const nextIndex = this.currentIndex + i;
            if (nextIndex < this.pages.length) {
                priorityIndices.push(nextIndex);
            }
        }

        priorityIndices.forEach(index => {
            this.preloadSingleUrl(this.pages[index], true);
        });

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

    loadCommentsForCurrentPage() {
        // Эта функция будет вызываться из app.js
    }
};
