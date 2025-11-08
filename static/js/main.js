// static/js/main.js
ocument.addEventListener('DOMContentLoaded', function() {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        // đảm bảo có nút close (phòng khi HTML chưa render sẵn)
        let closeBtn = alert.querySelector('.alert-close');
        if (!closeBtn) {
            closeBtn = document.createElement('button');
            closeBtn.className = 'alert-close';
            closeBtn.type = 'button';
            closeBtn.setAttribute('aria-label', 'Đóng');
            closeBtn.textContent = '×';
            alert.prepend(closeBtn);
        }
        closeBtn.addEventListener('click', () => {
            alert.style.opacity = '0';
            alert.style.transform = 'translateY(-10px)';
            setTimeout(() => alert.remove(), 200);
        });
    });

    // Form handling - SỬA LẠI
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (!submitBtn) return;
        
        // Lưu trữ HTML gốc
        const originalBtnHTML = submitBtn.innerHTML;
        
        // Reset button khi page load (nếu có lỗi từ server)
        resetButton();
        
        form.addEventListener('submit', function(e) {
            // Validate required fields
            const inputs = form.querySelectorAll('input[required], textarea[required], select[required]');
            let isValid = true;
            
            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    input.classList.add('error');
                } else {
                    input.classList.remove('error');
                }
            });
            
            // Nếu có lỗi validation, prevent submit và không set loading
            if (!isValid) {
                e.preventDefault();
                showNotification('Vui lòng điền đầy đủ thông tin', 'error');
                return false;
            }
            
            // CHỈ khi form valid, mới set loading state
            // Không preventDefault ở đây - để form submit bình thường
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> Đang xử lý...';
            
            // Safety net: reset sau 15 giây (trường hợp lỗi network)
            setTimeout(() => {
                if (submitBtn.disabled) {
                    resetButton();
                }
            }, 15000);
        });
        
        // Reset button function
        function resetButton() {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHTML;
        }
        
        // Reset khi có lỗi từ server (khi page reload với errors)
        if (form.querySelector('.form-error, .alert-error, .errorlist')) {
            resetButton();
        }
    });

    // Xóa error class khi user nhập
    document.querySelectorAll('input, textarea, select').forEach(input => {
        input.addEventListener('input', function() {
            this.classList.remove('error');
        });
    });
});

// Notification helper
function showNotification(message, type = 'info') {
    const messagesContainer = document.querySelector('.messages') || (() => {
        const container = document.querySelector('.container');
        if (!container) return null;
        const box = document.createElement('div');
        box.className = 'messages';
        container.insertBefore(box, container.firstChild);
        return box;
    })();
    if (!messagesContainer) return;

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'alert-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Đóng');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
        alert.style.opacity = '0';
        alert.style.transform = 'translateY(-10px)';
        setTimeout(() => alert.remove(), 200);
    });

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    alert.appendChild(closeBtn);
    alert.appendChild(document.createTextNode(` ${icons[type] || ''} ${message}`));
    messagesContainer.appendChild(alert);
}