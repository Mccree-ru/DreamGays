const reader = {
    mangaId: null,
    pages: [],
    currentIndex: 0,
    isGesturesInitialized: false,
    isPCControlsInitialized: false,
    
    // Переменные зума
    scale: 1,
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
            this.initGestures();
            this.isGesturesInitialized = true;
        }

        if (!this.isPCControlsInitialized) {
            this.initKeyboardControls();
            this.isPCControlsInitialized = true;
        }
    },
    
    applyZoom(scale, x = 0, y = 0) {
        this.scale = Math.max(1, Math.min(scale, 3));
        this.currentX = x;
        this.currentY = y;
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (container) {
            container.style.transition = 'transform 0.15s';
            // Применяем зум с учетом смещения
            container.style.transform = `scale(${this.scale}) translate(${this.currentX}px, ${this.currentY}px)`;
            
            // Скрываем UI при зуме
            const uiElements = document.querySelectorAll('.reader-header, .open-comments-trigger-btn');
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
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (container) {
            container.style.transition = 'transform 0.2s';
            container.style.transform = 'scale(1) translate(0px, 0px)';
        }
        const uiElements = document.querySelectorAll('.reader-header, .open-comments-trigger-btn');
        uiElements.forEach(el => {
            if (el) {
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto';
            }
        });
    },

    // Функция для расчета позиции зума относительно центра изображения
    calculateZoomPosition(touchX, touchY) {
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (!container) return { x: 0, y: 0 };
        
        const rect = container.getBoundingClientRect();
        
        // Координаты касания относительно контейнера (в процентах)
        const percentX = (touchX - rect.left) / rect.width;
        const percentY = (touchY - rect.top) / rect.height;
        
        // При зуме 2x, смещение должно быть таким, чтобы точка касания осталась на месте
        // Формула: смещение = (1 - scale) * позиция_в_процентах * размер_контейнера
        const offsetX = (1 - 2) * percentX * rect.width;
        const offsetY = (1 - 2) * percentY * rect.height;
        
        return { x: offsetX, y: offsetY };
    },

    initGestures() {
        const track = document.getElementById('readerTrack');
        if (!track) return;

        let startX = 0;
        let startY = 0;
        let lastTapTime = 0;
        let lastTapX = 0;
        let lastTapY = 0;
        let touchMoved = false;
        let isDoubleTap = false;

        // Обработка touch событий
        track.addEventListener('touchstart', function(e) {
            if (e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                touchMoved = false;
                isDoubleTap = false;
            }
        }, { passive: true });

        track.addEventListener('touchmove', function(e) {
            if (e.touches.length === 1) {
                const diffX = e.touches[0].clientX - startX;
                const diffY = e.touches[0].clientY - startY;
                if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
                    touchMoved = true;
                }
            }
        }, { passive: true });

        track.addEventListener('touchend', function(e) {
            const touch = e.changedTouches[0];
            const now = Date.now();
            const timeDiff = now - lastTapTime;
            
            // Проверка на двойной тап
            if (!touchMoved && timeDiff < 300) {
                // Это двойной тап - отменяем перелистывание
                isDoubleTap = true;
                e.preventDefault();
                
                // Рассчитываем позицию для зума
                const pos = reader.calculateZoomPosition(touch.clientX, touch.clientY);
                
                if (reader.scale > 1) {
                    reader.resetZoom();
                } else {
                    reader.applyZoom(2, pos.x, pos.y);
                }
                lastTapTime = 0;
                return;
            }
            
            // Если это был двойной тап, не делаем свайп
            if (isDoubleTap) {
                isDoubleTap = false;
                return;
            }
            
            lastTapTime = now;
            lastTapX = touch.clientX;
            lastTapY = touch.clientY;

            // Свайп для перелистывания (только при масштабе 1)
            if (reader.scale === 1 && touchMoved) {
                const diffX = startX - touch.clientX;
                if (Math.abs(diffX) > 50) {
                    if (diffX > 0 && reader.currentIndex < reader.pages.length - 1) {
                        reader.currentIndex++;
                        reader.updateTrack();
                    } else if (diffX < 0 && reader.currentIndex > 0) {
                        reader.currentIndex--;
                        reader.updateTrack();
                    }
                }
            }
        }, { passive: true });

        // Клики для ПК с двойным кликом
        let lastClickTime = 0;
        let lastClickX = 0;
        let lastClickY = 0;
        let clickTimeout = null;

        track.addEventListener('click', function(e) {
            const panel = document.getElementById('commentsPanel');
            if (panel && panel.classList.contains('open')) {
                reader.toggleComments(false);
                return;
            }

            if (e.target.closest('button')) return;

            const now = Date.now();
            const timeDiff = now - lastClickTime;

            // Проверка на двойной клик (для ПК)
            if (timeDiff < 300) {
                // Двойной клик
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }
                
                const pos = reader.calculateZoomPosition(e.clientX, e.clientY);
                
                if (reader.scale > 1) {
                    reader.resetZoom();
                } else {
                    reader.applyZoom(2, pos.x, pos.y);
                }
                lastClickTime = 0;
                return;
            }

            lastClickTime = now;
            lastClickX = e.clientX;
            lastClickY = e.clientY;

            // Откладываем обработку одиночного клика
            if (clickTimeout) {
                clearTimeout(clickTimeout);
            }
            
            clickTimeout = setTimeout(() => {
                clickTimeout = null;
                
                // Если картинка приближена — игнорируем клики для листания
                if (reader.scale > 1) return;

                const screenWidth = window.innerWidth;
                const clickX = e.clientX;

                if (clickX > screenWidth * 0.7 && reader.currentIndex < reader.pages.length - 1) {
                    reader.currentIndex++;
                    reader.updateTrack();
                } else if (clickX < screenWidth * 0.3 && reader.currentIndex > 0) {
                    reader.currentIndex--;
                    reader.updateTrack();
                }
            }, 300);
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
};
