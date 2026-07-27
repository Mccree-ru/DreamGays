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
    _preloadCount: 3, // Уменьшено для iOS

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
    
    // iOS-специфичные флаги
    _isNavigating: false,
    _navigationTimeout: null,
    _isIOS: false,
    _isLoading: false,
    _loadQueue: [],
    _currentLoadPromise: null,

    renderPages(mangaId, pagesArray) {
        this.mangaId = mangaId;
        this.pages = pagesArray;
        this.currentIndex = 0;
        this.resetZoom();
        this._isNavigating = false;
        this._isLoading = false;
        this._loadQueue = [];
        this._currentLoadPromise = null;
        
        // Определяем iOS
        this._isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        // Очистка состояния
        this.preloadedUrls = new Set();
        if (this._preloadTimer) {
            clearTimeout(this._preloadTimer);
            this._preloadTimer = null;
        }
        if (this._navigationTimeout) {
            clearTimeout(this._navigationTimeout);
            this._navigationTimeout = null;
        }

        const track = document.getElementById('readerTrack');
        if (!track) return;
        
        // Очищаем трек
        track.innerHTML = "";
        track.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
        track.style.webkitTransition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

        // Создаём слайды с защитой от iOS
        const fragment = document.createDocumentFragment();
        this.pages.forEach((pageUrl, index) => {
            const slide = document.createElement('div');
            slide.className = 'reader-slide';
            slide.dataset.index = index;
            slide.dataset.loaded = 'false';
            slide.style.position = 'relative';
            slide.style.width = '100vw';
            slide.style.height = '100vh';
            slide.style.flexShrink = '0';
            slide.style.display = 'flex';
            slide.style.alignItems = 'center';
            slide.style.justifyContent = 'center';
            slide.style.overflow = 'hidden';
            
            // Для iOS - показываем индикатор загрузки
            slide.innerHTML = `
                <div class="zoom-container" id="zoomContainer-${index}" 
                     style="position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
                    <div class="reader-skeleton" id="skeleton-${index}" 
                         style="position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border-radius:8px;background-color:#121212;display:flex;align-items:center;justify-content:center;z-index:2;">
                        <div class="reader-skeleton-inner skeleton-blink" 
                             style="width:100%;height:100%;border-radius:8px;"></div>
                    </div>
                    <img class="reader-img" id="readerImg-${index}" 
                         draggable="false" 
                         style="opacity:0;transition:opacity 0.3s ease;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;"
                         data-index="${index}"
                         data-loaded="false">
                </div>
            `;
            fragment.appendChild(slide);
        });
        track.appendChild(fragment);

        // Обновляем трек без анимации
        track.style.transition = 'none';
        track.style.webkitTransition = 'none';
        this._updateTrackOnly();
        
        // Восстанавливаем анимацию
        requestAnimationFrame(() => {
            track.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
            track.style.webkitTransition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
        });

        // Инициализация жестов
        if (!this.isGesturesInitialized) {
            this.initTouchGestures();
            this.isGesturesInitialized = true;
        }

        if (!this.isPCControlsInitialized) {
            this.initKeyboardControls();
            this.initClickZones();
            this.isPCControlsInitialized = true;
        }

        // Загружаем первую страницу с приоритетом
        this._loadPageWithPriority(0);
        
        // Предзагружаем следующие страницы
        setTimeout(() => {
            this._preloadPages(1);
        }, 300);
    },

    _updateTrackOnly() {
        const track = document.getElementById('readerTrack');
        if (!track) return;
        
        const transform = `translate3d(-${this.currentIndex * 100}vw, 0px, 0px)`;
        track.style.transform = transform;
        track.style.webkitTransform = transform;
        
        const counter = document.getElementById('pageCounter');
        if (counter) counter.textContent = `${this.currentIndex + 1} / ${this.pages.length}`;
    },

    // Загрузка страницы с приоритетом и обработкой ошибок
    _loadPageWithPriority(index) {
        if (this._isLoading) {
            // Если уже идет загрузка, добавляем в очередь
            this._loadQueue.push(index);
            return;
        }

        const img = document.getElementById(`readerImg-${index}`);
        if (!img) return;

        const url = this.pages[index];
        if (!url) return;

        // Проверяем, не загружена ли уже
        if (this.preloadedUrls.has(url) && img.dataset.loaded === 'true') {
            this._showLoadedImage(index);
            return;
        }

        this._isLoading = true;
        this._currentLoadPromise = new Promise((resolve, reject) => {
            // Показываем скелетон
            const sk = document.getElementById(`skeleton-${index}`);
            if (sk) {
                sk.style.display = 'flex';
                sk.style.opacity = '1';
                sk.style.visibility = 'visible';
            }
            
            // Очищаем предыдущий img
            img.onload = null;
            img.onerror = null;
            img.src = '';
            
            // Устанавливаем новый src
            img.src = url;
            this.preloadedUrls.add(url);
            
            // Таймаут для защиты от зависаний (особенно для iOS)
            const timeoutId = setTimeout(() => {
                if (img.dataset.loaded !== 'true') {
                    console.warn(`Timeout loading page ${index}`);
                    this._isLoading = false;
                    // Показываем ошибку
                    if (sk) {
                        sk.innerHTML = '<div style="color:#ff9500;font-size:14px;text-align:center;">⏳ Загрузка...</div>';
                    }
                    // Пробуем перезагрузить через секунду
                    setTimeout(() => {
                        this._loadPageWithPriority(index);
                    }, 1000);
                    resolve(false);
                }
            }, 8000);

            img.onload = () => {
                clearTimeout(timeoutId);
                img.dataset.loaded = 'true';
                this._showLoadedImage(index);
                this._isLoading = false;
                
                // Обрабатываем очередь
                this._processQueue();
                resolve(true);
            };
            
            img.onerror = () => {
                clearTimeout(timeoutId);
                this.preloadedUrls.delete(url);
                this._isLoading = false;
                
                // Показываем ошибку
                if (sk) {
                    sk.innerHTML = '<div style="color:#ff3b30;font-size:14px;">⚠️ Ошибка загрузки</div>';
                }
                
                // Пробуем перезагрузить через 2 секунды
                setTimeout(() => {
                    this._loadPageWithPriority(index);
                }, 2000);
                
                this._processQueue();
                resolve(false);
            };
        });
    },

    _showLoadedImage(index) {
        const img = document.getElementById(`readerImg-${index}`);
        const sk = document.getElementById(`skeleton-${index}`);
        
        if (img) {
            img.style.opacity = '1';
            img.dataset.loaded = 'true';
        }
        
        if (sk) {
            sk.style.display = 'none';
            sk.style.opacity = '0';
            sk.style.visibility = 'hidden';
        }
        
        const slide = img?.closest('.reader-slide');
        if (slide) slide.dataset.loaded = 'true';
        
        // Обновляем трек, если это текущая страница
        if (index === this.currentIndex) {
            const track = document.getElementById('readerTrack');
            if (track && this._isIOS) {
                // iOS-фикс: принудительно обновляем позицию
                const transform = track.style.transform;
                track.style.transition = 'none';
                track.style.webkitTransition = 'none';
                requestAnimationFrame(() => {
                    track.style.transform = transform;
                    track.style.webkitTransform = transform;
                    requestAnimationFrame(() => {
                        track.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
                        track.style.webkitTransition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
                    });
                });
            }
        }
    },

    _processQueue() {
        if (this._loadQueue.length > 0 && !this._isLoading) {
            const nextIndex = this._loadQueue.shift();
            this._loadPageWithPriority(nextIndex);
        }
    },

    _preloadPages(startIndex) {
        if (!this.pages || this.pages.length === 0) return;
        if (startIndex >= this.pages.length) return;
        
        // Для iOS уменьшаем количество предзагружаемых страниц
        const count = Math.min(this._preloadCount, this.pages.length - startIndex);
        if (count <= 0) return;

        let index = startIndex;
        const loadNext = () => {
            if (index >= startIndex + count) {
                // Загружаем следующую партию с задержкой
                const nextStart = startIndex + this._preloadCount;
                if (nextStart < this.pages.length) {
                    this._preloadTimer = setTimeout(() => {
                        this._preloadPages(nextStart);
                    }, 500);
                }
                return;
            }

            const img = document.getElementById(`readerImg-${index}`);
            if (img && img.dataset.loaded !== 'true') {
                // Для iOS загружаем только если не текущая страница
                if (index !== this.currentIndex) {
                    this._loadPageWithPriority(index);
                }
            }
            index++;
            this._preloadTimer = setTimeout(loadNext, 200);
        };

        loadNext();
    },

    // Безопасная навигация с проверкой загрузки
    navigateTo(index, direction) {
        if (this._isNavigating) return;
        if (index < 0 || index >= this.pages.length) return;
        if (index === this.currentIndex) return;

        // Проверяем, загружена ли целевая страница
        const targetImg = document.getElementById(`readerImg-${index}`);
        const isLoaded = targetImg && targetImg.dataset.loaded === 'true';

        if (!isLoaded) {
            // На iOS показываем индикатор загрузки без перехода
            if (this._isIOS) {
                const sk = document.getElementById(`skeleton-${index}`);
                if (sk) {
                    sk.style.display = 'flex';
                    sk.style.opacity = '1';
                    sk.style.visibility = 'visible';
                }
                // Загружаем страницу и после загрузки переходим
                this._loadPageWithPriority(index).then(() => {
                    if (index === this.currentIndex + 1 || index === this.currentIndex - 1) {
                        this._performNavigation(index);
                    }
                });
                return;
            } else {
                // Android: загружаем и переходим
                this._loadPageWithPriority(index);
                // Небольшая задержка для начала загрузки
                setTimeout(() => {
                    this._performNavigation(index);
                }, 100);
                return;
            }
        }

        this._performNavigation(index);
    },

    _performNavigation(index) {
        if (this._isNavigating) return;
        
        this._isNavigating = true;
        this.currentIndex = index;
        this.resetZoom();
        
        // Обновляем трек с анимацией
        const track = document.getElementById('readerTrack');
        if (track) {
            const transform = `translate3d(-${index * 100}vw, 0px, 0px)`;
            track.style.transform = transform;
            track.style.webkitTransform = transform;
        }
        
        const counter = document.getElementById('pageCounter');
        if (counter) counter.textContent = `${index + 1} / ${this.pages.length}`;
        
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }

        // Загружаем текущую страницу, если не загружена
        const currentImg = document.getElementById(`readerImg-${index}`);
        if (currentImg && currentImg.dataset.loaded !== 'true') {
            this._loadPageWithPriority(index);
        }

        // Предзагружаем соседние страницы
        this._preloadPages(index + 1);
        if (index > 0) {
            this._loadPageWithPriority(index - 1);
        }

        // Обновляем комментарии
        const commentsPanel = document.getElementById('commentsPanel');
        if (commentsPanel?.classList.contains('open')) {
            document.getElementById('commentsTitle').textContent = `Комментарии (стр. ${index + 1})`;
            this.loadCommentsForCurrentPage?.();
        }

        // Разблокируем навигацию
        if (this._navigationTimeout) {
            clearTimeout(this._navigationTimeout);
        }
        this._navigationTimeout = setTimeout(() => {
            this._isNavigating = false;
        }, 400);
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
            container.style.webkitTransform = `scale(${this.scale}) translate(${this.currentX}px, ${this.currentY}px)`;
            
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
            container.style.webkitTransform = 'scale(1) translate(0px, 0px)';
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
            
            const minSwipeDistance = this._isIOS ? 60 : 50;
            
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
                e.preventDefault();
                
                const isForward = diffX > 0;
                const targetIndex = isForward ? this.currentIndex + 1 : this.currentIndex - 1;
                
                if (targetIndex >= 0 && targetIndex < this.pages.length) {
                    // Используем безопасную навигацию
                    this.navigateTo(targetIndex, isForward ? 'forward' : 'back');
                }
                
                this._touchMoved = false;
                return;
            }
        }
        
        // Двойной тап для зума
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
        if (this._isNavigating) return;
        
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
            this.navigateTo(this.currentIndex + 1, 'forward');
        } else if (clickX < screenWidth * 0.3 && this.currentIndex > 0) {
            this.navigateTo(this.currentIndex - 1, 'back');
        }
    },

    updateTrack() {
        // Используем безопасную навигацию
        this.navigateTo(this.currentIndex, 'current');
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

            if (this._isNavigating) return;

            if (event.key === 'ArrowRight') {
                if (this.currentIndex < this.pages.length - 1) {
                    this.navigateTo(this.currentIndex + 1, 'forward');
                }
            } else if (event.key === 'ArrowLeft') {
                if (this.currentIndex > 0) {
                    this.navigateTo(this.currentIndex - 1, 'back');
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
        if (this._navigationTimeout) {
            clearTimeout(this._navigationTimeout);
            this._navigationTimeout = null;
        }
        this.preloadedUrls.clear();
        this._loadQueue = [];
        this._isLoading = false;
        this._isNavigating = false;
        
        const track = document.getElementById('readerTrack');
        if (track) {
            track.innerHTML = "";
            track.style.transform = 'none';
            track.style.webkitTransform = 'none';
        }
        
        const panel = document.getElementById('commentsPanel');
        if (panel) panel.classList.remove('open');
        
        this.currentIndex = 0;
        this.pages = [];
        this.mangaId = null;
    }
};
