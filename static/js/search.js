// search.js - JavaScript cho trang search

// Kiểm tra trạng thái Pi
async function checkPiStatus() {
    try {
        const response = await fetch('/api/status/');
        const data = await response.json();
        
        const statusEl = document.getElementById('piStatus');
        const statusText = document.getElementById('statusText');
        
        if (data.error) {
            statusEl.style.background = '#fee';
            statusEl.style.color = '#c00';
            statusText.textContent = '❌ Pi không khả dụng: ' + data.error;
        } else {
            const cameraState = data.camera?.state || 'unknown';
            const modelLoaded = data.model_loaded || false;
            
            if (cameraState === 'streaming' && modelLoaded) {
                statusEl.style.background = '#efe';
                statusEl.style.color = '#060';
                statusText.textContent = '✅ Pi sẵn sàng - Camera: ' + cameraState + ', Model: Đã tải';
            } else {
                statusEl.style.background = '#ffe';
                statusEl.style.color = '#660';
                statusText.textContent = '⚠️ Pi: Camera=' + cameraState + ', Model=' + (modelLoaded ? 'Đã tải' : 'Chưa tải');
            }
        }
    } catch (error) {
        const statusEl = document.getElementById('piStatus');
        const statusText = document.getElementById('statusText');
        statusEl.style.background = '#fee';
        statusEl.style.color = '#c00';
        statusText.textContent = '❌ Không thể kết nối Pi: ' + error.message;
    }
}

// Pause stream
async function pauseStream() {
    try {
        const response = await fetch('/api/stream/pause/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken()
            }
        });
        const data = await response.json();
        
        if (data.status === 'paused') {
            document.getElementById('pauseBtn').style.display = 'none';
            document.getElementById('resumeBtn').style.display = 'inline-block';
        }
    } catch (error) {
        alert('Lỗi tạm dừng stream: ' + error.message);
    }
}

// Resume stream
async function resumeStream() {
    try {
        const response = await fetch('/api/stream/resume/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken()
            }
        });
        const data = await response.json();
        
        if (data.status === 'streaming') {
            document.getElementById('pauseBtn').style.display = 'inline-block';
            document.getElementById('resumeBtn').style.display = 'none';
        }
    } catch (error) {
        alert('Lỗi tiếp tục stream: ' + error.message);
    }
}

// Load settings
async function loadSettings() {
    try {
        const response = await fetch('/api/settings/');
        const data = await response.json();
        
        if (data.error) {
            document.getElementById('settingsState').textContent = 'Lỗi: ' + data.error;
            return;
        }
        
        document.getElementById('settingsState').textContent = data.state || 'unknown';
        document.getElementById('settingsMode').textContent = data.mode || 'unknown';
        
        const modeSelect = document.getElementById('cameraMode');
        if (data.mode) {
            modeSelect.value = data.mode;
        }
    } catch (error) {
        document.getElementById('settingsState').textContent = 'Lỗi: ' + error.message;
    }
}

// Set camera mode
async function setCameraMode() {
    const mode = document.getElementById('cameraMode').value;
    
    try {
        const response = await fetch('/api/settings/mode/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'mode=' + encodeURIComponent(mode)
        });
        const data = await response.json();
        
        if (data.error) {
            alert('Lỗi thiết lập chế độ: ' + data.error);
        } else {
            alert('Đã thiết lập chế độ: ' + mode);
            loadSettings();
        }
    } catch (error) {
        alert('Lỗi: ' + error.message);
    }
}

// Restart camera
async function restartCamera() {
    if (!confirm('Bạn có chắc muốn khởi động lại camera? Quá trình này có thể mất vài giây.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/control/restart_camera/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken()
            }
        });
        const data = await response.json();
        
        if (data.error) {
            alert('Lỗi khởi động lại camera: ' + data.error);
        } else {
            alert('Đã khởi động lại camera thành công!');
            setTimeout(checkPiStatus, 2000);
        }
    } catch (error) {
        alert('Lỗi: ' + error.message);
    }
}

// Reload model
async function reloadModel() {
    if (!confirm('Bạn có chắc muốn tải lại model? Quá trình này có thể mất vài phút.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/control/reload_model/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken()
            }
        });
        const data = await response.json();
        
        if (data.error) {
            alert('Lỗi tải lại model: ' + data.error);
        } else {
            alert('Đã tải lại model thành công!');
            setTimeout(checkPiStatus, 2000);
        }
    } catch (error) {
        alert('Lỗi: ' + error.message);
    }
}

// Helper function để lấy CSRF token
function getCsrfToken() {
    const token = document.querySelector('[name=csrfmiddlewaretoken]');
    return token ? token.value : '';
}

// ============================================================
// CAMERA CONTROLS - HANDLED BY camera-controls.js
// All camera settings, presets, and resolution functions are now
// managed by the CameraControls class in camera-controls.js
// ============================================================

// NOTE: The following functions are delegated to camera-controls.js:
// - applyPreset() → window.cameraControls.applyPreset()
// - setSetting() → window.cameraControls.applySetting()
// - resetToDefault() → window.cameraControls.resetToDefault()
// - changeResolution() → window.cameraControls.changeResolution()
// - loadCameraSettings() → window.cameraControls.loadSettings()
// - loadResolutionProfiles() → handled in CameraControls.init()
//
// These are exported as global functions in camera-controls.js for
// backward compatibility with HTML onclick handlers.

// ============================================================
// USER PRESETS MANAGEMENT
// ============================================================

// Load user presets
// Load unified presets (system + user)
async function loadUnifiedPresets() {
    try {
        // Load user presets
        const response = await fetch('/api/presets/user/');
        const data = await response.json();
        
        const userGroup = document.getElementById('userPresetsGroup');
        userGroup.innerHTML = ''; // Clear existing
        
        if (data.presets && data.presets.length > 0) {
            data.presets.forEach(preset => {
                const option = document.createElement('option');
                option.value = `user:${preset.id}`;
                option.textContent = preset.name + (preset.is_default ? ' ⭐' : '');
                option.dataset.presetId = preset.id;
                userGroup.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '-- Chưa có preset --';
            option.disabled = true;
            userGroup.appendChild(option);
        }
    } catch (error) {
        console.error('Error loading unified presets:', error);
    }
}

// Legacy function for backward compatibility
async function loadUserPresets() {
    await loadUnifiedPresets();
}

// Handle preset dropdown change
function handlePresetChange() {
    const select = document.getElementById('unifiedPresetSelect');
    const deleteBtn = document.getElementById('deletePresetBtn');
    const value = select.value;
    
    // Enable delete button only for user presets
    if (value && value.startsWith('user:')) {
        deleteBtn.disabled = false;
    } else {
        deleteBtn.disabled = true;
    }
}

// Apply selected preset from dropdown
async function applySelectedPreset() {
    const select = document.getElementById('unifiedPresetSelect');
    const value = select.value;
    
    if (!value) {
        alert('Vui lòng chọn preset');
        return;
    }
    
    const statusEl = document.getElementById('presetStatus');
    statusEl.textContent = 'Đang áp dụng preset...';
    statusEl.style.color = 'var(--primary)';
    
    try {
        if (value.startsWith('system:')) {
            // System preset
            const presetName = value.replace('system:', '');
            const response = await fetch('/api/settings/preset/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': getCsrfToken(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ preset: presetName })
            });
            
            const data = await response.json();
            
            if (data.error) {
                statusEl.textContent = 'Lỗi: ' + data.error;
                statusEl.style.color = 'var(--danger)';
            } else {
                statusEl.textContent = 'Đã áp dụng preset thành công!';
                statusEl.style.color = 'var(--success)';
                
                // Refresh camera status after applying preset
                // StatusBoard sẽ được reload và UI sẽ tự động update
                setTimeout(async () => {
                    if (window.CameraStatusBoard) {
                        await window.CameraStatusBoard.loadFromCamera();
                    }
                    refreshCameraStatus();
                    if (window.loadUISettings) {
                        window.loadUISettings();
                    }
                }, 500);
            }
        } else if (value.startsWith('user:')) {
            // User preset
            const presetId = value.replace('user:', '');
            const response = await fetch('/api/presets/load/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': getCsrfToken(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ preset_id: parseInt(presetId) })
            });
            
            const data = await response.json();
            
            if (data.error) {
                statusEl.textContent = 'Lỗi: ' + data.error;
                statusEl.style.color = 'var(--danger)';
            } else {
                statusEl.textContent = 'Đã áp dụng preset thành công!';
                statusEl.style.color = 'var(--success)';
                
                // Refresh camera status after applying preset
                // StatusBoard sẽ được reload và UI sẽ tự động update
                setTimeout(async () => {
                    if (window.CameraStatusBoard) {
                        await window.CameraStatusBoard.loadFromCamera();
                    }
                    refreshCameraStatus();
                    if (window.loadUISettings) {
                        window.loadUISettings();
                    }
                }, 500);
            }
        }
    } catch (error) {
        statusEl.textContent = 'Lỗi: ' + error.message;
        statusEl.style.color = 'var(--danger)';
    }
}

// Delete selected preset
async function deleteSelectedPreset() {
    const select = document.getElementById('unifiedPresetSelect');
    const value = select.value;
    
    if (!value || !value.startsWith('user:')) {
        alert('Chỉ có thể xóa preset của bạn');
        return;
    }
    
    const presetId = value.replace('user:', '');
    const option = select.options[select.selectedIndex];
    const presetName = option.textContent.replace(' ⭐', '');
    
    if (!confirm(`Bạn có chắc muốn xóa preset "${presetName}"?`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/presets/delete/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ preset_id: parseInt(presetId) })
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert('Lỗi: ' + data.error);
        } else {
            alert('Đã xóa preset thành công!');
            loadUnifiedPresets(); // Reload danh sách
            select.value = ''; // Reset selection
            document.getElementById('deletePresetBtn').disabled = true;
        }
    } catch (error) {
        alert('Lỗi: ' + error.message);
    }
}

// Save current preset
async function saveCurrentPreset() {
    const name = document.getElementById('presetNameInput').value.trim();
    const isDefault = document.getElementById('setAsDefault').checked;
    
    if (!name) {
        alert('Vui lòng nhập tên preset');
        return;
    }
    
    try {
        // Lấy thông số hiện tại từ Pi
        const settingsResponse = await fetch('/api/settings/camera/');
        const currentSettings = await settingsResponse.json();
        
        if (currentSettings.error) {
            alert('Lỗi lấy thông số hiện tại: ' + currentSettings.error);
            return;
        }
        
        // Chuẩn bị settings để lưu
        const settingsToSave = {
            framerate: currentSettings.framerate || 30,
            AnalogueGain: currentSettings.AnalogueGain,
            ExposureTime: currentSettings.ExposureTime,
            ExposureValue: currentSettings.ExposureValue,
            Contrast: currentSettings.Contrast,
            Saturation: currentSettings.Saturation,
            Sharpness: currentSettings.Sharpness,
            AeEnable: currentSettings.AeEnable,
            AwbEnable: currentSettings.AwbEnable,
        };
        
        // Lưu preset
        const response = await fetch('/api/presets/save/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                settings: settingsToSave,
                is_default: isDefault
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert('Lỗi: ' + data.error);
        } else {
            alert('Đã lưu preset thành công!');
            document.getElementById('presetNameInput').value = '';
            document.getElementById('setAsDefault').checked = false;
            loadUnifiedPresets(); // Reload danh sách
        }
    } catch (error) {
        alert('Lỗi: ' + error.message);
    }
}

// Legacy function - redirect to unified preset
async function loadUserPreset() {
    const select = document.getElementById('unifiedPresetSelect');
    const value = select.value;
    
    if (!value || !value.startsWith('user:')) {
        alert('Vui lòng chọn preset của bạn');
        return;
    }
    
    await applySelectedPreset();
}

// Legacy function - redirect to unified preset
async function deleteUserPreset() {
    await deleteSelectedPreset();
}

// Refresh camera status with all technical parameters
// QUAN TRỌNG: Cập nhật từ StatusBoard (source of truth)
async function refreshCameraStatus() {
    try {
        // Reload StatusBoard từ camera
        if (window.CameraStatusBoard) {
            await window.CameraStatusBoard.loadFromCamera();
            
            // Lấy dữ liệu từ StatusBoard
            const systemInfo = window.CameraStatusBoard.getSystemInfo();
            const technicalSettings = window.CameraStatusBoard.getTechnicalSettings();
            const resolutionInfo = window.CameraStatusBoard.getResolutionInfo();
            
            // Update system info
            document.getElementById('settingsState').textContent = systemInfo.state || '-';
            document.getElementById('settingsMode').textContent = systemInfo.mode || '-';
            document.getElementById('settingsPreset').textContent = systemInfo.preset || '-';
            
            // Update technical settings
            const s = technicalSettings;
            
            // Format AnalogueGain (ISO)
            const gain = s.AnalogueGain;
            let gainText = '-';
            if (gain !== undefined && gain !== null) {
                if (gain === 0 || gain === 0.0) {
                    gainText = 'Auto';
                } else {
                    const iso = Math.round(gain * 100);
                    gainText = `${gain.toFixed(2)} (ISO ${iso})`;
                }
            }
            document.getElementById('statusAnalogueGain').textContent = gainText;
            
            // Format ExposureTime
            const expTime = s.ExposureTime;
            let expTimeText = '-';
            if (expTime !== undefined && expTime !== null) {
                if (expTime === 0) {
                    expTimeText = 'Auto';
                } else {
                    if (expTime < 1000) {
                        expTimeText = `${expTime} µs`;
                    } else if (expTime < 1000000) {
                        expTimeText = `${(expTime / 1000).toFixed(2)} ms`;
                    } else {
                        expTimeText = `${(expTime / 1000000).toFixed(2)} s`;
                    }
                }
            }
            document.getElementById('statusExposureTime').textContent = expTimeText;
            
            // Format ExposureValue
            const expValue = s.ExposureValue;
            document.getElementById('statusExposureValue').textContent = 
                (expValue !== undefined && expValue !== null) ? `${expValue >= 0 ? '+' : ''}${expValue.toFixed(2)} EV` : '-';
            
            // Format Contrast, Saturation, Sharpness
            document.getElementById('statusContrast').textContent = 
                (s.Contrast !== undefined && s.Contrast !== null) ? s.Contrast.toFixed(2) : '-';
            document.getElementById('statusSaturation').textContent = 
                (s.Saturation !== undefined && s.Saturation !== null) ? s.Saturation.toFixed(2) : '-';
            document.getElementById('statusSharpness').textContent = 
                (s.Sharpness !== undefined && s.Sharpness !== null) ? s.Sharpness.toFixed(2) : '-';
            
            // Format boolean values
            document.getElementById('statusAeEnable').textContent = 
                (s.AeEnable !== undefined) ? (s.AeEnable ? 'Bật' : 'Tắt') : '-';
            document.getElementById('statusAwbEnable').textContent = 
                (s.AwbEnable !== undefined) ? (s.AwbEnable ? 'Bật' : 'Tắt') : '-';
            
            // Frame rate
            const framerate = s.framerate;
            document.getElementById('statusFps').textContent = framerate ? `${framerate} fps` : '-';
            
            // Update resolution info
            if (resolutionInfo.resolution_main) {
                const width = resolutionInfo.resolution_main[0];
                const height = resolutionInfo.resolution_main[1];
                document.getElementById('statusResolution').textContent = `${width} × ${height}`;
                document.getElementById('statusMegapixels').textContent = 
                    resolutionInfo.megapixels ? resolutionInfo.megapixels.toFixed(2) : '-';
                document.getElementById('statusAspectRatio').textContent = 
                    resolutionInfo.aspect_ratio || '-';
            }
        } else {
            console.warn('[refreshCameraStatus] StatusBoard not available');
        }
        
    } catch (error) {
        console.error('Error refreshing camera status:', error);
    }
}

