document.addEventListener('DOMContentLoaded', function() {
    var buttons = document.querySelectorAll('.mode-btn');
    var currentMode = 'city';

    function switchMode(mode) {
        if (mode === currentMode) return;
        currentMode = mode;

        // Обновляем кнопки
        buttons.forEach(function(btn) {
            if (btn.getAttribute('data-target') === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Показываем/скрываем секции
        document.querySelectorAll('[data-mode]').forEach(function(section) {
            if (section.getAttribute('data-mode') === mode) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        });

        // Плавный скролл наверх к переключателю
        var switcher = document.getElementById('mode-switcher');
        if (switcher) {
            switcher.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Событие в Яндекс.Метрику
        if (typeof ym !== 'undefined') {
            ym(106091724, 'reachGoal', 'mode_switch', { mode: mode });
        }
    }

    // Обработчики кнопок
    buttons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            switchMode(this.getAttribute('data-target'));
        });
    });
});
