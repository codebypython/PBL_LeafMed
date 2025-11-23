/**
 * Camera Controls Module - REDESIGNED
 * Logic đơn giản và rõ ràng theo chuẩn ứng dụng camera phổ biến
 * 
 * Nguyên tắc hoạt động:
 * 1. User điều chỉnh slider -> Apply ngay lập tức (với debounce)
 * 2. Sau khi apply thành công -> Reload UI settings từ server để sync
 * 3. UI luôn reflect đúng camera settings thực tế
 * 4. Không có race condition giữa apply và reload
 */

// ============================================================
// STATE MANAGEMENT
// ============================================================

class CameraState {
    constructor() {
        this.uiSettings = {
            zoom: 100,
            brightness: 0,
            sharpness: 100,
            contrast: 100,
            saturation: 100,
            background_blur: 0
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
        this.elements.backgroundBlur = document.getElementById('backgroundBlur');
        this.elements.backgroundBlurValue = document.getElementById('backgroundBlurValue');
    }
    
    /**
     * Update UI với settings từ server
     * CHỈ được gọi sau khi reload từ server, KHÔNG được gọi khi user đang điều chỉnh
     * 
     * QUAN TRỌNG: Logic conflict giữa sharpness và background_blur:
     * - Theo Pi API: sharpness và background_blur dùng chung Sharpness control
     * - Khi set sharpness: background_blur sẽ không được apply (Pi API check "sharpness" not in ui_settings)
     * - Khi set background_blur: chỉ apply nếu sharpness không được set
     * - Khi convert ngược (technical_to_ui): nếu sharpness >= 1.0 thì background_blur = 0.0
     * - Do đó, sau khi apply một setting, cần reload từ server để sync UI với giá trị thực tế
     */
    updateUISettings(uiSettings) {
        console.log('[UI] Updating UI with server settings:', uiSettings);
        
        // QUAN TRỌNG: Không check isApplying ở đây nữa
        // Vì flag đã được reset trước khi gọi hàm này
        // Nếu check isApplying, sẽ skip update khi reload sau apply
        
        // Validate và normalize settings
        const normalizedSettings = {
            zoom: parseFloat(uiSettings.zoom) || 100,
            brightness: parseFloat(uiSettings.brightness) || 0,
            sharpness: parseFloat(uiSettings.sharpness) || 100,
            contrast: parseFloat(uiSettings.contrast) || 100,
            saturation: parseFloat(uiSettings.saturation) || 100,
            background_blur: parseFloat(uiSettings.background_blur) || 0
        };
        
        // Xử lý conflict giữa sharpness và background_blur
        // Nếu sharpness >= 100% (1.0 technical), background_blur phải = 0% (theo logic Pi API)
        if (normalizedSettings.sharpness >= 100) {
            normalizedSettings.background_blur = 0;
            console.log('[UI] Sharpness >= 100%, clearing background_blur to 0% (conflict resolution)');
        }
        // Nếu background_blur > 0, sharpness sẽ < 100% (theo logic Pi API)
        // Nhưng không cần force vì server đã tính đúng
        
        // Update từng control
        this.updateControl('zoom', normalizedSettings.zoom, 100, 400);
        this.updateControl('brightness', normalizedSettings.brightness, -100, 100, true);
        this.updateControl('sharpness', normalizedSettings.sharpness, 0, 200);
        this.updateControl('contrast', normalizedSettings.contrast, 0, 200);
        this.updateControl('saturation', normalizedSettings.saturation, 0, 200);
        this.updateControl('backgroundBlur', normalizedSettings.background_blur, 0, 100);
        
        // Update state với normalized settings
        this.state.updateUISettings(normalizedSettings);
    }
    
    /**
     * Update một control cụ thể
     * QUAN TRỌNG: Chỉ update UI, KHÔNG trigger event để tránh loop
     */
    updateControl(elementId, value, min, max, isSigned = false) {
        const element = this.elements[elementId];
        const valueElement = this.elements[elementId + 'Value'];
        
        if (!element || value === undefined) return;
        
        const numValue = parseFloat(value) || (min + max) / 2;
        const clampedValue = Math.max(min, Math.min(max, numValue));
        
        // Chỉ update nếu giá trị khác với giá trị hiện tại (tránh update không cần thiết)
        const currentValue = parseFloat(element.value);
        if (Math.abs(currentValue - clampedValue) > 0.1) {
            // Đánh dấu đang update programmatically để tránh trigger event oninput
            // Event oninput sẽ check flag này và skip apply
            element.dataset.programmaticUpdate = 'true';
            
            // Update giá trị
            element.value = clampedValue;
            this.updateRangeBackground(element);
            
            // Xóa flag sau một chút để đảm bảo event oninput không bị trigger
            // (nếu có event đã được trigger, nó sẽ check flag này và skip)
            setTimeout(() => {
                delete element.dataset.programmaticUpdate;
            }, 200);
        }
        
        // Luôn update display text
        if (valueElement) {
            if (isSigned) {
                valueElement.textContent = (clampedValue >= 0 ? '+' : '') + clampedValue.toFixed(0) + '%';
            } else {
                valueElement.textContent = clampedValue.toFixed(0) + '%';
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
     * Initialize - load current settings
     */
    async init() {
        console.log('[CameraControls] Initializing...');
        
        try {
            this.ui.initRangeSliders();
            await this.loadUISettings();
            console.log('[CameraControls] Initialized successfully');
        } catch (error) {
            console.error('[CameraControls] Initialization error:', error);
        }
    }
    
    /**
     * Load UI settings từ server
     * Đây là source of truth - UI sẽ được update từ đây
     */
    async loadUISettings() {
        try {
            console.log('[CameraControls] Loading UI settings from server...');
            const data = await this.api.getCurrentUISettings();
            
            if (data.error) {
                console.error('[CameraControls] API error:', data.error);
                throw new Error(data.error);
            }
            
            // Handle different response formats
            let uiSettings = null;
            if (data.ui_settings) {
                uiSettings = data.ui_settings;
            } else if (data.success && data.ui_settings) {
                uiSettings = data.ui_settings;
            } else if (data.brightness !== undefined || data.sharpness !== undefined) {
                // Direct settings object
                uiSettings = data;
            }
            
            if (uiSettings) {
                console.log('[CameraControls] Received UI settings:', uiSettings);
                // Use setTimeout để đảm bảo DOM đã sẵn sàng
                setTimeout(() => {
                    this.ui.updateUISettings(uiSettings);
                }, 50);
            } else {
                console.warn('[CameraControls] No ui_settings in response:', data);
            }
        } catch (error) {
            console.error('[CameraControls] Error loading UI settings:', error);
            throw error;
        }
    }
    
    /**
     * Apply một UI setting
     * Flow: Apply -> Reload từ server -> Update UI
     */
    async applyUISetting(name, value) {
        // Set flag để prevent UI update từ reload
        this.state.isApplying = true;
        
        try {
            console.log('[CameraControls] Applying UI setting:', name, '=', value);
            
            // Apply setting
            const data = await this.api.applyUISettings({ [name]: value });
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Nếu response có current_ui_settings, dùng nó luôn (nhanh hơn và chính xác)
            // current_ui_settings đã được convert từ technical settings thực tế từ camera,
            // nên nó đã reflect đúng conflict resolution (ví dụ: sharpness >= 100% thì background_blur = 0%)
            // QUAN TRỌNG: current_ui_settings được lấy SAU KHI apply, nên nó đã reflect giá trị mới
            if (data.current_ui_settings) {
                console.log('[CameraControls] Using current_ui_settings from response:', data.current_ui_settings);
                // Đợi một chút để đảm bảo camera đã apply settings hoàn toàn
                await new Promise(resolve => setTimeout(resolve, 300));
                // Reset flag trước khi update UI
                this.state.isApplying = false;
                // Update UI với giá trị từ server (đảm bảo sync đúng với giá trị thực tế)
                this.ui.updateUISettings(data.current_ui_settings);
            } else {
                // Reload UI settings từ server để sync
                // Đợi lâu hơn để camera apply settings (camera có thể cần thời gian)
                await new Promise(resolve => setTimeout(resolve, 600));
                // Reset flag trước khi reload
                this.state.isApplying = false;
                // Reload settings từ server (lấy giá trị thực tế từ camera)
                await this.loadUISettings();
            }
            
            console.log('[CameraControls] UI setting applied and synced');
            
            // Refresh camera status panel after applying setting
            if (window.refreshCameraStatus) {
                setTimeout(() => {
                    window.refreshCameraStatus();
                }, 500);
            }
        } catch (error) {
            console.error('[CameraControls] Error applying UI setting:', error);
            // Reload để sync lại nếu có lỗi
            try {
                await new Promise(resolve => setTimeout(resolve, 500));
                await this.loadUISettings();
            } catch (e) {
                console.error('[CameraControls] Error reloading after error:', e);
            }
            this.state.isApplying = false;
            throw error;
        }
    }
    
    /**
     * Apply preset
     * Flow: Apply preset -> Reload UI settings -> Update UI
     */
    async applyPreset(presetName) {
        this.state.isApplying = true;
        
        try {
            console.log('[CameraControls] Applying preset:', presetName);
            
            const data = await this.api.applyPreset(presetName);
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Đợi camera apply settings
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Reload UI settings từ server để sync
            await this.loadUISettings();
            
            // Đợi thêm một chút để đảm bảo UI đã được update
            await new Promise(resolve => setTimeout(resolve, 200));
            
            this.state.isApplying = false;
            
            console.log('[CameraControls] Preset applied and synced');
            
            // Refresh camera status panel after applying preset
            if (window.refreshCameraStatus) {
                setTimeout(() => {
                    window.refreshCameraStatus();
                }, 500);
            }
        } catch (error) {
            console.error('[CameraControls] Error applying preset:', error);
            try {
                await new Promise(resolve => setTimeout(resolve, 500));
                await this.loadUISettings();
            } catch (e) {
                console.error('[CameraControls] Error reloading after preset error:', e);
            }
            this.state.isApplying = false;
            throw error;
        }
    }
    
    /**
     * Reset to default (daylight preset)
     */
    async resetToDefault() {
        if (!confirm('Bạn có chắc muốn đặt lại thông số mặc định (Ban ngày)?')) {
            return;
        }
        
        try {
            await this.applyPreset('daylight');
            console.log('[CameraControls] Reset to default completed');
        } catch (error) {
            console.error('[CameraControls] Error resetting to default:', error);
            alert('Lỗi khi đặt lại mặc định: ' + error.message);
        }
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
        window.cameraControls = cameraControls; // Export ngay để các hàm khác có thể dùng
        cameraControls.init();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCameraControls);
} else {
    initializeCameraControls();
}

// Export functions for use in HTML
// These will be updated when cameraControls is initialized
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

// Helper function để lấy CSRF token (chỉ định nghĩa nếu chưa có)
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
            select.innerHTML = '<option value="">-- Chọn độ phân giải --</option>';
            Object.keys(profilesData.profiles).forEach(profileName => {
                const option = document.createElement('option');
                option.value = profileName;
                option.textContent = profileName;
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
            
            if (currentEl) currentEl.textContent = infoData.resolution || '-';
            if (megapixelsEl) megapixelsEl.textContent = infoData.megapixels || '-';
            if (maxFpsEl) maxFpsEl.textContent = infoData.max_fps || '-';
            
            // Set selected option
            if (select && infoData.profile) {
                select.value = infoData.profile;
            }
        }
    } catch (error) {
        console.error('Error loading resolution profiles:', error);
    }
};

