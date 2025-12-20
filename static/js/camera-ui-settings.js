/**
 * Camera UI Settings Module
 * Handles UI display updates, zoom quality indicators, and setting management
 */

// ============================================================
// ZOOM QUALITY MANAGEMENT
// ============================================================

/**
 * Cập nhật chỉ báo chất lượng zoom
 * Digital zoom làm giảm chất lượng ảnh khi zoom cao
 */
function updateZoomQuality(zoomValue) {
    const qualityBadge = document.getElementById('zoomQuality');
    const zoomHint = document.getElementById('zoomHint');
    if (!qualityBadge) return;
    
    const zoom = parseFloat(zoomValue) || 1.0;
    
    if (zoom <= 1.5) {
        // 1x - 1.5x: Chất lượng tốt nhất
        qualityBadge.textContent = 'Tốt nhất';
        qualityBadge.style.background = 'var(--accent-success, #28a745)';
        qualityBadge.style.color = 'white';
        if (zoomHint) zoomHint.textContent = 'Chất lượng tốt nhất cho chụp và phân tích lá cây.';
    } else if (zoom <= 2.0) {
        // 1.5x - 2x: Chất lượng tốt
        qualityBadge.textContent = 'Tốt';
        qualityBadge.style.background = 'var(--accent-info, #17a2b8)';
        qualityBadge.style.color = 'white';
        if (zoomHint) zoomHint.textContent = 'Chất lượng tốt, phù hợp cho preview và nhận dạng.';
    } else if (zoom <= 3.0) {
        // 2x - 3x: Chất lượng trung bình
        qualityBadge.textContent = 'Trung bình';
        qualityBadge.style.background = 'var(--accent-warning, #ffc107)';
        qualityBadge.style.color = '#000';
        if (zoomHint) zoomHint.textContent = '⚠️ Chất lượng giảm. Nên đặt lá gần camera hơn thay vì zoom.';
    } else {
        // 3x - 4x: Chất lượng thấp
        qualityBadge.textContent = 'Thấp';
        qualityBadge.style.background = 'var(--accent-danger, #dc3545)';
        qualityBadge.style.color = '#fff';
        if (zoomHint) zoomHint.textContent = '⚠️ Chất lượng thấp! Không khuyến nghị chụp ảnh ở mức zoom này.';
    }
}

// ============================================================
// UI SETTING DISPLAY UPDATES
// ============================================================

/**
 * Update UI display value (chỉ update hiển thị, không apply)
 * QUAN TRỌNG: Hàm này chỉ update display text, KHÔNG update slider value
 * Slider value được update bởi camera-controls.js thông qua updateControl()
 */
function updateUISettingDisplay(elementId, value) {
    const val = parseFloat(value) || 0;
    const valueElement = document.getElementById(elementId + 'Value');
    if (!valueElement) return;
    
    // Format display phù hợp với từng loại setting
    if (elementId === 'zoom') {
        // Zoom: hiển thị dạng "1.0x", "2.0x", "4.0x" (giống các app camera)
        valueElement.textContent = val.toFixed(1) + 'x';
        // Cập nhật chỉ báo chất lượng zoom
        updateZoomQuality(val);
    } else {
        // Các setting khác: hiển thị dấu +/- cho giá trị dương/âm
        const sign = val > 0 ? '+' : '';
        valueElement.textContent = sign + Math.round(val) + '%';
    }
    
    // Update slider background (chỉ visual, không trigger event)
    const slider = document.getElementById(elementId);
    if (slider && window.cameraControls && window.cameraControls.ui) {
        window.cameraControls.ui.updateRangeBackground(slider);
    }
}

// ============================================================
// SETTING MANAGEMENT
// ============================================================

/**
 * Load UI settings từ camera
 */
async function loadUISettings() {
    if (!window.cameraControls) {
        alert('Camera controls chưa sẵn sàng!');
        return;
    }
    
    try {
        // Load settings từ camera
        const settings = await window.cameraControls.loadSettings();
        
        if (settings && settings.ui_settings) {
            // Update UI sliders với giá trị từ camera
            const uiSettings = settings.ui_settings;
            
            // Set programmatic update flag để tránh trigger debounced apply
            if (uiSettings.zoom !== undefined) {
                const zoomSlider = document.getElementById('zoom');
                if (zoomSlider) {
                    zoomSlider.dataset.programmaticUpdate = 'true';
                    zoomSlider.value = uiSettings.zoom;
                    updateUISettingDisplay('zoom', uiSettings.zoom);
                    delete zoomSlider.dataset.programmaticUpdate;
                }
            }
            
            ['brightness', 'sharpness', 'contrast', 'saturation'].forEach(setting => {
                if (uiSettings[setting] !== undefined) {
                    const slider = document.getElementById(setting);
                    if (slider) {
                        slider.dataset.programmaticUpdate = 'true';
                        slider.value = uiSettings[setting];
                        updateUISettingDisplay(setting, uiSettings[setting]);
                        delete slider.dataset.programmaticUpdate;
                    }
                }
            });
            
            // Show success message
            const statusMsg = document.createElement('div');
            statusMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 1rem; border-radius: 4px; z-index: 10000;';
            statusMsg.textContent = '✅ Đã tải thông số từ camera';
            document.body.appendChild(statusMsg);
            setTimeout(() => statusMsg.remove(), 3000);
        }
    } catch (error) {
        console.error('[UI Settings] Error loading settings:', error);
        alert('Lỗi khi tải thông số: ' + error.message);
    }
}

/**
 * Reset UI settings về mặc định
 */
async function resetToDefault() {
    if (!confirm('Bạn có chắc muốn reset tất cả thông số về mặc định?')) {
        return;
    }
    
    // Default values
    const defaults = {
        zoom: 1.0,
        brightness: 0,
        sharpness: 0,
        contrast: 0,
        saturation: 0
    };
    
    try {
        // Update UI sliders
        Object.keys(defaults).forEach(setting => {
            const slider = document.getElementById(setting);
            if (slider) {
                slider.dataset.programmaticUpdate = 'true';
                slider.value = defaults[setting];
                updateUISettingDisplay(setting, defaults[setting]);
                delete slider.dataset.programmaticUpdate;
            }
        });
        
        // Apply to camera
        if (window.cameraControls) {
            await window.cameraControls.applyUISettings(defaults);
        }
        
        // Show success message
        const statusMsg = document.createElement('div');
        statusMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 1rem; border-radius: 4px; z-index: 10000;';
        statusMsg.textContent = '✅ Đã reset về mặc định';
        document.body.appendChild(statusMsg);
        setTimeout(() => statusMsg.remove(), 3000);
    } catch (error) {
        console.error('[UI Settings] Error resetting:', error);
        alert('Lỗi khi reset: ' + error.message);
    }
}

// Export functions to global scope
window.updateZoomQuality = updateZoomQuality;
window.updateUISettingDisplay = updateUISettingDisplay;
window.loadUISettings = loadUISettings;
window.resetToDefault = resetToDefault;

