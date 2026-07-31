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
    _preloadCount: 3,

    // Переменные для тача (Zoom & Pan)
    _touchStarted: false,
    _touchMoved: false,
    _lastTouchTime: 0,
    _lastDoubleTapTime: 0, // Защита от перелистывания при двойном тапе
    _isPinching: false,
    _isPanning: false,
    
    // Математика умного зума (по координатам пальцев)
    _initialPinchDist: 0,
    _initialScale: 1,
    _initialX: 0,
    _initialY: 0,
    _pinchCenterX: 0,
    _pinchCenterY: 0,

    _touchStartX: 0,
    _touchStartY: 0,
    _lastTouchX: 0,
    _lastTouchY: 0,
    
    // Переменные для мыши (ПК)
    _isMouseDown: false,
    _mouseX: 0,
    _mouseY: 0,
    
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
        
        this._isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        this.preloadedUrls = new Set();
        if (this._preloadTimer) clearTimeout(this._preloadTimer);
        if (this._navigationTimeout) clearTimeout(this._navigationTimeout);

        const track = document.getElementById('readerTrack');
        if (!track) return;
        
        track.innerHTML = "";
        track.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
        track.style.webkitTransition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

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
            
            slide.innerHTML = `
                <div class="zoom-container" id="zoomContainer-${index}" 
                     style="position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;touch-action:none;transform-origin:center center;">
                    <div class="reader-skeleton" id="skeleton-${index}" 
                         style="position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border-radius:8px;background-color:#121212;display:flex;align-items:center;justify-content:center;z-index:2;">
                        <div class="reader-skeleton-inner skeleton-blink" 
                             style="width:100%;height:100%;border-radius:8px;"></div>
                    </div>
                    <img class="reader-img" id="readerImg-${index}" 
                         draggable="false" 
                         style="opacity:0;transition:opacity 0.3s ease;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;pointer-events:none;-webkit-user-select:none;user-select:none;"
                         data-index="${index}"
                         data-loaded="false">
                </div>
            `;
            fragment.appendChild(slide);
        });
        track.appendChild(fragment);

        track.style.transition = 'none';
        track.style.webkitTransition = 'none';
        this._updateTrackOnly();
        
        requestAnimationFrame(() => {
            track.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
            track.style.webkitTransition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
        });

        if (!this.isGesturesInitialized) {
            this.initTouchGestures();
            this.isGesturesInitialized = true;
        }

        if (!this.isPCControlsInitialized) {
            this.initKeyboardAndMouseControls();
            this.initClickZones();
            this.isPCControlsInitialized = true;
        }

        this._loadPageWithPriority(0);
        setTimeout(() => { this._preloadPages(1); }, 300);
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

    _loadPageWithPriority(index) {
        if (this._isLoading) {
            this._loadQueue.push(index);
            return;
        }
        const img = document.getElementById(`readerImg-${index}`);
        if (!img) return;
        const url = this.pages[index];
        if (!url) return;

        if (this.preloadedUrls.has(url) && img.dataset.loaded === 'true') {
            this._showLoadedImage(index);
            return;
        }

        this._isLoading = true;
        this._currentLoadPromise = new Promise((resolve) => {
            const sk = document.getElementById(`skeleton-${index}`);
            if (sk) {
                sk.style.display = 'flex';
                sk.style.opacity = '1';
                sk.style.visibility = 'visible';
            }
            
            img.onload = null;
            img.onerror = null;
            img.src = url;
            this.preloadedUrls.add(url);
            
            const timeoutId = setTimeout(() => {
                if (img.dataset.loaded !== 'true') {
                    this._isLoading = false;
                    if (sk) sk.innerHTML = '<div style="color:#ff9500;font-size:14px;text-align:center;">⏳ Загрузка...</div>';
                    setTimeout(() => { this._loadPageWithPriority(index); }, 1000);
                    resolve(false);
                }
            }, 8000);

            img.onload = () => {
                clearTimeout(timeoutId);
                img.dataset.loaded = 'true';
                this._showLoadedImage(index);
                this._isLoading = false;
                this._processQueue();
                resolve(true);
            };
            
            img.onerror = () => {
                clearTimeout(timeoutId);
                this.preloadedUrls.delete(url);
                this._isLoading = false;
                if (sk) sk.innerHTML = '<div style="color:#ff3b30;font-size:14px;">⚠️ Ошибка загрузки</div>';
                setTimeout(() => { this._loadPageWithPriority(index); }, 2000);
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
        
        if (index === this.currentIndex) {
            const track = document.getElementById('readerTrack');
            if (track && this._isIOS) {
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
        
        const count = Math.min(this._preloadCount, this.pages.length - startIndex);
        if (count <= 0) return;

        let index = startIndex;
        const loadNext = () => {
            if (index >= startIndex + count) {
                const nextStart = startIndex + this._preloadCount;
                if (nextStart < this.pages.length) {
                    this._preloadTimer = setTimeout(() => { this._preloadPages(nextStart); }, 500);
                }
                return;
            }
            const img = document.getElementById(`readerImg-${index}`);
            if (img && img.dataset.loaded !== 'true' && index !== this.currentIndex) {
                this._loadPageWithPriority(index);
            }
            index++;
            this._preloadTimer = setTimeout(loadNext, 200);
        };
        loadNext();
    },

    navigateTo(index, direction) {
        if (this._isNavigating) return;
        if (index < 0 || index >= this.pages.length) return;
        if (index === this.currentIndex) return;

        const targetImg = document.getElementById(`readerImg-${index}`);
        const isLoaded = targetImg && targetImg.dataset.loaded === 'true';

        if (!isLoaded) {
            if (this._isIOS) {
                const sk = document.getElementById(`skeleton-${index}`);
                if (sk) {
                    sk.style.display = 'flex';
                    sk.style.opacity = '1';
                    sk.style.visibility = 'visible';
                }
                this._loadPageWithPriority(index).then(() => {
                    if (index === this.currentIndex + 1 || index === this.currentIndex - 1) {
                        this._performNavigation(index);
                    }
                });
                return;
            } else {
                this._loadPageWithPriority(index);
                setTimeout(() => { this._performNavigation(index); }, 100);
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

        const currentImg = document.getElementById(`readerImg-${index}`);
        if (currentImg && currentImg.dataset.loaded !== 'true') {
            this._loadPageWithPriority(index);
        }

        this._preloadPages(index + 1);
        if (index > 0) this._loadPageWithPriority(index - 1);

        const commentsPanel = document.getElementById('commentsPanel');
        if (commentsPanel?.classList.contains('open')) {
            document.getElementById('commentsTitle').textContent = `Комментарии (стр. ${index + 1})`;
            this.loadCommentsForCurrentPage?.();
        }

        if (this._navigationTimeout) clearTimeout(this._navigationTimeout);
        this._navigationTimeout = setTimeout(() => { this._isNavigating = false; }, 400);
    },

    applyZoom(scale, x = 0, y = 0) {
        this.scale = Math.max(1, Math.min(scale, 4));
        
        if (this.scale === 1) {
            this.currentX = 0;
            this.currentY = 0;
        } else {
            const screenW = window.innerWidth;
            const screenH = window.innerHeight;
            const maxX = (screenW * (this.scale - 1)) / 2;
            const maxY = (screenH * (this.scale - 1)) / 2;
            this.currentX = Math.max(-maxX, Math.min(x, maxX));
            this.currentY = Math.max(-maxY, Math.min(y, maxY));
        }

        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (container) {
            container.style.transition = (this._isPinching || this._isPanning || this._isMouseDown) ? 'none' : 'transform 0.2s cubic-bezier(0.1, 0.57, 0.1, 1)';
            const transformStr = `translate3d(${this.currentX}px, ${this.currentY}px, 0px) scale(${this.scale})`;
            container.style.transform = transformStr;
            container.style.webkitTransform = transformStr;
        }

        const uiElements = document.querySelectorAll('.open-comments-trigger-btn, .reader-header');
        uiElements.forEach(el => {
            if (el) {
                el.style.opacity = this.scale > 1 ? '0' : '1';
                el.style.pointerEvents = this.scale > 1 ? 'none' : 'auto';
            }
        });
    },

    resetZoom() {
        this.scale = 1;
        this.currentX = 0;
        this.currentY = 0;
        this.lastScale = 1;
        this.applyZoom(1, 0, 0);
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
            this._isPinching = true;
            this._isPanning = false;
            
            // Фиксируем исходные значения для умного зума (в точку пальцев)
            this._initialScale = this.scale;
            this._initialX = this.currentX;
            this._initialY = this.currentY;
            this._pinchCenterX = (touches[0].clientX + touches[1].clientX) / 2;
            this._pinchCenterY = (touches[0].clientY + touches[1].clientY) / 2;
            this._initialPinchDist = Math.hypot(
                touches[0].clientX - touches[1].clientX,
                touches[0].clientY - touches[1].clientY
            );
            e.preventDefault();
        } else if (touches.length === 1) {
            this._isPinching = false;
            this._touchStartX = touches[0].clientX;
            this._touchStartY = touches[0].clientY;
            this._lastTouchX = touches[0].clientX;
            this._lastTouchY = touches[0].clientY;

            if (this.scale > 1) {
                this._isPanning = true;
                e.preventDefault();
            }
        }
    },

    _onTouchMove(e) {
        if (!this._touchStarted) return;
        const touches = e.touches;

        if (touches.length === 2 && this._isPinching) {
            e.preventDefault();
            this._touchMoved = true;
            const currentDist = Math.hypot(
                touches[0].clientX - touches[1].clientX,
                touches[0].clientY - touches[1].clientY
            );
            if (this._initialPinchDist > 0) {
                const newScale = this._initialScale * (currentDist / this._initialPinchDist);
                
                // Рассчитываем смещение к центру между пальцами, учитывая панорамирование
                const currentPinchX = (touches[0].clientX + touches[1].clientX) / 2;
                const currentPinchY = (touches[0].clientY + touches[1].clientY) / 2;
                
                const rectX = this._pinchCenterX - window.innerWidth / 2;
                const rectY = this._pinchCenterY - window.innerHeight / 2;
                
                const dx = rectX - this._initialX;
                const dy = rectY - this._initialY;
                
                const panX = currentPinchX - this._pinchCenterX;
                const panY = currentPinchY - this._pinchCenterY;
                
                const targetX = rectX - dx * (newScale / this._initialScale) + panX;
                const targetY = rectY - dy * (newScale / this._initialScale) + panY;
                
                this.applyZoom(newScale, targetX, targetY);
            }
        } else if (touches.length === 1 && this.scale > 1 && this._isPanning) {
            e.preventDefault();
            this._touchMoved = true;
            const deltaX = touches[0].clientX - this._lastTouchX;
            const deltaY = touches[0].clientY - this._lastTouchY;
            this._lastTouchX = touches[0].clientX;
            this._lastTouchY = touches[0].clientY;

            this.applyZoom(this.scale, this.currentX + deltaX, this.currentY + deltaY);
        } else if (touches.length === 1 && !this._isPinching) {
            this._touchMoved = true;
            this._lastTouchX = touches[0].clientX;
            this._lastTouchY = touches[0].clientY;
        }
    },

    _onTouchEnd(e) {
        if (!this._touchStarted) return;
        this._touchStarted = false;
        
        if (this._isPinching) {
            this._isPinching = false;
            this.lastScale = this.scale;
            if (this.scale < 1.05) this.resetZoom();
            return;
        }

        if (this._isPanning) {
            this._isPanning = false;
            return;
        }

        if (this._touchMoved && !this._isPinching && this.scale === 1) {
            const diffX = this._touchStartX - this._lastTouchX;
            const diffY = this._touchStartY - this._lastTouchY;
            const minSwipeDistance = this._isIOS ? 60 : 50;
            
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
                if (e.cancelable) e.preventDefault();
                const isForward = diffX > 0;
                const targetIndex = isForward ? this.currentIndex + 1 : this.currentIndex - 1;
                
                if (targetIndex >= 0 && targetIndex < this.pages.length) {
                    this.navigateTo(targetIndex, isForward ? 'forward' : 'back');
                }
                this._touchMoved = false;
                return;
            }
        }
        
        if (!this._touchMoved && !this._isPinching) {
            const now = Date.now();
            if (now - this._lastTouchTime < 300) {
                if (e.cancelable) e.preventDefault();
                
                if (this.scale > 1) {
                    this.resetZoom();
                } else {
                    // Умный зум в ту точку, куда мы дважды тапнули
                    const touch = e.changedTouches[0];
                    const rectX = touch.clientX - window.innerWidth / 2;
                    const rectY = touch.clientY - window.innerHeight / 2;
                    
                    const targetX = -rectX;
                    const targetY = -rectY;
                    
                    this.applyZoom(2, targetX, targetY);
                }
                
                this._lastDoubleTapTime = now; // Ставим метку, чтобы заблокировать перелистывание
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
        
        // ЗАЩИТА: Блокируем клик, если только что был двойной тап!
        if (this._lastDoubleTapTime && (Date.now() - this._lastDoubleTapTime < 500)) {
            return; 
        }
        
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

    initKeyboardAndMouseControls() {
        if (this._keydownHandler) window.removeEventListener('keydown', this._keydownHandler);

        this._keydownHandler = (event) => {
            const readerScreen = document.getElementById('readerScreen');
            if (!readerScreen || !readerScreen.classList.contains('active')) return;
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
            if (this._isNavigating) return;

            if (event.key === 'ArrowRight') {
                if (this.currentIndex < this.pages.length - 1) this.navigateTo(this.currentIndex + 1, 'forward');
            } else if (event.key === 'ArrowLeft') {
                if (this.currentIndex > 0) this.navigateTo(this.currentIndex - 1, 'back');
            } else if (event.key === 'Escape') {
                if (this.scale > 1) this.resetZoom();
                else window.app?.closeMangaReader();
            }
        };

        window.addEventListener('keydown', this._keydownHandler);

        const track = document.getElementById('readerTrack');
        if (!track) return;

        // Зум колесиком точно в место нахождения курсора
        track.addEventListener('wheel', (e) => {
            e.preventDefault();
            const newScale = this.scale + (e.deltaY > 0 ? -0.25 : 0.25);
            if (newScale <= 1) {
                this.resetZoom();
            } else {
                const rectX = e.clientX - window.innerWidth / 2;
                const rectY = e.clientY - window.innerHeight / 2;
                const dx = rectX - this.currentX;
                const dy = rectY - this.currentY;
                const targetX = rectX - dx * (newScale / this.scale);
                const targetY = rectY - dy * (newScale / this.scale);
                
                this.applyZoom(newScale, targetX, targetY);
            }
        }, { passive: false });

        track.addEventListener('mousedown', (e) => {
            if (this.scale > 1 && e.button === 0) {
                this._isMouseDown = true;
                this._mouseX = e.clientX;
                this._mouseY = e.clientY;
                e.preventDefault();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this._isMouseDown && this.scale > 1) {
                const deltaX = e.clientX - this._mouseX;
                const deltaY = e.clientY - this._mouseY;
                this._mouseX = e.clientX;
                this._mouseY = e.clientY;
                this.applyZoom(this.scale, this.currentX + deltaX, this.currentY + deltaY);
            }
        });

        window.addEventListener('mouseup', () => { this._isMouseDown = false; });
        
        // Двойной клик на ПК с умным зумом по координатам мыши
        track.addEventListener('dblclick', (e) => {
            if (e.target.closest('button')) return;
            if (this.scale > 1) {
                this.resetZoom();
            } else {
                const rectX = e.clientX - window.innerWidth / 2;
                const rectY = e.clientY - window.innerHeight / 2;
                this.applyZoom(2, -rectX, -rectY);
            }
        });
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
        if (this._preloadTimer) clearTimeout(this._preloadTimer);
        if (this._navigationTimeout) clearTimeout(this._navigationTimeout);
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
