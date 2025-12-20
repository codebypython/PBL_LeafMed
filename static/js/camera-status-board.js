/**
 * Camera Status Board - Simplified
 * 
 * Chỉ load từ server khi cần thiết:
 * 1. Lần đầu khi trang load
 * 2. Sau khi apply preset
 * 3. User click nút refresh thủ công
 * 
 * KHÔNG auto-refresh - theo pattern của các ứng dụng camera chuyên nghiệp
 */

class CameraStatusBoard {
    constructor() {
        // Technical settings (từ camera)
        this.technicalSettings = {
            framerate: 30,
            AnalogueGain: 1.0,
            ExposureTime: 0,
            ExposureValue: 0.0,
            Contrast: 1.0,
            Saturation: 1.0,
            Sharpness: 1.0,
            AeEnable: true,
            AwbEnable: true
        };
        
        // UI settings (converted từ technical)
        this.uiSettings = {
            zoom: 1.0,
            brightness: 0,
            sharpness: 0,
            contrast: 0,
            saturation: 0
        };
        
        // System info
        this.systemInfo = {
            state: 'unknown',
            mode: 'unknown',
            preset: '-'
        };
        
        // Resolution info
        this.resolutionInfo = {
            resolution_main: [1920, 1080],
            megapixels: 2.1,
            max_fps: 30,
            aspect_ratio: '16:9',
            profile: 'full_hd'
        };
        
        // Listeners để notify khi có thay đổi
        this.listeners = [];
    }
    
    /**
     * Subscribe để nhận thông báo khi status thay đổi
     */
    subscribe(listener) {
        this.listeners.push(listener);
    }
    
    /**
     * Notify tất cả listeners
     */
    notify(type, data) {
        this.listeners.forEach(listener => {
            try {
                listener(type, data);
            } catch (error) {
                console.error('[StatusBoard] Error in listener:', error);
            }
        });
    }
    
    /**
     * Cập nhật technical settings từ camera response
     */
    updateTechnicalSettings(settings) {
        if (!settings || typeof settings !== 'object') return;
        
        Object.keys(this.technicalSettings).forEach(key => {
            if (settings[key] !== undefined && settings[key] !== null) {
                this.technicalSettings[key] = settings[key];
            }
        });
        
        if (settings.framerate !== undefined) {
            this.technicalSettings.framerate = settings.framerate;
        }
        
        console.log('[StatusBoard] Technical settings updated:', this.technicalSettings);
        this.notify('technical_settings', this.technicalSettings);
    }
    
    /**
     * Cập nhật UI settings từ camera response
     */
    updateUISettings(uiSettings) {
        if (!uiSettings || typeof uiSettings !== 'object') {
            console.warn('[StatusBoard] Invalid UI settings:', uiSettings);
            return;
        }
        
        Object.keys(this.uiSettings).forEach(key => {
            const newValue = parseFloat(uiSettings[key]);
            if (uiSettings[key] !== undefined && uiSettings[key] !== null && !isNaN(newValue)) {
                this.uiSettings[key] = newValue;
            }
        });
        
        console.log('[StatusBoard] UI settings updated:', this.uiSettings);
        this.notify('ui_settings', { ...this.uiSettings });
    }
    
    /**
     * Cập nhật system info
     */
    updateSystemInfo(info) {
        if (!info || typeof info !== 'object') return;
        
        if (info.state !== undefined) this.systemInfo.state = info.state;
        if (info.mode !== undefined) this.systemInfo.mode = info.mode;
        if (info.preset !== undefined) this.systemInfo.preset = info.preset;
        
        console.log('[StatusBoard] System info updated:', this.systemInfo);
        this.notify('system_info', this.systemInfo);
    }
    
    /**
     * Cập nhật resolution info
     */
    updateResolutionInfo(info) {
        if (!info || typeof info !== 'object') return;
        
        if (info.resolution_main) this.resolutionInfo.resolution_main = info.resolution_main;
        if (info.megapixels !== undefined) this.resolutionInfo.megapixels = info.megapixels;
        if (info.max_fps !== undefined) this.resolutionInfo.max_fps = info.max_fps;
        if (info.aspect_ratio) this.resolutionInfo.aspect_ratio = info.aspect_ratio;
        if (info.profile) this.resolutionInfo.profile = info.profile;
        
        console.log('[StatusBoard] Resolution info updated:', this.resolutionInfo);
        this.notify('resolution_info', this.resolutionInfo);
    }
    
    /**
     * Load tất cả thông tin từ camera
     * CHỈ gọi khi cần thiết (lần đầu, sau preset, user click refresh)
     */
    async loadFromCamera() {
        try {
            console.log('[StatusBoard] Loading from camera...');
            
            // Load system settings
            const settingsResponse = await fetch('/api/settings/');
            const settingsData = await settingsResponse.json();
            if (!settingsData.error) {
                this.updateSystemInfo(settingsData);
            }
            
            // Load technical settings
            const cameraResponse = await fetch('/api/settings/camera/');
            const cameraData = await cameraResponse.json();
            
            if (!cameraData.error) {
                let settings = cameraData.settings || cameraData;
                if (settings) {
                    this.updateTechnicalSettings(settings);
                }
            }
            
            // Load UI settings
            const uiResponse = await fetch('/api/ui/settings/current/');
            const uiData = await uiResponse.json();
            
            if (!uiData.error) {
                let uiSettings = uiData.ui_settings || uiData;
                if (uiSettings) {
                    console.log('[StatusBoard] Received UI settings from camera:', uiSettings);
                    this.updateUISettings(uiSettings);
                }
            }
            
            // Load resolution info
            const resolutionResponse = await fetch('/api/resolution/');
            const resolutionData = await resolutionResponse.json();
            
            if (!resolutionData.error && resolutionData.resolution_main) {
                this.updateResolutionInfo(resolutionData);
            }
            
            console.log('[StatusBoard] Loaded from camera successfully');
            this.notify('all_loaded', {
                technical: this.technicalSettings,
                ui: this.uiSettings,
                system: this.systemInfo,
                resolution: this.resolutionInfo
            });
            
        } catch (error) {
            console.error('[StatusBoard] Error loading from camera:', error);
            throw error;
        }
    }
    
    /**
     * Get technical settings
     */
    getTechnicalSettings() {
        return { ...this.technicalSettings };
    }
    
    /**
     * Get UI settings
     */
    getUISettings() {
        return { ...this.uiSettings };
    }
    
    /**
     * Get system info
     */
    getSystemInfo() {
        return { ...this.systemInfo };
    }
    
    /**
     * Get resolution info
     */
    getResolutionInfo() {
        return { ...this.resolutionInfo };
    }
}

// Global instance
let cameraStatusBoard = null;

// Initialize
function initializeCameraStatusBoard() {
    if (!cameraStatusBoard) {
        cameraStatusBoard = new CameraStatusBoard();
        window.CameraStatusBoard = cameraStatusBoard;
    }
    return cameraStatusBoard;
}

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCameraStatusBoard);
} else {
    initializeCameraStatusBoard();
}

// Export reload function
window.reloadCameraStatusToBoard = async function() {
    if (!cameraStatusBoard) {
        initializeCameraStatusBoard();
    }
    await cameraStatusBoard.loadFromCamera();
};
