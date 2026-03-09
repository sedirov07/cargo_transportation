// === Телефонная маска ===
document.addEventListener('DOMContentLoaded', function() {
    var phoneInput = document.getElementById('phone-input');
    
    phoneInput.value = '+7 ';
    
    phoneInput.addEventListener('focus', function() {
        if (this.value === '') {
            this.value = '+7 ';
        }
    });
    
    phoneInput.addEventListener('keydown', function(e) {
        if (this.selectionStart < 3 && e.key === 'Backspace') {
            e.preventDefault();
        }
        if (this.selectionStart < 3 && e.key === 'Delete') {
            e.preventDefault();
        }
    });
    
    phoneInput.addEventListener('input', function() {
        if (!this.value.startsWith('+7')) {
            this.value = '+7 ' + this.value.replace(/[^\d]/g, '');
        }
        
        var numbers = this.value.replace(/\D/g, '').substring(1);
        if (numbers.length > 0) {
            var formatted = '+7 ';
            
            if (numbers.length <= 3) {
                formatted += numbers;
            } else if (numbers.length <= 6) {
                formatted += '(' + numbers.substring(0,3) + ') ' + numbers.substring(3);
            } else if (numbers.length <= 8) {
                formatted += '(' + numbers.substring(0,3) + ') ' + numbers.substring(3,6) + '-' + numbers.substring(6);
            } else {
                formatted += '(' + numbers.substring(0,3) + ') ' + numbers.substring(3,6) + '-' + numbers.substring(6,8) + '-' + numbers.substring(8,10);
            }
            
            this.value = formatted;
        }
    });
    
    phoneInput.addEventListener('blur', function() {
        var cleanNumber = this.value.replace(/\D/g, '');
        if (cleanNumber.length < 2) {
            this.value = '+7 ';
        }
    });
});

// === Валидация формы в реальном времени ===
document.addEventListener('DOMContentLoaded', function() {
    var form = document.getElementById('contact-form');
    var submitBtn = document.getElementById('submit-btn');
    var phoneInput = document.getElementById('phone-input');
    
    var phoneCheck = document.getElementById('phone-check');
    
    function updateFieldStatus(input, checkMark, isValid, hasValue) {
        if (isValid) {
            input.classList.remove('border-red-400');
            input.classList.add('border-green-400');
            if (checkMark) checkMark.classList.remove('hidden');
        } else if (hasValue) {
            input.classList.remove('border-green-400');
            input.classList.add('border-red-400');
            if (checkMark) checkMark.classList.add('hidden');
        } else {
            input.classList.remove('border-green-400', 'border-red-400');
            if (checkMark) checkMark.classList.add('hidden');
        }
    }
    
    function validateForm() {
        var phone = phoneInput.value.trim();
        var phoneDigits = phone.replace(/\D/g, '');
        
        var isPhoneValid = phoneDigits.length >= 11;
        
        updateFieldStatus(phoneInput, phoneCheck, isPhoneValid, phoneDigits.length > 1);
        
        submitBtn.disabled = !isPhoneValid;
    }
    
    phoneInput.addEventListener('input', validateForm);
    
    validateForm();
});

// === AJAX отправка формы ===
document.addEventListener('DOMContentLoaded', function() {
    var form = document.getElementById('contact-form');
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        var phoneInput = form.querySelector('[name="phone"]');
        var phone = phoneInput.value.trim();
        
        var formData = new FormData(this);
        var submitBtn = document.getElementById('submit-btn');
        var originalText = submitBtn.textContent;
        
        submitBtn.textContent = 'Отправляем...';
        submitBtn.disabled = true;
        
        fetch('/tg-lead', {
            method: 'POST',
            body: formData
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.ok) {
                // Событие в Яндекс.Метрику
                if (typeof ym !== 'undefined') {
                    ym(106091724, 'reachGoal', 'form_submit', {
                        formName: 'contact_form',
                        userPhone: phone
                    });
                }
                
                var successHTML = '<div class="bg-green-50 border border-green-200 rounded-xl p-8 text-center">' +
                    '<div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">' +
                        '<span class="text-green-600 text-3xl">✓</span>' +
                    '</div>' +
                    '<h3 class="text-xl font-semibold text-green-800 mb-3">Спасибо!</h3>' +
                    '<p class="text-green-700 mb-2">Заявка отправлена</p>' +
                    '<p class="text-green-700 mb-6">Перезвоню в течение 15 минут</p>' +
                    '<button onclick="location.reload()" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition">' +
                        'Отправить ещё одну заявку' +
                    '</button>' +
                '</div>';
                
                form.innerHTML = successHTML;
            } else {
                alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        })
        .catch(function(error) {
            alert('Ошибка отправки формы. Попробуйте позвонить напрямую.');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        });
    });
});
