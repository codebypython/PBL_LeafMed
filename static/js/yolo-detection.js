/**
 * YOLO Leaf Detection JavaScript Module
 * Handles real-time leaf detection, bounding box display, and interaction
 */

class YOLOLeafDetector {
    constructor(streamImageId, overlayCanvasId) {
        this.streamImage = document.getElementById(streamImageId);
        this.overlayCanvas = document.getElementById(overlayCanvasId);
        this.ctx = this.overlayCanvas.getContext('2d');
        
        this.detections = [];
        this.isDetecting = false;
        this.detectionInterval = null;
        this.confidence = 0.35;
        this.selectedBox = null;
        
        this.setupCanvas();
        this.bindEvents();
    }
    
    setupCanvas() {
        // Position canvas over stream image
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        this.overlayCanvas.style.pointerEvents = 'auto';
        this.overlayCanvas.style.cursor = 'pointer';
        
        // Set initial canvas size
        this.resizeCanvas();
    }
    
    resizeCanvas() {
        const rect = this.streamImage.getBoundingClientRect();
        this.overlayCanvas.width = rect.width;
        this.overlayCanvas.height = rect.height;
        this.overlayCanvas.style.width = rect.width + 'px';
        this.overlayCanvas.style.height = rect.height + 'px';
    }
    
    bindEvents() {
        // Resize canvas when stream image loads or window resizes
        this.streamImage.addEventListener('load', () => this.resizeCanvas());
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Handle clicks on bounding boxes
        this.overlayCanvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // Hover effects
        this.overlayCanvas.addEventListener('mousemove', (e) => this.handleCanvasHover(e));
    }
    
    async startDetection(intervalMs = 3000) {
        if (this.isDetecting) return;
        
        this.isDetecting = true;
        this.showDetectionStatus('🔄 Đang quét lá...', 'info');
        
        // Run initial detection
        await this.runDetection();
        
        // Set up interval for continuous detection
        this.detectionInterval = setInterval(async () => {
            if (this.isDetecting) {
                await this.runDetection();
            }
        }, intervalMs);
    }
    
    stopDetection() {
        this.isDetecting = false;
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
        this.clearCanvas();
        this.showDetectionStatus('', 'hidden');
    }
    
    async runDetection() {
        console.log('=== YOLO DETECTION DEBUG START ===');
        
        try {
            // Get CSRF token with detailed logging
            const csrfFromForm = document.querySelector('[name=csrfmiddlewaretoken]')?.value;
            const csrfFromMeta = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const csrfFromWindow = window.getCsrfToken ? window.getCsrfToken() : null;
            
            console.log('CSRF Token Sources:');
            console.log('- From form:', csrfFromForm ? 'Found' : 'Not found');
            console.log('- From meta:', csrfFromMeta ? 'Found' : 'Not found');  
            console.log('- From window.getCsrfToken:', csrfFromWindow ? 'Found' : 'Not found');
            
            const csrfToken = csrfFromForm || csrfFromMeta || csrfFromWindow || '';
            console.log('Final CSRF token:', csrfToken ? 'Available' : 'MISSING');
            
            const url = `/api/yolo/detect/?confidence=${this.confidence}`;
            console.log('Making request to:', url);
            console.log('Request headers:', {
                'X-CSRFToken': csrfToken ? '[PRESENT]' : '[MISSING]',
            });
            
            // Add timeout to prevent infinite pending
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-CSRFToken': csrfToken,
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            console.log('Response status:', response.status);
            console.log('Response ok:', response.ok);
            
            const result = await response.json();
            console.log('Response data:', result);
            
            if (result.success) {
                this.detections = result.detections || [];
                console.log('Detections found:', this.detections.length);
                this.drawBoundingBoxes();
                this.showDetectionStatus(`🍃 Tìm thấy ${result.total_leaves} lá`, 'success');
            } else {
                console.log('Detection failed:', result.error);
                this.showDetectionStatus(`❌ Lỗi: ${result.error}`, 'error');
            }
            
        } catch (error) {
            console.error('YOLO detection error:', error);
            console.log('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            this.showDetectionStatus(`❌ Lỗi kết nối`, 'error');
        }
        
        console.log('=== YOLO DETECTION DEBUG END ===');
    }
    
    drawBoundingBoxes() {
        this.clearCanvas();
        
        // Get scale factors
        const imageRect = this.streamImage.getBoundingClientRect();
        const scaleX = imageRect.width / this.streamImage.naturalWidth;
        const scaleY = imageRect.height / this.streamImage.naturalHeight;
        
        this.detections.forEach((detection, index) => {
            const bbox = detection.bbox;
            const confidence = detection.confidence;
            
            // Scale coordinates to canvas size
            const x = bbox.x1 * scaleX;
            const y = bbox.y1 * scaleY;
            const width = bbox.width * scaleX;
            const height = bbox.height * scaleY;
            
            // Set colors based on confidence and selection
            let strokeColor, fillColor;
            if (this.selectedBox && this.selectedBox.id === detection.id) {
                strokeColor = '#00ff00'; // Green for selected
                fillColor = 'rgba(0, 255, 0, 0.1)';
            } else if (confidence > 0.8) {
                strokeColor = '#00ff00'; // High confidence - green
                fillColor = 'rgba(0, 255, 0, 0.05)';
            } else if (confidence > 0.6) {
                strokeColor = '#ffff00'; // Medium confidence - yellow
                fillColor = 'rgba(255, 255, 0, 0.05)';
            } else {
                strokeColor = '#ff6600'; // Low confidence - orange
                fillColor = 'rgba(255, 102, 0, 0.05)';
            }
            
            // Draw bounding box
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 2;
            this.ctx.fillStyle = fillColor;
            
            this.ctx.fillRect(x, y, width, height);
            this.ctx.strokeRect(x, y, width, height);
            
            // Draw label
            const label = `Lá ${index + 1}: ${(confidence * 100).toFixed(0)}%`;
            this.ctx.font = '12px Arial';
            this.ctx.fillStyle = strokeColor;
            this.ctx.fillText(label, x + 5, y - 5);
            
            // Store coordinates for click detection
            detection._canvasCoords = { x, y, width, height };
        });
    }
    
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
    
    handleCanvasClick(e) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // Find clicked bounding box
        for (const detection of this.detections) {
            if (!detection._canvasCoords) continue;
            
            const { x, y, width, height } = detection._canvasCoords;
            
            if (clickX >= x && clickX <= x + width && 
                clickY >= y && clickY <= y + height) {
                
                this.selectBoundingBox(detection);
                return;
            }
        }
        
        // Click outside any box - deselect
        this.deselectBoundingBox();
    }
    
    handleCanvasHover(e) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        const hoverX = e.clientX - rect.left;
        const hoverY = e.clientY - rect.top;
        
        // Check if hovering over any bounding box
        let hovering = false;
        for (const detection of this.detections) {
            if (!detection._canvasCoords) continue;
            
            const { x, y, width, height } = detection._canvasCoords;
            
            if (hoverX >= x && hoverX <= x + width && 
                hoverY >= y && hoverY <= y + height) {
                hovering = true;
                break;
            }
        }
        
        this.overlayCanvas.style.cursor = hovering ? 'pointer' : 'default';
    }
    
    selectBoundingBox(detection) {
        this.selectedBox = detection;
        this.drawBoundingBoxes(); // Redraw with selection highlight
        
        // Show crop/analyze options
        this.showCropOptions(detection);
    }
    
    deselectBoundingBox() {
        this.selectedBox = null;
        this.drawBoundingBoxes();
        this.hideCropOptions();
    }
    
    showCropOptions(detection) {
        // Create or update crop options panel
        let panel = document.getElementById('yoloCropPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'yoloCropPanel';
            panel.className = 'yolo-crop-panel';
            document.body.appendChild(panel);
        }
        
        panel.innerHTML = `
            <div class="crop-panel-header">
                <h4>🍃 Lá đã chọn</h4>
                <button onclick="window.yoloDetector.deselectBoundingBox()">×</button>
            </div>
            <div class="crop-panel-body">
                <p>Độ tin cậy: <strong>${(detection.confidence * 100).toFixed(1)}%</strong></p>
                <div class="crop-actions">
                    <button class="btn btn-primary" onclick="window.yoloDetector.cropAndAnalyze('${detection.id}')">
                        🔍 Phân tích lá
                    </button>
                </div>
            </div>
        `;
        
        panel.style.display = 'block';
    }
    
    hideCropOptions() {
        const panel = document.getElementById('yoloCropPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    }
    
    async cropAndAnalyze(detectionId) {
        const detection = this.detections.find(d => d.id === detectionId);
        if (!detection) return;
        
        try {
            this.showCropStatus('🔄 Đang cắt ảnh...', 'info');
            
            // Get CSRF token
            const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
                             document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
                             (window.getCsrfToken ? window.getCsrfToken() : '');
            
            // Step 1: Crop the image and save locally 
            const cropResponse = await fetch('/api/yolo/crop/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                },
                body: JSON.stringify({
                    bbox: detection.bbox,
                    auto_analyze: false  // Just crop and save locally
                })
            });
            
            const cropResult = await cropResponse.json();
            
            if (!cropResult.success) {
                this.showCropStatus(`❌ Lỗi cắt ảnh: ${cropResult.error}`, 'error');
                return;
            }
            
            // Show analysis panel with loading state
            if (cropResult.cropped_image_b64) {
                // Convert base64 to data URL for preview
                const imageDataUrl = 'data:image/jpeg;base64,' + cropResult.cropped_image_b64;
                
                // Show loading panel using existing function from search-page.js
                if (window.showAnalysisPanelLoading) {
                    window.showAnalysisPanelLoading({
                        previewUrl: imageDataUrl,
                        timestamp: new Date().toLocaleString('vi-VN')
                    });
                }
                
                // Hide crop options panel
                this.hideCropOptions();
            }
            
            this.showCropStatus('🔄 Đang phân tích với Pi...', 'info');
            
            // Step 2: Convert base64 to file and call api_upload_analyze
            if (cropResult.cropped_image_b64 && cropResult.saved_filename) {
                try {
                    // Convert base64 to blob
                    const base64Data = cropResult.cropped_image_b64;
                    const byteCharacters = atob(base64Data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'image/jpeg' });
                    
                    // Create file object
                    const file = new File([blob], cropResult.saved_filename, { 
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    
                    // Use FormData to call api_upload_analyze
                    const formData = new FormData();
                    formData.append('image', file);
                    
                    // Call API upload analyze (same as manual upload)
                    const analyzeResponse = await fetch('/api/upload/analyze/', {
                        method: 'POST',
                        headers: {
                            'X-CSRFToken': csrfToken,
                        },
                        body: formData
                    });
                    
                    if (!analyzeResponse.ok) {
                        throw new Error(`HTTP error! status: ${analyzeResponse.status}`);
                    }
                    
                    const analysisResult = await analyzeResponse.json();
                    
                    if (analysisResult.success) {
                        // Update analysis panel with result using existing function
                        if (window.updateAnalysisPanelWithResult) {
                            window.updateAnalysisPanelWithResult(analysisResult);
                        }
                        this.showCropStatus('✅ Phân tích thành công!', 'success');
                        
                        // Hide crop status after 2 seconds
                        setTimeout(() => {
                            this.showCropStatus('', 'hidden');
                        }, 2000);
                    } else {
                        if (window.updateAnalysisPanelWithError) {
                            window.updateAnalysisPanelWithError(analysisResult.error || 'Phân tích thất bại');
                        }
                        this.showCropStatus(`❌ Phân tích thất bại: ${analysisResult.error}`, 'error');
                    }
                    
                } catch (uploadError) {
                    console.error('Upload error:', uploadError);
                    if (window.updateAnalysisPanelWithError) {
                        window.updateAnalysisPanelWithError('Không thể kết nối với server');
                    }
                    this.showCropStatus(`❌ Lỗi: ${uploadError.message}`, 'error');
                }
                
            } else {
                this.showCropStatus('❌ Không thể lấy ảnh đã cắt', 'error');
            }
            
        } catch (error) {
            console.error('Crop and analyze error:', error);
            this.showCropStatus('❌ Lỗi kết nối', 'error');
        }
    }
    
    async cropOnly(detectionId) {
        const detection = this.detections.find(d => d.id === detectionId);
        if (!detection) return;
        
        try {
            this.showCropStatus('✂️ Đang cắt ảnh...', 'info');
            
            // Get CSRF token
            const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
                             document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
                             (window.getCsrfToken ? window.getCsrfToken() : '');
            
            const response = await fetch('/api/yolo/crop/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                },
                body: JSON.stringify({
                    bbox: detection.bbox,
                    auto_analyze: false
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Show cropped image in new window/modal
                this.showCroppedImage(result.cropped_image_b64);
                this.showCropStatus('✅ Cắt ảnh thành công!', 'success');
            } else {
                this.showCropStatus(`❌ Lỗi: ${result.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Crop error:', error);
            this.showCropStatus('❌ Lỗi kết nối', 'error');
        }
    }
    
    showAnalysisResult(result, thumbnailB64) {
        // Reuse existing analysis panel if available
        if (typeof updateAnalysisPanelWithResult === 'function') {
            const analysisData = {
                ...result,
                image_b64_thumbnail: thumbnailB64
            };
            updateAnalysisPanelWithResult(analysisData);
        } else {
            // Fallback: simple alert
            alert(`Kết quả phân tích:\nTên: ${result.name}\nĐộ tin cậy: ${(result.confidence * 100).toFixed(1)}%`);
        }
    }
    
    showCroppedImage(imageB64) {
        // Create modal to show cropped image
        let modal = document.getElementById('croppedImageModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'croppedImageModal';
            modal.className = 'cropped-image-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h4>Ảnh đã cắt</h4>
                        <button onclick="this.parentElement.parentElement.parentElement.style.display='none'">×</button>
                    </div>
                    <div class="modal-body">
                        <img id="croppedImageDisplay" alt="Cropped leaf" />
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        const img = modal.querySelector('#croppedImageDisplay');
        img.src = `data:image/jpeg;base64,${imageB64}`;
        modal.style.display = 'block';
    }
    
    showDetectionStatus(message, type) {
        let statusEl = document.getElementById('yoloDetectionStatus');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'yoloDetectionStatus';
            statusEl.className = 'yolo-detection-status';
            
            // Insert after stream container
            const streamContainer = document.querySelector('.stream-container');
            if (streamContainer) {
                streamContainer.appendChild(statusEl);
            }
        }
        
        statusEl.textContent = message;
        statusEl.className = `yolo-detection-status ${type}`;
        
        if (type === 'hidden') {
            statusEl.style.display = 'none';
        } else {
            statusEl.style.display = 'block';
        }
    }
    
    showCropStatus(message, type) {
        const panel = document.getElementById('yoloCropPanel');
        if (!panel) return;
        
        let statusEl = panel.querySelector('.crop-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.className = 'crop-status';
            panel.appendChild(statusEl);
        }
        
        statusEl.textContent = message;
        statusEl.className = `crop-status ${type}`;
        
        // Auto-hide success/error messages
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                statusEl.textContent = '';
            }, 3000);
        }
    }
    
    setConfidence(confidence) {
        this.confidence = Math.max(0.1, Math.min(0.9, confidence));
    }
}

// Global functions for external access
window.toggleYOLODetection = function() {
    if (!window.yoloDetector) {
        console.error('YOLO detector not initialized');
        return;
    }
    
    if (window.yoloDetector.isDetecting) {
        window.yoloDetector.stopDetection();
        document.getElementById('yoloToggleBtn').textContent = '🔍 Bắt đầu quét lá';
    } else {
        window.yoloDetector.startDetection();
        document.getElementById('yoloToggleBtn').textContent = '⏸️ Dừng quét';
    }
};

window.setYOLOConfidence = function(confidence) {
    if (window.yoloDetector) {
        window.yoloDetector.setConfidence(confidence);
    }
};