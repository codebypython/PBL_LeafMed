"""
Service layer để giao tiếp với Pi API
Xử lý retry, error handling, và các tương tác với Pi
"""
import requests
import time
from typing import Dict, Optional
from django.conf import settings


class PiClient:
    """Client để giao tiếp với Pi API"""
    
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.PI_API_BASE_URL).rstrip('/')
        self.timeout = 30
    
    def _request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Thực hiện HTTP request với retry logic"""
        url = f"{self.base_url}{endpoint}"
        max_retries = 3
        retry_delay = 1.0
        
        for attempt in range(max_retries):
            try:
                kwargs.setdefault('timeout', self.timeout)
                response = requests.request(method, url, **kwargs)
                return response
            except requests.exceptions.RequestException:
                if attempt == max_retries - 1:
                    raise
                time.sleep(retry_delay * (attempt + 1))
        raise requests.exceptions.RequestException("Max retries exceeded")
    
    def get_status(self) -> Dict:
        """Lấy trạng thái hệ thống Pi"""
        try:
            response = self._request('GET', '/status')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e), "camera": {"state": "error"}, "model_loaded": False}
    
    def pause_stream(self) -> Dict:
        """Tạm dừng stream"""
        try:
            response = self._request('POST', '/stream/pause')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def resume_stream(self) -> Dict:
        """Tiếp tục stream"""
        try:
            response = self._request('POST', '/stream/resume')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def capture_preview(self) -> Dict:
        """
        Capture ảnh và trả về ngay để hiển thị (preview) - KHÔNG phân tích
        Trả về thumbnail nhỏ để hiển thị ngay trên client
        
        Returns:
            Dict với success, file, image_url, image_b64_thumbnail (base64 nhỏ để hiển thị ngay)
        """
        try:
            data = {
                'return_image': 'true',  # Trả về thumbnail để hiển thị ngay
            }
            # Timeout ngắn vì chỉ capture, không phân tích
            response = self._request('POST', '/capture/preview', data=data, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def analyze_image(self, filename: str) -> Dict:
        """
        Phân tích ảnh đã capture từ preview
        
        Args:
            filename: Tên file ảnh đã capture từ preview
        
        Returns:
            Dict với success, name, confidence, file
        """
        try:
            data = {
                'filename': filename,
            }
            # Timeout dài vì có phân tích model
            response = self._request('POST', '/capture/analyze', data=data, timeout=120)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def upload_image(self, file_data: bytes, filename: str, content_type: str) -> Dict:
        """Upload ảnh để phân tích"""
        try:
            files = {'image': (filename, file_data, content_type)}
            response = self._request('POST', '/upload', files=files, timeout=60)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_history(self, limit: int = 100) -> Dict:
        """Lấy danh sách lịch sử"""
        try:
            response = self._request('GET', f'/history?limit={limit}')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"success": False, "error": str(e), "files": []}
    
    def get_history_image_url(self, filename: str) -> str:
        """Lấy URL ảnh từ lịch sử"""
        return f"{self.base_url}/history/image/{filename}"
    
    def get_settings(self) -> Dict:
        """Lấy cấu hình camera"""
        try:
            response = self._request('GET', '/settings')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def set_mode(self, mode: str) -> Dict:
        """Thiết lập chế độ camera"""
        try:
            response = self._request('POST', '/settings/mode', data={"mode": mode})
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def restart_camera(self) -> Dict:
        """Khởi động lại camera"""
        try:
            response = self._request('POST', '/control/restart_camera', timeout=60)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def reload_model(self) -> Dict:
        """Tải lại model"""
        try:
            response = self._request('POST', '/control/reload_model', timeout=120)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def get_stream_url(self) -> str:
        """Lấy URL stream"""
        return f"{self.base_url}/stream/live"
    
    def get_camera_settings(self) -> Dict:
        """Lấy thông số camera hiện tại"""
        try:
            response = self._request('GET', '/settings/current')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def set_camera_settings(self, settings: Dict) -> Dict:
        """Thiết lập thông số camera"""
        try:
            response = self._request('PUT', '/settings', json=settings)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def apply_preset(self, preset_name: str) -> Dict:
        """Áp dụng preset"""
        try:
            response = self._request('POST', '/settings/preset', json={"preset": preset_name})
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def get_available_presets(self) -> Dict:
        """Lấy danh sách preset"""
        try:
            response = self._request('GET', '/settings/presets')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e), "presets": []}
    
    # Resolution methods
    def get_resolution_info(self) -> Dict:
        """Lấy thông tin resolution hiện tại"""
        try:
            response = self._request('GET', '/settings/resolution')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def change_resolution(self, profile_name: str) -> Dict:
        """Thay đổi resolution camera"""
        try:
            response = self._request('POST', '/settings/resolution', json={"profile": profile_name})
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def get_resolution_profiles(self) -> Dict:
        """Lấy danh sách resolution profiles"""
        try:
            response = self._request('GET', '/settings/resolution/profiles')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e), "profiles": {}}
    
    # UI Settings methods (user-friendly)
    def get_ui_settings_definitions(self) -> Dict:
        """Lấy definitions của UI settings"""
        try:
            response = self._request('GET', '/settings/ui/definitions')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e), "ui_settings": {}}
    
    def get_current_ui_settings(self) -> Dict:
        """Lấy UI settings hiện tại"""
        try:
            response = self._request('GET', '/settings/ui/current')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def apply_ui_settings(self, ui_settings: Dict) -> Dict:
        """Áp dụng UI settings"""
        try:
            response = self._request('POST', '/settings/ui/apply', json={"ui_settings": ui_settings})
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}

    # Video recording methods (tạm thời - để tăng dataset)
    def start_video_recording(self, duration: int = None) -> Dict:
        """Bắt đầu quay video"""
        try:
            data = {}
            if duration:
                data['duration'] = duration
            response = self._request('POST', '/video/start', data=data, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"success": False, "error": str(e)}

    def stop_video_recording(self) -> Dict:
        """Dừng quay video và lưu trên Pi"""
        try:
            response = self._request('POST', '/video/stop', timeout=30)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_video_recording_status(self) -> Dict:
        """Lấy trạng thái recording hiện tại"""
        try:
            response = self._request('GET', '/video/status')
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"success": False, "error": str(e), "recording": False}