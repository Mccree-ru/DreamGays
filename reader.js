const reader = {
    mangaId: null,
    pages: [],
    currentIndex: 0,
    isGesturesInitialized: false,
    isPCControlsInitialized: false,
    
    // Переменные для зума и панорамирования
    scale: 1,
    currentX: 0,
    currentY: 0,
    startX: 0,
    startY: 0,
    initialDistance: 0,
    initialScale: 1,
    isDragging: false,
    wasPinchOrZoomActive: false, 

    preloadQueue: [], 
    preloadedUrls: new Set(),
    isBackgroundLoading: false,

    renderPages(mangaId, pagesArray) {
        this.mangaId = mangaId;
        this.pages = pagesArray;
        this.currentIndex = 0;
        this.scale = 1;
        this.currentX = 0;
        this.currentY = 0;
        this.wasPinchOrZoomActive = false;
        this.resetZoom();

        const track = document.getElementById('readerTrack');
        if (!track) return;
        track.innerHTML = "";

        this.pages.forEach((pageUrl, index) => {
            const slide = document.createElement('div');
            slide.className = 'reader-slide';
            
            slide.innerHTML = `
                <div class="zoom-container" id="zoomContainer-${index}" style="transform-origin: 50% 50%;">
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

        if (this.pages[0]) {
            this.preloadedUrls.add(this.pages[0]);
        }

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

    managePreload() {
        if (!this.pages || this.pages.length === 0) return;
        const nextPagesCount = 3; 
        const priorityIndices = [];
        for (let i = 1; i <= nextPagesCount; i++) {
            const nextIndex = this.currentIndex + i;
            if (nextIndex < this.pages.length) priorityIndices.push(nextIndex);
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
            img.onload = () => resolve();
            img.onerror = () => { this.preloadedUrls.delete(url); resolve(); };
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
        window.addEventListener('keydown', (event) => {
            const readerScreen = document.getElementById('readerScreen');
            if (!readerScreen || !readerScreen.classList.contains('active')) return;
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

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

        let clickTimeout = null;
        let lastClickTime = 0;

        track.addEventListener('click', (event) => {
            if (event.target.closest('button') || event.target.closest('.page-comments-panel') || event.target.closest('.comment-input-block')) return;

            const commentsPanel = document.getElementById('commentsPanel');
            if (commentsPanel && commentsPanel.classList.contains('open')) {
                this.toggleComments(false);
                if (clickTimeout) clearTimeout(clickTimeout);
                return; 
            }

            const currentTime = new Date().getTime();
            const clickDelay = currentTime - lastClickTime;

            if (clickDelay < 300) {
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }
                this.toggleZoom(event);
                lastClickTime = 0; 
                return;
            }
            
            lastClickTime = currentTime;

            clickTimeout = setTimeout(() => {
                clickTimeout = null;
                if (this.scale && this.scale > 1) return;

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
            }, 250);
        });
    },

    toggleZoom(event) {
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (!container) return;

        container.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)';

        if (this.scale && this.scale > 1) {
            this.resetZoom();
        } else {
            this.scale = 2.5;
            this.wasPinchOrZoomActive = true;

            const rect = container.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            container.style.transformOrigin = `${x}px ${y}px`;
            this.currentX = 0;
            this.currentY = 0;
            
            container.style.transform = `translate3d(0px, 0px, 0px) scale(${this.scale})`;
            this.toggleTopPanel(false);
        }
    },

    initTouchGestures() {
        const track = document.getElementById('readerTrack');
        let touchStartX = 0;
        let touchEndX = 0;

        track.addEventListener('touchstart', (e) => {
            const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
            if (!container) return;

            if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                this.startX = e.touches[0].clientX - this.currentX;
                this.startY = e.touches[0].clientY - this.currentY;
                
                if (this.scale > 1) {
                    container.style.transition = 'none';
                    this.isDragging = true;
                }
            } else if (e.touches.length === 2) {
                this.wasPinchOrZoomActive = true;
                container.style.transition = 'none';
                this.isDragging = false;

                this.initialDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                this.initialScale = this.scale || 1;

                // ИСПРАВЛЕНИЕ: Меняем точку начала зума ТОЛЬКО если картинка в исходном масштабе 1:1.
                // Если картинка уже приближена, не трогаем origin, чтобы избежать прыжков позиции («колбасы»).
                if (!this.scale || this.scale <= 1.02) {
                    const rect = container.getBoundingClientRect();
                    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
                    container.style.transformOrigin = `${midX}px ${midY}px`;
                }
            }
        }, { passive: true });

        track.addEventListener('touchmove', (e) => {
            const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
            if (!container) return;

            if (e.touches.length === 1 && this.isDragging) {
                this.currentX = e.touches[0].clientX - this.startX;
                this.currentY = e.touches[0].clientY - this.startY;

                const maxMoveX = (window.innerWidth * (this.scale - 1)) / 2;
                const maxMoveY = (window.innerHeight * (this.scale - 1)) / 2;
                this.currentX = Math.max(-maxMoveX, Math.min(maxMoveX, this.currentX));
                this.currentY = Math.max(-maxMoveY, Math.min(maxMoveY, this.currentY));

                container.style.transform = `translate3d(${this.currentX}px, ${this.currentY}px, 0px) scale(${this.scale})`;
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );

                let newScale = (dist / this.initialDistance) * this.initialScale;
                this.scale = Math.max(1, Math.min(4, newScale));

                if (this.scale <= 1) {
                    this.currentX = 0;
                    this.currentY = 0;
                }

                container.style.transform = `translate3d(${this.currentX}px, ${this.currentY}px, 0px) scale(${this.scale})`;
                this.toggleTopPanel(this.scale <= 1);
            }
        }, { passive: true });

        track.addEventListener('touchend', (e) => {
            const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
            if (!container) return;

            this.isDragging = false;

            if (e.touches.length === 0) {
                if (this.scale < 1.05) {
                    this.resetZoom();
                    setTimeout(() => { this.wasPinchOrZoomActive = false; }, 50);
                } else {
                    container.style.transition = 'transform 0.2s ease-out';
                }
            }

            if (e.changedTouches.length === 1 && (!this.scale || this.scale <= 1) && !this.wasPinchOrZoomActive) {
                touchEndX = e.changedTouches[0].clientX;
                const diffX = touchStartX - touchEndX;

                if (diffX > 60 && this.currentIndex < this.pages.length - 1) {
                    this.currentIndex++;
                    this.resetZoom();
                    this.updateTrack();
                } else if (diffX < -60 && this.currentIndex > 0) {
                    this.currentIndex--;
                    this.resetZoom();
                    this.updateTrack();
                }
            }

            if (e.touches.length === 0) {
                touchStartX = 0;
                touchEndX = 0;
            }
        }, { passive: true });
    },

    toggleTopPanel(show) {
        const counter = document.getElementById('pageCounter');
        if (counter && counter.parentElement) {
            const topBar = counter.parentElement;
            topBar.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
            if (show) {
                topBar.style.transform = 'translateY(0)';
                topBar.style.opacity = '1';
                topBar.style.pointerEvents = 'auto';
            } else {
                topBar.style.transform = 'translateY(-100%)';
                topBar.style.opacity = '0';
                topBar.style.pointerEvents = 'none';
            }
        }
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
            this.loadCommentsForCurrentPage();
        }

        this.managePreload();
    },

    resetZoom() {
        this.scale = 1;
        this.currentX = 0;
        this.currentY = 0;
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (container) {
            container.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)';
            container.style.transform = `translate3d(0px, 0px, 0px) scale(1)`;
            setTimeout(() => {
                if (this.scale === 1) {
                    container.style.transformOrigin = '50% 50%';
                    this.wasPinchOrZoomActive = false; 
                }
            }, 250);
        }
        this.toggleTopPanel(true);
    },

    toggleComments(show) {
        const panel = document.getElementById('commentsPanel');
        if (!panel) return;
        if (show) {
            panel.classList.add('open');
            const commentsTitle = document.getElementById('commentsTitle');
            if (commentsTitle) commentsTitle.textContent = `Комментарии к странице ${this.currentIndex + 1}`;
            this.loadCommentsForCurrentPage();
        } else {
            panel.classList.remove('open');
        }
    },

    async loadCommentsForCurrentPage() {
        const container = document.getElementById('pageCommentsScroll');
        if (!container) return;
        container.innerHTML = "<p style='color:#777; font-size:13px; text-align:center;'>Загрузка комментариев страницы...</p>";
        
        try {
            const comments = await api.fetchPageComments(this.mangaId, this.currentIndex);
            if (!comments || comments.length === 0) {
                container.innerHTML = "<p style='color:#777; font-size:13px; text-align:center;'>К этой странице пока нет комментариев.</p>";
                return;
            }
            container.innerHTML = "";
            comments.forEach(c => {
                const item = document.createElement('div');
                item.className = 'comment-item';
                const isMyComment = Number(c.user_id) === Number(app.userId);
                const delBtnHtml = isMyComment ? `<button class="comment-del-btn" onclick="reader.deletePageComment('${c.id}')">🗑 Удалить</button>` : '';
                const timeString = typeof app.formatCommentTime === 'function' ? app.formatCommentTime(c.created_at) : '';

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
        } catch (e) {
            console.error("Ошибка загрузки комментариев страницы:", e);
            container.innerHTML = "<span style='color:#ff3b30;'>Не удалось загрузить комментарии.</span>";
        }
    },

    async sendPageComment() {
        const input = document.getElementById('pageCommentInputField');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        try {
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
            await api.addComment(this.mangaId, this.currentIndex, app.userId, app.userName, text);
            input.value = "";

            if (app.currentManga) {
                if (app.currentManga.comments_count !== undefined) {
                    app.currentManga.comments_count++;
                } else {
                    app.currentManga.comments_count = 1;
                }
                const previewComments = document.getElementById('previewComments');
                if (previewComments) previewComments.textContent = `💬 ${app.currentManga.comments_count}`;
                if (typeof app.renderCatalogGrid === 'function') app.renderCatalogGrid(app.allManga);
            }
            await this.loadCommentsForCurrentPage();
        } catch (e) {
            console.error("Ошибка при отправке комментария страницы:", e);
            alert("Не удалось отправить комментарий.");
        }
    },

    async deletePageComment(commentId) {
        if (confirm("Удалить ваш комментарий к странице?")) {
            try {
                if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                }
                await api.deleteComment(commentId, app.userId);
                if (app.currentManga && app.currentManga.comments_count > 0) {
                    app.currentManga.comments_count--;
                    const previewComments = document.getElementById('previewComments');
                    if (previewComments) previewComments.textContent = `💬 ${app.currentManga.comments_count}`;
                    if (typeof app.renderCatalogGrid === 'function') app.renderCatalogGrid(app.allManga);
                }
                await this.loadCommentsForCurrentPage();
            } catch (e) {
                console.error("Ошибка при удалении комментария:", e);
                alert("Не удалось удалить комментарий.");
            }
        }
    }
};
