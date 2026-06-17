const reader = {
    mangaId: null,
    pages: [],
    currentIndex: 0,
    scale: 1,
    totalTranslateX: 0,
    totalTranslateY: 0,
    isZooming: false,
    uiTimeout: null,

    renderPages(mangaId, pagesArray) {
        this.mangaId = mangaId;
        this.pages = pagesArray;
        this.currentIndex = 0;

        const track = document.getElementById('readerTrack');
        track.innerHTML = "";

        this.pages.forEach((pageUrl, index) => {
            const slide = document.createElement('div');
            slide.className = 'reader-slide';
            slide.innerHTML = `
                <div class="tap-zone-left" onclick="reader.handleTap('left', event)"></div>
                <div class="tap-zone-center" onclick="reader.handleTap('center', event)"></div>
                <div class="tap-zone-right" onclick="reader.handleTap('right', event)"></div>
                <div class="zoom-container" id="zoom-${index}">
                    <img class="reader-img" src="${pageUrl}" draggable="false">
                </div>
            `;
            track.appendChild(slide);
        });

        this.updateTrack();
        this.initTouchEvents();
        this.resetUiTimer();
    },

    updateTrack() {
        const track = document.getElementById('readerTrack');
        track.style.transform = `translate3d(-${this.currentIndex * 100}vw, 0px, 0px)`;
        document.getElementById('pageCounter').textContent = `${this.currentIndex + 1} / ${this.pages.length}`;
        this.loadCommentsForCurrentPage();
    },

    handleTap(zone, event) {
        event.stopPropagation();
        if (this.scale > 1) return;

        if (zone === 'left') {
            if (this.currentIndex > 0) { this.currentIndex--; this.updateTrack(); }
        } else if (zone === 'right') {
            if (this.currentIndex < this.pages.length - 1) { this.currentIndex++; this.updateTrack(); }
        } else if (zone === 'center') {
            const header = document.getElementById('readerHeader');
            if (header.classList.contains('visible')) {
                this.hideUi();
            } else {
                this.showUi();
            }
        }
    },

    showUi() {
        document.getElementById('readerHeader').classList.add('visible');
        this.toggleComments(true);
        this.resetUiTimer();
    },

    hideUi() {
        document.getElementById('readerHeader').classList.remove('visible');
        this.toggleComments(false);
        clearTimeout(this.uiTimeout);
    },

    resetUiTimer() {
        clearTimeout(this.uiTimeout);
        this.uiTimeout = setTimeout(() => {
            if (this.scale === 1) this.hideUi();
        }, 4000);
    },

    toggleComments(show) {
        const panel = document.getElementById('commentsPanel');
        if (show) {
            panel.classList.add('open');
            document.getElementById('commentsTitle').textContent = `Комментарии к странице ${this.currentIndex + 1}`;
        } else {
            panel.classList.remove('open');
        }
    },

    async loadCommentsForCurrentPage() {
        const container = document.getElementById('commentsScroll');
        container.innerHTML = "Загрузка обсуждения...";
        try {
            const comments = await api.fetchPageComments(this.mangaId, this.currentIndex);
            if(comments.length === 0) {
                container.innerHTML = "<p style='color:#777; font-size:12px;'>На этой странице никто ничего не написал. Будьте первыми!</p>";
                return;
            }
            container.innerHTML = "";
            comments.forEach(c => {
                const item = document.createElement('div');
                item.className = 'comment-item';
                
                // Проверяем: если комментарий оставил текущий авторизованный юзер — выводим кнопку удаления
                const isMyComment = Number(c.user_id) === Number(app.userId);
                const delBtnHtml = isMyComment ? `<button class="comment-del-btn" onclick="reader.deletePageComment('${c.id}')">🗑 Удалить</button>` : '';

                item.innerHTML = `
                    <div class="comment-user">${c.user_name}</div>
                    <p class="comment-text">${c.text}</p>
                    ${delBtnHtml}
                `;
                container.appendChild(item);
            });
        } catch(e) {
            container.innerHTML = "<span style='color:red;'>Не удалось загрузить комментарии.</span>";
        }
    },

    async sendPageComment() {
        const input = document.getElementById('commentInputField');
        const text = input.value.trim();
        if (!text) return;

        await api.addPageComment(this.mangaId, this.currentIndex, app.userId, app.userName, text);
        input.value = "";
        this.loadCommentsForCurrentPage();
    },

    async deletePageComment(commentId) {
        if(confirm("Удалить ваш комментарий?")) {
            await api.deleteComment(commentId, app.userId);
            this.loadCommentsForCurrentPage();
        }
    },

    initTouchEvents() {
        const screen = document.getElementById('readerScreen');
        let swipeStartX = 0, swipeStartY = 0;

        screen.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1 && this.scale === 1) {
                swipeStartX = e.touches[0].clientX;
                swipeStartY = e.touches[0].clientY;
            }
        }, { passive: true });

        screen.addEventListener('touchend', (e) => {
            if (this.scale === 1 && e.changedTouches.length > 0) {
                const diffX = e.changedTouches[0].clientX - swipeStartX;
                const diffY = e.changedTouches[0].clientY - swipeStartY;
                if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 60) {
                    if (diffX > 0 && this.currentIndex > 0) { this.currentIndex--; this.updateTrack(); }
                    else if (diffX < 0 && this.currentIndex < this.pages.length - 1) { this.currentIndex++; this.updateTrack(); }
                }
            }
        }, { passive: true });
    }
};
