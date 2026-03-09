/**
 * Умный калькулятор стоимости грузоперевозок
 * Подсказки адресов через Яндекс Geocoder API (серверный прокси, до 5 вариантов)
 * Расстояние через Яндекс Geocoder + Haversine (серверный прокси)
 */
(function () {
    'use strict';

    // === Тарифы ===
    var RATES = {
        city: {
            perHour: 450,
            minHours: 2,
            moversPerHour: 600
        },
        intercity: {
            fullPerKm: 20,
            partialPerKm: 10,
            moversPerHour: 600
        }
    };

    // === Городской калькулятор ===
    function initCityCalculator() {
        var container = document.getElementById('calc-city');
        if (!container) return;

        var hoursSlider = container.querySelector('#calc-city-hours');
        var hoursValue = container.querySelector('#calc-city-hours-value');
        var moversToggle = container.querySelector('#calc-city-movers');
        var moversOptions = container.querySelector('#calc-city-movers-options');
        var moversHoursSlider = container.querySelector('#calc-city-movers-hours');
        var moversHoursValue = container.querySelector('#calc-city-movers-hours-value');

        var resultBlock = container.querySelector('#calc-city-result');
        var resultMin = container.querySelector('#calc-city-result-min');
        var resultMax = container.querySelector('#calc-city-result-max');
        var resultDetails = container.querySelector('#calc-city-details');

        if (!hoursSlider) return;

        function calculate() {
            var hours = parseInt(hoursSlider.value);
            var needMovers = moversToggle && moversToggle.checked;
            var moversHours = moversHoursSlider ? parseInt(moversHoursSlider.value) : 2;

            if (hoursValue) hoursValue.textContent = hours;
            if (moversHoursValue) moversHoursValue.textContent = moversHours;
            if (moversOptions) moversOptions.style.display = needMovers ? 'block' : 'none';

            var transportCost = hours * RATES.city.perHour;
            var moversCost = needMovers ? moversHours * RATES.city.moversPerHour : 0;
            var totalMin = transportCost + moversCost;
            var totalMax = Math.round(totalMin * 1.15);

            if (resultMin) resultMin.textContent = formatPrice(totalMin);
            if (resultMax) resultMax.textContent = formatPrice(totalMax);

            if (resultDetails) {
                var details = 'Транспорт: ' + hours + ' ч × ' + RATES.city.perHour + ' ₽ = ' + formatPrice(transportCost) + ' ₽';
                if (needMovers) {
                    details += '\nГрузчики: ' + moversHours + ' ч × ' + RATES.city.moversPerHour + ' ₽ = ' + formatPrice(moversCost) + ' ₽';
                }
                resultDetails.textContent = details;
            }

            if (resultBlock) resultBlock.style.display = 'block';

            logCalcDebounced({
                mode: 'city',
                hours: hours,
                movers: needMovers,
                costMin: totalMin,
                costMax: totalMax
            });
        }

        hoursSlider.addEventListener('input', calculate);
        if (moversToggle) moversToggle.addEventListener('change', calculate);
        if (moversHoursSlider) moversHoursSlider.addEventListener('input', calculate);

        calculate();
    }

    // === Междугородний калькулятор ===
    function initIntercityCalculator() {
        var container = document.getElementById('calc-intercity');
        if (!container) return;

        var fromInput = container.querySelector('#calc-intercity-from');
        var toInput = container.querySelector('#calc-intercity-to');
        var distanceInfo = container.querySelector('#calc-intercity-distance-info');
        var distanceValue = container.querySelector('#calc-intercity-distance-value');
        var distanceLoader = container.querySelector('#calc-intercity-distance-loader');

        var moversToggle = container.querySelector('#calc-intercity-movers');
        var moversOptions = container.querySelector('#calc-intercity-movers-options');
        var moversHoursSlider = container.querySelector('#calc-intercity-movers-hours');
        var moversHoursValue = container.querySelector('#calc-intercity-movers-hours-value');

        var resultBlock = container.querySelector('#calc-intercity-result');
        var resultMin = container.querySelector('#calc-intercity-result-min');
        var resultMax = container.querySelector('#calc-intercity-result-max');
        var resultDetails = container.querySelector('#calc-intercity-details');
        var resultKm = container.querySelector('#calc-intercity-km-display');

        if (!fromInput || !toInput) return;

        var currentKm = 0;
        var routeDebounce = null;
        // Если поле "откуда" уже заполнено (напр. "Екатеринбург"), считаем его выбранным
        var fromSelected = !!(fromInput.value && fromInput.value.trim().length >= 2);
        var toSelected = false;   // адрес "куда" выбран из подсказок

        // === Кэш запросов (экономия API-вызовов) ===
        var suggestCache = {};
        var distanceCache = {};

        // === Подсказки адресов (через серверный прокси к Яндекс Geocoder) ===
        function initSuggest(input) {
            var suggestList = input.parentElement.querySelector('.calc-suggest-list');
            if (!suggestList) return;

            var suggestDebounce = null;
            var selectedFromList = false;

            input.addEventListener('input', function () {
                selectedFromList = false;
                // Сбрасываем флаг выбора при ручном вводе
                if (input === fromInput) fromSelected = false;
                if (input === toInput) toSelected = false;
                if (suggestDebounce) clearTimeout(suggestDebounce);
                var q = input.value.trim();
                if (q.length < 2) {
                    suggestList.innerHTML = '';
                    suggestList.classList.remove('active');
                    return;
                }
                suggestDebounce = setTimeout(function () {
                    fetchSuggest(q, suggestList);
                }, 300);
            });

            input.addEventListener('blur', function () {
                // Задержка, чтобы успеть кликнуть по подсказке
                setTimeout(function () {
                    suggestList.innerHTML = '';
                    suggestList.classList.remove('active');
                }, 200);
            });

            input.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    suggestList.innerHTML = '';
                    suggestList.classList.remove('active');
                }
            });

            function fetchSuggest(query, listEl) {
                // Проверяем клиентский кэш
                if (suggestCache[query]) {
                    renderSuggestItems(suggestCache[query], listEl);
                    return;
                }
                fetch('/api/suggest?q=' + encodeURIComponent(query))
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        var items = data.items || [];
                        suggestCache[query] = items; // Сохраняем в кэш
                        renderSuggestItems(items, listEl);
                    })
                    .catch(function () {
                        listEl.innerHTML = '';
                        listEl.classList.remove('active');
                    });
            }

            function renderSuggestItems(items, listEl) {
                listEl.innerHTML = '';
                if (items.length === 0) {
                    listEl.classList.remove('active');
                    return;
                }
                items.forEach(function (item) {
                    var div = document.createElement('div');
                    div.className = 'calc-suggest-item';
                    div.textContent = item.text;
                    div.addEventListener('mousedown', function (e) {
                        e.preventDefault();
                        input.value = item.text;
                        selectedFromList = true;
                        if (input === fromInput) fromSelected = true;
                        if (input === toInput) toSelected = true;
                        listEl.innerHTML = '';
                        listEl.classList.remove('active');
                        if (fromSelected && toSelected) {
                            scheduleRouteCalc();
                        }
                    });
                    listEl.appendChild(div);
                });
                listEl.classList.add('active');
            }
        }

        // === Расчёт расстояния через серверный API ===
        function scheduleRouteCalc() {
            if (routeDebounce) clearTimeout(routeDebounce);
            routeDebounce = setTimeout(calcRoute, 700);
        }

        function calcRoute() {
            var from = fromInput.value.trim();
            var to = toInput.value.trim();

            if (!from || !to || from.length < 3 || to.length < 3) {
                currentKm = 0;
                if (distanceInfo) distanceInfo.style.display = 'none';
                if (resultBlock) resultBlock.style.display = 'none';
                return;
            }

            // Проверяем клиентский кэш расстояний
            var cacheKey = from + '|' + to;
            if (distanceCache[cacheKey]) {
                var cached = distanceCache[cacheKey];
                currentKm = cached.km;
                if (distanceLoader) distanceLoader.style.display = 'none';
                if (distanceValue) distanceValue.textContent = formatPrice(cached.km);
                if (distanceInfo) distanceInfo.style.display = 'block';
                calculateIntercity();
                return;
            }

            // Показываем лоадер
            if (distanceInfo) distanceInfo.style.display = 'block';
            if (distanceLoader) distanceLoader.style.display = 'inline';
            if (distanceValue) distanceValue.textContent = '…';

            fetch('/api/distance?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to))
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (distanceLoader) distanceLoader.style.display = 'none';

                    if (data.ok && data.km > 0) {
                        currentKm = data.km;
                        distanceCache[cacheKey] = { km: data.km }; // Сохраняем в кэш
                        if (distanceValue) distanceValue.textContent = formatPrice(data.km);
                        if (distanceInfo) distanceInfo.style.display = 'block';
                        calculateIntercity();
                    } else {
                        currentKm = 0;
                        if (distanceValue) distanceValue.textContent = 'не найден';
                        if (resultBlock) resultBlock.style.display = 'none';
                    }
                })
                .catch(function () {
                    currentKm = 0;
                    if (distanceLoader) distanceLoader.style.display = 'none';
                    if (distanceValue) distanceValue.textContent = 'ошибка';
                    if (resultBlock) resultBlock.style.display = 'none';
                });
        }

        // === Расчёт стоимости ===
        function calculateIntercity() {
            var km = currentKm;
            var needMovers = moversToggle && moversToggle.checked;
            var moversHours = moversHoursSlider ? parseInt(moversHoursSlider.value) : 2;

            if (moversOptions) moversOptions.style.display = needMovers ? 'block' : 'none';
            if (moversHoursValue) moversHoursValue.textContent = moversHours;

            if (km === 0) {
                if (resultBlock) resultBlock.style.display = 'none';
                return;
            }

            var ratePerKm = RATES.intercity.fullPerKm;
            var transportCost = km * ratePerKm;
            var moversCost = needMovers ? moversHours * RATES.intercity.moversPerHour : 0;
            var totalMin = transportCost + moversCost;
            var totalMax = Math.round(totalMin * 1.15);

            if (resultKm) resultKm.textContent = formatPrice(km);
            if (resultMin) resultMin.textContent = formatPrice(totalMin);
            if (resultMax) resultMax.textContent = formatPrice(totalMax);

            if (resultDetails) {
                var details = 'Выделенная машина: ' + formatPrice(km) + ' км × ' + ratePerKm + ' ₽ = ' + formatPrice(transportCost) + ' ₽';
                if (needMovers) {
                    details += '\nГрузчики: ' + moversHours + ' ч × ' + RATES.intercity.moversPerHour + ' ₽ = ' + formatPrice(moversCost) + ' ₽';
                }
                resultDetails.textContent = details;
            }

            if (resultBlock) resultBlock.style.display = 'block';

            logCalc({
                mode: 'intercity',
                from: fromInput.value.trim(),
                to: toInput.value.trim(),
                km: km,
                loadType: 'full',
                costMin: totalMin,
                costMax: totalMax
            });
        }

        // === Слушатели ===
        if (moversToggle) moversToggle.addEventListener('change', calculateIntercity);
        if (moversHoursSlider) moversHoursSlider.addEventListener('input', calculateIntercity);

        // Инициализация подсказок
        initSuggest(fromInput);
        initSuggest(toInput);
    }

    // === Утилиты ===
    function formatPrice(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    // === Логирование ===
    var _logDebounceTimer = null;

    function logCalcDebounced(data) {
        if (_logDebounceTimer) clearTimeout(_logDebounceTimer);
        _logDebounceTimer = setTimeout(function () { logCalc(data); }, 2000);
    }

    function logCalc(data) {
        try {
            fetch('/api/calc-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).catch(function () {});
        } catch (e) {}
    }

    // === Инициализация ===
    document.addEventListener('DOMContentLoaded', function () {
        initCityCalculator();
        initIntercityCalculator();
    });
})();
