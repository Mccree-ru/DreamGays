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
        this.applyZoom(1, 0, 0);
    },

    initTouchGestures() {
        const track = document.getElementById('readerTrack');
        let initialPinchDist = 0;
        let touchStartX = 0;

        track.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                initialPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            } else if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
            }
        }, { passive: false });

        track.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && this.scale > 1) {
                e.preventDefault();
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                this.applyZoom(this.lastScale * (dist / initialPinchDist));
            }
        }, { passive: false });

        track.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) this.lastScale = this.scale;
            
            // Перелистывание только если масштаб 1:1
            if (this.scale === 1 && e.changedTouches.length === 1) {
                const diffX = touchStartX - e.changedTouches[0].clientX;
                if (Math.abs(diffX) > 60) {
                    if (diffX > 0 && this.currentIndex < this.pages.length - 1) {
                        this.currentIndex++;
                        this.updateTrack();
                    } else if (diffX < 0 && this.currentIndex > 0) {
                        this.currentIndex--;
                        this.updateTrack();
                    }
                }
            }
        });

        // Двойной тап для зума
        let lastTap = 0;
        track.addEventListener('click', (e) => {
            const now = new Date().getTime();
            if (now - lastTap < 300) {
                this.scale > 1 ? this.resetZoom() : this.applyZoom(2);
            }
            lastTap = now;
        });
    },

    initClickZones() {
        const track = document.getElementById('readerTrack');
        if (!track) return;

        track.addEventListener('click', (event) => {
            // Если открыты комментарии — только закрываем их и не перелистываем страницу
            const panel = document.getElementById('commentsPanel');
            if (panel && panel.classList.contains('open')) {
                this.toggleComments(false);
                return;
            }

            // Если картинка приближена — игнорируем клики для листания
            if (this.scale > 1) return;
            if (event.target.closest('button')) return;

            const screenWidth = window.innerWidth;
            const clickX = event.clientX;

            if (clickX > screenWidth * 0.7 && this.currentIndex < this.pages.length - 1) {
                this.currentIndex++;
                this.updateTrack();
            } else if (clickX < screenWidth * 0.3 && this.currentIndex > 0) {
                this.currentIndex--;
                this.updateTrack();
            }
        });
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
	
    // Умное управление приоритетами загрузки фреймов
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

    // Асинхронное скачивание одного изображения
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
                // Если произошла сетевая ошибка — даем шанс скачать картинку заново при листании
                this.preloadedUrls.delete(url); 
                resolve();
            };
            
            img.src = url;
            this.preloadQueue.push(img);
        });
    },

    // Последовательный догруз оставшейся части главы без забивания канала связи
    async preloadRemainingSequentially() {
        if (this.isBackgroundLoading) return;
        this.isBackgroundLoading = true;

        for (let i = 0; i < this.pages.length; i++) {
            const url = this.pages[i];
            
            // Если до страницы еще не дошла очередь — скачиваем её и дожидаемся (await)
            if (!this.preloadedUrls.has(url)) {
                await this.preloadSingleUrl(url, false);
            }
        }

        this.isBackgroundLoading = false;
    },

    initKeyboardControls() {
        window.addEventListener('keydown', (event) => {
            const readerScreen = document.getElementById('readerScreen');
            if (!readerScreen || !readerScreen.classList.contains('active')) return;

            // Если фокус в инпуте комментариев — стрелочки не должны переключать страницы
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
        });
    },

    initClickZones() {
        const track = document.getElementById('readerTrack');
        if (!track) return;

        track.addEventListener('click', (event) => {
            // Игнорируем клики, если они пришлись на кнопки или панель комментариев
            if (event.target.closest('button') || event.target.closest('.page-comments-panel')) return;

            const screenWidth = window.innerWidth;
            const clickX = event.clientX;

            const leftZoneBound = screenWidth * 0.3;
            const rightZoneBound = screenWidth * 0.7;

            if (clickX > rightZoneBound) {
                if (this.currentIndex < this.pages.length - 1) {
                    this.currentIndex++;
                    this.resetZoom();
                    this.updateTrack();
                }
            } else if (clickX < leftZoneBound) {
                if (this.currentIndex > 0) {
                    this.currentIndex--;
                    this.resetZoom();
                    this.updateTrack();
                }
            }
        });
    },

    updateTrack() {
        const track = document.getElementById('readerTrack');
        if (!track) return;
        track.style.transform = `translate3d(-${this.currentIndex * 100}vw, 0px, 0px)`;
        
        const counter = document.getElementById('pageCounter');
        if (counter) {
            counter.textContent = `${this.currentIndex + 1} / ${this.pages.length}`;
        }
        
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }

        const commentsPanel = document.getElementById('commentsPanel');
        if (commentsPanel && commentsPanel.classList.contains('open')) {
            const commentsTitle = document.getElementById('commentsTitle');
            if (commentsTitle) commentsTitle.textContent = `Комментарии к странице ${this.currentIndex + 1}`;
            if (typeof this.loadCommentsForCurrentPage === 'function') {
                this.loadCommentsForCurrentPage();
            }
        }

        // ПЕРЕРАСЧЕТ: Каждый раз при смене кадра обновляем приоритеты загрузки
        this.managePreload();
    },

    resetZoom() {
        this.scale = 1;
        this.currentX = 0;
        this.currentY = 0;
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (container) {
            container.style.transform = `translate3d(0px, 0px, 0px) scale(1)`;
        }
    },

    initTouchGestures() {
        const track = document.getElementById('readerTrack');
        let touchStartX = 0;
        let touchEndX = 0;

        track.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
            }
        }, { passive: true });

        track.addEventListener('touchend', (e) => {
            if (e.changedTouches.length === 1) {
                touchEndX = e.changedTouches[0].clientX;
                const diffX = touchStartX - touchEndX;

                if (diffX > 60 && this.currentIndex < this.pages.length - 1) {
                    this.currentIndex++;
                    this.resetZoom();
                    this.updateTrack();
                }
                else if (diffX < -60 && this.currentIndex > 0) {
                    this.currentIndex--;
                    this.resetZoom();
                    this.updateTrack();
                }
            }
        }, { passive: true });
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
    }
};
