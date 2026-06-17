const reader = {
    mangaId: null,
    pages: [],
    currentIndex: 0,
    
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
        track.innerHTML = "";

        this.pages.forEach((pageUrl, index) => {
            const slide = document.createElement('div');
            slide.className = 'reader-slide';
            slide.innerHTML = `
                <div class="zoom-container" id="zoomContainer-${index}">
                    <img class="reader-img" src="${pageUrl}" draggable="false">
                </div>
            `;
            track.appendChild(slide);
        });

        this.updateTrack();
        this.initTouchGestures();
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
        this.scale = 1; this.lastScale = 1;
        this.posX = 0; this.posY = 0;
        this.lastPosX = 0; this.lastPosY = 0;
        document.querySelectorAll('.zoom-container').forEach(c => {
            c.style.transform = `translate3d(0px, 0px, 0px) scale(1)`;
        });
    },

    applyZoomTransform() {
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (!container) return;
        if (this.scale <= 1) { this.posX = 0; this.posY = 0; }
        container.style.transform = `translate3d(${this.posX}px, ${this.posY}px, 0px) scale(${this.scale})`;
    },

    toggleComments(show) {
        const panel = document.getElementById('commentsPanel');
        const triggerBtn = document.getElementById('openCommentsBtn');
        if (show) {
            panel.classList.add('open');
            triggerBtn.style.display = 'none';
            document.getElementById('commentsTitle').textContent = `Комментарии к странице ${this.currentIndex + 1}`;
            this.loadCommentsForCurrentPage();
        } else {
            panel.classList.remove('open');
            triggerBtn.style.display = 'flex';
        }
    },

    async loadCommentsForCurrentPage() {
        const container = document.getElementById('pageCommentsScroll');
        container.innerHTML = "<span style='color:#777; font-size:12px;'>Загрузка обсуждения страницы...</span>";
        try {
            const comments = await api.fetchPageComments(this.mangaId, this.currentIndex);
            if(!comments || comments.length === 0) {
                container.innerHTML = "<p style='color:#777; font-size:12px; text-align:center;'>Тут пусто. Напишите что-нибудь первым!</p>";
                return;
            }
            container.innerHTML = "";
            comments.forEach(c => {
                const item = document.createElement('div');
                item.className = 'comment-item';
                const isMyComment = String(c.user_id) === String(app.userId);
                const delBtnHtml = isMyComment ? `<button class="comment-del-btn" onclick="reader.deletePageComment('${c.id}')">🗑 Удалить</button>` : '';

                item.innerHTML = `
                    <div class="comment-user">${c.user_name}</div>
                    <p class="comment-text">${c.text}</p>
                    ${delBtnHtml}
                `;
                container.appendChild(item);
            });
        } catch(e) {
            container.innerHTML = "<span style='color:#ff3b30; font-size:12px;'>Не удалось загрузить комментарии.</span>";
        }
    },

    async sendPageComment() {
        const input = document.getElementById('pageCommentInputField');
        const text = input.value.trim();
        if (!text) return;

        try {
            await api.addPageComment(this.mangaId, this.currentIndex, app.userId, app.userName, text);
            input.value = "";
            // Сразу же принудительно перерисовываем
            await this.loadCommentsForCurrentPage();
        } catch(e) {
            alert("Не удалось отправить сообщение.");
        }
    },

    async deletePageComment(commentId) {
        if(confirm("Удалить ваш комментарий?")) {
            await api.deleteComment(commentId, app.userId);
            this.loadCommentsForCurrentPage();
        }
    },

    initTouchGestures() {
        const screen = document.getElementById('readerScreen');
        let startX = 0, startY = 0;
        let lastTapTime = 0;
        let tapTimeout = null;

        screen.addEventListener('touchstart', (e) => {
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
            this.isDragging = false;
            
            if (e.changedTouches.length > 0) {
                const diffX = e.changedTouches[0].clientX - startX;
                const diffY = e.changedTouches[0].clientY - startY;

                // Если это был свайп (перелистывание жестом)
                if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50 && this.scale === 1) {
                    if (diffX > 0 && this.currentIndex > 0) { this.currentIndex--; this.updateTrack(); }
                    else if (diffX < 0 && this.currentIndex < this.pages.length - 1) { this.currentIndex++; this.updateTrack(); }
                    return;
                }

                // Логика одиночных / двойных тапов по краям экрана
                if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10) {
                    const now = Date.now();
                    if (now - lastTapTime < 300) {
                        // Обработка Двойного тапа (Зум)
                        clearTimeout(tapTimeout);
                        if (this.scale > 1) { this.resetZoom(); } 
                        else { this.scale = 2.5; this.applyZoomTransform(); }
                        lastTapTime = 0;
                    } else {
                        // Обработка Одиночного тапа по зонам (25% слева / 25% справа)
                        lastTapTime = now;
                        tapTimeout = setTimeout(() => {
                            if (this.scale === 1) {
                                const screenWidth = window.innerWidth;
                                const tapX = e.changedTouches[0].clientX;
                                
                                if (tapX < screenWidth * 0.25) {
                                    // Клик слева -> Назад
                                    if (this.currentIndex > 0) { this.currentIndex--; this.updateTrack(); }
                                } else if (tapX > screenWidth * 0.75) {
                                    // Клик справа -> Вперед
                                    if (this.currentIndex < this.pages.length - 1) { this.currentIndex++; this.updateTrack(); }
                                }
                            }
                        }, 250);
                    }
                }
            }
        }, { passive: true });
    }
};
