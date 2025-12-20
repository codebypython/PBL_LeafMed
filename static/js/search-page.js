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
    'saturation': 'saturation'
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
    
    // KHÔNG auto-refresh camera status
    // Chỉ refresh khi:
    // 1. Load lần đầu
    // 2. Sau preset
    // 3. User click refresh thủ công
    // Đây là Optimistic Update pattern - UI là source of truth
    
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
    const uploadForm = document.getElementById('uploadForm');
    
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
    
    // Handle form submission with AJAX and show analysis panel
    if (uploadForm) {
        uploadForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleUploadAndAnalyze();
        });
    }
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

function handleUploadAndAnalyze() {
    const imageInput = document.getElementById('imageInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const previewImage = document.getElementById('previewImage');
    
    if (!imageInput.files || !imageInput.files[0]) {
        alert('Vui lòng chọn file ảnh!');
        return;
    }
    
    const file = imageInput.files[0];
    const originalBtnText = uploadBtn.textContent;
    
    // Step 1: Show loading state
    uploadBtn.disabled = true;
    uploadBtn.textContent = '📤 Đang tải lên...';
    
    // Step 2: Prepare form data
    const formData = new FormData();
    formData.append('image', file);
    
    // Step 3: Upload and get preview image URL
    const previewImageUrl = previewImage.src;
    
    // Step 4: Show analysis panel with loading state
    uploadBtn.textContent = '🔍 Đang phân tích...';
    showAnalysisPanelLoading({
        file: file.name,
        image_url: previewImageUrl,
        image_size_bytes: file.size
    });
    
    // Step 5: Upload to server
    fetch('/api/upload/analyze/', {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken(),
        },
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(analysisResult => {
        // Step 6: Update panel with analysis result
        uploadBtn.textContent = '✅ Hoàn thành!';
        updateAnalysisPanelWithResult(analysisResult);
        
        // Reset form
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalBtnText;
    })
    .catch(error => {
        console.error('Upload/Analysis error:', error);
        
        if (currentAnalysisData) {
            updateAnalysisPanelWithError(error.message);
        } else {
            alert('Lỗi: ' + error.message);
        }
        
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalBtnText;
    });
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
    // Ưu tiên dùng image_url hoặc file path để có ảnh full size, tránh dùng thumbnail bị resize sai tỷ lệ
    if (data.image_url) {
        return data.image_url.startsWith('/') ? window.PI_BASE_URL + data.image_url : data.image_url;
    } else if (data.file) {
        return window.PI_BASE_URL + '/history/image/' + data.file;
    } else if (data.image_b64) {
        return 'data:image/jpeg;base64,' + data.image_b64;
    } else if (data.image_b64_thumbnail) {
        // Chỉ dùng thumbnail khi không có lựa chọn nào khác
        return 'data:image/jpeg;base64,' + data.image_b64_thumbnail;
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
    
    // Lưu preview data
    currentAnalysisData = {
        ...previewData,
        loading: true
    };
    
    // Tạo HTML cho panel với loading state
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
            
            <div class="analysis-info-card" id="zoomInfoCard" style="display: ${previewData.zoom_info ? 'block' : 'none'};">
                <h3>🔍 Chất lượng ảnh</h3>
                <p class="value">${previewData.quality_info || 'Full resolution'}</p>
                ${previewData.zoom_info ? `<small style="color: var(--text-muted);">Zoom ${previewData.zoom_info.zoom}x • ${previewData.zoom_info.cropped_size ? previewData.zoom_info.cropped_size[0] + 'x' + previewData.zoom_info.cropped_size[1] : 'N/A'}</small>` : ''}
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
    
    // Cập nhật footer với nút disabled
    if (panelFooter) {
        panelFooter.innerHTML = `
            <button class="btn btn-secondary" onclick="closeAnalysisPanel()">Đóng</button>
            <button class="btn btn-primary btn-save" id="saveResultBtn" disabled>
                💾 Lưu kết quả
            </button>
        `;
    }
    
    // Hiển thị panel với animation
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
    
    // Tạo HTML với kết quả phân tích
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
    
    // Cập nhật footer với nút lưu (disabled nếu không được lưu)
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
            // Hiển thị thông báo thành công
            const panelBody = document.getElementById('analysisPanelBody');
            const successBadge = document.createElement('div');
            successBadge.className = 'analysis-success-badge';
            successBadge.style.marginBottom = '1rem';
            successBadge.innerHTML = '✅ ' + data.message;
            
            // Thêm badge vào đầu panel body
            panelBody.insertBefore(successBadge, panelBody.firstChild);
            
            // Đổi nút lưu thành "Đã lưu"
            saveBtn.textContent = '✅ Đã lưu';
            saveBtn.disabled = true;
            saveBtn.classList.remove('btn-primary');
            saveBtn.classList.add('btn-secondary');
            
            // Cập nhật currentAnalysisData để đánh dấu đã lưu
            currentAnalysisData.saved = true;
            
            // Cập nhật panel với thông tin đầy đủ từ database nếu có
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
    
    // Cập nhật các trường với dữ liệu đầy đủ từ database
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
    
    // Cập nhật các section chi tiết
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
    
    // Thêm các section khác nếu có
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
        if (window.updateZoomQuality) {
            window.updateZoomQuality(val);
        }
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

/**
 * Apply UI setting với validation
 * OPTIMISTIC UPDATE: UI đã update rồi, chỉ gửi request đến server
 */
async function applyUISettingSafe(settingName, elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`[UI] Element not found: ${elementId}`);
        return;
    }
    
    let value = parseFloat(element.value);
    
    // Validate
    if (isNaN(value)) {
        console.error(`[UI] Invalid value for ${settingName}:`, element.value);
        return;
    }
    
    // Clamp giá trị
    const min = parseFloat(element.min) || 0;
    const max = parseFloat(element.max) || 100;
    value = Math.max(min, Math.min(max, value));
    
    // Update element nếu bị clamp
    if (element.value != value) {
        element.value = value;
        updateUISettingDisplay(elementId, value);
    }
    
    // Apply setting
    if (window.cameraControls && window.cameraControls.applyUISetting) {
        try {
            console.log(`[UI] Applying ${settingName} = ${value}`);
            await window.cameraControls.applyUISetting(settingName, value);
            console.log(`[UI] Successfully applied ${settingName} = ${value}`);
        } catch (error) {
            console.error(`[UI] Error applying ${settingName}:`, error);
            alert(`Lỗi khi áp dụng ${settingName}: ${error.message}`);
        }
    } else {
        console.error('[UI] cameraControls not available');
        // Retry after a short delay
        setTimeout(() => {
            if (window.cameraControls && window.cameraControls.applyUISetting) {
                applyUISettingSafe(settingName, elementId);
            }
        }, 500);
    }
}

/**
 * Debounced apply - Tự động apply sau khi user ngừng điều chỉnh
 * 
 * OPTIMISTIC UPDATE PATTERN:
 * - UI cập nhật ngay lập tức (không đợi server)
 * - Gửi request đến server (background)
 * - Nếu error → hiển thị thông báo, KHÔNG reset slider
 * - Slider giữ nguyên giá trị user đã set
 */
function debouncedApplyUISetting(settingName, elementId) {
    const element = document.getElementById(elementId);
    
    // Skip nếu đang update programmatically (chỉ khi load lần đầu)
    if (element && element.dataset.programmaticUpdate === 'true') {
        console.log(`[UI] Skipping debounced apply for ${settingName} - programmatic update in progress`);
        return;
    }
    
    // Clear existing timer
    if (debounceTimers[settingName]) {
        clearTimeout(debounceTimers[settingName]);
    }
    
    // Set new timer (300ms delay - đủ để user điều chỉnh thoải mái)
    debounceTimers[settingName] = setTimeout(() => {
        if (element && element.dataset.programmaticUpdate === 'true') {
            console.log(`[UI] Skipping apply for ${settingName} - still programmatic update`);
            return;
        }
        applyUISettingSafe(settingName, elementId);
    }, 300);
}

/**
 * Điều chỉnh UI setting bằng nút +/-
 * @param elementId - ID của slider
 * @param delta - Giá trị thay đổi (ví dụ: -5 cho brightness, -0.1 cho zoom)
 *                Giá trị này là trực tiếp, KHÔNG nhân với step của slider
 */
function adjustUISetting(elementId, delta) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`[UI] Element not found: ${elementId}`);
        return;
    }
    
    const currentValue = parseFloat(element.value) || 0;
    const min = parseFloat(element.min) || 0;
    const max = parseFloat(element.max) || 100;
    
    // Calculate new value - delta là giá trị thay đổi trực tiếp
    let newValue = currentValue + delta;
    newValue = Math.max(min, Math.min(max, newValue));
    
    // Round để tránh floating point errors (ví dụ: 1.0000000001)
    // Zoom: 1 decimal, others: integer
    if (elementId === 'zoom') {
        newValue = Math.round(newValue * 10) / 10;  // 1 decimal place
    } else {
        newValue = Math.round(newValue);  // Integer
    }
    
    // Update slider và display NGAY LẬP TỨC (Optimistic Update)
    element.value = newValue;
    updateUISettingDisplay(elementId, newValue);
    
    // Update zoom quality badge nếu là zoom
    if (elementId === 'zoom' && window.updateZoomQuality) {
        window.updateZoomQuality(newValue);
    }
    
    // Apply to camera (background, không block UI)
    const settingName = settingNameMap[elementId];
    if (settingName) {
        applyUISettingSafe(settingName, elementId);
    }
}

// ============================================================
// ZOOM QUALITY INDICATOR
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

// ============================================================
// LOAD & RESET FUNCTIONS
// ============================================================

/**
 * Load UI settings từ camera
 */
async function loadUISettings() {
    if (!window.cameraControls) {
        console.warn('[UI] Camera controls not ready, retrying...');
        setTimeout(loadUISettings, 500);
        return;
    }
    
    try {
        // Load settings từ camera
        const settings = await window.cameraControls.loadUISettings();
        
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
                    setTimeout(() => delete zoomSlider.dataset.programmaticUpdate, 100);
                }
            }
            
            ['brightness', 'sharpness', 'contrast', 'saturation'].forEach(setting => {
                if (uiSettings[setting] !== undefined) {
                    const slider = document.getElementById(setting);
                    if (slider) {
                        slider.dataset.programmaticUpdate = 'true';
                        slider.value = uiSettings[setting];
                        updateUISettingDisplay(setting, uiSettings[setting]);
                        setTimeout(() => delete slider.dataset.programmaticUpdate, 100);
                    }
                }
            });
            
            console.log('[UI] Settings loaded from camera:', uiSettings);
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
                setTimeout(() => delete slider.dataset.programmaticUpdate, 100);
            }
        });
        
        // Apply to camera
        if (window.cameraControls) {
            await window.cameraControls.applyUISettings(defaults);
        }
        
        console.log('[UI] Reset to defaults completed');
    } catch (error) {
        console.error('[UI Settings] Error resetting:', error);
        alert('Lỗi khi reset: ' + error.message);
    }
}

// Export functions to global scope for inline event handlers
window.toggleSidebar = toggleSidebar;
window.showTab = showTab;
window.closeAnalysisPanel = closeAnalysisPanel;
window.saveAnalysisResult = saveAnalysisResult;
window.updateUISettingDisplay = updateUISettingDisplay;
window.debouncedApplyUISetting = debouncedApplyUISetting;
window.adjustUISetting = adjustUISetting;
window.updateZoomQuality = updateZoomQuality;
window.loadUISettings = loadUISettings;
window.resetToDefault = resetToDefault;
