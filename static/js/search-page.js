/**
 * Search Page JavaScript
 * Handles camera capture, image upload, analysis panel, and camera controls
 */

// Global variables
let currentAnalysisData = null;
const debounceTimers = {};

// Map elementId to setting name
const settingNameMap = {
    'zoom': 'zoom',
    'brightness': 'brightness',
    'sharpness': 'sharpness',
    'contrast': 'contrast',
    'saturation': 'saturation',
    'backgroundBlur': 'background_blur'
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    initializeSearchPage();
});

function initializeSearchPage() {
    // Kiểm tra trạng thái khi load
    checkPiStatus();
    setInterval(checkPiStatus, 30000);
    loadUnifiedPresets();
    
    // Load camera status từ StatusBoard khi trang load
    setTimeout(async () => {
        if (window.CameraStatusBoard) {
            await window.CameraStatusBoard.loadFromCamera();
            refreshCameraStatus();
        } else {
            refreshCameraStatus();
        }
    }, 500);
    
    // Auto-refresh camera status every 5 seconds
    setInterval(async () => {
        if (window.CameraStatusBoard) {
            await window.CameraStatusBoard.loadFromCamera();
            refreshCameraStatus();
        } else {
            refreshCameraStatus();
        }
    }, 5000);
    
    // Load resolution profiles khi trang load
    if (window.loadResolutionProfiles) {
        setTimeout(() => {
            loadResolutionProfiles();
        }, 500);
    }
    
    // Setup event listeners
    setupUploadFunctionality();
    setupCaptureForm();
    setupAnalysisPanel();
    setupStreamErrorHandler();
}

// ============================================================
// SIDEBAR & TAB MANAGEMENT
// ============================================================

function toggleSidebar() {
    const sidebar = document.getElementById('controlsSidebar');
    sidebar.classList.toggle('open');
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabName + '-tab').style.display = 'block';
    document.getElementById('tab-' + tabName).classList.add('active');
}

// ============================================================
// UPLOAD FUNCTIONALITY
// ============================================================

function setupUploadFunctionality() {
    const uploadArea = document.getElementById('uploadArea');
    const imageInput = document.getElementById('imageInput');
    const previewImage = document.getElementById('previewImage');
    const uploadBtn = document.getElementById('uploadBtn');
    
    if (!uploadArea || !imageInput) return;
    
    uploadArea.addEventListener('click', () => imageInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary)';
        uploadArea.style.background = 'rgba(212, 175, 55, 0.05)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--border-color)';
        uploadArea.style.background = 'var(--bg-primary)';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border-color)';
        uploadArea.style.background = 'var(--bg-primary)';
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            imageInput.files = files;
            handleFileSelect(files[0]);
        }
    });
    
    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

function handleFileSelect(file) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        alert('Chỉ chấp nhận file ảnh: JPG, PNG, WebP');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        alert('File ảnh quá lớn (tối đa 10MB)');
        return;
    }
    
    const reader = new FileReader();
    const previewImage = document.getElementById('previewImage');
    const uploadBtn = document.getElementById('uploadBtn');
    
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewImage.style.display = 'block';
        const placeholder = document.querySelector('.upload-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        uploadBtn.disabled = false;
    };
    reader.readAsDataURL(file);
}

// ============================================================
// CAPTURE FUNCTIONALITY
// ============================================================

function setupCaptureForm() {
    const captureForm = document.getElementById('captureForm');
    if (!captureForm) return;
    
    captureForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const captureBtn = document.getElementById('captureBtn');
        const streamOverlay = document.getElementById('streamOverlay');
        const streamImage = document.getElementById('streamImage');
        const originalStreamUrl = streamImage.src;
        
        // Step 1: Disable button and show loading
        captureBtn.disabled = true;
        captureBtn.textContent = '📸 Đang chụp...';
        streamOverlay.style.display = 'flex';
        
        // Step 2: Capture preview
        fetch('/api/capture/preview/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'Content-Type': 'application/json',
            },
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data.success) {
                throw new Error(data.error || 'Lỗi chụp ảnh');
            }
            
            // Step 3: Display captured image
            let capturedImageUrl = getCapturedImageUrl(data);
            if (capturedImageUrl) {
                streamImage.src = capturedImageUrl;
            }
            
            // Step 4: Show analysis panel with loading state
            captureBtn.textContent = '🔍 Đang phân tích...';
            showAnalysisPanelLoading({
                file: data.file,
                image_url: capturedImageUrl || (data.image_url ? (data.image_url.startsWith('/') ? window.PI_BASE_URL + data.image_url : data.image_url) : ''),
                image_size_bytes: data.image_size_bytes
            });
            
            // Step 5: Analyze captured image
            return analyzeImage(data.file);
        })
        .then(analysisResult => {
            // Step 6: Update panel with analysis result
            captureBtn.textContent = '✅ Hoàn thành!';
            updateAnalysisPanelWithResult(analysisResult);
            
            // Restore stream
            streamImage.src = originalStreamUrl;
            captureBtn.disabled = false;
            captureBtn.textContent = '📸 Chụp ảnh và phân tích';
            streamOverlay.style.display = 'none';
        })
        .catch(error => {
            console.error('Capture/Analysis error:', error);
            
            if (currentAnalysisData) {
                updateAnalysisPanelWithError(error.message);
            } else {
                alert('Lỗi: ' + error.message);
            }
            
            // Restore stream
            streamImage.src = originalStreamUrl;
            captureBtn.disabled = false;
            captureBtn.textContent = '📸 Chụp ảnh và phân tích';
            streamOverlay.style.display = 'none';
        });
    });
}

function getCapturedImageUrl(data) {
    if (data.image_b64_thumbnail) {
        return 'data:image/jpeg;base64,' + data.image_b64_thumbnail;
    } else if (data.image_b64) {
        return 'data:image/jpeg;base64,' + data.image_b64;
    } else if (data.image_url) {
        return data.image_url.startsWith('/') ? window.PI_BASE_URL + data.image_url : data.image_url;
    } else if (data.file) {
        return window.PI_BASE_URL + '/history/image/' + data.file;
    }
    return '';
}

function analyzeImage(filename) {
    return fetch('/api/capture/analyze/', {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename: filename }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(analysisResult => {
        if (!analysisResult.success) {
            throw new Error(analysisResult.error || 'Lỗi phân tích');
        }
        return analysisResult;
    });
}

// ============================================================
// ANALYSIS PANEL
// ============================================================

function setupAnalysisPanel() {
    const panel = document.getElementById('analysisPanel');
    if (!panel) return;
    
    // Close panel when clicking overlay
    panel.addEventListener('click', function(e) {
        if (e.target === this) {
            closeAnalysisPanel();
        }
    });
    
    // Close panel with ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && panel && panel.classList.contains('show')) {
            closeAnalysisPanel();
        }
    });
}

function showAnalysisPanelLoading(previewData) {
    const panel = document.getElementById('analysisPanel');
    const panelBody = document.getElementById('analysisPanelBody');
    const panelFooter = document.querySelector('.analysis-panel-footer');
    
    currentAnalysisData = {
        ...previewData,
        loading: true
    };
    
    panelBody.innerHTML = `
        <div class="analysis-image-section">
            <img src="${escapeHtml(previewData.image_url)}" alt="Captured image" id="analysisPanelImage">
        </div>
        
        <div class="analysis-info-grid">
            <div class="analysis-info-card">
                <h3>🌿 Tên tiếng Việt</h3>
                <p class="value"><span class="loading-skeleton"></span></p>
            </div>
            
            <div class="analysis-info-card">
                <h3>🔬 Tên khoa học</h3>
                <p class="value"><span class="loading-skeleton"></span></p>
            </div>
            
            <div class="analysis-info-card">
                <h3>🌍 Tên tiếng Anh</h3>
                <p class="value"><span class="loading-skeleton"></span></p>
            </div>
            
            <div class="analysis-info-card">
                <h3>📊 Độ tin cậy</h3>
                <div class="confidence-display">
                    <span class="confidence-value"><span class="loading-skeleton" style="width: 60px;"></span></span>
                    <div class="confidence-bar-container">
                        <div class="confidence-bar">
                            <div class="confidence-bar-fill" style="width: 0%;"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="analysis-info-card">
                <h3>📏 Kích thước ảnh</h3>
                <p class="value">${previewData.image_size_bytes ? (previewData.image_size_bytes / 1024).toFixed(1) + ' KB' : 'N/A'}</p>
            </div>
            
            <div class="analysis-info-card">
                <h3>📅 Thời gian</h3>
                <p class="value">${new Date().toLocaleString('vi-VN')}</p>
            </div>
        </div>
        
        <div class="analysis-detail-section">
            <h3>📝 Mô tả chi tiết</h3>
            <div class="analysis-detail-content"><span class="loading-skeleton"></span></div>
        </div>
        
        <div class="analysis-detail-section">
            <h3>💊 Công dụng</h3>
            <div class="analysis-detail-content"><span class="loading-skeleton"></span></div>
        </div>
        
        <div class="analysis-detail-section">
            <h3>📍 Vị trí phân bố</h3>
            <div class="analysis-detail-content"><span class="loading-skeleton"></span></div>
        </div>
    `;
    
    if (panelFooter) {
        panelFooter.innerHTML = `
            <button class="btn btn-secondary" onclick="closeAnalysisPanel()">Đóng</button>
            <button class="btn btn-primary btn-save" id="saveResultBtn" disabled>
                💾 Lưu kết quả
            </button>
        `;
    }
    
    panel.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function updateAnalysisPanelWithResult(analysisResult) {
    const panelBody = document.getElementById('analysisPanelBody');
    const panelFooter = document.querySelector('.analysis-panel-footer');
    
    const label = (analysisResult.name || '').toLowerCase();
    const isNotSavable = label === 'background' || label === 'green_but_not_leaf';
    
    const confidencePercent = Math.round((analysisResult.confidence || 0) * 100);
    let confidenceClass = 'high';
    let confidenceColor = '#4CAF50';
    if (confidencePercent < 70) {
        confidenceClass = 'medium';
        confidenceColor = '#FF9800';
    }
    if (confidencePercent < 50) {
        confidenceClass = 'low';
        confidenceColor = '#F44336';
    }
    
    let preservedImageUrl = '';
    if (currentAnalysisData?.image_url) {
        preservedImageUrl = currentAnalysisData.image_url;
    } else if (analysisResult.image_url) {
        preservedImageUrl = analysisResult.image_url.startsWith('/') ? 
                            window.PI_BASE_URL + analysisResult.image_url : 
                            analysisResult.image_url;
    } else if (analysisResult.file) {
        preservedImageUrl = window.PI_BASE_URL + '/history/image/' + analysisResult.file;
    }
    
    const { image_url: _, ...analysisResultWithoutImageUrl } = analysisResult;
    currentAnalysisData = {
        ...currentAnalysisData,
        ...analysisResultWithoutImageUrl,
        image_url: preservedImageUrl,
        loading: false,
        isNotSavable: isNotSavable
    };
    
    panelBody.innerHTML = `
        ${isNotSavable ? `
        <div class="analysis-warning-badge">
            ⚠️ Kết quả này không được lưu vào database: "${escapeHtml(analysisResult.name)}"
        </div>
        ` : ''}
        
        <div class="analysis-image-section">
            <img src="${escapeHtml(preservedImageUrl)}" alt="Captured image" id="analysisPanelImage" 
                 onerror="console.error('Failed to load image:', this.src); this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'400\\' height=\\'300\\'%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\' fill=\\'%23999\\'%3EKhông thể tải ảnh%3C/text%3E%3C/svg%3E';">
        </div>
        
        <div class="analysis-info-grid">
            <div class="analysis-info-card">
                <h3>🌿 Tên tiếng Việt</h3>
                <p class="value">${escapeHtml(analysisResult.name || 'Đang phân tích...')}</p>
            </div>
            
            <div class="analysis-info-card">
                <h3>🔬 Tên khoa học</h3>
                <p class="value empty">Chưa có thông tin</p>
            </div>
            
            <div class="analysis-info-card">
                <h3>🌍 Tên tiếng Anh</h3>
                <p class="value empty">Chưa có thông tin</p>
            </div>
            
            <div class="analysis-info-card">
                <h3>📊 Độ tin cậy</h3>
                <div class="confidence-display">
                    <span class="confidence-value" style="color: ${confidenceColor};">${confidencePercent}%</span>
                    <div class="confidence-bar-container">
                        <div class="confidence-bar">
                            <div class="confidence-bar-fill ${confidenceClass}" style="width: ${confidencePercent}%;"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="analysis-info-card">
                <h3>📏 Kích thước ảnh</h3>
                <p class="value">${currentAnalysisData.image_size_bytes ? (currentAnalysisData.image_size_bytes / 1024).toFixed(1) + ' KB' : 'N/A'}</p>
            </div>
            
            <div class="analysis-info-card">
                <h3>📅 Thời gian</h3>
                <p class="value">${new Date().toLocaleString('vi-VN')}</p>
            </div>
        </div>
        
        <div class="analysis-detail-section">
            <h3>📝 Mô tả chi tiết</h3>
            <div class="analysis-detail-content empty">Chưa có thông tin</div>
        </div>
        
        <div class="analysis-detail-section">
            <h3>💊 Công dụng</h3>
            <div class="analysis-detail-content empty">Chưa có thông tin</div>
        </div>
        
        <div class="analysis-detail-section">
            <h3>📍 Vị trí phân bố</h3>
            <div class="analysis-detail-content empty">Chưa có thông tin</div>
        </div>
    `;
    
    if (panelFooter) {
        panelFooter.innerHTML = `
            <button class="btn btn-secondary" onclick="closeAnalysisPanel()">Đóng</button>
            <button class="btn btn-primary btn-save" id="saveResultBtn" onclick="saveAnalysisResult()" ${isNotSavable ? 'disabled' : ''}>
                💾 Lưu kết quả
            </button>
        `;
    }
}

function updateAnalysisPanelWithError(errorMessage) {
    const panelBody = document.getElementById('analysisPanelBody');
    const panelFooter = document.querySelector('.analysis-panel-footer');
    
    panelBody.innerHTML = `
        <div class="analysis-warning-badge">
            ❌ Lỗi phân tích: ${escapeHtml(errorMessage)}
        </div>
        
        <div class="analysis-image-section">
            <img src="${escapeHtml(currentAnalysisData?.image_url || '')}" alt="Captured image" id="analysisPanelImage">
        </div>
    `;
    
    if (panelFooter) {
        panelFooter.innerHTML = `
            <button class="btn btn-secondary" onclick="closeAnalysisPanel()">Đóng</button>
        `;
    }
}

function saveAnalysisResult() {
    if (!currentAnalysisData || currentAnalysisData.loading || currentAnalysisData.isNotSavable) {
        return;
    }
    
    const saveBtn = document.getElementById('saveResultBtn');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Đang lưu...';
    
    fetch('/api/capture/save/', {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: currentAnalysisData.name,
            confidence: currentAnalysisData.confidence,
            file: currentAnalysisData.file,
            image_url: currentAnalysisData.image_url,
            image_size_bytes: currentAnalysisData.image_size_bytes
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const panelBody = document.getElementById('analysisPanelBody');
            const successBadge = document.createElement('div');
            successBadge.className = 'analysis-success-badge';
            successBadge.style.marginBottom = '1rem';
            successBadge.innerHTML = '✅ ' + data.message;
            
            panelBody.insertBefore(successBadge, panelBody.firstChild);
            
            saveBtn.textContent = '✅ Đã lưu';
            saveBtn.disabled = true;
            saveBtn.classList.remove('btn-primary');
            saveBtn.classList.add('btn-secondary');
            
            currentAnalysisData.saved = true;
            
            if (data.result) {
                updatePanelWithFullData(data.result);
            }
        } else {
            throw new Error(data.error || 'Lỗi lưu kết quả');
        }
    })
    .catch(error => {
        console.error('Save error:', error);
        alert('Lỗi: ' + error.message);
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    });
}

function updatePanelWithFullData(fullData) {
    const panelBody = document.getElementById('analysisPanelBody');
    
    const nameCard = panelBody.querySelector('.analysis-info-card:nth-child(2) .value');
    if (nameCard) {
        nameCard.textContent = fullData.vietnamese_name || fullData.name || '';
        nameCard.classList.remove('empty');
    }
    
    const scientificCard = panelBody.querySelector('.analysis-info-card:nth-child(3) .value');
    if (scientificCard && fullData.scientific_name) {
        scientificCard.textContent = fullData.scientific_name;
        scientificCard.classList.remove('empty');
    }
    
    const englishCard = panelBody.querySelector('.analysis-info-card:nth-child(4) .value');
    if (englishCard && fullData.english_name) {
        englishCard.textContent = fullData.english_name;
        englishCard.classList.remove('empty');
    }
    
    if (fullData.description) {
        const descSection = panelBody.querySelector('.analysis-detail-section:nth-child(4) .analysis-detail-content');
        if (descSection) {
            descSection.textContent = fullData.description;
            descSection.classList.remove('empty');
        }
    }
    
    if (fullData.usage) {
        const usageSection = panelBody.querySelector('.analysis-detail-section:nth-child(5) .analysis-detail-content');
        if (usageSection) {
            usageSection.textContent = fullData.usage;
            usageSection.classList.remove('empty');
        }
    }
    
    if (fullData.common_locations) {
        const locationSection = panelBody.querySelector('.analysis-detail-section:nth-child(6) .analysis-detail-content');
        if (locationSection) {
            locationSection.textContent = fullData.common_locations;
            locationSection.classList.remove('empty');
        }
    }
    
    if (fullData.biological_info) {
        let bioSection = panelBody.querySelector('.analysis-detail-section:nth-child(7)');
        if (!bioSection) {
            bioSection = document.createElement('div');
            bioSection.className = 'analysis-detail-section';
            bioSection.innerHTML = `
                <h3>🔬 Thông tin sinh học</h3>
                <div class="analysis-detail-content">${escapeHtml(fullData.biological_info)}</div>
            `;
            panelBody.appendChild(bioSection);
        }
    }
    
    if (fullData.medicinal_info) {
        let medSection = panelBody.querySelector('.analysis-detail-section:nth-child(8)');
        if (!medSection) {
            medSection = document.createElement('div');
            medSection.className = 'analysis-detail-section';
            medSection.innerHTML = `
                <h3>💉 Thông tin dược liệu</h3>
                <div class="analysis-detail-content">${escapeHtml(fullData.medicinal_info)}</div>
            `;
            panelBody.appendChild(medSection);
        }
    }
}

function closeAnalysisPanel() {
    const panel = document.getElementById('analysisPanel');
    panel.classList.remove('show');
    document.body.style.overflow = '';
    currentAnalysisData = null;
}

// ============================================================
// CAMERA CONTROLS HELPERS
// ============================================================

function updateUISettingDisplay(elementId, value) {
    const val = parseFloat(value) || 0;
    const valueElement = document.getElementById(elementId + 'Value');
    if (!valueElement) return;
    
    if (elementId === 'brightness') {
        valueElement.textContent = (val >= 0 ? '+' : '') + val.toFixed(0) + '%';
    } else {
        valueElement.textContent = val.toFixed(0) + '%';
    }
    
    const slider = document.getElementById(elementId);
    if (slider && window.cameraControls && window.cameraControls.ui) {
        window.cameraControls.ui.updateRangeBackground(slider);
    }
}

async function applyUISettingSafe(settingName, elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`[UI] Element not found: ${elementId}`);
        return;
    }
    
    let value = parseFloat(element.value);
    
    if (isNaN(value)) {
        console.error(`[UI] Invalid value for ${settingName}:`, element.value);
        return;
    }
    
    const min = parseFloat(element.min) || 0;
    const max = parseFloat(element.max) || 100;
    value = Math.max(min, Math.min(max, value));
    
    if (element.value != value) {
        element.value = value;
        updateUISettingDisplay(elementId, value);
    }
    
    if (window.cameraControls && window.cameraControls.applyUISetting) {
        try {
            await window.cameraControls.applyUISetting(settingName, value);
        } catch (error) {
            console.error(`[UI] Error applying ${settingName}:`, error);
            alert(`Lỗi khi áp dụng ${settingName}: ${error.message}`);
        }
    } else {
        console.error('[UI] cameraControls not available');
    }
}

function debouncedApplyUISetting(settingName, elementId) {
    const element = document.getElementById(elementId);
    
    if (element && element.dataset.programmaticUpdate === 'true') {
        console.log(`[UI] Skipping debounced apply for ${settingName} - programmatic update in progress`);
        return;
    }
    
    if (debounceTimers[settingName]) {
        clearTimeout(debounceTimers[settingName]);
    }
    
    debounceTimers[settingName] = setTimeout(() => {
        if (element && element.dataset.programmaticUpdate === 'true') {
            console.log(`[UI] Skipping apply for ${settingName} - still programmatic update`);
            return;
        }
        applyUISettingSafe(settingName, elementId);
    }, 300);
}

function adjustUISetting(elementId, step) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`[UI] Element not found: ${elementId}`);
        return;
    }
    
    const currentValue = parseFloat(element.value) || 0;
    const min = parseFloat(element.min) || 0;
    const max = parseFloat(element.max) || 100;
    const stepValue = parseFloat(element.step) || 5;
    
    let newValue = currentValue + (step * stepValue);
    newValue = Math.max(min, Math.min(max, newValue));
    
    element.value = newValue;
    updateUISettingDisplay(elementId, newValue);
    
    const settingName = settingNameMap[elementId];
    if (settingName) {
        applyUISettingSafe(settingName, elementId);
    }
}

// ============================================================
// STREAM ERROR HANDLER
// ============================================================

function setupStreamErrorHandler() {
    const streamImage = document.getElementById('streamImage');
    if (streamImage) {
        streamImage.addEventListener('error', function() {
            this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle" fill="%23999"%3EStream không khả dụng%3C/text%3E%3C/svg%3E';
        });
    }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export functions to global scope for inline event handlers
window.toggleSidebar = toggleSidebar;
window.showTab = showTab;
window.closeAnalysisPanel = closeAnalysisPanel;
window.saveAnalysisResult = saveAnalysisResult;
window.updateUISettingDisplay = updateUISettingDisplay;
window.debouncedApplyUISetting = debouncedApplyUISetting;
window.adjustUISetting = adjustUISetting;
