/**
 * Camera Controls Module - OPTIMISTIC UPDATE PATTERN
 * 
 * Nguyên tắc hoạt động (giống các ứng dụng camera chuyên nghiệp):
 * 1. UI là source of truth - slider giữ nguyên giá trị user đã set
 * 2. User điều chỉnh slider -> UI update ngay lập tức
 * 3. Gửi request đến server (background, không block UI)
 * 4. Nếu error -> hiển thị thông báo, KHÔNG reset slider
 * 5. KHÔNG auto-refresh, KHÔNG reload từ server sau mỗi lần apply
 * 6. Chỉ load từ server: lần đầu, sau preset, hoặc user click refresh thủ công
 */

// ============================================================
// STATE MANAGEMENT (Simplified)
// ============================================================

class CameraState {
    constructor() {
        // UI Settings: -100% đến +100% với 0% = mặc định
        // Zoom: 1x đến 4x (giống các app camera)
        // Thiết kế giống Adobe Lightroom, Snapseed
        this.uiSettings = {
            zoom: 1.0,          // 1x = không zoom (1.0 - 4.0)
            brightness: 0,      // 0% = mặc định (EV = 0)
            sharpness: 0,       // 0% = mặc định (Sharpness = 1.0)
            contrast: 0,        // 0% = mặc định (Contrast = 1.0)
            saturation: 0       // 0% = mặc định (Saturation = 1.0)
        };
        this.isApplying = false;
        this.listeners = [];
    }
    
    updateUISettings(newSettings) {
        console.log('[State] Updating UI settings:', newSettings);
        this.uiSettings = { ...this.uiSettings, ...newSettings };
        this.notifyListeners('ui_settings', this.uiSettings);
    }
    
    subscribe(listener) {
        this.listeners.push(listener);
    }
    
    notifyListeners(type, data) {
        this.listeners.forEach(listener => {
            try {
                listener(type, data);
            } catch (error) {
                console.error('[State] Error in listener:', error);
            }
        });
    }
}

// ============================================================
// API COMMUNICATION
// ============================================================

class CameraAPI {
    constructor() {
        this.baseURL = '';
        this.timeout = 30000;
    }
    
    getCSRFToken() {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'csrftoken') return value;
        }
        return '';
    }
    
    async request(endpoint, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCSRFToken()
            },
            timeout: this.timeout
        };
        
        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: { ...defaultOptions.headers, ...options.headers }
        };
        
        try {
            const response = await fetch(endpoint, finalOptions);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`[API] Error calling ${endpoint}:`, error);
            throw error;
        }
    }
    
    async getCurrentUISettings() {
        return await this.request('/api/ui/settings/current/');
    }
    
    async applyUISettings(uiSettings) {
        return await this.request('/api/ui/settings/apply/', {
            method: 'POST',
            body: JSON.stringify({ ui_settings: uiSettings })
        });
    }
    
    async applyPreset(presetName) {
        return await this.request('/api/settings/preset/', {
            method: 'POST',
            body: JSON.stringify({ preset: presetName })
        });
    }
}

// ============================================================
// UI MANAGEMENT
// ============================================================

class CameraUI {
    constructor(state) {
        this.state = state;
        this.elements = {};
        this.initElements();
    }
    
    initElements() {
        this.elements.zoom = document.getElementById('zoom');
        this.elements.zoomValue = document.getElementById('zoomValue');
        this.elements.brightness = document.getElementById('brightness');
        this.elements.brightnessValue = document.getElementById('brightnessValue');
        this.elements.sharpness = document.getElementById('sharpness');
        this.elements.sharpnessValue = document.getElementById('sharpnessValue');
        this.elements.contrast = document.getElementById('contrast');
        this.elements.contrastValue = document.getElementById('contrastValue');
        this.elements.saturation = document.getElementById('saturation');
        this.elements.saturationValue = document.getElementById('saturationValue');
    }
    
    /**
     * Update UI với settings từ server
     * CHỈ gọi khi: load lần đầu, sau preset, hoặc user click refresh thủ công
     * 
     * RANGE: -100% đến +100% với 0% = mặc định (trừ zoom: 100-400%)
     * Thiết kế giống Adobe Lightroom, Snapseed
     */
    updateUISettings(uiSettings) {
        console.log('[UI] Updating UI with settings:', uiSettings);
        
        // Validate và normalize settings
        // Zoom: 1.0 - 4.0 (1x - 4x)
        // Các setting khác: -100% đến +100% với 0% = mặc định
        const normalizedSettings = {
            zoom: parseFloat(uiSettings.zoom) || 1.0,
            brightness: parseFloat(uiSettings.brightness) ?? 0,
            sharpness: parseFloat(uiSettings.sharpness) ?? 0,
            contrast: parseFloat(uiSettings.contrast) ?? 0,
            saturation: parseFloat(uiSettings.saturation) ?? 0
        };
        
        // Update từng control với range tương ứng
        this.updateControl('zoom', normalizedSettings.zoom, 1, 4, false, true);  // isZoom = true
        this.updateControl('brightness', normalizedSettings.brightness, -100, 100, true);
        this.updateControl('sharpness', normalizedSettings.sharpness, -100, 100, true);
        this.updateControl('contrast', normalizedSettings.contrast, -100, 100, true);
        this.updateControl('saturation', normalizedSettings.saturation, -100, 100, true);
        
        // Update state
        this.state.updateUISettings(normalizedSettings);
    }
    
    /**
     * Update một control cụ thể
     * 
     * @param elementId - ID của element
     * @param value - Giá trị cần set
     * @param min - Giá trị tối thiểu
     * @param max - Giá trị tối đa
     * @param isSigned - True nếu hiển thị dấu +/- (cho range âm)
     * @param isZoom - True nếu là zoom control (hiển thị dạng "1.0x")
     */
    updateControl(elementId, value, min, max, isSigned = false, isZoom = false) {
        const element = this.elements[elementId];
        const valueElement = this.elements[elementId + 'Value'];
        
        if (!element || value === undefined) return;
        
        const numValue = parseFloat(value) ?? 0;
        const clampedValue = Math.max(min, Math.min(max, numValue));
        
        // Đánh dấu đang update programmatically
        element.dataset.programmaticUpdate = 'true';
        
        // Update giá trị
        element.value = clampedValue;
        this.updateRangeBackground(element);
        
        // Xóa flag sau một chút
        setTimeout(() => {
            delete element.dataset.programmaticUpdate;
        }, 100);
        
        // Update display text
        if (valueElement) {
            if (isZoom) {
                // Zoom: hiển thị dạng "1.0x", "2.0x" (giống các app camera)
                valueElement.textContent = clampedValue.toFixed(1) + 'x';
            } else if (isSigned) {
                // Hiển thị dấu + cho giá trị dương
                const sign = clampedValue > 0 ? '+' : '';
                valueElement.textContent = sign + Math.round(clampedValue) + '%';
            } else {
                valueElement.textContent = Math.round(clampedValue) + '%';
            }
        }
    }
    
    /**
     * Update range slider background
     */
    updateRangeBackground(slider) {
        if (!slider) return;
        
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        let value = parseFloat(slider.value);
        
        value = Math.max(min, Math.min(max, value));
        
        const percentage = ((value - min) / (max - min)) * 100;
        const gradient = `linear-gradient(to right, var(--primary) 0%, var(--primary) ${percentage}%, var(--border-color) ${percentage}%, var(--border-color) 100%)`;
        slider.style.setProperty('background', gradient, 'important');
    }
    
    /**
     * Initialize range sliders
     */
    initRangeSliders() {
        document.querySelectorAll('input[type="range"]').forEach(slider => {
            this.updateRangeBackground(slider);
            slider.addEventListener('input', () => {
                requestAnimationFrame(() => {
                    this.updateRangeBackground(slider);
                });
            });
        });
    }
}

// ============================================================
// MAIN CONTROLLER
// ============================================================

class CameraControls {
    constructor() {
        this.state = new CameraState();
        this.api = new CameraAPI();
        this.ui = new CameraUI(this.state);
    }
    
    /**
     * Initialize - load settings MỘT LẦN từ server
     */
    async init() {
        console.log('[CameraControls] Initializing...');
        
        try {
            this.ui.initRangeSliders();
            
            // Subscribe vào StatusBoard để nhận thông báo
            if (window.CameraStatusBoard) {
                window.CameraStatusBoard.subscribe((type, data) => {
                    console.log('[CameraControls] StatusBoard notification:', type, data);
                    if (type === 'ui_settings' || type === 'all_loaded') {
                        const uiSettings = type === 'all_loaded' ? data.ui : data;
                        if (uiSettings) {
                            // Chỉ update UI khi load lần đầu hoặc sau preset
                            // KHÔNG update khi user đang điều chỉnh
                            this.ui.updateUISettings(uiSettings);
                        }
                    }
                });
                
                // Load từ camera MỘT LẦN khi khởi tạo
                await window.CameraStatusBoard.loadFromCamera();
            } else {
                console.warn('[CameraControls] StatusBoard not ready, loading directly...');
                await this.loadUISettings();
            }
            
            console.log('[CameraControls] Initialized successfully');
        } catch (error) {
            console.error('[CameraControls] Initialization error:', error);
        }
    }
    
    /**
     * Load UI settings từ server
     * CHỈ gọi khi cần thiết (lần đầu, sau preset, user click refresh)
     */
    async loadUISettings() {
        try {
            console.log('[CameraControls] Loading UI settings from server...');
            
            if (window.CameraStatusBoard) {
                await window.CameraStatusBoard.loadFromCamera();
            } else {
                const data = await this.api.getCurrentUISettings();
                
                if (data.error) {
                    throw new Error(data.error);
                }
                
                let uiSettings = data.ui_settings || data;
                if (uiSettings) {
                    this.ui.updateUISettings(uiSettings);
                }
            }
        } catch (error) {
            console.error('[CameraControls] Error loading UI settings:', error);
            throw error;
        }
    }
    
    /**
     * Apply một UI setting
     * OPTIMISTIC UPDATE: UI đã update rồi, chỉ gửi request đến server
     * KHÔNG reload từ server sau khi apply
     */
    async applyUISetting(name, value) {
        try {
            console.log('[CameraControls] Applying UI setting:', name, '=', value);
            
            // Gửi request đến server (background)
            const data = await this.api.applyUISettings({ [name]: value });
            
            if (data.error) {
                // Hiển thị lỗi nhưng KHÔNG reset slider
                console.error('[CameraControls] Server error:', data.error);
                throw new Error(data.error);
            }
            
            console.log('[CameraControls] UI setting applied successfully');
            
            // KHÔNG reload từ server - UI giữ nguyên giá trị user đã set
            // Đây là Optimistic Update pattern
            
        } catch (error) {
            console.error('[CameraControls] Error applying UI setting:', error);
            // Hiển thị lỗi nhưng KHÔNG reset slider về giá trị cũ
            // User có thể thử lại hoặc điều chỉnh
            throw error;
        }
    }
    
    /**
     * Apply preset
     * Preset thay đổi nhiều settings nên CẦN reload từ server
     */
    async applyPreset(presetName) {
        try {
            console.log('[CameraControls] Applying preset:', presetName);
            
            const data = await this.api.applyPreset(presetName);
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Đợi camera apply settings
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Reload từ server vì preset thay đổi TẤT CẢ settings
            if (window.CameraStatusBoard) {
                await window.CameraStatusBoard.loadFromCamera();
            } else {
                await this.loadUISettings();
            }
            
            console.log('[CameraControls] Preset applied successfully');
            
            // Refresh camera status panel
            if (window.refreshCameraStatus) {
                setTimeout(() => window.refreshCameraStatus(), 300);
            }
        } catch (error) {
            console.error('[CameraControls] Error applying preset:', error);
            throw error;
        }
    }
    
    /**
     * Reset to default (auto preset - giữ nguyên tính chất gốc của camera)
     */
    async resetToDefault() {
        if (!confirm('Bạn có chắc muốn đặt lại thông số mặc định (Tự động)?')) {
            return;
        }
        
        try {
            await this.applyPreset('auto');
            console.log('[CameraControls] Reset to default completed');
        } catch (error) {
            console.error('[CameraControls] Error resetting to default:', error);
            alert('Lỗi khi đặt lại mặc định: ' + error.message);
        }
    }
    
    /**
     * Manual refresh - user click nút refresh
     */
    async manualRefresh() {
        console.log('[CameraControls] Manual refresh requested');
        await this.loadUISettings();
    }
}

// ============================================================
// GLOBAL INSTANCE & EXPORTS
// ============================================================

let cameraControls = null;

// Initialize when DOM is ready
function initializeCameraControls() {
    if (!cameraControls) {
        cameraControls = new CameraControls();
        window.cameraControls = cameraControls;
        cameraControls.init();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCameraControls);
} else {
    initializeCameraControls();
}

// Export functions for use in HTML
window.applyPreset = (presetName) => {
    if (!cameraControls) {
        console.error('[CameraControls] Not initialized yet');
        return Promise.reject(new Error('Camera controls not initialized'));
    }
    return cameraControls.applyPreset(presetName);
};

window.setUISetting = (name, value) => {
    if (!cameraControls) {
        console.error('[CameraControls] Not initialized yet');
        return Promise.reject(new Error('Camera controls not initialized'));
    }
    return cameraControls.applyUISetting(name, value);
};

window.resetToDefault = () => {
    if (!cameraControls) {
        console.error('[CameraControls] Not initialized yet');
        return Promise.reject(new Error('Camera controls not initialized'));
    }
    return cameraControls.resetToDefault();
};

window.loadUISettings = () => {
    if (!cameraControls) {
        console.error('[CameraControls] Not initialized yet');
        return Promise.reject(new Error('Camera controls not initialized'));
    }
    return cameraControls.loadUISettings();
};

window.loadCameraSettings = () => {
    if (!cameraControls) {
        console.error('[CameraControls] Not initialized yet');
        return Promise.reject(new Error('Camera controls not initialized'));
    }
    return cameraControls.loadUISettings();
};

window.manualRefreshCameraSettings = () => {
    if (!cameraControls) {
        console.error('[CameraControls] Not initialized yet');
        return Promise.reject(new Error('Camera controls not initialized'));
    }
    return cameraControls.manualRefresh();
};

// Helper function để lấy CSRF token
if (typeof window.getCsrfToken === 'undefined') {
    window.getCsrfToken = function() {
        const token = document.querySelector('[name=csrfmiddlewaretoken]');
        return token ? token.value : '';
    };
}

// Resolution functions
window.changeResolution = async function() {
    const select = document.getElementById('resolutionProfile');
    if (!select || !select.value) {
        alert('Vui lòng chọn độ phân giải');
        return;
    }
    
    if (!confirm('Thay đổi độ phân giải sẽ khởi động lại camera. Bạn có chắc muốn tiếp tục?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/resolution/change/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': window.getCsrfToken ? window.getCsrfToken() : '',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ profile: select.value })
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert('Lỗi: ' + data.error);
        } else {
            alert('Đã thay đổi độ phân giải thành công! Camera đang khởi động lại...');
            setTimeout(() => {
                if (window.loadResolutionProfiles) loadResolutionProfiles();
                if (window.checkPiStatus) checkPiStatus();
            }, 2000);
        }
    } catch (error) {
        alert('Lỗi: ' + error.message);
    }
};

window.loadResolutionProfiles = async function() {
    try {
        // Load profiles
        const profilesResponse = await fetch('/api/resolution/profiles/');
        const profilesData = await profilesResponse.json();
        
        const select = document.getElementById('resolutionProfile');
        if (select && profilesData.profiles) {
            // KHÔNG thêm option rỗng - chỉ hiện các profile thực sự có thể chọn
            select.innerHTML = '';
            
            Object.keys(profilesData.profiles).forEach(profileKey => {
                const profile = profilesData.profiles[profileKey];
                const option = document.createElement('option');
                option.value = profileKey;
                // Hiển thị tên đẹp hơn với thông tin chi tiết
                option.textContent = `${profile.name} (${profile.resolution_main[0]}×${profile.resolution_main[1]}, ${profile.max_fps}fps)`;
                select.appendChild(option);
            });
        }
        
        // Load current resolution info
        const infoResponse = await fetch('/api/resolution/');
        const infoData = await infoResponse.json();
        
        if (infoData && !infoData.error) {
            const currentEl = document.getElementById('currentResolution');
            const megapixelsEl = document.getElementById('currentMegapixels');
            const maxFpsEl = document.getElementById('currentMaxFps');
            
            // FIX: Dùng đúng key từ API
            if (infoData.resolution_main) {
                if (currentEl) currentEl.textContent = `${infoData.resolution_main[0]}×${infoData.resolution_main[1]}`;
            }
            if (infoData.profile_info) {
                if (megapixelsEl) megapixelsEl.textContent = infoData.profile_info.megapixels || '-';
                if (maxFpsEl) maxFpsEl.textContent = infoData.profile_info.max_fps || '-';
            }
            
            // FIX: Dùng profile_name thay vì profile
            if (select && infoData.profile_name) {
                select.value = infoData.profile_name;
            }
        }
    } catch (error) {
        console.error('Error loading resolution profiles:', error);
    }
};
