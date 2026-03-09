document.addEventListener('DOMContentLoaded', function() {
    var track = document.getElementById('slider-track');
    var slides = document.querySelectorAll('.slider-slide');
    var dots = document.querySelectorAll('.slider-dot');
    var prevBtn = document.getElementById('slider-prev');
    var nextBtn = document.getElementById('slider-next');
    
    // Элементы модального окна
    var modal = document.getElementById('image-modal');
    var modalImage = document.getElementById('modal-image');
    var modalClose = document.getElementById('modal-close');
    var modalPrev = document.getElementById('modal-prev');
    var modalNext = document.getElementById('modal-next');
    var modalCurrent = document.getElementById('modal-current');
    var modalTotal = document.getElementById('modal-total');
    
    var currentSlide = 0;
    var modalCurrentSlide = 0;
    var totalSlides = slides.length;
    var SLIDE_INTERVAL = 10000;
    
    // Установка общего количества слайдов
    modalTotal.textContent = totalSlides;
    
    // Функция обновления слайдера
    function updateSlider() {
        var translateValue = 'translateX(-' + (currentSlide * 100) + '%)';
        track.style.transform = translateValue;
        track.style.webkitTransform = translateValue;
        
        dots.forEach(function(dot, index) {
            if (index === currentSlide) {
                dot.classList.add('active');
                dot.setAttribute('aria-current', 'true');
            } else {
                dot.classList.remove('active');
                dot.removeAttribute('aria-current');
            }
        });
    }
    
    function nextSlide() {
        currentSlide = (currentSlide + 1) % totalSlides;
        updateSlider();
    }
    
    function prevSlide() {
        currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
        updateSlider();
    }
    
    function restartInterval() {
        clearInterval(slideInterval);
        slideInterval = setInterval(nextSlide, SLIDE_INTERVAL);
    }
    
    // Автопрокрутка
    var slideInterval = setInterval(nextSlide, SLIDE_INTERVAL);
    
    // Обработчики кнопок
    nextBtn.addEventListener('click', function() {
        nextSlide();
        restartInterval();
    });
    
    prevBtn.addEventListener('click', function() {
        prevSlide();
        restartInterval();
    });
    
    // Обработчики точек
    dots.forEach(function(dot) {
        dot.addEventListener('click', function() {
            currentSlide = parseInt(this.getAttribute('data-slide'));
            updateSlider();
            restartInterval();
        });
    });
    
    // Пауза при наведении
    var sliderContainer = document.querySelector('.slider-container');
    sliderContainer.addEventListener('mouseenter', function() {
        clearInterval(slideInterval);
    });
    
    sliderContainer.addEventListener('mouseleave', function() {
        restartInterval();
    });
    
    // === Обработчик свайпов для мобильных устройств ===
    var startX = 0;
    var startY = 0;
    var currentTranslate = 0;
    var isDragging = false;
    var dragDirection = null;
    
    track.addEventListener('touchstart', function(e) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isDragging = true;
        dragDirection = null;
        
        var computedStyle = window.getComputedStyle(track);
        var matrix = computedStyle.transform || computedStyle.webkitTransform;
        if (matrix && matrix !== 'none') {
            var matrixValues = matrix.match(/matrix.*\((.+)\)/);
            if (matrixValues) {
                var values = matrixValues[1].split(', ');
                var translateX = parseFloat(values[4]) || 0;
                var sliderWidth = sliderContainer.offsetWidth;
                currentTranslate = (translateX / sliderWidth) * 100;
                currentSlide = Math.round(-currentTranslate / 100);
            } else {
                currentTranslate = -currentSlide * 100;
            }
        } else {
            currentTranslate = -currentSlide * 100;
        }
        
        track.classList.add('dragging');
        track.style.transform = 'translateX(' + currentTranslate + '%)';
        track.style.webkitTransform = 'translateX(' + currentTranslate + '%)';
        clearInterval(slideInterval);
    }, { passive: true });
    
    track.addEventListener('touchmove', function(e) {
        if (!isDragging) return;
        
        var currentX = e.touches[0].clientX;
        var currentY = e.touches[0].clientY;
        var diffX = currentX - startX;
        var diffY = currentY - startY;
        
        if (dragDirection === null && (Math.abs(diffX) > 5 || Math.abs(diffY) > 5)) {
            if (Math.abs(diffX) > Math.abs(diffY)) {
                dragDirection = 'horizontal';
            } else {
                dragDirection = 'vertical';
                isDragging = false;
                track.classList.remove('dragging');
                return;
            }
        }
        
        if (dragDirection !== 'horizontal') return;
        
        e.preventDefault();
        
        var sliderWidth = sliderContainer.offsetWidth;
        var dragPercent = (diffX / sliderWidth) * 100;
        
        if ((currentSlide === 0 && diffX > 0) || (currentSlide === totalSlides - 1 && diffX < 0)) {
            dragPercent = dragPercent * 0.3;
        }
        
        var translateValue = currentTranslate + dragPercent;
        track.style.transform = 'translateX(' + translateValue + '%)';
        track.style.webkitTransform = 'translateX(' + translateValue + '%)';
    }, { passive: false });
    
    track.addEventListener('touchend', function(e) {
        var wasDragging = dragDirection === 'horizontal';
        
        isDragging = false;
        dragDirection = null;
        
        if (!wasDragging) {
            track.classList.remove('dragging');
            updateSlider();
            restartInterval();
            return;
        }
        
        var endX = e.changedTouches[0].clientX;
        var diffX = endX - startX;
        var sliderWidth = sliderContainer.offsetWidth;
        var threshold = sliderWidth * 0.15;
        
        if (Math.abs(diffX) > threshold) {
            if (diffX < 0 && currentSlide < totalSlides - 1) {
                currentSlide++;
            } else if (diffX > 0 && currentSlide > 0) {
                currentSlide--;
            }
        }
        
        track.classList.remove('dragging');
        void track.offsetWidth; // force reflow
        updateSlider();
        
        restartInterval();
    }, { passive: true });
    
    track.addEventListener('touchcancel', function() {
        isDragging = false;
        dragDirection = null;
        track.classList.remove('dragging');
        updateSlider();
        restartInterval();
    }, { passive: true });
    
    // === Модальное окно ===
    
    function openModal(slideIndex) {
        modalCurrentSlide = slideIndex;
        updateModal();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        clearInterval(slideInterval);
    }
    
    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        restartInterval();
    }
    
    function updateModal() {
        var slide = slides[modalCurrentSlide];
        var imageSrc = slide.getAttribute('data-image-src');
        var imageAlt = slide.querySelector('img').getAttribute('alt');
        
        modalImage.src = imageSrc;
        modalImage.alt = imageAlt;
        modalCurrent.textContent = modalCurrentSlide + 1;
        
        currentSlide = modalCurrentSlide;
        updateSlider();
    }
    
    function nextModalImage() {
        modalCurrentSlide = (modalCurrentSlide + 1) % totalSlides;
        updateModal();
    }
    
    function prevModalImage() {
        modalCurrentSlide = (modalCurrentSlide - 1 + totalSlides) % totalSlides;
        updateModal();
    }
    
    // Обработчики кликов на слайды
    var touchMoved = false;
    
    slides.forEach(function(slide, index) {
        slide.addEventListener('touchstart', function() {
            touchMoved = false;
        }, { passive: true });
        
        slide.addEventListener('touchmove', function() {
            touchMoved = true;
        }, { passive: true });
        
        slide.addEventListener('click', function(e) {
            if (touchMoved || e.target.closest('.slider-btn')) return;
            openModal(index);
        });
    });
    
    // Обработчики модального окна
    modalClose.addEventListener('click', closeModal);
    modalPrev.addEventListener('click', prevModalImage);
    modalNext.addEventListener('click', nextModalImage);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
        
        if (modal.classList.contains('active')) {
            if (e.key === 'ArrowLeft') {
                prevModalImage();
            } else if (e.key === 'ArrowRight') {
                nextModalImage();
            }
        }
    });
    
    // Плавная загрузка изображений
    var images = document.querySelectorAll('.slider-slide img, .modal-image');
    images.forEach(function(img) {
        if (img.complete) {
            img.classList.add('loaded');
        } else {
            img.addEventListener('load', function() {
                this.classList.add('loaded');
            });
            
            img.addEventListener('error', function() {
                this.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500' viewBox='0 0 800 500'%3E%3Crect width='800' height='500' fill='%236b7280'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='white' font-family='sans-serif' font-size='24'%3EИзображение%3C/text%3E%3C/svg%3E";
            });
        }
    });
    
    // Инициализация
    updateSlider();
});
