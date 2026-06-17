const reader = {
    mangaId: null,
    pages: [],
    currentIndex: 0,
    isGesturesInitialized: false,
    
    scale: 1,
    lastScale: 1,
    posX: 0,
    posY: 0,
    lastPosX: 0,
    lastPosY: 0,
    isDragging: false,
    touchStartDist: 0,

    renderPages(mangaId, pagesArray) {
        this.mangaId = mangaId;
        this.pages = pagesArray;
        this.currentIndex = 0;
        this.resetZoom();

        const track = document.getElementById('readerTrack');
        track.innerHTML = \"\";

        this.pages.forEach((pageUrl, index) => {
            const slide = document.createElement('div');
            slide.className = 'reader-slide';
            slide.innerHTML = `
                <div class=\"zoom-container\" id=\"zoomContainer-${index}\">\n                    <img class=\"reader-img\" src=\"${pageUrl}\" draggable=\"false\">\n                </div>\n            `;
            track.appendChild(slide);
        });

        this.updateTrack();
        
        if (!this.isGesturesInitialized) {
            this.initTouchGestures();
            this.isGesturesInitialized = true;
        }
    },

    updateTrack() {
        const track = document.getElementById('readerTrack');
        track.style.transform = `translate3d(-${this.currentIndex * 100}vw, 0px, 0px)`;
        document.getElementById('pageCounter').textContent = `${this.currentIndex + 1} / ${this.pages.length}`;
        if (document.getElementById('commentsPanel').classList.contains('open')) {
            document.getElementById('commentsTitle').textContent = `Комментарии к странице ${this.currentIndex + 1}`;
            this.loadCommentsForCurrentPage();
        }
    },

    resetZoom() {
        this.scale = 1;
        this.posX = 0;
        this.posY = 0;
        this.applyZoomTransform();
        this.toggleUiVisibility(true);
    },

    applyZoomTransform() {
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (container) {
            container.style.transform = `translate3d(${this.posX}px, ${this.posY}px, 0px) scale(${this.scale})`;
        }
    },

    toggleUiVisibility(show) {
        const header = document.getElementById('readerHeader');
        const counter = document.getElementById('pageCounter');
        const triggerBtn = document.getElementById('openCommentsBtn');

        if (show) {
            header.classList.remove('ui-hidden');
            counter.classList.remove('ui-hidden');
            if (!document.getElementById('commentsPanel').classList.contains('open')) {
                triggerBtn.classList.remove('ui-hidden');
            }
        } else {
            header.classList.add('ui-hidden');
            counter.classList.add('ui-hidden');
            triggerBtn.classList.add('ui-hidden');
        }
    },

    toggleComments(show) {
        const panel = document.getElementById('commentsPanel');
        const triggerBtn = document.getElementById('openCommentsBtn');
        if (show) {
            panel.classList.add('open');
            triggerBtn.classList.add('ui-hidden'); 
            document.getElementById('commentsTitle').textContent = `Комментарии к странице ${this.currentIndex + 1}`;
            this.loadCommentsForCurrentPage();
        } else {
            panel.classList.remove('open');
            if (this.scale === 1) {
                triggerBtn.classList.remove('ui-hidden');
            }
        }
    },

    async loadCommentsForCurrentPage() {
        const container = document.getElementById('pageCommentsScroll');
        container.innerHTML = \"Загрузка...\";
        try {
            const list = await api.fetchPageComments(this.mangaId, this.currentIndex);
            container.innerHTML = \"\";
            if (list.length === 0) {
                container.innerHTML = \"<div style='color:#888; text-align:center; padding:15px; font-size:13px;'>К этой странице пока нет комментов.</div>\";
                return;
            }
            list.forEach(c => {
                const item = document.createElement('div');
                item.className = 'comment-item';
                let deleteBtn = '';
                if (Number(c.user_id) === Number(app.userId)) {
                    deleteBtn = `<span class=\"delete-comment-btn\" onclick=\"reader.deletePageComment('${c.id}')\">Удалить</span>`;
                }
                item.innerHTML = `
                    <div class=\"comment-meta\">
                        <span class=\"comment-author\">${c.user_name}</span>
                        <span class=\"comment-time\">${app.formatCommentTime(c.created_at)}</span>
                    </div>
                    <div class=\"comment-text\">${c.text}</div>
                    ${deleteBtn}
                `;
                container.appendChild(item);
            });
        } catch(e) {
            container.innerHTML = \"<span style='color:#ff3b30;'>Ошибка загрузки.</span>\";
        }
    },

    async sendPageComment() {
        const input = document.getElementById('pageCommentInputField');
        const text = input.value.trim();
        if (!text) return;

        try {
            await api.addComment(this.mangaId, this.currentIndex, app.userId, app.userName, text);
            input.value = \"\";
            await this.loadCommentsForCurrentPage();
        } catch(e) {
            alert(\"Не удалось отправить комментарий.\");
        }
    },

    async deletePageComment(commentId) {
        if (confirm(\"Удалить ваш комментарий к странице?\")) {
            await api.deleteComment(commentId, app.userId);
            this.loadCommentsForCurrentPage();
        }
    },

    initTouchGestures() {
        const screen = document.getElementById('readerScreen');
        const commentsPanel = document.getElementById('commentsPanel');
        let startX = 0, startY = 0;
        let lastTapTime = 0;
        let tapTimeout = null;

        screen.addEventListener('touchstart', (e) => {
            // ИСПРАВЛЕНО: Полностью изолируем тачи внутри панели комментов
            if (commentsPanel.classList.contains('open')) {
                if (!e.target.closest('#commentsPanel')) {
                    // Разрешаем дальнейшую логику (клик мимо закроет окно)
                } else {
                    return; // Игнорируем жесты читалки внутри чата
                }
            }

            if (e.target.closest('#openCommentsBtn') || e.target.closest('#readerHeader')) return;

            if (e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                
                if (this.scale > 1) {
                    this.isDragging = true;
                    this.lastPosX = e.touches[0].clientX - this.posX;
                    this.lastPosY = e.touches[0].clientY - this.posY;
                }
            } else if (e.touches.length === 2) {
                this.isDragging = false;
                this.touchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                this.lastScale = this.scale;
            }
        }, { passive: true });

        screen.addEventListener('touchmove', (e) => {
            if (commentsPanel.classList.contains('open')) return;

            if (this.scale > 1 && this.isDragging && e.touches.length === 1) {
                this.posX = e.touches[0].clientX - this.lastPosX;
                this.posY = e.touches[0].clientY - this.lastPosY;
                this.applyZoomTransform();
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                this.scale = Math.min(Math.max(this.lastScale * (dist / this.touchStartDist), 1), 4);
                this.applyZoomTransform();
            }
        }, { passive: true });

        screen.addEventListener('touchend', (e) => {
            // ИСПРАВЛЕНО: Закрываем чат только при тапе МИМО панели
            if (commentsPanel.classList.contains('open')) {
                if (!e.target.closest('#commentsPanel')) {
                    this.toggleComments(false);
                }
                return; 
            }

            if (e.target.closest('#openCommentsBtn') || e.target.closest('#readerHeader')) return;

            this.isDragging = false;
            if (e.changedTouches.length > 0) {
                const diffX = e.changedTouches[0].clientX - startX;
                const diffY = e.changedTouches[0].clientY - startY;

                if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 30 && this.scale === 1) {
                    if (diffX > 0 && this.currentIndex > 0) { this.currentIndex--; this.updateTrack(); }
                    else if (diffX < 0 && this.currentIndex < this.pages.length - 1) { this.currentIndex++; this.updateTrack(); }
                    return;
                }

                if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10) {
                    const now = Date.now();
                    if (now - lastTapTime < 300) {
                        clearTimeout(tapTimeout);
                        if (this.scale > 1) this.resetZoom();
                        else {
                            const screenWidth = window.innerWidth;
                            const screenHeight = window.innerHeight;
                            const clickX = e.changedTouches[0].clientX;
                            const clickY = e.changedTouches[0].clientY;
                            this.scale = 2.5;
                            this.posX = (screenWidth / 2 - clickX) * (this.scale - 1);
                            this.posY = (screenHeight / 2 - clickY) * (this.scale - 1);
                            this.applyZoomTransform();
                        }
                        lastTapTime = 0;
                    } else {
                        lastTapTime = now;
                        tapTimeout = setTimeout(() => {
                            if (this.scale === 1) {
                                const screenWidth = window.innerWidth;
                                const tapX = e.changedTouches[0].clientX;
                                if (tapX < screenWidth * 0.25) { if (this.currentIndex > 0) { this.currentIndex--; this.updateTrack(); } }
                                else if (tapX > screenWidth * 0.75) { if (this.currentIndex < this.pages.length - 1) { this.currentIndex++; this.updateTrack(); } }
                            }
                        }, 200);
                    }
                }
            }
        }, { passive: true });
    }
};
